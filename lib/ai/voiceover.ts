import { createHash } from "node:crypto";
import { GoogleGenAI, Modality } from "@google/genai";

export const VOICEOVER_MODEL = process.env.GEMINI_TTS_MODEL || "gemini-3.1-flash-tts-preview";
export const MAX_VOICEOVER_SCRIPT_LENGTH = 4_000;

export const VOICEOVER_VOICES = [
  { name: "Aoede", label: "Aoede", description: "Breezy and natural" },
  { name: "Kore", label: "Kore", description: "Clear and confident" },
  { name: "Leda", label: "Leda", description: "Youthful and bright" },
  { name: "Puck", label: "Puck", description: "Upbeat and lively" },
  { name: "Charon", label: "Charon", description: "Informative and steady" },
  { name: "Fenrir", label: "Fenrir", description: "Energetic and expressive" },
  { name: "Gacrux", label: "Gacrux", description: "Mature and composed" },
  { name: "Sulafat", label: "Sulafat", description: "Warm and encouraging" },
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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");
  client = new GoogleGenAI({ apiKey });
  return client;
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
  };
}
