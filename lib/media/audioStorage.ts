/**
 * Small, server-only helpers for audio that BrenUp owns.  New speech assets
 * should use Opus where possible: it is dramatically smaller than PCM/WAV
 * while remaining clear enough for lesson narration and dialogue practice.
 */

export type AudioStorageFile = {
  bytes: Uint8Array;
  mimeType: string;
  extension: string;
  optimized: boolean;
  originalBytes: number;
};

export function audioExtension(mimeType?: string | null) {
  const value = String(mimeType || "").toLowerCase();
  if (value.includes("opus") || value.includes("ogg")) return "opus";
  if (value.includes("mpeg") || value.includes("mp3")) return "mp3";
  if (value.includes("mp4") || value.includes("aac")) return "m4a";
  if (value.includes("webm")) return "webm";
  if (value.includes("wav")) return "wav";
  return "audio";
}

export function audioMimeType(mimeType?: string | null) {
  const value = String(mimeType || "").toLowerCase();
  if (value.includes("opus") || value.includes("ogg")) return "audio/ogg";
  if (value.includes("mpeg") || value.includes("mp3")) return "audio/mpeg";
  if (value.includes("mp4") || value.includes("aac")) return "audio/mp4";
  if (value.includes("webm")) return "audio/webm";
  if (value.includes("wav")) return "audio/wav";
  return value || "application/octet-stream";
}

function isAlreadyEfficient(mimeType: string) {
  return /(?:ogg|opus|webm)/i.test(mimeType);
}

function shouldOptimize(mimeType: string, byteLength: number) {
  if (process.env.AUDIO_STORAGE_OPTIMIZATION === "false") return false;
  if (!process.env.KOKORO_TTS_URL || !process.env.KOKORO_TTS_API_KEY) return false;
  if (isAlreadyEfficient(mimeType)) return false;
  // Lossless audio is always worth compacting. Other formats are only
  // re-encoded when they are unexpectedly large.
  if (/(?:wav|aiff|flac|pcm)/i.test(mimeType)) return true;
  const threshold = Math.max(256 * 1024, Number(process.env.AUDIO_STORAGE_OPTIMIZE_AFTER_BYTES || 2 * 1024 * 1024));
  return byteLength >= threshold;
}

/**
 * Uses the private Mac Mini media endpoint when it is available.  A failed
 * optimization deliberately falls back to the source file: creators should
 * never lose an upload because the home voice service is temporarily offline.
 */
export async function optimizeAudioForStorage(input: {
  bytes: Uint8Array;
  mimeType?: string | null;
  fileName?: string | null;
}): Promise<AudioStorageFile> {
  const sourceMimeType = audioMimeType(input.mimeType);
  const fallback: AudioStorageFile = {
    bytes: input.bytes,
    mimeType: sourceMimeType,
    extension: audioExtension(sourceMimeType),
    optimized: false,
    originalBytes: input.bytes.byteLength,
  };
  if (!shouldOptimize(sourceMimeType, input.bytes.byteLength)) return fallback;

  const baseUrl = process.env.KOKORO_TTS_URL?.replace(/\/$/, "");
  const apiKey = process.env.KOKORO_TTS_API_KEY;
  if (!baseUrl || !apiKey) return fallback;

  try {
    const response = await fetch(`${baseUrl}/v1/audio/transcode`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": sourceMimeType,
        "X-Brenup-File-Name": encodeURIComponent(input.fileName || `audio.${audioExtension(sourceMimeType)}`),
      },
      body: new Uint8Array(input.bytes).buffer,
      signal: AbortSignal.timeout(Math.min(60_000, Math.max(8_000, Number(process.env.KOKORO_AUDIO_TRANSCODE_TIMEOUT_MS || 35_000)))),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`transcode returned ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength < 128) throw new Error("transcode returned an invalid audio file");
    return {
      bytes,
      mimeType: "audio/ogg",
      extension: "opus",
      optimized: true,
      originalBytes: input.bytes.byteLength,
    };
  } catch (error) {
    console.warn("Audio optimization skipped; retaining the source file.", error);
    return fallback;
  }
}
