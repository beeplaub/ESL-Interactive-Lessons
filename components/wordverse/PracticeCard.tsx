"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { recallDefinition } from "@/lib/wordverse-learning";
import type { WordverseWord } from "@/lib/wordverse";

type Result = { correct: boolean; nextReview: string | null };
type Props = {
  word: WordverseWord;
  remaining: number;
  score: { correct: number; total: number };
  onAnswer: (answer: string) => Promise<Result>;
  onNext: () => void;
  onClose: () => void;
};
export default function PracticeCard({ word, remaining, score, onAnswer, onNext, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [answer, setAnswer] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { const node = dialog.current; node?.showModal(); input.current?.focus(); return () => node?.close(); }, []);
  async function submit() {
    if (busy.current || result || !answer.trim()) return;
    busy.current = true;
    setPending(true);
    setError("");
    try { setResult(await onAnswer(answer)); }
    catch { setError("Your answer could not be saved. Check your connection and try again."); }
    finally { busy.current = false; setPending(false); }
  }
  return <dialog ref={dialog} aria-labelledby="wordverse-practice-title" onCancel={event => { if (busy.current) event.preventDefault(); else onClose(); }} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto border-0 bg-transparent p-0 text-white backdrop:bg-[#020711]">
    <section className="rounded-3xl border border-cyan-200/20 bg-[#08182a] p-6 shadow-2xl">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-xs text-cyan-200/70">Word recall · {remaining} remaining · {score.correct}/{score.total} correct</p><h2 id="wordverse-practice-title" className="mt-2 text-2xl font-bold">Which word fits this meaning?</h2></div>
        <button type="button" disabled={pending} onClick={onClose} aria-label="Close practice"><X size={18} /></button>
      </div>
      <p className="mt-5 rounded-xl border border-white/10 p-4 leading-6">{recallDefinition(word.definition, word.word)}</p>
      <p className="mt-3 text-sm text-white/60">Recall the word you are practising. {word.word_class} · starts with “{word.word.charAt(0)}”. Capitalization and extra spaces do not matter.</p>
      <form className="mt-5" onSubmit={event => { event.preventDefault(); void submit(); }}>
        <label className="block text-sm" htmlFor="wordverse-answer">Your answer</label>
        <input ref={input} id="wordverse-answer" autoFocus autoComplete="off" spellCheck={false} maxLength={200} value={answer} disabled={pending || Boolean(result)} onChange={event => setAnswer(event.target.value)} className="mt-2 w-full rounded-xl border border-white/20 bg-white/5 px-3 py-3 text-white focus:border-cyan-200" />
        {error ? <p role="alert" className="mt-3 text-sm text-amber-100">{error}</p> : null}
        {!result ? <button disabled={pending || !answer.trim()} className="mt-4 w-full rounded-xl bg-cyan-300/20 px-4 py-3 font-bold disabled:opacity-40">{pending ? "Checking and saving…" : "Check answer"}</button> : null}
      </form>
      {result ? <div className="mt-5" role="status">
        <p className={result.correct ? "text-green-200" : "text-amber-100"}>{result.correct ? "Correct!" : `The word is “${word.word}”.`}</p>
        {word.examples[0] ? <p className="mt-2 text-sm text-white/70">{word.examples[0]}</p> : null}
        <p className="mt-3 text-sm text-cyan-100">Saved. Next review: {result.nextReview ? new Date(result.nextReview).toLocaleString() : "not scheduled"}.</p>
        <button type="button" onClick={onNext} className="mt-4 w-full rounded-xl bg-cyan-300/20 px-4 py-3 font-bold">{remaining > 1 ? "Next word" : "Finish practice"}</button>
      </div> : null}
    </section>
  </dialog>;
}
