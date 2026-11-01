"use client";

import dynamic from "next/dynamic";
import { ArrowLeft, ArrowRight, AudioLines, BookOpen, Check, Clock3, Mic, MicOff, Send, Sparkles, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { startLiveTutor } from "@/components/GeminiLiveTranslation";

type Message = { sender: "LEARNER" | "TUTOR"; text: string; audioBase64?: string; mimeType?: string };
type Mode = "ready" | "connecting" | "live" | "text" | "ended";

const starterTopics = ["Speak with confidence", "Everyday small talk", "Past tense in conversation"];

const AiTutorAvatar = dynamic(() => import("@/components/AiTutorAvatar").then((module) => module.AiTutorAvatar), { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-gradient-to-br from-rose-100 via-violet-100 to-indigo-100"/> });

function AvatarStage({ speaking }: { speaking: boolean }) {
  return (
    <div className="relative h-[min(25dvh,190px)] overflow-hidden rounded-[26px] bg-[radial-gradient(ellipse_at_50%_30%,#f8d5c5_0%,#ede6ff_47%,#e7ecff_100%)] sm:h-[min(34dvh,320px)]">
      <div className="absolute left-5 top-5 z-10 flex items-center gap-2 rounded-full border border-white/70 bg-white/75 px-3 py-1.5 text-xs font-bold text-[#3b3276] shadow-sm backdrop-blur"><span className={`size-2 rounded-full ${speaking ? "animate-pulse bg-emerald-500" : "bg-indigo-400"}`} />{speaking ? "Tutor speaking" : "Your tutor"}</div>
      <div className="absolute -bottom-20 left-1/2 size-[290px] -translate-x-1/2 rounded-full bg-white/40 blur-2xl" />
      <AiTutorAvatar speaking={speaking}/>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#e8eafa]/80 to-transparent" />
    </div>
  );
}

export function AiTutorWorkspace({ cefrLevel = "B1" }: { cefrLevel?: string }) {
  const [topic, setTopic] = useState("");
  const [duration, setDuration] = useState<1 | 5>(1);
  const [mode, setMode] = useState<Mode>("ready");
  const [messages, setMessages] = useState<Message[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [error, setError] = useState("");
  const [learnerMessage, setLearnerMessage] = useState("");
  const stopRef = useRef<(() => Promise<void>) | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const setMicEnabledRef = useRef<((enabled: boolean) => void) | null>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
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
  useEffect(() => () => { void stopRef.current?.(); audioRef.current?.pause(); }, []);

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
    if (!cleanTopic) { setError("Choose a topic before starting your lesson."); return; }
    setError(""); setMessages([]); setMode("connecting");
    await startLiveTutor({
      topic: cleanTopic, durationMinutes: duration, onAudio: setSpeaking, onTranscript: addTranscript,
      onReady: (stop, maxSeconds, setMic) => { stopRef.current = stop; setMicEnabledRef.current = setMic; setMicEnabled(true); setSecondsLeft(Math.min(duration * 60, maxSeconds)); setMode("live"); },
      onError: (message) => { setError(message); setMode("ready"); },
    });
  }

  function beginTextFallback() {
    if (!topic.trim()) { setError("Choose a topic before starting your lesson."); return; }
    setError("");
    setMessages([{ sender: "TUTOR", text: `Welcome! In this short lesson, we’ll practise ${topic.trim()}. What would you like to get better at?` }]);
    setSecondsLeft(duration * 60); setMode("text");
  }

  async function sendTextMessage() {
    const text = learnerMessage.trim();
    if (!text || mode !== "text") return;
    const history = [...messages, { sender: "LEARNER" as const, text }];
    setMessages(history); setLearnerMessage(""); setError(""); setSpeaking(true);
    try {
      const response = await fetch("/api/ai/tutor-text", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: topic.trim(), level: cefrLevel, history: messages, learnerMessage: text }) });
      const result = await response.json() as { reply?: string; audio?: string | null; mimeType?: string | null; error?: string };
      if (!response.ok || !result.reply) throw new Error(result.error || "BrenUp AI is unavailable right now.");
      setMessages((current) => [...current, { sender: "TUTOR", text: result.reply!, audioBase64: result.audio || undefined, mimeType: result.mimeType || undefined }]);
      if (result.audio) playKokoroAudio(result.audio, result.mimeType || "audio/ogg");
      else setSpeaking(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "BrenUp AI is unavailable right now."); setSpeaking(false); }
  }

  const formattedTime = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;

  if (mode === "connecting" || mode === "live" || mode === "text") {
    return (
      <main className="fixed inset-0 z-[60] h-[100dvh] overflow-hidden bg-[var(--br-canvas)] px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pt-5">
        <div className="mx-auto flex h-full min-h-0 w-full max-w-[960px] flex-col">
          <header className="mb-3 flex shrink-0 items-center justify-between gap-3 sm:mb-5">
            <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[.16em] text-[var(--br-brand)]">{mode === "text" ? "Text mini-lesson" : mode === "connecting" ? "Meeting your tutor" : "Live mini-lesson"} · {duration} min</p><h1 className="truncate text-lg font-extrabold sm:text-2xl">{topic}</h1></div>
            <div className="flex shrink-0 items-center gap-2">{mode !== "connecting" ? <span className="rounded-full bg-violet-100 px-3 py-1.5 font-mono text-sm font-black text-violet-800">{formattedTime}</span> : null}<button type="button" disabled={mode === "connecting"} onClick={() => void stopSession(true)} className="rounded-full border border-[var(--br-border)] bg-white px-3 py-2 text-xs font-bold text-[var(--br-text-muted)] hover:bg-rose-50 hover:text-rose-700 disabled:opacity-60">{mode === "connecting" ? "Connecting…" : "End lesson"}</button></div>
          </header>

          <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-3 lg:grid-cols-[1.05fr_.95fr] lg:grid-rows-1 lg:gap-4">
            <section className="min-h-0 min-w-0 overflow-hidden rounded-[26px] border border-[var(--br-border)] bg-[var(--br-surface)] shadow-[var(--br-shadow)]"><AvatarStage speaking={speaking}/><div className="px-3 py-2 text-center sm:p-4"><span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${speaking ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}><span className={`size-2 rounded-full ${speaking ? "animate-pulse bg-rose-500" : "bg-emerald-500"}`}/>{mode === "connecting" ? "Connecting your microphone" : speaking ? "Tutor speaking" : micEnabled ? "Listening to you" : "Microphone paused"}</span><p className="mt-2 text-xs leading-5 text-[var(--br-text-muted)]">{mode === "live" ? "Your voice is streamed for this lesson and isn’t saved by BrenUp." : mode === "connecting" ? "Your lesson is getting ready." : "Type naturally; your tutor will respond aloud."}</p></div></section>

            <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[26px] border border-[var(--br-border)] bg-[var(--br-surface)] p-3 shadow-[var(--br-shadow)] sm:p-5"><div className="mb-3 flex shrink-0 items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.14em] text-[var(--br-text-muted)]">Your conversation</p><p className="mt-1 text-sm font-extrabold">{mode === "text" ? "BrenUp AI · Kokoro voice" : "Talk with your tutor"}</p></div><AudioLines size={18} className="text-[var(--br-brand)]"/></div>
              <div ref={conversationRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1" aria-live="polite">{messages.length ? messages.map((message, index) => <div key={`${message.sender}-${index}`} className={`max-w-[94%] rounded-2xl px-3.5 py-3 text-sm leading-6 ${message.sender === "TUTOR" ? "bg-violet-50 text-[var(--br-text)]" : "ml-auto bg-[var(--br-brand)] text-white"}`}><p className="mb-1 text-[10px] font-black uppercase tracking-wider opacity-60">{message.sender === "TUTOR" ? "Tutor" : "You"}</p>{message.text}{message.sender === "TUTOR" && message.audioBase64 ? <button type="button" aria-label="Play tutor reply" onClick={() => playKokoroAudio(message.audioBase64!, message.mimeType)} className="ml-2 inline-grid size-7 place-items-center rounded-full bg-white text-violet-700" title="Play tutor voice"><Volume2 size={14}/></button> : null}</div>) : <p className="rounded-2xl bg-violet-50 px-4 py-4 text-sm leading-6 text-[var(--br-text-muted)]">Your tutor is joining the conversation…</p>}</div>
              {error ? <p role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</p> : null}
              {mode === "text" ? <form onSubmit={(event) => { event.preventDefault(); void sendTextMessage(); }} className="mt-4 flex gap-2"><input value={learnerMessage} onChange={(event) => setLearnerMessage(event.target.value)} maxLength={1200} placeholder="Type your answer…" className="h-11 min-w-0 flex-1 rounded-xl border border-[var(--br-border)] bg-[var(--br-canvas)] px-3 text-sm outline-none focus:border-violet-400"/><button type="submit" disabled={!learnerMessage.trim() || speaking} aria-label="Send answer" className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--br-brand)] text-white disabled:opacity-50"><Send size={17}/></button></form> : <div className="mt-4 flex flex-col items-center gap-2"><button type="button" disabled={mode === "connecting"} aria-pressed={micEnabled} aria-label={micEnabled ? "Pause microphone" : "Resume microphone"} onClick={() => { const next = !micEnabled; setMicEnabledRef.current?.(next); setMicEnabled(next); }} className={`grid size-[76px] place-items-center rounded-full transition disabled:opacity-60 ${micEnabled ? "bg-gradient-to-br from-orange-400 via-[#ff665e] to-rose-500 text-white shadow-[0_10px_25px_rgba(247,91,86,.32)] ring-4 ring-orange-100" : "border-2 border-[var(--br-border)] bg-white text-[var(--br-text-muted)]"}`}><span className="grid size-[60px] place-items-center rounded-full border border-white/50">{micEnabled ? <Mic size={25}/> : <MicOff size={25}/>}</span></button><p className="text-xs font-semibold text-[var(--br-text-muted)]">{mode === "connecting" ? "Getting your microphone ready…" : micEnabled ? "Microphone on · tap to pause" : "Microphone paused · tap to speak"}</p></div>}
            </section>
          </div>
        </div>
      </main>
    );
  }

  if (mode === "ended") {
    return <main className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-[radial-gradient(ellipse_at_50%_0%,#eee9ff_0%,var(--br-canvas)_58%)] p-4"><section className="w-full max-w-[520px] rounded-[30px] border border-white bg-white/90 p-6 text-center shadow-[0_24px_80px_rgba(46,35,103,.14)] sm:p-9"><span className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check size={30}/></span><p className="mt-5 text-xs font-black uppercase tracking-[.16em] text-emerald-700">Mini-lesson complete</p><h1 className="mt-2 text-2xl font-black tracking-tight text-[var(--br-text)]">Nice work showing up.</h1><p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[var(--br-text-muted)]">Your mini-lesson on <strong className="text-[var(--br-text)]">{topic}</strong> is wrapped up. A little conversation practice adds up.</p><div className="mt-6 rounded-2xl bg-violet-50 p-4 text-left"><p className="text-[10px] font-black uppercase tracking-[.12em] text-violet-700">Next step</p><p className="mt-1 text-sm font-semibold text-[var(--br-text)]">Try using one new phrase from this lesson in a real conversation today.</p></div><button type="button" onClick={() => { setMessages([]); setError(""); setSecondsLeft(0); setMode("ready"); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--br-brand)] px-4 text-sm font-extrabold text-white shadow-md hover:brightness-110">Plan another mini-lesson <ArrowRight size={16}/></button><Link href="/account" className="mt-3 inline-flex items-center gap-2 py-2 text-sm font-bold text-[var(--br-text-muted)] hover:text-[var(--br-brand)]"><ArrowLeft size={15}/> Back to BrenUp</Link></section></main>;
  }

  return (
    <div className="mx-auto w-full max-w-[820px] space-y-5 pb-6">
      <header className="overflow-hidden rounded-[28px] bg-[linear-gradient(120deg,#211c48_0%,#392970_58%,#6346d7_100%)] p-5 text-white shadow-[0_18px_50px_rgba(46,35,103,.18)] sm:p-7"><div className="flex flex-wrap items-center justify-between gap-4"><div><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold text-violet-100"><Sparkles size={14}/> BRENUP AI TUTOR</div><h1 className="text-2xl font-black tracking-tight sm:text-3xl">A little English, one conversation at a time.</h1><p className="mt-2 max-w-xl text-sm leading-6 text-white/75">Choose a goal and lesson length. Your tutor will meet you on the next screen.</p></div><div className="flex items-center gap-2 rounded-full border border-emerald-200/20 bg-emerald-300/10 px-3 py-2 text-xs font-bold text-emerald-100"><span className="size-2 rounded-full bg-emerald-300"/> Free-tier options</div></div></header>
      <section className="mx-auto w-full max-w-[620px] rounded-[26px] border border-[var(--br-border)] bg-[var(--br-surface)] p-5 shadow-[var(--br-shadow)] sm:p-7"><div className="mb-6 flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-[var(--br-brand)]">Step 1 of 2 · Plan</p><h2 className="mt-1 text-xl font-extrabold">What shall we learn?</h2></div><span className="grid size-11 place-items-center rounded-2xl bg-violet-100 text-violet-700"><BookOpen size={20}/></span></div>
        <label className="block text-sm font-bold" htmlFor="tutor-topic">Topic or goal</label><input id="tutor-topic" value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={180} placeholder="e.g. ordering food politely" className="mt-2 h-12 w-full rounded-xl border border-[var(--br-border)] bg-[var(--br-canvas)] px-3 text-sm outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"/><div className="mt-3 flex flex-wrap gap-2">{starterTopics.map((item) => <button key={item} type="button" onClick={() => setTopic(item)} className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800 transition hover:bg-violet-100">{item}</button>)}</div>
        <div className="mt-6"><p className="text-sm font-bold">Lesson length</p><div className="mt-2 grid grid-cols-2 gap-2">{([1, 5] as const).map((minutes) => <button key={minutes} type="button" onClick={() => setDuration(minutes)} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-extrabold transition ${duration === minutes ? "border-violet-500 bg-violet-50 text-violet-800 ring-2 ring-violet-100" : "border-[var(--br-border)] bg-[var(--br-canvas)] text-[var(--br-text-muted)]"}`}><Clock3 size={16}/>{minutes} minute{minutes > 1 ? "s" : ""}</button>)}</div></div><div className="mt-4 flex items-center justify-between rounded-xl bg-[var(--br-canvas)] px-3 py-2.5 text-sm"><span className="font-semibold text-[var(--br-text-muted)]">Your level</span><span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-[var(--br-brand)] shadow-sm">{cefrLevel}</span></div>
        <div className="mt-6 space-y-2"><button type="button" onClick={startVoice} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--br-brand)] px-4 text-sm font-extrabold text-white shadow-md transition hover:brightness-110">Meet your tutor <ArrowRight size={16}/></button><button type="button" onClick={beginTextFallback} className="h-11 w-full rounded-xl border border-[var(--br-border)] bg-white px-4 text-sm font-bold text-[var(--br-text)] transition hover:bg-[var(--br-canvas)]">Start with text instead</button></div><p className="mt-4 text-center text-[11px] leading-5 text-[var(--br-text-muted)]">Voice mode uses Gemini Live free access. If quota is unavailable, use the typed BrenUp AI tutor with Kokoro voice. No paid-provider fallback is used.</p>{error ? <p role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">{error}</p> : null}
      </section>
    </div>
  );
}
