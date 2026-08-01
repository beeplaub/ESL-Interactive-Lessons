import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1).replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

const apply = process.argv.includes("--apply");
const dedupe = process.argv.includes("--dedupe");
const skipIndex = process.argv.includes("--skip-index");
const skipNarrations = process.argv.includes("--skip-narrations");
const dedupeOnly = process.argv.includes("--dedupe-only");
const indexOnly = process.argv.includes("--index-only");
const parsedOffset = Number(process.argv.find((arg) => arg.startsWith("--offset="))?.split("=")[1] ?? 0);
const parsedLimit = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? 0);
const offset = Number.isFinite(parsedOffset) && parsedOffset > 0 ? Math.floor(parsedOffset) : 0;
const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : 0;
const required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_BASE_URL"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing required environment variable(s): ${missing.join(", ")}`);
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicBase = process.env.R2_PUBLIC_BASE_URL.replace(/\/+$/, "");
const r2Bucket = process.env.R2_BUCKET;
const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const report = {
  mode: apply ? "apply" : "dry-run",
  candidates: 0,
  totalCandidates: 0,
  copied: 0,
  alreadyOnR2: 0,
  missingAtSource: 0,
  databaseRowsUpdated: 0,
  blockUrlsUpdated: 0,
  narrationAssetsIndexed: 0,
  blockAssetsIndexed: 0,
  duplicateLibraryRowsTrashed: 0,
  failures: [],
};

function r2Path(bucket, path) {
  return `${bucket}/${path}`.replace(/^\/+/, "");
}

function r2Url(bucket, path) {
  return `${publicBase}/${encodeURI(r2Path(bucket, path)).replace(/%2F/g, "/")}`;
}

function legacyPublicUrl(bucket, path) {
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${encodeURI(path).replace(/%2F/g, "/")}`;
}

function legacyStorageInfo(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/https?:\/\/[^/]+\/storage\/v1\/object\/public\/(lessons|lesson-audio)\/(.+?)(?:\?.*)?$/i);
  if (!match) return null;
  return { bucket: match[1], path: decodeURIComponent(match[2]) };
}

async function fetchAll(table, columns) {
  const all = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    all.push(...(data ?? []));
    if ((data ?? []).length < pageSize) return all;
  }
}

async function r2Has(key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: r2Bucket, Key: key }));
    return true;
  } catch (error) {
    const code = error?.$metadata?.httpStatusCode;
    if (code === 404 || error?.name === "NotFound") return false;
    throw error;
  }
}

async function ensureR2Object(bucket, path) {
  const key = r2Path(bucket, path);
  if (await r2Has(key)) {
    report.alreadyOnR2 += 1;
    return { key, url: r2Url(bucket, path) };
  }

  if (!apply) return { key, url: r2Url(bucket, path) };
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    report.missingAtSource += 1;
    throw new Error(`Source ${bucket}/${path}: ${error?.message ?? "not found"}`);
  }
  await r2.send(new PutObjectCommand({
    Bucket: r2Bucket,
    Key: key,
    Body: new Uint8Array(await data.arrayBuffer()),
    ContentType: data.type || "application/octet-stream",
  }));
  if (!(await r2Has(key))) throw new Error(`R2 verification failed for ${key}`);
  report.copied += 1;
  return { key, url: r2Url(bucket, path) };
}

async function mapWithConcurrency(values, limit, worker) {
  const queue = [...values];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await worker(queue.shift());
  }));
}

function collectStrings(value, found = []) {
  if (typeof value === "string") found.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, found));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectStrings(item, found));
  return found;
}

function replaceUrls(value, replacements) {
  if (typeof value === "string") return replacements.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => replaceUrls(item, replacements));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceUrls(item, replacements)]));
  return value;
}

function mediaEntriesFromBlock(block) {
  const content = block.content && typeof block.content === "object" ? block.content : {};
  const string = (value) => typeof value === "string" ? value.trim() : "";
  const entries = [];
  if (block.block_type === "IMAGE") {
    const url = string(content.path); if (url) entries.push({ type: "IMAGE", url, alt: string(content.alt), caption: string(content.caption) });
  } else if (block.block_type === "IMAGE_TEXT") {
    const url = string(content.image_path); if (url) entries.push({ type: "IMAGE", url, alt: string(content.alt), caption: string(content.caption) });
  } else if (block.block_type === "AUDIO") {
    const url = string(content.path); if (url) entries.push({ type: "AUDIO", url, caption: string(content.label) });
  } else if (block.block_type === "VIDEO") {
    const url = string(content.url); if (url) entries.push({ type: "VIDEO", url, caption: string(content.title) });
  } else if (block.block_type === "DIALOGUE") {
    for (const turn of Array.isArray(content.turns) ? content.turns : []) {
      const url = string(turn?.audio_url ?? turn?.audio); if (url) entries.push({ type: "AUDIO", url, caption: string(turn?.speaker) || "Dialogue line" });
    }
  } else if (block.block_type === "FLASHCARD") {
    for (const card of Array.isArray(content.cards) ? content.cards : []) {
      const image = string(card?.image_path); if (image) entries.push({ type: "IMAGE", url: image, alt: string(card?.word) });
      const audio = string(card?.audio_path); if (audio) entries.push({ type: "AUDIO", url: audio, caption: string(card?.word) });
    }
  }
  return entries;
}

async function upsertAsset(input) {
  const { data: existing, error: existingError } = await supabase
    .from("media_assets")
    .select("id,deleted_at,use_count")
    .eq("owner_id", input.owner_id)
    .eq("url", input.url)
    .order("created_at", { ascending: true })
    .limit(1);
  if (existingError) throw new Error(existingError.message);
  const row = existing?.[0];
  const payload = { ...input, use_count: Math.max(row?.use_count ?? 0, 1), last_used_at: new Date().toISOString() };
  if (row) {
    const { error } = await supabase.from("media_assets").update({ ...payload, deleted_at: null, deleted_by: null }).eq("id", row.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("media_assets").insert(payload);
    if (error) throw new Error(error.message);
  }
}

const [assets, narrations, translations, blocks, lessons] = await Promise.all([
  fetchAll("media_assets", "*"),
  fetchAll("lesson_audio_files", "id,lesson_id,slide_id,label,linked_slide_number,storage_path,storage_provider,storage_bucket,public_url"),
  fetchAll("narration_translation_cache", "id,narration_audio_file_id,storage_path,storage_provider,public_url,target_language_code"),
  fetchAll("lesson_blocks", "id,lesson_id,block_type,content"),
  fetchAll("lessons", "id,title,created_by"),
]);
const lessonsById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
const candidates = new Map();
function addCandidate(bucket, path) {
  if (!bucket || !path || !["lessons", "lesson-audio"].includes(bucket)) return;
  candidates.set(`${bucket}/${path}`, { bucket, path });
}

for (const asset of assets) {
  if (asset.storage_provider === "supabase" && asset.storage_bucket && asset.storage_path) addCandidate(asset.storage_bucket, asset.storage_path);
  const legacy = legacyStorageInfo(asset.url) ?? legacyStorageInfo(asset.public_url);
  if (legacy) addCandidate(legacy.bucket, legacy.path);
}
for (const narration of narrations) if (narration.storage_provider !== "r2") addCandidate(narration.storage_bucket ?? "lesson-audio", narration.storage_path);
for (const translation of translations) if (translation.storage_provider !== "r2") addCandidate("lesson-audio", translation.storage_path);
for (const block of blocks) for (const url of collectStrings(block.content)) {
  const legacy = legacyStorageInfo(url); if (legacy) addCandidate(legacy.bucket, legacy.path);
}
report.candidates = candidates.size;
report.totalCandidates = candidates.size;
const selectedCandidates = [...candidates.values()].slice(offset, limit ? offset + limit : undefined);
report.candidates = selectedCandidates.length;

const replacements = new Map();
if (!indexOnly) await mapWithConcurrency(selectedCandidates, 12, async ({ bucket, path }) => {
  try {
    const stored = await ensureR2Object(bucket, path);
    replacements.set(legacyPublicUrl(bucket, path), stored.url);
  } catch (error) {
    report.failures.push(error instanceof Error ? error.message : String(error));
  }
});

if (apply) {
  for (const asset of assets) {
    const legacy = asset.storage_provider === "supabase" && asset.storage_bucket && asset.storage_path
      ? { bucket: asset.storage_bucket, path: asset.storage_path }
      : legacyStorageInfo(asset.url) ?? legacyStorageInfo(asset.public_url);
    if (!legacy) continue;
    const url = replacements.get(legacyPublicUrl(legacy.bucket, legacy.path));
    if (!url) continue;
    const { error } = await supabase.from("media_assets").update({
      url, public_url: url, storage_provider: "r2", storage_bucket: r2Bucket, storage_path: r2Path(legacy.bucket, legacy.path),
    }).eq("id", asset.id);
    if (error) report.failures.push(`media_assets ${asset.id}: ${error.message}`); else report.databaseRowsUpdated += 1;
  }
  for (const narration of narrations) {
    if (narration.storage_provider === "r2") continue;
    const bucket = narration.storage_bucket ?? "lesson-audio";
    const url = replacements.get(legacyPublicUrl(bucket, narration.storage_path));
    if (!url) continue;
    const { error } = await supabase.from("lesson_audio_files").update({ storage_provider: "r2", storage_bucket: r2Bucket, storage_path: r2Path(bucket, narration.storage_path), public_url: url }).eq("id", narration.id);
    if (error) report.failures.push(`lesson_audio_files ${narration.id}: ${error.message}`); else report.databaseRowsUpdated += 1;
  }
  for (const translation of translations) {
    if (translation.storage_provider === "r2") continue;
    const url = replacements.get(legacyPublicUrl("lesson-audio", translation.storage_path));
    if (!url) continue;
    const { error } = await supabase.from("narration_translation_cache").update({ storage_provider: "r2", storage_path: r2Path("lesson-audio", translation.storage_path), public_url: url }).eq("id", translation.id);
    if (error) report.failures.push(`narration_translation_cache ${translation.id}: ${error.message}`); else report.databaseRowsUpdated += 1;
  }
  for (const block of blocks) {
    const content = replaceUrls(block.content, replacements);
    if (JSON.stringify(content) === JSON.stringify(block.content)) continue;
    const { error } = await supabase.from("lesson_blocks").update({ content }).eq("id", block.id);
    if (error) report.failures.push(`lesson_blocks ${block.id}: ${error.message}`); else report.blockUrlsUpdated += 1;
    block.content = content;
  }

  const refreshedNarrations = skipIndex || skipNarrations ? [] : await fetchAll("lesson_audio_files", "id,lesson_id,slide_id,label,linked_slide_number,storage_path,storage_provider,storage_bucket,public_url");
  for (const narration of refreshedNarrations.filter((row) => row.label === "narration" && row.public_url)) {
    const lesson = lessonsById.get(narration.lesson_id);
    if (!lesson?.created_by) continue;
    try {
      await upsertAsset({
        owner_id: lesson.created_by, type: "AUDIO", source: "UPLOAD", url: narration.public_url, public_url: narration.public_url,
        storage_provider: narration.storage_provider, storage_bucket: narration.storage_bucket, storage_path: narration.storage_path,
        lesson_id: narration.lesson_id, lesson_title: lesson.title ?? null, title: `Slide ${narration.linked_slide_number ?? ""} narration`.trim(),
        caption: "Slide narration", file_name: narration.storage_path.split("/").pop(), tags: ["narration", `slide:${narration.slide_id}`],
      });
      report.narrationAssetsIndexed += 1;
    } catch (error) { report.failures.push(`narration index ${narration.id}: ${error instanceof Error ? error.message : error}`); }
  }
  if (!skipIndex && !skipNarrations) {
    const narrationsById = new Map(refreshedNarrations.map((row) => [row.id, row]));
    const refreshedTranslations = await fetchAll("narration_translation_cache", "id,narration_audio_file_id,target_language_code,storage_path,storage_provider,public_url");
    for (const translation of refreshedTranslations.filter((row) => row.public_url)) {
      const narration = narrationsById.get(translation.narration_audio_file_id);
      const lesson = narration ? lessonsById.get(narration.lesson_id) : null;
      if (!narration || !lesson?.created_by) continue;
      try {
        await upsertAsset({
          owner_id: lesson.created_by, type: "AUDIO", source: "UPLOAD", url: translation.public_url, public_url: translation.public_url,
          storage_provider: translation.storage_provider, storage_bucket: translation.storage_provider === "r2" ? r2Bucket : "lesson-audio", storage_path: translation.storage_path,
          lesson_id: narration.lesson_id, lesson_title: lesson.title ?? null, title: `Bengali translation · slide narration`, caption: "AI narration translation",
          file_name: translation.storage_path.split("/").pop(), tags: ["narration-translation", `narration:${narration.id}`],
        });
      } catch (error) { report.failures.push(`translation index ${translation.id}: ${error instanceof Error ? error.message : error}`); }
    }
  }
  const blocksWithMedia = dedupeOnly ? [] : blocks.filter((block) => ["IMAGE", "IMAGE_TEXT", "AUDIO", "VIDEO", "DIALOGUE", "FLASHCARD"].includes(block.block_type));
  const indexBlocks = indexOnly && limit ? blocksWithMedia.slice(offset, offset + limit) : blocksWithMedia;
  for (const block of skipIndex ? [] : indexBlocks) {
    const lesson = lessonsById.get(block.lesson_id);
    if (!lesson?.created_by) continue;
    for (const entry of mediaEntriesFromBlock(block)) {
      const r2PathValue = entry.url.startsWith(`${publicBase}/`) ? decodeURI(entry.url.slice(publicBase.length + 1)) : null;
      const legacy = legacyStorageInfo(entry.url);
      try {
        await upsertAsset({
          owner_id: lesson.created_by, type: entry.type, source: r2PathValue || legacy ? "UPLOAD" : "LINK", url: entry.url,
          public_url: entry.url, storage_provider: r2PathValue ? "r2" : legacy ? "supabase" : "external",
          storage_bucket: r2PathValue ? r2Bucket : legacy?.bucket ?? null, storage_path: r2PathValue ?? legacy?.path ?? null,
          lesson_id: block.lesson_id, lesson_title: lesson.title ?? null, alt_text: entry.alt || null, caption: entry.caption || null,
          file_name: decodeURIComponent(entry.url.split("?")[0]?.split("/").pop() ?? "") || null, tags: [],
        });
        report.blockAssetsIndexed += 1;
      } catch (error) { report.failures.push(`block index ${block.id}: ${error instanceof Error ? error.message : error}`); }
    }
  }

  if (dedupe) {
    const active = (await fetchAll("media_assets", "id,owner_id,url,use_count,created_at,deleted_at")).filter((asset) => !asset.deleted_at);
    const groups = new Map();
    for (const asset of active) {
      const key = `${asset.owner_id}:${asset.url}`;
      groups.set(key, [...(groups.get(key) ?? []), asset]);
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      group.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      const [keeper, ...duplicates] = group;
      const total = group.reduce((sum, asset) => sum + (asset.use_count ?? 1), 0);
      await supabase.from("media_assets").update({ use_count: total }).eq("id", keeper.id);
      const { error } = await supabase.from("media_assets").update({ deleted_at: new Date().toISOString() }).in("id", duplicates.map((item) => item.id));
      if (error) report.failures.push(`dedupe ${keeper.url}: ${error.message}`); else report.duplicateLibraryRowsTrashed += duplicates.length;
    }
  }
}

console.log(JSON.stringify(report, null, 2));
if (!apply) console.log("\nDry run only. Run `node scripts/reconcile-r2-media.mjs --apply --limit=50 --offset=0 --skip-index` in batches, then run an index pass. Supabase originals are never deleted by this script.");
if (report.failures.length) process.exitCode = 2;
