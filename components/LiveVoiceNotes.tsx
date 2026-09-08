"use client";

import { Loader2, Mic, Square, Trash2, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { liveJson, notifyLiveRoom, useLiveRefresh } from "@/lib/liveSync";

type VoiceMessage = { id: string; sender_name: string; channel: string; duration_seconds: number | null; created_at: string; url: string };
type VoiceData = { messages: VoiceMessage[]; ownGroupId: string | null; groups: Array<{ id: string; name: string; status: string }>; teacher: boolean };

function time(value: number) { return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`; }

export function LiveVoiceNotes({ sessionId, teacher: initialTeacher = false, live = true }: { sessionId: string; teacher?: boolean; live?: boolean }) {
  const [data, setData] = useState<VoiceData | null>(null);
  const [channel, setChannel] = useState("EVERYONE");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);
  const elapsedRef = useRef(0);
  const mounted = useRef(true);
  const starting = useRef(false);
  const cachedVoiceUrls = useRef(new Map<string, { url: string; refreshedAt: number }>());
  const [pendingVoice, setPendingVoice] = useState<{ blob: Blob; duration: number; audience: string } | null>(null);
  const teacher = data?.teacher ?? initialTeacher;
  const ownGroup = data?.groups.find((group) => group.id === data.ownGroupId) ?? null;

  useEffect(() => {
    if (channel === "GROUP" && !ownGroup) setChannel("EVERYONE");
  }, [channel, ownGroup]);

  const refresh = useCallback(async (signal: AbortSignal) => {
    const next = await liveJson<VoiceData>(`/api/live/${sessionId}/voice`, signal);
    if (!signal.aborted) {
      const now = Date.now();
      const nextCache = new Map<string, { url: string; refreshedAt: number }>();
      const messages = next.messages.map((message) => {
        const cached = cachedVoiceUrls.current.get(message.id);
        const entry = cached && now - cached.refreshedAt < 45 * 60_000 ? cached : { url: message.url, refreshedAt: now };
        nextCache.set(message.id, entry);
        return { ...message, url: entry.url };
      });
      cachedVoiceUrls.current = nextCache;
      setData({ ...next, messages });
    }
  }, [sessionId]);
  const sync = useLiveRefresh(sessionId, "voice", refresh, live);
  function announce() { notifyLiveRoom(sessionId, "voice"); sync.retry(); }

  useEffect(() => { mounted.current = true; return () => {
    mounted.current = false;
    if (timer.current) window.clearInterval(timer.current);
    if (recorder.current) {
      recorder.current.onstop = null;
      if (recorder.current.state !== "inactive") recorder.current.stop();
    }
    stream.current?.getTracks().forEach((track) => track.stop());
  }; }, []);

  async function upload(blob: Blob, duration: number, audience = channel) {
    setSending(true); setError(null);
    try {
      const formData = new FormData();
      const extension = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
      formData.append("file", new File([blob], `voice-${Date.now()}.${extension}`, { type: blob.type || "audio/webm" }));
      formData.append("channel", audience);
      formData.append("durationSeconds", String(duration));
      const response = await fetch(`/api/live/${sessionId}/voice`, { method: "POST", body: formData });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not send the voice note.");
      setPendingVoice(null); announce();
    } catch (uploadError) { setPendingVoice({ blob, duration, audience }); setError(uploadError instanceof Error ? uploadError.message : "Could not send the voice note."); }
    finally { setSending(false); }
  }

  async function start() {
    if (!live || starting.current) return;
    starting.current = true;
    setError(null);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { media.getTracks().forEach((track) => track.stop()); return; }
      stream.current = media; chunks.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "";
      const next = mimeType ? new MediaRecorder(media, { mimeType, audioBitsPerSecond: 32_000 }) : new MediaRecorder(media, { audioBitsPerSecond: 32_000 });
      next.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      next.onstop = () => {
        if (timer.current) window.clearInterval(timer.current);
        stream.current?.getTracks().forEach((track) => track.stop());
        stream.current = null;
        const blob = new Blob(chunks.current, { type: next.mimeType || "audio/webm" });
        void upload(blob, elapsedRef.current);
      };
      recorder.current = next; elapsedRef.current = 0; setElapsed(0); next.start(500); setRecording(true);
      timer.current = window.setInterval(() => { elapsedRef.current += 1; setElapsed(elapsedRef.current); if (elapsedRef.current >= 120 && next.state === "recording") { next.stop(); setRecording(false); } }, 1000);
    } catch { stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null; setError("Microphone access is unavailable. Please allow microphone access and try again."); } finally { starting.current = false; }
  }

  function stop() { if (recording) { setRecording(false); recorder.current?.stop(); } }
  async function remove(voiceId: string) {
    if (!window.confirm("Remove this voice note from the class?")) return;
    try {
    const response = await fetch(`/api/live/${sessionId}/voice?voiceId=${encodeURIComponent(voiceId)}`, { method: "DELETE" });
    if (response.ok) { announce(); } else setError("Could not remove the voice note.");
    } catch { setError("Connection lost. Please retry removing the voice note."); }
  }

  return <section className="rounded-xl border border-[var(--br-border)] bg-surface p-3 shadow-sm">
    <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-1.5"><Volume2 size={16} className="text-violetglow" /><h2 className="text-sm font-extrabold">Voice notes</h2></div><select aria-label="Voice note audience" disabled={recording || sending || !live} value={channel} onChange={(event) => setChannel(event.target.value)} className="rounded-md border border-[var(--br-border)] px-1.5 py-1 text-[10px] font-bold text-[var(--br-text-muted)]"><option value="EVERYONE">Everyone</option><option value="TEACHER">Teacher</option>{ownGroup ? <option value="GROUP">{ownGroup.name}</option> : null}</select></div>
    <div className="mt-3 max-h-44 space-y-2 overflow-y-auto">{data?.messages.length ? data.messages.map((message) => <div key={message.id} className="rounded-lg bg-surface-muted p-2"><div className="flex items-center gap-2"><div className="min-w-0 flex-1"><p className="truncate text-[10px] font-extrabold text-violetglow">{message.sender_name} · {message.channel.toLowerCase()}</p><p className="text-[10px] text-[var(--br-text-muted)]">{message.duration_seconds ? time(message.duration_seconds) : "Voice note"}</p></div>{teacher ? <button type="button" onClick={() => void remove(message.id)} className="rounded p-1 text-[var(--br-text-muted)] hover:bg-red-50 hover:text-[var(--br-danger)]" aria-label="Remove voice note"><Trash2 size={13} /></button> : null}</div><audio controls src={message.url} preload="none" className="mt-1.5 h-8 w-full" /></div>) : <p className="py-3 text-center text-xs text-[var(--br-text-muted)]">Voice notes will appear here.</p>}</div>
    <div className="mt-3 flex items-center gap-2 rounded-lg bg-[var(--br-surface-muted)] p-2">{recording ? <><button type="button" onClick={stop} className="grid size-9 place-items-center rounded-full bg-[var(--br-danger)] text-on-dark" aria-label="Stop recording"><Square size={14} /></button><span className="text-xs font-extrabold text-[var(--br-danger)]">Recording {time(elapsed)}</span></> : <><button type="button" disabled={sending || !live || Boolean(pendingVoice)} onClick={() => void start()} className="grid size-9 place-items-center rounded-full bg-violetglow text-on-dark disabled:opacity-50" aria-label="Record voice note">{sending ? <Loader2 size={15} className="animate-spin" /> : <Mic size={15} />}</button><span className="text-xs font-semibold text-[var(--br-text-muted)]">{sending ? "Sending voice note..." : "Record a voice note (up to 2 minutes)."}</span></>}</div>
    {pendingVoice ? <div className="mt-2 flex gap-2"><button type="button" disabled={sending || !live} onClick={() => void upload(pendingVoice.blob, pendingVoice.duration, pendingVoice.audience)} className="min-h-10 rounded border border-[var(--br-border)] px-3 text-xs font-bold">Retry voice note</button><button type="button" disabled={sending} onClick={() => setPendingVoice(null)} className="min-h-10 px-3 text-xs">Discard</button></div> : null}
    {error ? <p className="mt-2 text-xs font-semibold text-[var(--br-danger)]">{error}</p> : null}
  </section>;
}
