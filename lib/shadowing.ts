export type ShadowingPhase = {
  id: string;
  targetText: string;
  audioUrl: string;
};

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
