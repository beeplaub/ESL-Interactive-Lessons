"use client";

import { Loader2, Mic, Square, Trash2, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type VoiceMessage = { id: string; sender_name: string; channel: string; duration_seconds: number | null; created_at: string; url: string };
type VoiceData = { messages: VoiceMessage[]; ownGroupId: string | null; groups: Array<{ id: string; name: string; status: string }>; teacher: boolean };

function time(value: number) { return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`; }

export function LiveVoiceNotes({ sessionId, teacher: initialTeacher = false }: { sessionId: string; teacher?: boolean }) {
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
  const teacher = data?.teacher ?? initialTeacher;
  const ownGroup = data?.groups.find((group) => group.id === data.ownGroupId) ?? null;

  useEffect(() => {
    if (channel === "GROUP" && !ownGroup) setChannel("EVERYONE");
  }, [channel, ownGroup]);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/live/${sessionId}/voice`, { cache: "no-store" });
    if (response.ok) {
      const next = await response.json() as VoiceData;
      setData((current) => {
        if (!current) return next;
        const cachedUrls = new Map(current.messages.map((message) => [message.id, message.url]));
        return { ...next, messages: next.messages.map((message) => ({ ...message, url: cachedUrls.get(message.id) || message.url })) };
      });
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
    const supabase = createClient();
    const realtime = supabase.channel(`brenup-live-voice:${sessionId}`).on("broadcast", { event: "refresh" }, refresh).subscribe();
    const interval = window.setInterval(refresh, 5000);
    return () => { window.clearInterval(interval); void supabase.removeChannel(realtime); };
  }, [refresh, sessionId]);

  function announce() { void createClient().channel(`brenup-live-voice:${sessionId}`).send({ type: "broadcast", event: "refresh", payload: {} }); }

  async function upload(blob: Blob, duration: number) {
    setSending(true); setError(null);
    try {
      const formData = new FormData();
      const extension = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
      formData.append("file", new File([blob], `voice-${Date.now()}.${extension}`, { type: blob.type || "audio/webm" }));
      formData.append("channel", channel);
      formData.append("durationSeconds", String(duration));
      const response = await fetch(`/api/live/${sessionId}/voice`, { method: "POST", body: formData });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not send the voice note.");
      await refresh(); announce();
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "Could not send the voice note."); }
    finally { setSending(false); }
  }

  async function start() {
    setError(null);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media; chunks.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "";
      const next = mimeType ? new MediaRecorder(media, { mimeType }) : new MediaRecorder(media);
      next.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      next.onstop = () => {
        if (timer.current) window.clearInterval(timer.current);
        stream.current?.getTracks().forEach((track) => track.stop());
        stream.current = null;
        const blob = new Blob(chunks.current, { type: next.mimeType || "audio/webm" });
        void upload(blob, elapsedRef.current);
      };
      recorder.current = next; elapsedRef.current = 0; setElapsed(0); next.start(500); setRecording(true);
      timer.current = window.setInterval(() => setElapsed((current) => { const nextElapsed = current + 1; elapsedRef.current = nextElapsed; return nextElapsed; }), 1000);
    } catch { setError("Microphone access is unavailable. Please allow microphone access and try again."); }
  }

  function stop() { if (recording) { setRecording(false); recorder.current?.stop(); } }
  async function remove(voiceId: string) {
    if (!window.confirm("Remove this voice note from the class?")) return;
    const response = await fetch(`/api/live/${sessionId}/voice?voiceId=${encodeURIComponent(voiceId)}`, { method: "DELETE" });
    if (response.ok) { await refresh(); announce(); } else setError("Could not remove the voice note.");
  }

  return <section className="rounded-xl border border-black/10 bg-white p-3 shadow-sm">
    <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-1.5"><Volume2 size={16} className="text-violetglow" /><h2 className="text-sm font-extrabold">Voice notes</h2></div><select value={channel} onChange={(event) => setChannel(event.target.value)} className="rounded-md border border-black/10 px-1.5 py-1 text-[10px] font-bold text-black/55"><option value="EVERYONE">Everyone</option><option value="TEACHER">Teacher</option>{ownGroup ? <option value="GROUP">{ownGroup.name}</option> : null}</select></div>
    <div className="mt-3 max-h-44 space-y-2 overflow-y-auto">{data?.messages.length ? data.messages.map((message) => <div key={message.id} className="rounded-lg bg-slate-50 p-2"><div className="flex items-center gap-2"><div className="min-w-0 flex-1"><p className="truncate text-[10px] font-extrabold text-violetglow">{message.sender_name} · {message.channel.toLowerCase()}</p><p className="text-[10px] text-black/45">{message.duration_seconds ? time(message.duration_seconds) : "Voice note"}</p></div>{teacher ? <button type="button" onClick={() => void remove(message.id)} className="rounded p-1 text-black/35 hover:bg-red-50 hover:text-[var(--br-danger)]" aria-label="Remove voice note"><Trash2 size={13} /></button> : null}</div><audio controls src={message.url} preload="metadata" className="mt-1.5 h-8 w-full" /></div>) : <p className="py-3 text-center text-xs text-black/45">Voice notes will appear here.</p>}</div>
    <div className="mt-3 flex items-center gap-2 rounded-lg bg-[#F8F6FF] p-2">{recording ? <><button type="button" onClick={stop} className="grid size-9 place-items-center rounded-full bg-[var(--br-danger)] text-white" aria-label="Stop recording"><Square size={14} /></button><span className="text-xs font-extrabold text-[var(--br-danger)]">Recording {time(elapsed)}</span></> : <><button type="button" disabled={sending} onClick={() => void start()} className="grid size-9 place-items-center rounded-full bg-violetglow text-white disabled:opacity-50" aria-label="Record voice note">{sending ? <Loader2 size={15} className="animate-spin" /> : <Mic size={15} />}</button><span className="text-xs font-semibold text-black/55">{sending ? "Sending voice note..." : "Hold a thought? Record a voice note."}</span></>}</div>
    {error ? <p className="mt-2 text-xs font-semibold text-[var(--br-danger)]">{error}</p> : null}
  </section>;
}
