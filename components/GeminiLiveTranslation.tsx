"use client";

import { GoogleGenAI, Modality } from "@google/genai";

type TokenRequest = { mode: "NARRATION" | "SPEAK_TRANSLATE"; lessonId: string; slideId?: string; activityId?: string };
type LiveConnection = Awaited<ReturnType<GoogleGenAI["live"]["connect"]>>;

function base64FromBytes(bytes: Uint8Array) {
  let output = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) output += String.fromCharCode(...bytes.subarray(index, index + chunk));
  return btoa(output);
}

function bytesFromBase64(value: string) {
  const raw = atob(value);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function downsample(samples: Float32Array, inputRate: number, outputRate = 16000) {
  if (inputRate === outputRate) return samples;
  const ratio = inputRate / outputRate;
  const result = new Float32Array(Math.round(samples.length / ratio));
  for (let index = 0; index < result.length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(samples.length, Math.floor((index + 1) * ratio));
    let total = 0;
    for (let source = start; source < end; source += 1) total += samples[source] ?? 0;
    result[index] = total / Math.max(1, end - start);
  }
  return result;
}

function pcm16Base64(samples: Float32Array) {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  samples.forEach((sample, index) => view.setInt16(index * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true));
  return base64FromBytes(bytes);
}

class PcmPlayer {
  private context: AudioContext;
  private cursor = 0;

  constructor() { this.context = new AudioContext(); }

  async resume() { if (this.context.state !== "running") await this.context.resume(); }

  play(base64: string) {
    const bytes = bytesFromBase64(base64);
    const sampleCount = Math.floor(bytes.byteLength / 2);
    const buffer = this.context.createBuffer(1, sampleCount, 24000);
    const output = buffer.getChannelData(0);
    const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let index = 0; index < sampleCount; index += 1) output[index] = data.getInt16(index * 2, true) / 0x8000;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    const at = Math.max(this.context.currentTime + 0.03, this.cursor);
    source.start(at);
    this.cursor = at + buffer.duration;
  }

  async close() { await this.context.close(); }
}

async function requestToken(request: TokenRequest) {
  const response = await fetch("/api/ai/live-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
  const data = await response.json() as { token?: string; model?: string; targetLanguageCode?: string; maxSeconds?: number | null; error?: string };
  if (!response.ok || !data.token || !data.model) throw new Error(data.error || "Live translation is unavailable.");
  return data as Required<Pick<typeof data, "token" | "model" | "targetLanguageCode">> & { maxSeconds?: number | null };
}

function extractAudio(message: unknown) {
  const record = message as { serverContent?: { modelTurn?: { parts?: Array<{ inlineData?: { data?: string } }> } } };
  return record.serverContent?.modelTurn?.parts?.map((part) => part.inlineData?.data).filter((data): data is string => Boolean(data)) ?? [];
}

function extractTranscript(message: unknown) {
  const record = message as { serverContent?: { inputTranscription?: { text?: string }; outputTranscription?: { text?: string } } };
  return [record.serverContent?.inputTranscription?.text, record.serverContent?.outputTranscription?.text].filter((text): text is string => Boolean(text));
}

async function connect(request: TokenRequest, onAudio: (data: string) => void, onError: (message: string) => void, onTranscript?: (text: string) => void) {
  const token = await requestToken(request);
  const ai = new GoogleGenAI({ apiKey: token.token, httpOptions: { apiVersion: "v1alpha" } });
  const session = await ai.live.connect({
    model: token.model,
    config: {
      responseModalities: [Modality.AUDIO],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      translationConfig: { targetLanguageCode: token.targetLanguageCode, echoTargetLanguage: true },
    },
    callbacks: {
      onmessage: (message) => { extractAudio(message).forEach(onAudio); extractTranscript(message).forEach((text) => onTranscript?.(text)); },
      onerror: () => onError("The live translation connection was interrupted."),
    },
  });
  return { session, maxSeconds: token.maxSeconds ?? null, targetLanguageCode: token.targetLanguageCode };
}

/** Stream a saved narration to Gemini only after the learner actively asks for it. */
export async function playNarrationTranslation({ lessonId, slideId, src, onState }: { lessonId: string; slideId: string; src: string; onState?: (state: "loading" | "playing" | "done" | "error", message?: string) => void }) {
  onState?.("loading");
  const player = new PcmPlayer();
  try {
    await player.resume();
    const { session } = await connect({ mode: "NARRATION", lessonId, slideId }, (audio) => { player.play(audio); onState?.("playing"); }, (message) => onState?.("error", message));
    const response = await fetch(src);
    const bytes = await response.arrayBuffer();
    const context = new AudioContext();
    const decoded = await context.decodeAudioData(bytes.slice(0));
    const mono = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      const source = decoded.getChannelData(channel);
      for (let index = 0; index < source.length; index += 1) mono[index] += source[index] / decoded.numberOfChannels;
    }
    const pcm = downsample(mono, decoded.sampleRate);
    const frameSize = 1600;
    for (let index = 0; index < pcm.length; index += frameSize) {
      session.sendRealtimeInput({ audio: { data: pcm16Base64(pcm.slice(index, index + frameSize)), mimeType: "audio/pcm;rate=16000" } });
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    session.sendRealtimeInput({ audioStreamEnd: true });
    window.setTimeout(() => { session.close(); void context.close(); void player.close(); onState?.("done"); }, 4000);
  } catch (error) {
    await player.close();
    onState?.("error", error instanceof Error ? error.message : "Translation could not start.");
  }
}

export async function startSpeakTranslation({ lessonId, activityId, onAudio, onTranscript, onReady, onError }: { lessonId: string; activityId: string; onAudio: () => void; onTranscript?: (text: string) => void; onReady: (stop: () => void, maxSeconds: number) => void; onError: (message: string) => void }) {
  const player = new PcmPlayer();
  let stream: MediaStream | null = null;
  let context: AudioContext | null = null;
  let processor: ScriptProcessorNode | null = null;
  let session: LiveConnection | null = null;
  try {
    await player.resume();
    const connection = await connect({ mode: "SPEAK_TRANSLATE", lessonId, activityId }, (audio) => { player.play(audio); onAudio(); }, onError, onTranscript);
    session = connection.session;
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    processor = context.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (event) => {
      const pcm = downsample(event.inputBuffer.getChannelData(0), context?.sampleRate ?? 48000);
      session?.sendRealtimeInput({ audio: { data: pcm16Base64(pcm), mimeType: "audio/pcm;rate=16000" } });
    };
    source.connect(processor); processor.connect(context.destination);
    onReady(() => {
      processor?.disconnect(); source.disconnect(); stream?.getTracks().forEach((track) => track.stop());
      session?.sendRealtimeInput({ audioStreamEnd: true }); session?.close(); void context?.close(); void player.close();
    }, connection.maxSeconds ?? 30);
  } catch (error) {
    stream?.getTracks().forEach((track) => track.stop());
    processor?.disconnect(); session?.close(); if (context) void context.close(); void player.close();
    onError(error instanceof Error ? error.message : "Microphone translation could not start.");
  }
}
