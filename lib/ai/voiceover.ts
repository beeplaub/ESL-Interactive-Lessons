import { createHash } from "node:crypto";
import { GoogleGenAI, Modality } from "@google/genai";
import { VOICEOVER_PACES, VOICEOVER_STYLES, VOICEOVER_VOICES } from "@/lib/ai/voiceoverCatalog";

export { VOICEOVER_PACES, VOICEOVER_STYLES, VOICEOVER_VOICES } from "@/lib/ai/voiceoverCatalog";

export const VOICEOVER_MODEL = process.env.GEMINI_TTS_MODEL || "gemini-3.1-flash-tts-preview";
export const KOKORO_VOICEOVER_MODEL = process.env.KOKORO_TTS_MODEL || "kokoro-82m";
export const MAX_VOICEOVER_SCRIPT_LENGTH = 4_000;

type VoiceoverRequest = {
  script: string;
  voiceName: string;
  languageCode: string;
  style: string;
  pace: string;
  provider?: "auto" | "kokoro" | "google";
};

let client: GoogleGenAI | null = null;

function geminiClient() {
  if (client) return client;
  // Voice generation has a dedicated project and quota. Keep GEMINI_API_KEY as
  // a local-development fallback so existing developer setups do not break.
  const apiKey = process.env.GEMINI_TTS_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_TTS_API_KEY is not configured.");
  client = new GoogleGenAI({ apiKey });
  return client;
}

export function isVoiceoverQuotaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /RESOURCE_EXHAUSTED|quota exceeded|rate limit|\b429\b/i.test(message);
}

export function voiceoverRequestHash(request: VoiceoverRequest, provider = voiceoverProviderForRequest(request)) {
  const providerModel = provider === "kokoro" ? KOKORO_VOICEOVER_MODEL : VOICEOVER_MODEL;
  const providerVoice = provider === "kokoro"
    ? VOICEOVER_VOICES.find((candidate) => candidate.name === request.voiceName)?.kokoroVoice || "af_heart"
    : request.voiceName;
  return createHash("sha256")
    .update(JSON.stringify({
      script: request.script.trim(),
      voiceName: request.voiceName,
      languageCode: request.languageCode,
      style: request.style,
      pace: request.pace,
      provider,
      model: providerModel,
      providerVoice,
      providerPreference: request.provider || "auto",
    }))
    .digest("hex");
}

function isEnglishLanguage(languageCode: string) {
  return /^en(?:-|$)/i.test(languageCode);
}

export function voiceoverProviderForLanguage(languageCode: string): "kokoro" | "google" {
  const preference = (process.env.VOICEOVER_PROVIDER || "auto").toLowerCase();
  const configured = Boolean(process.env.KOKORO_TTS_URL && process.env.KOKORO_TTS_API_KEY);
  if (preference === "gemini" || !isEnglishLanguage(languageCode)) return "google";
  if ((preference === "kokoro" || preference === "auto") && configured) return "kokoro";
  return "google";
}

export function voiceoverProviderForRequest(request: Pick<VoiceoverRequest, "languageCode" | "style" | "provider">): "kokoro" | "google" {
  if (request.provider === "google") return "google";
  if (request.provider === "kokoro") return "kokoro";
  const provider = voiceoverProviderForLanguage(request.languageCode);
  const preference = (process.env.VOICEOVER_PROVIDER || "auto").toLowerCase();
  if (provider === "kokoro" && preference === "auto" && request.style !== "Natural") return "google";
  return provider;
}

function sampleRateFromMime(mimeType?: string) {
  const match = mimeType?.match(/rate=(\d+)/i);
  return match ? Number(match[1]) : 24_000;
}

/** Wrap Gemini's signed 16-bit mono PCM response in a browser-compatible WAV container. */
export function pcmToWav(pcm: Uint8Array, sampleRate = 24_000) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.byteLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.byteLength, 40);
  return new Uint8Array(Buffer.concat([header, Buffer.from(pcm)]));
}

async function generateGeminiVoiceover(request: VoiceoverRequest) {
  const styleInstruction = request.style === "Natural" ? "natural and clear" : request.style.toLowerCase();
  const paceInstruction = request.pace === "Natural" ? "a natural speaking pace" : `a ${request.pace.toLowerCase()} speaking pace`;
  const prompt = [
    `Read the following script exactly as written in a ${styleInstruction} voice, using ${paceInstruction}.`,
    "Use natural pauses and accurate pronunciation. Do not add, remove, explain, or introduce any words.",
    "SCRIPT:",
    request.script.trim(),
  ].join("\n\n");

  const response = await geminiClient().models.generateContent({
    model: VOICEOVER_MODEL,
    contents: prompt,
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        languageCode: request.languageCode,
        voiceConfig: { prebuiltVoiceConfig: { voiceName: geminiVoiceName(request.voiceName) } },
      },
    },
  });

  const part = response.candidates?.[0]?.content?.parts?.find((candidate) => candidate.inlineData?.data);
  const encoded = part?.inlineData?.data;
  if (!encoded) throw new Error("Gemini did not return audio. Try a shorter script or another voice.");
  const pcm = new Uint8Array(Buffer.from(encoded, "base64"));
  const sampleRate = sampleRateFromMime(part.inlineData?.mimeType);
  const wav = pcmToWav(pcm, sampleRate);
  return {
    wav,
    sampleRate,
    durationSeconds: pcm.byteLength / (sampleRate * 2),
    model: response.modelVersion || VOICEOVER_MODEL,
    tokenEstimate: response.usageMetadata?.totalTokenCount ?? Math.ceil(request.script.length / 4),
    inputTokens: response.usageMetadata?.promptTokenCount ?? Math.ceil(request.script.length / 4),
    outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    provider: "google" as const,
  };
}

const GEMINI_VOICE_NAMES = new Set(["Aoede", "Kore", "Leda", "Gacrux", "Sulafat", "Puck", "Charon", "Fenrir"]);

function geminiVoiceName(requestedVoice: string) {
  if (GEMINI_VOICE_NAMES.has(requestedVoice)) return requestedVoice;
  const selected = VOICEOVER_VOICES.find((voice) => voice.name === requestedVoice);
  return selected?.presentation === "Male" ? "Puck" : "Aoede";
}

function kokoroSpeed(pace: string) {
  if (pace === "Very slow") return 0.75;
  if (pace === "Slow") return 0.85;
  if (pace === "Brisk") return 1.15;
  return 1;
}

function wavDurationSeconds(wav: Uint8Array) {
  if (wav.byteLength < 44) return 0;
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const sampleRate = view.getUint32(24, true);
  const channels = view.getUint16(22, true);
  const bitsPerSample = view.getUint16(34, true);
  const dataBytes = view.getUint32(40, true);
  return sampleRate && channels && bitsPerSample ? dataBytes / (sampleRate * channels * (bitsPerSample / 8)) : 0;
}

async function generateKokoroVoiceover(request: VoiceoverRequest) {
  if (!isEnglishLanguage(request.languageCode)) throw new Error("Kokoro currently supports English voiceovers only. Choose Gemini for this language.");
  if (request.style !== "Natural") throw new Error("Kokoro currently supports Natural delivery only. Choose Gemini for delivery styles.");
  const baseUrl = process.env.KOKORO_TTS_URL?.replace(/\/$/, "");
  const apiKey = process.env.KOKORO_TTS_API_KEY;
  if (!baseUrl || !apiKey) throw new Error("The BrenUp Kokoro voice service is not configured.");
  const voice = VOICEOVER_VOICES.find((candidate) => candidate.name === request.voiceName)?.kokoroVoice || "af_heart";
  const timeoutMs = Math.min(35_000, Math.max(5_000, Number(process.env.KOKORO_TTS_TIMEOUT_MS || 20_000)));
  const response = await fetch(`${baseUrl}/v1/audio/speech`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "kokoro", input: request.script.trim(), voice, speed: kokoroSpeed(request.pace), response_format: "wav" }),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Kokoro voice service returned ${response.status}${details ? `: ${details.slice(0, 240)}` : ""}`);
  }
  const wav = new Uint8Array(await response.arrayBuffer());
  if (wav.byteLength < 44) throw new Error("Kokoro returned an invalid audio file.");
  const durationSeconds = Number(response.headers.get("x-audio-duration")) || wavDurationSeconds(wav);
  return {
    wav,
    sampleRate: 24_000,
    durationSeconds,
    model: response.headers.get("x-tts-model") || KOKORO_VOICEOVER_MODEL,
    tokenEstimate: 0,
    inputTokens: 0,
    outputTokens: 0,
    provider: "kokoro" as const,
  };
}

export async function generateVoiceoverAudio(request: VoiceoverRequest) {
  const provider = voiceoverProviderForRequest(request);
  if (provider === "kokoro") {
    try {
      return await generateKokoroVoiceover(request);
    } catch (error) {
      const fallbackAllowed = process.env.KOKORO_FALLBACK_TO_GEMINI !== "false";
      const explicitlySelectedKokoro = request.provider === "kokoro";
      if (explicitlySelectedKokoro || !fallbackAllowed || (process.env.VOICEOVER_PROVIDER || "auto").toLowerCase() === "kokoro") throw error;
      console.error("Kokoro generation failed; using Gemini fallback", error);
    }
  }
  return generateGeminiVoiceover(request);
}
