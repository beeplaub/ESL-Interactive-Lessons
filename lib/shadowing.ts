export type ShadowingPhase = {
  id: string;
  targetText: string;
  audioUrl: string;
};

export type ShadowingChunk = {
  id: string;
  text: string;
  startSeconds: number;
  endSeconds: number;
};

export function shadowingChunks(data: Record<string, unknown>): ShadowingChunk[] {
  if (!Array.isArray(data.chunks)) return [];
  return data.chunks.flatMap((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const text = String(row.text ?? row.target_text ?? "").trim();
    const startSeconds = Number(row.start_seconds ?? row.startSeconds);
    const endSeconds = Number(row.end_seconds ?? row.endSeconds);
    return [{
      id: String(row.id ?? `chunk-${index + 1}`),
      text,
      startSeconds: Number.isFinite(startSeconds) ? Math.max(0, startSeconds) : 0,
      endSeconds: Number.isFinite(endSeconds) ? Math.max(0, endSeconds) : 0,
    }];
  });
}

export function shadowingChunkData(chunks: ShadowingChunk[]) {
  return chunks.map((chunk) => ({
    id: chunk.id,
    text: chunk.text,
    start_seconds: chunk.startSeconds,
    end_seconds: chunk.endSeconds,
  }));
}

export function shadowingPhases(data: Record<string, unknown>): ShadowingPhase[] {
  const raw = Array.isArray(data.phases) ? data.phases : Array.isArray(data.targets) ? data.targets : [];
  const phases = raw.map((item, index) => {
    const row = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : {};
    return {
      id: String(row.id ?? `phase-${index + 1}`),
      targetText: String(row.target_text ?? row.targetText ?? row.text ?? "").trim(),
      audioUrl: String(row.audio_url ?? row.audioUrl ?? row.audio ?? "").trim(),
    };
  }).filter((phase) => phase.targetText || phase.audioUrl);
  if (phases.length) return phases;
  return [{
    id: "phase-1",
    targetText: String(data.target_text ?? data.correct_answer ?? ""),
    audioUrl: String(data.audio_url ?? ""),
  }];
}

export function shadowingPhaseData(phases: ShadowingPhase[]) {
  return phases.map((phase) => ({ id: phase.id, target_text: phase.targetText, audio_url: phase.audioUrl }));
}
