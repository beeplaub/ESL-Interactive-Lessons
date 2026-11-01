"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, WandSparkles } from "lucide-react";
import { MediaRecorderInput } from "@/components/MediaRecorderInput";
import type { ShadowingChunk } from "@/lib/shadowing";

type Props = {
  audioUrl: string;
  chunks: ShadowingChunk[];
  onAudioUrlChange: (url: string) => void;
  onChunksChange: (chunks: ShadowingChunk[]) => void;
  lessonId?: string;
  quizId?: string;
};

export function ShadowingChunkEditor({ audioUrl, chunks, onAudioUrlChange, onChunksChange, lessonId, quizId }: Props) {
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);
  const inputFingerprint = JSON.stringify([audioUrl, chunks.map(({ id, text }) => [id, text])]);
  const currentFingerprintRef = useRef(inputFingerprint);
  currentFingerprintRef.current = inputFingerprint;

  useEffect(() => () => {
    const controller = requestControllerRef.current;
    requestControllerRef.current = null;
    controller?.abort();
  }, []);
  const textIsReady = chunks.length > 0 && chunks.every((chunk) => chunk.text.trim());
  const audioIsReady = Boolean(audioUrl.trim());
  const timingsAreReady = chunks.length > 0 && chunks.every((chunk) => chunk.endMs > chunk.startMs);

  function invalidateMatch(next: ShadowingChunk[]) {
    setError(null);
    onChunksChange(next.map((chunk) => ({ ...chunk, startMs: 0, endMs: 0 })));
  }

  async function matchAudioToChunks() {
    if (!audioIsReady || !textIsReady || matching) return;
    const requestedFingerprint = inputFingerprint;
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setMatching(true);
    setError(null);
    try {
      const response = await fetch("/api/speech/shadowing-reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          audioUrl,
          lessonId,
          quizId,
          chunks: chunks.map(({ id, text }) => ({ id, text })),
        }),
      });
      const result = await response.json().catch(() => ({})) as {
        chunks?: Array<{ id: string; start_ms: number; end_ms: number }>;
        error?: string;
      };
      if (!response.ok || !Array.isArray(result.chunks)) throw new Error(result.error || "Could not match the text to the audio. Please try again.");
      if (currentFingerprintRef.current !== requestedFingerprint) throw new Error("The audio or chunk text changed while matching. Please match again.");
      const matched = new Map(result.chunks.map((chunk) => [chunk.id, chunk]));
      const next = chunks.map((chunk) => {
        const timing = matched.get(chunk.id);
        return timing ? { ...chunk, startMs: timing.start_ms, endMs: timing.end_ms } : { ...chunk, startMs: 0, endMs: 0 };
      });
      if (next.some((chunk) => chunk.endMs <= chunk.startMs)) throw new Error("Could not match every chunk. Check that the text follows the spoken sentence, then try again.");
      onChunksChange(next);
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not match the text to the audio. Please try again.");
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
        setMatching(false);
      }
    }
  }

  return (
    <div className="grid gap-3 rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
      <div>
        <h3 className="text-sm font-black text-[var(--br-dark-card)]">Model sentence and chunks</h3>
        <p className="mt-1 text-xs leading-5 text-[var(--br-text-muted)]">Add the complete model audio, then divide its sentence into text chunks. BrenUp matches each chunk to the recording automatically.</p>
      </div>
      <MediaRecorderInput label="Full model sentence audio" value={audioUrl} onChange={(url) => {
        onAudioUrlChange(url);
        invalidateMatch(chunks);
      }} lessonId={lessonId} />

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold text-[var(--br-text-muted)]">Sentence chunks</p>
        <button
          type="button"
          onClick={() => invalidateMatch([...chunks, { id: `chunk-${Date.now()}`, text: "", startMs: 0, endMs: 0 }])}
          className="rounded-lg bg-[var(--br-brand)] px-3 py-1.5 text-xs font-bold text-on-dark"
        >
          + Add chunk
        </button>
      </div>
      {chunks.map((chunk, index) => (
        <section key={chunk.id} className="grid gap-2 rounded-xl border border-violet-100 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-black uppercase tracking-wide text-[var(--br-chart-primary)]">Chunk {index + 1}</p>
            {chunks.length > 1 ? <button type="button" onClick={() => invalidateMatch(chunks.filter((_, chunkIndex) => chunkIndex !== index))} className="text-xs font-semibold text-coral">Remove</button> : null}
          </div>
          <label className="text-sm font-medium">
            Chunk text
            <input
              value={chunk.text}
              onChange={(event) => invalidateMatch(chunks.map((item, chunkIndex) => chunkIndex === index ? { ...item, text: event.target.value } : item))}
              className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-3 py-2"
              placeholder={index === 0 ? "e.g. I'm gonna" : "e.g. go to the store"}
            />
          </label>
        </section>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={!audioIsReady || !textIsReady || matching} onClick={() => void matchAudioToChunks()} className="inline-flex items-center gap-2 rounded-lg bg-[var(--br-chart-primary)] px-4 py-2 text-xs font-bold text-on-dark disabled:opacity-50">
          {matching ? <Loader2 size={15} className="animate-spin" /> : <WandSparkles size={15} />}
          {matching ? "Matching audio and text…" : timingsAreReady ? "Match again" : "Match chunks automatically"}
        </button>
        {timingsAreReady && !matching ? <span role="status" className="text-xs font-semibold text-[var(--br-success)]">Chunks are ready.</span> : null}
      </div>
      {error ? <p role="alert" className="text-xs font-semibold text-amber-800">{error}</p> : null}
      <p className="text-[11px] leading-5 text-[var(--br-text-muted)]">You only provide the words. The system listens to the model audio and creates the chunk boundaries automatically; learners record the complete sentence once.</p>
    </div>
  );
}
