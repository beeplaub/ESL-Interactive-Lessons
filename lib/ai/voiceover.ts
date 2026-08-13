import { createHash } from "node:crypto";
import { GoogleGenAI, Modality } from "@google/genai";

export const VOICEOVER_MODEL = process.env.GEMINI_TTS_MODEL || "gemini-3.1-flash-tts-preview";
export const MAX_VOICEOVER_SCRIPT_LENGTH = 4_000;

export const VOICEOVER_VOICES = [
  {
    name: "Aoede", label: "Aoede", description: "Breezy and natural", presentation: "Female",
    sampleUrl: "https://media.brenup.com/ai-recordings/voiceovers/fab99c28-0901-4159-877c-f56834c7833f/saved/1786434386973-aoede.wav",
  },
  {
    name: "Kore", label: "Kore", description: "Clear and confident", presentation: "Female",
    sampleUrl: "https://media.brenup.com/ai-recordings/voiceovers/fab99c28-0901-4159-877c-f56834c7833f/saved/1786434663688-aoede.wav",
  },
  {
    name: "Leda", label: "Leda", description: "Youthful and bright", presentation: "Female",
    sampleUrl: "https://media.brenup.com/ai-recordings/voiceovers/fab99c28-0901-4159-877c-f56834c7833f/saved/1786434762218-aoede.wav",
  },
  {
    name: "Gacrux", label: "Gacrux", description: "Mature and composed", presentation: "Female",
    sampleUrl: "https://media.brenup.com/ai-recordings/voiceovers/fab99c28-0901-4159-877c-f56834c7833f/saved/1786435143303-gacrux.wav",
  },
  {
    name: "Sulafat", label: "Sulafat", description: "Warm and encouraging", presentation: "Female",
    sampleUrl: "https://media.brenup.com/ai-recordings/voiceovers/fab99c28-0901-4159-877c-f56834c7833f/saved/1786442446428-sulafat.wav",
  },
  {
    name: "Puck", label: "Puck", description: "Upbeat and lively", presentation: "Male",
    sampleUrl: "https://media.brenup.com/ai-recordings/voiceovers/fab99c28-0901-4159-877c-f56834c7833f/saved/1786434855299-puck.wav",
  },
  {
    name: "Charon", label: "Charon", description: "Informative and steady", presentation: "Male",
    sampleUrl: "https://media.brenup.com/ai-recordings/voiceovers/fab99c28-0901-4159-877c-f56834c7833f/saved/1786434910089-charon.wav",
  },
  {
    name: "Fenrir", label: "Fenrir", description: "Energetic and expressive", presentation: "Male",
    sampleUrl: "https://media.brenup.com/ai-recordings/voiceovers/fab99c28-0901-4159-877c-f56834c7833f/saved/1786434969535-fenrir.wav",
  },
] as const;

export const VOICEOVER_STYLES = ["Natural", "Warm teacher", "Calm narration", "Energetic", "Conversational", "Storytelling"] as const;
export const VOICEOVER_PACES = ["Slow", "Natural", "Brisk"] as const;

type VoiceoverRequest = {
  script: string;
  voiceName: string;
  languageCode: string;
  style: string;
  pace: string;
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

export function voiceoverRequestHash(request: VoiceoverRequest) {
  return createHash("sha256")
    .update(JSON.stringify({
      script: request.script.trim(),
      voiceName: request.voiceName,
      languageCode: request.languageCode,
      style: request.style,
      pace: request.pace,
      model: VOICEOVER_MODEL,
    }))
    .digest("hex");
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

export async function generateVoiceoverAudio(request: VoiceoverRequest) {
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
        voiceConfig: { prebuiltVoiceConfig: { voiceName: request.voiceName } },
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
  };
}
