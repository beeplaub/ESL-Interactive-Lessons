import { optimizeAudioForStorage } from "@/lib/media/audioStorage";

type Wav = { channels: number; sampleRate: number; bitsPerSample: number; pcm: Uint8Array };

function readWav(bytes: Uint8Array): Wav {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 44 || String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF" || String.fromCharCode(...bytes.slice(8, 12)) !== "WAVE") throw new Error("The voice service returned an unsupported audio format.");
  let offset = 12;
  let format = 0; let channels = 0; let sampleRate = 0; let bits = 0; let pcm: Uint8Array | null = null;
  while (offset + 8 <= bytes.byteLength) {
    const id = String.fromCharCode(...bytes.slice(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (id === "fmt ") { format = view.getUint16(start, true); channels = view.getUint16(start + 2, true); sampleRate = view.getUint32(start + 4, true); bits = view.getUint16(start + 14, true); }
    if (id === "data") pcm = bytes.slice(start, Math.min(start + size, bytes.byteLength));
    offset = start + size + (size % 2);
  }
  if (format !== 1 || channels !== 1 || bits !== 16 || !pcm || !sampleRate) throw new Error("Conversation audio must be mono 16-bit PCM.");
  return { channels, sampleRate, bitsPerSample: bits, pcm };
}

function writeWav(pcm: Uint8Array, sampleRate: number) {
  const out = new Uint8Array(44 + pcm.byteLength);
  const view = new DataView(out.buffer);
  const write = (at: number, value: string) => value.split("").forEach((char, index) => { out[at + index] = char.charCodeAt(0); });
  write(0, "RIFF"); view.setUint32(4, 36 + pcm.byteLength, true); write(8, "WAVE"); write(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, pcm.byteLength, true); out.set(pcm, 44); return out;
}

export async function composeConversationAudio(inputs: Array<{ audio: Uint8Array; durationSeconds?: number }>, pauseMs = 260) {
  const parsed = inputs.map((input) => readWav(input.audio));
  const sampleRate = parsed[0]?.sampleRate;
  if (!sampleRate || parsed.some((item) => item.sampleRate !== sampleRate)) throw new Error("The generated voices used incompatible audio rates. Please regenerate the conversation.");
  const pause = new Uint8Array(Math.round(sampleRate * 2 * pauseMs / 1000));
  const total = parsed.reduce((sum, item) => sum + item.pcm.byteLength, 0) + Math.max(0, parsed.length - 1) * pause.byteLength;
  const pcm = new Uint8Array(total); let cursor = 0;
  parsed.forEach((item, index) => { pcm.set(item.pcm, cursor); cursor += item.pcm.byteLength; if (index < parsed.length - 1) { pcm.set(pause, cursor); cursor += pause.byteLength; } });
  const wav = writeWav(pcm, sampleRate);
  const compact = await optimizeAudioForStorage({ bytes: wav, mimeType: "audio/wav", fileName: "conversation.wav" });
  return { ...compact, durationSeconds: pcm.byteLength / (sampleRate * 2) };
}
