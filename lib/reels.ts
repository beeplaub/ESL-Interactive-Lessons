import { z } from "zod";

export const REEL_GENRES = ["microfiction", "reflection", "creative challenge"] as const;
export const REEL_VOICES = [
  { id: "af_heart", label: "Heart · American English" },
  { id: "af_bella", label: "Bella · American English" },
  { id: "am_michael", label: "Michael · American English" },
  { id: "bf_emma", label: "Emma · British English" },
  { id: "bm_george", label: "George · British English" },
] as const;
const narration = z.string().trim().max(400).refine((text) => {
  const words = text.split(/\s+/).filter(Boolean).length;
  return words >= 8 && words <= 35;
}, "Use 8–35 spoken words per scene.");
export const reelContentSchema = z.object({
  title: z.string().trim().min(1).max(100),
  scenes: z.array(z.object({
    narration,
    caption: z.string().trim().min(1).max(90),
    image_prompt: z.string().trim().min(1).max(500),
  })).length(4),
});
export const REEL_GEMINI_VOICES = ["Aoede", "Kore", "Leda", "Puck", "Charon", "Fenrir"] as const;
export const reelScriptSchema = z.object({
  title: z.string().trim().min(1).max(100),
  scenes: z.array(z.object({
    narration: z.string().trim().min(1).max(400),
    caption: z.string().trim().min(1).max(90),
    image_prompt: z.string().max(500).default(""),
    imageAssetId: z.string().uuid().optional(),
    audioGenerationId: z.string().uuid().optional(),
  })).min(1).max(10),
  genre: z.string().trim().min(1).max(60),
  topic: z.string().trim().min(3).max(250),
});
export const reelTopicSchema = z.object({
  genre: z.string().trim().min(1).max(60),
  topic: z.string().trim().min(3).max(250),
});
export const reelBatchSchema = z.object({
  requestId: z.string().uuid(),
  provider: z.enum(["kokoro", "google"]).default("kokoro"),
  voice: z.string(),
  scripts: z.array(reelScriptSchema).min(1).max(5).refine(
    (scripts) => new Set(scripts.map((script) => script.topic.toLowerCase())).size === scripts.length,
    "Use a different topic for each reel.",
  ),
}).superRefine((input, ctx) => {
  const allowed: readonly string[] = input.provider === "google" ? REEL_GEMINI_VOICES : REEL_VOICES.map((v) => v.id);
  if (!allowed.includes(input.voice)) ctx.addIssue({ code: "custom", message: "Choose a voice for the selected provider." });
  if (input.provider === "google" && input.scripts.some((s) => s.scenes.some((scene) => !scene.audioGenerationId))) ctx.addIssue({ code: "custom", message: "Generate Gemini narration before rendering." });
});
export type ReelScript = z.infer<typeof reelScriptSchema>;
export type ReelEngineStatus = { available: boolean; ollama: boolean; message: string };
export type ReelPreview = { id: string; title: string; duration: number; script: ReelScript };
export type ReelBatch = {
  id: string;
  status: "queued" | "rendering" | "complete" | "failed";
  createdAt: string;
  count: number;
  completed: number;
  error?: string;
  reels: ReelPreview[];
  drafts: ReelScript[];
};
export function reelAssetUrl(batch: string, reel: string, asset: "video" | "thumbnail" | "script" | "captions", download = false) {
  return `/api/creator-tools/reels/files?${new URLSearchParams({ batch, reel, asset, ...(download ? { download: "1" } : {}) })}`;
}

/** Single byte range for browser video seeking. null means a malformed/unsatisfiable range. */
export function reelByteRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size <= 0) return null;
  const suffix = !match[1];
  const start = suffix ? Math.max(0, size - Number(match[2])) : Number(match[1]);
  const end = suffix || !match[2] ? size - 1 : Math.min(Number(match[2]), size - 1);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) return null;
  return { start, end };
}
