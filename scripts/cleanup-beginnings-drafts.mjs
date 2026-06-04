import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...valueParts] = trimmed.split("=");
    if (!process.env[key]) {
      process.env[key] = valueParts.join("=").replace(/^["']|["']$/g, "");
    }
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

const confirmed = process.argv.includes("--confirm");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const { data: lessons, error: lessonError } = await supabase
  .from("lessons")
  .select("id,title,topic,status,pdf_path,created_at")
  .eq("status", "DRAFT")
  .or("title.ilike.%Beginnings%,topic.ilike.%Beginnings%")
  .order("created_at", { ascending: false });

if (lessonError) {
  console.error("Failed to fetch draft lessons:", lessonError.message);
  process.exit(1);
}

if (!lessons?.length) {
  console.log("No draft Beginnings lessons found.");
  process.exit(0);
}

console.log(`Found ${lessons.length} draft Beginnings lesson(s):`);
for (const lesson of lessons) {
  console.log(`- ${lesson.id} | ${lesson.title} | ${lesson.topic} | ${lesson.created_at}`);
}

if (!confirmed) {
  console.log("\nDry run only. Re-run with --confirm to delete these draft lessons and their storage files.");
  process.exit(0);
}

const lessonIds = lessons.map((lesson) => lesson.id);
const pdfPaths = lessons.map((lesson) => lesson.pdf_path).filter(Boolean);

const { data: audioFiles, error: audioError } = await supabase
  .from("lesson_audio_files")
  .select("storage_path")
  .in("lesson_id", lessonIds);

if (audioError) {
  console.error("Failed to fetch audio file paths:", audioError.message);
  process.exit(1);
}

const audioPaths = (audioFiles ?? []).map((file) => file.storage_path).filter(Boolean);

if (pdfPaths.length) {
  const { error } = await supabase.storage.from("lessons").remove(pdfPaths);
  if (error) console.warn("PDF storage cleanup warning:", error.message);
}

if (audioPaths.length) {
  const { error } = await supabase.storage.from("lesson-audio").remove(audioPaths);
  if (error) console.warn("Audio storage cleanup warning:", error.message);
}

const { error: deleteError } = await supabase.from("lessons").delete().in("id", lessonIds);
if (deleteError) {
  console.error("Failed to delete draft lessons:", deleteError.message);
  process.exit(1);
}

console.log(`Deleted ${lessonIds.length} draft Beginnings lesson(s). Published lessons were not touched.`);
