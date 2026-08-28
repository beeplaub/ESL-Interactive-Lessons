export type AudioTrackMode = "SEPARATE" | "SEQUENTIAL";

export type AudioTrack = {
  id: string;
  url: string;
  label?: string;
};

export type AudioTrackConfig = {
  tracks: AudioTrack[];
  mode: AudioTrackMode;
  pauseSeconds: number;
};

const AUDIO_TRACKS_MARKER = "__brenup_audio_tracks__";

function cleanTracks(value: unknown): AudioTrack[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    if (typeof item === "string") return { id: "track-" + (index + 1), url: item.trim() };
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    const url = String(row.url ?? row.path ?? row.audio_url ?? "").trim();
    return url ? { id: String(row.id ?? "track-" + (index + 1)), url, label: row.label ? String(row.label) : undefined } : null;
  }).filter((item): item is AudioTrack => Boolean(item));
}

export function parseAudioTracks(value: unknown): AudioTrackConfig {
  if (Array.isArray(value)) return { tracks: cleanTracks(value), mode: "SEPARATE", pauseSeconds: 1 };
  if (value && typeof value === "object") {
    const data = value as Record<string, unknown>;
    return {
      tracks: cleanTracks(data.tracks),
      mode: data.mode === "SEQUENTIAL" ? "SEQUENTIAL" : "SEPARATE",
      pauseSeconds: Math.max(0, Math.min(30, Number(data.pauseSeconds ?? data.pause_seconds ?? 1) || 0)),
    };
  }
  const text = String(value ?? "").trim();
  if (!text) return { tracks: [], mode: "SEPARATE", pauseSeconds: 1 };
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (parsed?.[AUDIO_TRACKS_MARKER] === true) return parseAudioTracks(parsed);
  } catch {
    // A normal URL/path is the legacy single-track format.
  }
  return { tracks: [{ id: "track-1", url: text }], mode: "SEPARATE", pauseSeconds: 1 };
}

export function serializeAudioTracks(config: AudioTrackConfig): string {
  const tracks = cleanTracks(config.tracks);
  if (tracks.length === 0) return "";
  if (tracks.length === 1 && config.mode === "SEPARATE" && config.pauseSeconds === 1) return tracks[0].url;
  return JSON.stringify({ [AUDIO_TRACKS_MARKER]: true, tracks, mode: config.mode, pauseSeconds: Math.max(0, Math.min(30, Number(config.pauseSeconds) || 0)) });
}
