"use client";

import { useRef, useState } from "react";
import { MediaRecorderInput } from "@/components/MediaRecorderInput";
import type { ShadowingChunk } from "@/lib/shadowing";

type Props = {
  audioUrl: string;
  chunks: ShadowingChunk[];
  onAudioUrlChange: (url: string) => void;
  onChunksChange: (chunks: ShadowingChunk[]) => void;
  lessonId?: string;
};

function timeLabel(value: number) {
  const safe = Math.max(0, value);
  const minutes = Math.floor(safe / 60);
  const seconds = (safe % 60).toFixed(1).padStart(4, "0");
  return `${minutes}:${seconds}`;
}

export function ShadowingChunkEditor({ audioUrl, chunks, onAudioUrlChange, onChunksChange, lessonId }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playhead, setPlayhead] = useState(0);
  const chunksValid = chunks.length > 0 && chunks.every((chunk) => chunk.text.trim() && chunk.endSeconds > chunk.startSeconds);
  const chunksOverlap = chunks.some((chunk, index) => index > 0 && chunk.startSeconds < chunks[index - 1].endSeconds);

  function setBoundary(index: number, key: "startSeconds" | "endSeconds") {
    const position = audioRef.current?.currentTime ?? playhead;
    onChunksChange(chunks.map((chunk, chunkIndex) => chunkIndex === index ? { ...chunk, [key]: position } : chunk));
  }

  function updateChunk(index: number, patch: Partial<ShadowingChunk>) {
    onChunksChange(chunks.map((chunk, chunkIndex) => chunkIndex === index ? { ...chunk, ...patch } : chunk));
  }

  return (
    <div className="grid gap-3 rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
      <div>
        <h3 className="text-sm font-black text-[var(--br-dark-card)]">Model sentence and chunks</h3>
        <p className="mt-1 text-xs leading-5 text-[var(--br-text-muted)]">Add one complete sentence audio, then mark the start and end of each creator-defined chunk while the audio is playing.</p>
      </div>
      <MediaRecorderInput label="Full model sentence audio" value={audioUrl} onChange={onAudioUrlChange} lessonId={lessonId} />
      {audioUrl ? (
        <div className="rounded-xl border border-[var(--br-border)] bg-white p-3">
          <audio
            ref={audioRef}
            className="w-full"
            controls
            preload="metadata"
            src={audioUrl}
            onTimeUpdate={(event) => setPlayhead(event.currentTarget.currentTime)}
            onSeeked={(event) => setPlayhead(event.currentTarget.currentTime)}
          />
          <p className="mt-1 text-right text-[11px] font-semibold text-[var(--br-text-muted)]">Current position: {timeLabel(playhead)}</p>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold text-[var(--br-text-muted)]">Sentence chunks</p>
        <button
          type="button"
          onClick={() => onChunksChange([...chunks, { id: `chunk-${Date.now()}`, text: "", startSeconds: 0, endSeconds: 0 }])}
          className="rounded-lg bg-[var(--br-brand)] px-3 py-1.5 text-xs font-bold text-on-dark"
        >
          + Add chunk
        </button>
      </div>
      {chunks.map((chunk, index) => (
        <section key={chunk.id} className="grid gap-2 rounded-xl border border-violet-100 bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-black uppercase tracking-wide text-[var(--br-chart-primary)]">Chunk {index + 1}</p>
            {chunks.length > 1 ? <button type="button" onClick={() => onChunksChange(chunks.filter((_, chunkIndex) => chunkIndex !== index))} className="text-xs font-semibold text-coral">Remove</button> : null}
          </div>
          <label className="text-sm font-medium">
            Chunk text
            <input value={chunk.text} onChange={(event) => updateChunk(index, { text: event.target.value })} className="mt-1 w-full rounded-lg border border-[var(--br-border)] px-3 py-2" placeholder="e.g. Could you tell me" />
          </label>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-lg bg-slate-50 px-2.5 py-1.5 font-bold text-[var(--br-text-muted)]">Start {timeLabel(chunk.startSeconds)}</span>
            <button type="button" disabled={!audioUrl} onClick={() => setBoundary(index, "startSeconds")} className="rounded-lg border border-[var(--br-border)] px-2.5 py-1.5 font-bold disabled:opacity-50">Set start at player</button>
            <span className="rounded-lg bg-slate-50 px-2.5 py-1.5 font-bold text-[var(--br-text-muted)]">End {timeLabel(chunk.endSeconds)}</span>
            <button type="button" disabled={!audioUrl} onClick={() => setBoundary(index, "endSeconds")} className="rounded-lg border border-[var(--br-border)] px-2.5 py-1.5 font-bold disabled:opacity-50">Set end at player</button>
          </div>
          {chunk.endSeconds <= chunk.startSeconds ? <p className="text-[11px] font-semibold text-amber-700">Play the model audio and set a start and end position for this chunk.</p> : null}
        </section>
      ))}
      {!chunksValid ? <p role="status" className="text-xs font-semibold text-amber-700">Add chunk text and mark valid start/end positions before learners can record.</p> : null}
      {chunksOverlap ? <p role="status" className="text-xs font-semibold text-amber-700">Chunk times overlap. Check the start and end markers so each chunk plays in order.</p> : null}
      <p className="text-[11px] leading-5 text-[var(--br-text-muted)]">Chunk text must follow the sentence order. Learners record the complete sentence once; Groq word timestamps are used only to locate those chunks in the recording.</p>
    </div>
  );
}
