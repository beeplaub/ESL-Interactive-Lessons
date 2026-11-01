"use client";

import dynamic from "next/dynamic";
import { ArrowLeft, ArrowRight, AudioLines, Check, Mic, MicOff, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { startLiveTutor } from "@/components/GeminiLiveTranslation";

type Message = { sender: "LEARNER" | "TUTOR"; text: string; audioBase64?: string; mimeType?: string };
type Mode = "ready" | "connecting" | "live" | "text" | "ended";
const AiTutorAvatar = dynamic(() => import("@/components/AiTutorAvatar").then((module) => module.AiTutorAvatar), { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-gradient-to-br from-rose-100 via-violet-100 to-indigo-100"/> });

function AvatarStage({ speaking, showLabel = true }: { speaking: boolean; showLabel?: boolean }) {
  return (
    <div className="relative h-[min(25dvh,190px)] overflow-hidden rounded-[26px] bg-[radial-gradient(ellipse_at_50%_30%,#f8d5c5_0%,#ede6ff_47%,#e7ecff_100%)] sm:h-[min(34dvh,320px)]">
      {showLabel ? <div className="absolute left-5 top-5 z-10 flex items-center gap-2 rounded-full border border-white/70 bg-white/75 px-3 py-1.5 text-xs font-bold text-[#3b3276] shadow-sm backdrop-blur"><span className={`size-2 rounded-full ${speaking ? "animate-pulse bg-emerald-500" : "bg-indigo-400"}`} />{speaking ? "Tutor speaking" : "Your tutor"}</div> : null}
      <div className="absolute -bottom-20 left-1/2 size-[290px] -translate-x-1/2 rounded-full bg-white/40 blur-2xl" />
      <AiTutorAvatar speaking={speaking}/>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#e8eafa]/80 to-transparent" />
    </div>
  );
}

export function AiTutorWorkspace({ cefrLevel = "B1" }: { cefrLevel?: string }) {
  const [topic, setTopic] = useState("");
  const [duration, setDuration] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [explanationLanguage, setExplanationLanguage] = useState<"bn" | "en">("bn");
  const [mode, setMode] = useState<Mode>("ready");
  const [messages, setMessages] = useState<Message[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [liveUnavailable, setLiveUnavailable] = useState(false);
  const stopRef = useRef<(() => Promise<void>) | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const setMicEnabledRef = useRef<((enabled: boolean) => void) | null>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef(0);
  const recordingTimeoutRef = useRef<number | null>(null);
  const inSession = mode === "live" || mode === "text";

  const stopSession = useCallback(async (ended = false) => {
    const stop = stopRef.current;
    stopRef.current = null;
    await stop?.();
    setSpeaking(false);
    setMode(ended ? "ended" : "ready");
  }, []);

  useEffect(() => {
    const conversation = conversationRef.current;
    if (conversation) conversation.scrollTo({ top: conversation.scrollHeight, behavior: "smooth" });
  }, [messages]);
  useEffect(() => {
    if (!inSession || secondsLeft <= 0) return;
    const timer = window.setInterval(() => setSecondsLeft((remaining) => Math.max(0, remaining - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [inSession, secondsLeft]);
  useEffect(() => {
    if (inSession && secondsLeft === 0) void stopSession(true);
  }, [inSession, secondsLeft, stopSession]);
  useEffect(() => () => {
    void stopRef.current?.(); audioRef.current?.pause();
    if (recordingTimeoutRef.current) window.clearTimeout(recordingTimeoutRef.current);
    recorderRef.current?.stop(); recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  function playKokoroAudio(audioBase64: string, mimeType = "audio/ogg") {
    audioRef.current?.pause();
    const bytes = Uint8Array.from(atob(audioBase64), (character) => character.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onplay = () => setSpeaking(true);
    audio.onended = () => { setSpeaking(false); URL.revokeObjectURL(url); };
    audio.onerror = () => { setSpeaking(false); URL.revokeObjectURL(url); };
    void audio.play().catch(() => setSpeaking(false));
  }

  const addTranscript = useCallback((sender: "LEARNER" | "AI", text: string) => {
    setMessages((current) => {
      const mappedSender = sender === "AI" ? "TUTOR" : "LEARNER";
      const previous = current.at(-1);
      if (previous?.sender === mappedSender) return [...current.slice(0, -1), { sender: mappedSender, text: `${previous.text} ${text}`.trim() }];
      return [...current, { sender: mappedSender, text }];
    });
  }, []);

  async function startVoice() {
    const cleanTopic = topic.trim();
    setError(""); setLiveUnavailable(false); setMessages([]); setMode("connecting");
    await startLiveTutor({
      topic: cleanTopic, durationMinutes: duration, explanationLanguage, onAudio: setSpeaking, onTranscript: addTranscript,
      onReady: (stop, maxSeconds, setMic) => { stopRef.current = stop; setMicEnabledRef.current = setMic; setMicEnabled(true); setSecondsLeft(Math.min(duration * 60, maxSeconds)); setMode("live"); },
      onError: () => { setError("Voice lesson couldn’t connect. You can retry or continue with a voice backup."); setLiveUnavailable(true); setMode("ready"); },
    });
  }

  async function beginTextFallback() {
    setError(""); setLiveUnavailable(false); setMessages([]); setSecondsLeft(duration * 60); setMode("text"); setSpeaking(true);
    try {
      const response = await fetch("/api/ai/tutor-text", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opening: true, topic: topic.trim() }) });
      const result = await response.json() as { reply?: string; audio?: string | null; mimeType?: string | null; error?: string };
      if (!response.ok || !result.reply) throw new Error(result.error || "Your tutor couldn’t start the lesson.");
      setMessages([{ sender: "TUTOR", text: result.reply, audioBase64: result.audio || undefined, mimeType: result.mimeType || undefined }]);
      if (result.audio) playKokoroAudio(result.audio, result.mimeType || "audio/ogg");
      else setSpeaking(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Your tutor couldn’t start the lesson."); setSpeaking(false); }
  }

  async function sendVoiceMessage(blob: Blob, durationSeconds: number) {
    if (!blob.size || mode !== "text") return;
    setError(""); setSpeaking(true);
    try {
      const form = new FormData();
      form.append("topic", topic.trim()); form.append("durationSeconds", String(durationSeconds));
      form.append("history", JSON.stringify(messages.map(({ sender, text }) => ({ sender, text }))));
      form.append("file", blob, "learner-answer.webm");
      const response = await fetch("/api/ai/tutor-text", { method: "POST", body: form });
      const result = await response.json() as { transcript?: string; reply?: string; audio?: string | null; mimeType?: string | null; error?: string };
      if (!response.ok || !result.reply) throw new Error(result.error || "BrenUp AI is unavailable right now.");
      if (!topic.trim() && result.transcript) setTopic(result.transcript.trim().slice(0, 180));
      setMessages((current) => [...current, ...(result.transcript ? [{ sender: "LEARNER" as const, text: result.transcript }] : []), { sender: "TUTOR", text: result.reply!, audioBase64: result.audio || undefined, mimeType: result.mimeType || undefined }]);
      if (result.audio) playKokoroAudio(result.audio, result.mimeType || "audio/ogg");
      else setSpeaking(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "BrenUp AI is unavailable right now."); setSpeaking(false); }
  }

  async function toggleFallbackRecording() {
    const current = recorderRef.current;
    if (current?.state === "recording") {
      if (recordingTimeoutRef.current) window.clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
      current.stop(); setRecording(false); return;
    }
    if (speaking) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      recordingStreamRef.current = stream;
      recordingChunksRef.current = [];
      recordingStartedAtRef.current = Date.now();
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) recordingChunksRef.current.push(event.data); };
      recorder.onstop = () => {
        if (recordingTimeoutRef.current) window.clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
        stream.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null; recorderRef.current = null; setRecording(false);
        const clip = new Blob(recordingChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        void sendVoiceMessage(clip, Math.max(1, Math.ceil((Date.now() - recordingStartedAtRef.current) / 1000)));
      };
      recorder.start(); setRecording(true);
      recordingTimeoutRef.current = window.setTimeout(() => {
        recordingTimeoutRef.current = null;
        if (recorder.state === "recording") recorder.stop();
        setRecording(false);
      }, 15_000);
    } catch {
      setError("Allow microphone access to answer your tutor by voice.");
    }
  }

  const formattedTime = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;

  if (mode === "connecting" || mode === "live" || mode === "text") {
    return (
      <main className="fixed inset-0 z-[60] h-[100dvh] overflow-hidden bg-[var(--br-canvas)] px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pt-5">
        <div className="mx-auto flex h-full min-h-0 w-full max-w-[960px] flex-col">
          <header className="mb-3 flex shrink-0 items-center justify-between gap-3 sm:mb-5">
            <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[.16em] text-[var(--br-brand)]">{mode === "connecting" ? "Meeting your tutor" : "Voice mini-lesson"} · {duration} min</p><h1 className="truncate text-lg font-extrabold sm:text-2xl">{topic || "Your mini-lesson"}</h1></div>
            <div className="flex shrink-0 items-center gap-2">{mode !== "connecting" ? <span className="rounded-full bg-violet-100 px-3 py-1.5 font-mono text-sm font-black text-violet-800">{formattedTime}</span> : null}<button type="button" disabled={mode === "connecting"} onClick={() => void stopSession(true)} className="rounded-full border border-[var(--br-border)] bg-white px-3 py-2 text-xs font-bold text-[var(--br-text-muted)] hover:bg-rose-50 hover:text-rose-700 disabled:opacity-60">{mode === "connecting" ? "Connecting…" : "End lesson"}</button></div>
          </header>

          <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-3 lg:grid-cols-[1.05fr_.95fr] lg:grid-rows-1 lg:gap-4">
            <section className="min-h-0 min-w-0 overflow-hidden rounded-[26px] border border-[var(--br-border)] bg-[var(--br-surface)] shadow-[var(--br-shadow)]"><AvatarStage speaking={speaking}/><div className="px-3 py-2 text-center sm:p-4"><span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${speaking ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}><span className={`size-2 rounded-full ${speaking ? "animate-pulse bg-rose-500" : "bg-emerald-500"}`}/>{mode === "connecting" ? "Connecting your microphone" : speaking ? "Tutor speaking" : mode === "text" ? recording ? "Listening to your answer" : "Ready for your voice" : micEnabled ? "Listening to you" : "Microphone paused"}</span><p className="mt-2 text-xs leading-5 text-[var(--br-text-muted)]">{mode === "live" ? "Your voice is streamed for this lesson and isn’t saved by BrenUp." : mode === "connecting" ? "Your lesson is getting ready." : "Your speech is transcribed for this turn; BrenUp doesn’t save the recording."}</p></div></section>

            <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[26px] border border-[var(--br-border)] bg-[var(--br-surface)] p-3 shadow-[var(--br-shadow)] sm:p-5"><div className="mb-3 flex shrink-0 items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.14em] text-[var(--br-text-muted)]">Your conversation</p><p className="mt-1 text-sm font-extrabold">Talk with your tutor</p></div><AudioLines size={18} className="text-[var(--br-brand)]"/></div>
              <div ref={conversationRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1" aria-live="polite">{messages.length ? messages.map((message, index) => <div key={`${message.sender}-${index}`} className={`max-w-[94%] rounded-2xl px-3.5 py-3 text-sm leading-6 ${message.sender === "TUTOR" ? "bg-violet-50 text-[var(--br-text)]" : "ml-auto bg-[var(--br-brand)] text-white"}`}><p className="mb-1 text-[10px] font-black uppercase tracking-wider opacity-60">{message.sender === "TUTOR" ? "Tutor" : "You"}</p>{message.text}{message.sender === "TUTOR" && message.audioBase64 ? <button type="button" aria-label="Play tutor reply" onClick={() => playKokoroAudio(message.audioBase64!, message.mimeType)} className="ml-2 inline-grid size-7 place-items-center rounded-full bg-white text-violet-700" title="Play tutor voice"><Volume2 size={14}/></button> : null}</div>) : <p className="rounded-2xl bg-violet-50 px-4 py-4 text-sm leading-6 text-[var(--br-text-muted)]">Your tutor is joining the conversation…</p>}</div>
              {error ? <p role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</p> : null}
              {mode === "text" ? <div className="mt-4 flex flex-col items-center gap-2"><button type="button" disabled={speaking} aria-pressed={recording} aria-label={recording ? "Stop and send your answer" : "Record a spoken answer"} onClick={() => void toggleFallbackRecording()} className={`grid size-[76px] place-items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-60 ${recording ? "animate-pulse bg-rose-600 text-white shadow-[0_10px_25px_rgba(225,29,72,.3)] ring-4 ring-rose-100" : "bg-gradient-to-br from-orange-400 via-[#ff665e] to-rose-500 text-white shadow-[0_10px_25px_rgba(247,91,86,.32)] ring-4 ring-orange-100"}`}><span className="grid size-[60px] place-items-center rounded-full border border-white/50">{recording ? <MicOff size={25}/> : <Mic size={25}/>}</span></button><p className="text-xs font-semibold text-[var(--br-text-muted)]">{speaking ? "Listen to your tutor" : recording ? "Recording · tap to send" : "Tap the microphone and speak"}</p></div> : <div className="mt-4 flex flex-col items-center gap-2"><button type="button" disabled={mode === "connecting"} aria-pressed={micEnabled} aria-label={micEnabled ? "Pause microphone" : "Resume microphone"} onClick={() => { const next = !micEnabled; setMicEnabledRef.current?.(next); setMicEnabled(next); }} className={`grid size-[76px] place-items-center rounded-full transition disabled:opacity-60 ${micEnabled ? "bg-gradient-to-br from-orange-400 via-[#ff665e] to-rose-500 text-white shadow-[0_10px_25px_rgba(247,91,86,.32)] ring-4 ring-orange-100" : "border-2 border-[var(--br-border)] bg-white text-[var(--br-text-muted)]"}`}><span className="grid size-[60px] place-items-center rounded-full border border-white/50">{micEnabled ? <Mic size={25}/> : <MicOff size={25}/>}</span></button><p className="text-xs font-semibold text-[var(--br-text-muted)]">{mode === "connecting" ? "Getting your microphone ready…" : micEnabled ? "Microphone on · tap to pause" : "Microphone paused · tap to speak"}</p></div>}
            </section>
          </div>
        </div>
      </main>
    );
  }

  if (mode === "ended") {
    return <main className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-[radial-gradient(ellipse_at_50%_0%,#eee9ff_0%,var(--br-canvas)_58%)] p-4"><section className="w-full max-w-[520px] rounded-[30px] border border-white bg-white/90 p-6 text-center shadow-[0_24px_80px_rgba(46,35,103,.14)] sm:p-9"><span className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check size={30}/></span><p className="mt-5 text-xs font-black uppercase tracking-[.16em] text-emerald-700">Mini-lesson complete</p><h1 className="mt-2 text-2xl font-black tracking-tight text-[var(--br-text)]">Nice work showing up.</h1><p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[var(--br-text-muted)]">Your mini-lesson{topic ? <> on <strong className="text-[var(--br-text)]">{topic}</strong></> : ""} is wrapped up. A little conversation practice adds up.</p><div className="mt-6 rounded-2xl bg-violet-50 p-4 text-left"><p className="text-[10px] font-black uppercase tracking-[.12em] text-violet-700">Next step</p><p className="mt-1 text-sm font-semibold text-[var(--br-text)]">Try using one new phrase from this lesson in a real conversation today.</p></div><button type="button" onClick={() => { setMessages([]); setTopic(""); setError(""); setSecondsLeft(0); setMode("ready"); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--br-brand)] px-4 text-sm font-extrabold text-white shadow-md hover:brightness-110">Plan another mini-lesson <ArrowRight size={16}/></button><Link href="/account" className="mt-3 inline-flex items-center gap-2 py-2 text-sm font-bold text-[var(--br-text-muted)] hover:text-[var(--br-brand)]"><ArrowLeft size={15}/> Back to BrenUp</Link></section></main>;
  }

  return (
    <div className="mx-auto w-full max-w-[820px] space-y-5 pb-6">

      <section className="mx-auto w-full max-w-[860px] overflow-hidden rounded-[26px] border border-[var(--br-border)] bg-[var(--br-surface)] shadow-[var(--br-shadow)]">
        <header className="px-5 pt-5 text-center sm:px-7 sm:pt-7">
          <h1 className="text-2xl font-black tracking-tight text-[var(--br-brand)]">Ask your tutor anything.</h1>
        </header>
        <div className="grid grid-cols-1 sm:grid-cols-[.78fr_1.22fr]">
          <div className="p-4 sm:p-6">
            <div className="relative min-h-[210px] overflow-hidden rounded-[24px] bg-[radial-gradient(ellipse_at_50%_30%,#f8d5c5_0%,#ede6ff_47%,#e7ecff_100%)] sm:min-h-[390px]">
              <div className="pointer-events-none absolute inset-0"><AiTutorAvatar speaking={false}/></div>
            </div>
            <div className="mt-2 text-center"><span className="inline-flex items-center rounded-full bg-[var(--br-canvas)] px-3 py-1 text-xs font-bold text-[var(--br-text-muted)]">Your tutor</span></div>
          </div>
          <div className="min-w-0 p-5 sm:p-7">
            <p className="mb-2 text-xs font-semibold text-[var(--br-text-muted)]">Your level: <span className="font-extrabold text-[var(--br-brand)]">{cefrLevel}</span></p>
            <label className="block text-sm font-bold" htmlFor="tutor-topic">I’d like to learn:</label>
            <input id="tutor-topic" value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={180} placeholder="Leave blank and ask your tutor" className="mt-2 h-12 w-full rounded-xl border border-[var(--br-border)] bg-[var(--br-canvas)] px-3 text-sm outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"/>
            <div className="mt-1.5 text-xs text-[var(--br-text-muted)]">Leave blank and your tutor will ask what you’d like to learn.</div>
            <div className="mt-4 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-[var(--br-canvas)] px-3 py-2">
              <label className="whitespace-nowrap text-xs font-bold" htmlFor="tutor-duration">Lesson length</label>
              <input id="tutor-duration" type="range" min={1} max={5} step={1} value={duration} onChange={(event) => setDuration(Number(event.target.value) as 1 | 2 | 3 | 4 | 5)} aria-label="Lesson length in minutes" className="h-2 w-full cursor-pointer accent-[var(--br-brand)]"/>
              <span className="min-w-[42px] text-right text-xs font-extrabold text-[var(--br-brand)]">{duration} min</span>
            </div>
            <fieldset className="mt-5">
              <legend className="text-sm font-bold">Tutor Speaks:</legend>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button type="button" aria-pressed={explanationLanguage === "bn"} onClick={() => setExplanationLanguage("bn")} className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${explanationLanguage === "bn" ? "border-[var(--br-brand)] bg-[var(--br-brand-soft)] text-[var(--br-brand)] ring-2 ring-violet-100" : "border-[var(--br-border)] bg-[var(--br-canvas)] text-[var(--br-text-muted)]"}`}><span className="font-extrabold">বাংলা + English</span></button>
                <button type="button" aria-pressed={explanationLanguage === "en"} onClick={() => setExplanationLanguage("en")} className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${explanationLanguage === "en" ? "border-[var(--br-brand)] bg-[var(--br-brand-soft)] text-[var(--br-brand)] ring-2 ring-violet-100" : "border-[var(--br-border)] bg-[var(--br-canvas)] text-[var(--br-text-muted)]"}`}><span className="font-extrabold">English only</span></button>
              </div>
              {liveUnavailable && explanationLanguage === "bn" ? <p className="mt-2 text-xs text-[var(--br-text-muted)]">The voice backup speaks English only. Select English to continue with it.</p> : null}
            </fieldset>
            <div className="mt-5">
              <button type="button" onClick={() => void startVoice()} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--br-brand)] px-4 text-sm font-extrabold text-white shadow-md transition hover:brightness-110">Start voice lesson <ArrowRight size={16}/></button>
              {liveUnavailable ? <button type="button" disabled={explanationLanguage !== "en"} onClick={() => void beginTextFallback()} className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--br-brand)] bg-[var(--br-brand-soft)] px-4 text-sm font-bold text-[var(--br-brand)] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"><Mic size={16}/>Continue with voice backup</button> : null}
            </div>
            {error ? <p role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">{error}{liveUnavailable ? " Retry the lesson or choose English to continue with the voice backup." : ""}</p> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
