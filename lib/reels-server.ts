import "server-only";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { creatorAccessError, getCreatorStaffAccess } from "@/lib/ai/creatorAccess";
import { reelScriptSchema, type ReelBatch, type ReelEngineStatus, type ReelScript } from "@/lib/reels";
import { getCreatorAiAccess } from "@/lib/ai/creatorAccess";
import { createAdminClient } from "@/lib/supabase/admin";
import { voiceoverRequestHash } from "@/lib/ai/voiceover";
import { resolveMediaUrl } from "@/lib/storage/mediaStorage";

const root = path.join(process.cwd(), "tools", "reel-machine");
const output = path.join(root, "output");
const python = process.env.REEL_PYTHON || path.join(homedir(), "Library/Application Support/BrenUp/kokoro-tts/.venv/bin/python");
const identifier = z.string().uuid();

export class ReelHttpError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export async function reelAccess() {
  // This free local utility follows the Creator Tools staff gate, like the QR tool.
  // Optional Gemini narration separately enforces the existing AI feature gate.
  try { return await getCreatorStaffAccess(); }
  catch (error) {
    const known = creatorAccessError(error);
    const message = error instanceof Error && error.message === "FEATURE_UNAVAILABLE" ? "Reel Machine is not enabled for your role." : known?.message;
    throw new ReelHttpError(message || "Could not verify creator access.", known?.status || 500);
  }
}
export function reelError(error: unknown) {
  console.error("Reel request failed", error);
  return Response.json({ error: error instanceof ReelHttpError ? error.message : "The reel engine could not complete this request. Please try again." }, { status: error instanceof ReelHttpError ? error.status : 500 });
}
export async function reelBody(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) throw new ReelHttpError("Please submit this request from the Reel Machine page.", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new ReelHttpError("JSON is required.", 415);
  // Bound streamed bodies as well as requests with Content-Length.
  const reader = request.body?.getReader();
  if (!reader) throw new ReelHttpError("A request body is required.");
  let text = "";
  let bytes = 0;
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 128_000) { await reader.cancel(); throw new ReelHttpError("This batch is too large.", 413); }
    text += decoder.decode(value, { stream: true });
  }
  try { return JSON.parse(text + decoder.decode()) as unknown; }
  catch { throw new ReelHttpError("Invalid JSON."); }
}
export async function reelEngineStatus(): Promise<ReelEngineStatus> {
  if (process.env.VERCEL) return { available: false, ollama: false, message: "Open BrenUp on your Mac to use the local engine. This hosted server is not connected to your Mac." };
  try {
    await Promise.all([access(python), access(path.join(root, "web_render.py")), access(path.join(root, ".deps/PIL"))]);
  } catch {
    return { available: false, ollama: false, message: "The local reel engine is not installed on this server. Run BrenUp on the Mac where Reel Machine is installed." };
  }
  let ollama = false;
  try {
    const response = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(2000), cache: "no-store" });
    const data = await response.json() as { models?: Array<{ name: string }> };
    ollama = response.ok && Boolean(data.models?.some((model) => model.name === "qwen2.5:7b"));
  } catch { /* Render existing scripts even when Ollama is stopped. */ }
  return { available: true, ollama, message: ollama ? "Local engine ready · Kokoro is free" : "Rendering is ready. Start Ollama with qwen2.5:7b to generate new scripts." };
}
function userRoot(userId: string) {
  return path.join(output, "studio", identifier.parse(userId));
}
export function reelImagePath(userId: string, id: string) {
  return path.join(userRoot(userId), "images", `${identifier.parse(id)}.jpg`);
}
export function reelFolder(userId: string, batchId: string) {
  return batchId === "samples" ? path.join(output, "first-5") : path.join(userRoot(userId), identifier.parse(batchId));
}
async function readBatch(folder: string, id: string): Promise<ReelBatch | null> {
  let batch: ReelBatch;
  try {
    batch = id === "samples"
      ? { id, status: "complete", createdAt: "2026-09-07T00:00:00.000Z", count: 5, completed: 0, reels: [], drafts: [] }
      : JSON.parse(await readFile(path.join(folder, "studio.json"), "utf8"));
  } catch { return null; }
  if (id !== "samples") {
    try {
      const status = JSON.parse(await readFile(path.join(folder, "status.json"), "utf8"));
      batch.status = status.status;
      batch.error = status.error;
      if (["queued", "rendering"].includes(batch.status) && Date.now() - status.updatedAt > 90_000) {
        batch.status = "failed";
        batch.error = "The local worker stopped responding. You can reuse the scripts to start a new batch.";
      }
    } catch {
      if (Date.now() - Date.parse(batch.createdAt) > 30_000) {
        batch.status = "failed";
        batch.error = "The local worker did not start. Check the local engine setup.";
      }
    }
  }
  batch.reels = [];
  batch.drafts = [];
  for (let n = 1; n <= Math.min(batch.count, 5); n++) {
    const reelId = String(n).padStart(3, "0");
    try {
      const directory = path.join(folder, reelId);
      const scriptText = await readFile(path.join(directory, "script.json"), "utf8");
      const script = reelScriptSchema.parse(JSON.parse(scriptText));
      batch.drafts.push(script);
      const [completedText] = await Promise.all([readFile(path.join(directory, "complete.json"), "utf8"), access(path.join(directory, "reel.mp4"))]);
      batch.reels.push({ id: reelId, title: script.title, duration: Number(JSON.parse(completedText).duration), script });
    } catch { /* An in-progress reel is not exposed as a finished file. */ }
  }
  batch.completed = batch.reels.length;
  return batch;
}
export async function reelBatches(userId: string): Promise<ReelBatch[]> {
  let ids: string[] = [];
  try { ids = (await readdir(userRoot(userId))).filter((id) => identifier.safeParse(id).success); } catch { /* First visit. */ }
  const batches = (await Promise.all(ids.map((id) => readBatch(reelFolder(userId, id), id)))).filter((batch): batch is ReelBatch => Boolean(batch));
  batches.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const samples = await readBatch(reelFolder(userId, "samples"), "samples");
  return [...batches.slice(0, 20), ...(samples?.reels.length ? [samples] : [])];
}
export async function startReelBatch(userId: string, requestId: string, scripts: ReelScript[], voice: string, provider: "kokoro" | "google" = "kokoro") {
  const prepared = new Map<string, Buffer>();
  if (provider === "google") {
    const access = await getCreatorAiAccess();
    if (access.user.id !== userId) throw new ReelHttpError("Creator session changed.", 403);
    const admin = createAdminClient();
    for (const script of scripts) for (const scene of script.scenes) {
      const { data: row } = await admin.from("ai_voiceover_generations").select("request_hash,status,expires_at,public_url,storage_provider,storage_bucket,storage_path").eq("id", scene.audioGenerationId!).eq("creator_id", userId).maybeSingle();
      const expected = voiceoverRequestHash({ script: scene.narration, voiceName: voice, languageCode: "en-US", style: "Natural", pace: "Natural", provider: "google" });
      if (!row || row.request_hash !== expected || !["PREVIEW", "SAVED"].includes(row.status) || (row.status !== "SAVED" && row.expires_at && Date.parse(row.expires_at) <= Date.now())) throw new ReelHttpError("This narration has changed or expired. Generate it again.");
      const url = row.public_url || await resolveMediaUrl(admin, { provider: row.storage_provider, bucket: row.storage_bucket, path: row.storage_path });
      if (!url) throw new ReelHttpError("Narration audio is unavailable.");
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok || !response.body) throw new ReelHttpError("Could not load narration audio.");
      const chunks: Uint8Array[] = []; let size = 0;
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        size += chunk.length;
        if (size > 10_000_000) throw new ReelHttpError("Narration audio is too large.");
        chunks.push(chunk);
      }
      prepared.set(scene.audioGenerationId!, Buffer.concat(chunks));
    }
  }
  for (const script of scripts) for (const scene of script.scenes) if (scene.imageAssetId) {
    try { await access(reelImagePath(userId, scene.imageAssetId)); } catch { throw new ReelHttpError("A scene image is missing. Upload it again."); }
  }
  const folder = reelFolder(userId, requestId);
  const hash = createHash("sha256").update(JSON.stringify({ scripts, voice, provider })).digest("hex");
  await mkdir(userRoot(userId), { recursive: true });
  try { await mkdir(folder); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = JSON.parse(await readFile(path.join(folder, "studio.json"), "utf8").catch(() => "null"));
    if (!existing || existing.inputHash !== hash) throw new ReelHttpError("This request is already being submitted. Refresh the batch list before trying again.", 409);
    return requestId;
  }
  await writeFile(path.join(folder, "studio.json"), JSON.stringify({ id: requestId, count: scripts.length, status: "queued", createdAt: new Date().toISOString(), inputHash: hash }));
  for (const [index, script] of scripts.entries()) {
    const sceneFolder = path.join(folder, String(index + 1).padStart(3, "0"));
    await mkdir(sceneFolder);
    for (const [i, scene] of script.scenes.entries()) {
      if (scene.imageAssetId) await copyFile(reelImagePath(userId, scene.imageAssetId), path.join(sceneFolder, `scene-${i + 1}.upload.jpg`));
      if (provider === "google") await writeFile(path.join(sceneFolder, `scene-${i + 1}.source.audio`), prepared.get(scene.audioGenerationId!)!);
    }
    await writeFile(path.join(sceneFolder, "script.json"), JSON.stringify({ ...script, status: "draft" }));
  }
  await writeFile(path.join(folder, "topics.json"), JSON.stringify(scripts.map((script) => [script.genre, script.topic])));
  // No shell, user-controlled command flags, or inherited application credentials.
  const child = spawn(python, [path.join(root, "web_render.py"), "--output", folder, "--count", String(scripts.length), "--voice", voice, "--provider", provider], {
    cwd: root, detached: true, stdio: "ignore",
    env: { NODE_ENV: process.env.NODE_ENV, PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin", HOME: homedir(), PYTHONUNBUFFERED: "1", HF_HUB_OFFLINE: "1", ...(process.env.TMPDIR ? { TMPDIR: process.env.TMPDIR } : {}) },
  });
  await new Promise<void>((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
  child.unref();
  return requestId;
}
