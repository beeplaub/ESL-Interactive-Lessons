import { createHash } from "node:crypto";
import { GoogleGenAI, Modality } from "@google/genai";
import { VOICEOVER_PACES, VOICEOVER_STYLES, VOICEOVER_VOICES } from "@/lib/ai/voiceoverCatalog";
import { audioExtension, audioMimeType, optimizeAudioForStorage } from "@/lib/media/audioStorage";

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
  outputFormat?: "opus" | "wav";
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
      // Saved WAV generations use the pre-Opus cache shape. Version the
      // format so a creator can regenerate the same script once and receive
      // a compact replacement instead of silently reusing a legacy WAV.
      storageFormat: "opus-v1",
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
  const compact = request.outputFormat === "wav"
    ? { bytes: wav, mimeType: "audio/wav", extension: "wav" }
    : await optimizeAudioForStorage({ bytes: wav, mimeType: "audio/wav", fileName: "gemini-voiceover.wav" });
  return {
    audio: compact.bytes,
    mimeType: compact.mimeType,
    extension: compact.extension,
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
  // Kokoro's default is 1.0. The previous values (0.75/0.85) were too close
  // to normal speed for language-learning narration, especially on shorter
  // dialogue turns where the difference was barely perceptible.
  if (pace === "Very slow") return 0.55;
  if (pace === "Slow") return 0.72;
  if (pace === "Brisk") return 1.15;
  return 1;
}

async function generateKokoroVoiceover(request: VoiceoverRequest) {
  if (!isEnglishLanguage(request.languageCode)) throw new Error("Kokoro currently supports English voiceovers only. Choose Gemini for this language.");
  const baseUrl = process.env.KOKORO_TTS_URL?.replace(/\/$/, "");
  const apiKey = process.env.KOKORO_TTS_API_KEY;
  if (!baseUrl || !apiKey) throw new Error("The BrenUp Kokoro voice service is not configured.");
  const voice = VOICEOVER_VOICES.find((candidate) => candidate.name === request.voiceName)?.kokoroVoice || "af_heart";
  // Leave room for the subsequent audio optimization and R2 write inside the
  // 300-second voiceover function window, while allowing long local renders.
  const timeoutMs = Math.min(120_000, Math.max(5_000, Number(process.env.KOKORO_TTS_TIMEOUT_MS || 90_000)));
  async function requestSpeech(responseFormat: "opus" | "wav") {
    return fetch(`${baseUrl}/v1/audio/speech`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "kokoro", input: request.script.trim(), voice, speed: kokoroSpeed(request.pace), response_format: responseFormat }),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  }

  let response = await requestSpeech(request.outputFormat === "wav" ? "wav" : "opus");
  // Keep older deployed Kokoro gateways usable during a rolling restart. The
  // newer service accepts 0.5+, while the previous schema rejected values
  // below 0.75. Once the service is upgraded, the requested slower pace is
  // sent unchanged.
  if (!response.ok && response.status === 422 && kokoroSpeed(request.pace) < 0.75) {
    const details = await response.clone().text().catch(() => "");
    if (/greater_than_equal|0\.75/i.test(details)) {
      response = await fetch(`${baseUrl}/v1/audio/speech`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "kokoro", input: request.script.trim(), voice, speed: 0.75, response_format: "opus" }),
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
    }
  }
  // During rollout an existing Mac Mini service may still be the prior
  // WAV-only release. Keep voiceover creation working until its installer has
  // been run, then switch to Opus automatically on the next request.
  if (!response.ok && request.outputFormat !== "wav" && [400, 404, 415, 422].includes(response.status)) {
    const details = await response.clone().text().catch(() => "");
    if (/response_format|wav output|opus|unsupported/i.test(details)) response = await requestSpeech("wav");
  }
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Kokoro voice service returned ${response.status}${details ? `: ${details.slice(0, 240)}` : ""}`);
  }
  const audio = new Uint8Array(await response.arrayBuffer());
  if (audio.byteLength < 128) throw new Error("Kokoro returned an invalid audio file.");
  const mimeType = audioMimeType(response.headers.get("content-type") || "audio/ogg");
  const durationSeconds = Number(response.headers.get("x-audio-duration")) || 0;
  return {
    audio,
    mimeType,
    extension: audioExtension(mimeType),
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
