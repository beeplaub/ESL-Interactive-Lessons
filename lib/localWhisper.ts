"use client";

type LocalTranscriber = (
  audio: string,
  options?: {
    chunk_length_s?: number;
    stride_length_s?: number;
    language?: string;
    task?: string;
  },
) => Promise<{ text?: string }>;

let transcriberPromise: Promise<LocalTranscriber> | null = null;

async function getTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const { env, pipeline } = await import("@huggingface/transformers");
      env.allowLocalModels = false;
      env.allowRemoteModels = true;
      env.useBrowserCache = true;

      return await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny.en", {
        device: "wasm",
        dtype: "q8",
      }) as unknown as LocalTranscriber;
    })();
  }

  return transcriberPromise;
}

/** Transcribe a locally recorded browser audio blob without uploading the audio. */
export async function transcribeLocalAudio(blob: Blob) {
  const transcriber = await getTranscriber();
  const audioUrl = URL.createObjectURL(blob);

  try {
    const output = await transcriber(audioUrl, {
      chunk_length_s: 30,
      stride_length_s: 5,
      language: "english",
      task: "transcribe",
    });
    return String(output.text ?? "").replace(/\s+/g, " ").trim();
  } finally {
    URL.revokeObjectURL(audioUrl);
  }
}
