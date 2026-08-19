"use client";

import { Bot, CheckCircle2, Copy, Loader2, Plus, Send, ShieldCheck, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; content: string };
type Provider = "ollama" | "deepseek";
type Health = { connected: boolean; model?: string; provider?: Provider; providers?: Record<string, { configured?: boolean; connected?: boolean; models?: string[] }>; harness?: string; reason?: string };

const examples = ["Which courses have incomplete OBE mappings?", "Find published quizzes with no summative role.", "Audit the assessment readiness of my courses."];

export function BrenUpAiWorkspace() {
  const [health, setHealth] = useState<Health>({ connected: false });
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState("research");
  const [provider, setProvider] = useState<Provider>("ollama");
  const [model, setModel] = useState("qwen2.5:7b");
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetch("/api/admin/brenup-ai").then((r) => r.json()).then(setHealth).catch(() => setHealth({ connected: false })); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, pending]);

  async function send(value = input) {
    const message = value.trim();
    if (!message || pending) return;
    setInput(""); setMessages((current) => [...current, { role: "user", content: message }]); setPending(true);
    try {
      const response = await fetch("/api/admin/brenup-ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, mode, provider, model }) });
      const data = await response.json();
      setMessages((current) => [...current, { role: "assistant", content: data.answer || data.error || "The assistant did not return an answer." }]);
    } catch { setMessages((current) => [...current, { role: "assistant", content: "The local BrenUp AI gateway is offline." }]); }
    finally { setPending(false); }
  }

  const lastAnswer = [...messages].reverse().find((message) => message.role === "assistant")?.content;
  const providerModels = provider === "deepseek" ? ["deepseek-v4-flash", "deepseek-v4-pro"] : ["qwen2.5:7b", "gemma3:4b"];
  return <main className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
    <section className="flex min-h-[calc(100vh-3rem)] min-w-0 flex-col overflow-hidden rounded-3xl border border-[var(--br-border)] bg-surface shadow-[var(--br-shadow)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--br-border)] px-4 py-4 sm:px-6"><div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-2xl bg-[var(--br-dark-card)] text-white"><Bot className="size-5" /></div><div><h1 className="text-xl font-black text-ink">BrenUp AI</h1><p className="text-xs font-semibold text-[var(--br-text-muted)]">Local Ollama assistant · read-only</p></div></div><div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${health.connected ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{health.connected ? <CheckCircle2 className="size-4" /> : <WifiOff className="size-4" />}{health.connected ? "Connected" : "Offline"}</div></header>
      <div className="flex-1 overflow-y-auto p-4 sm:p-6"><div className="mx-auto max-w-3xl space-y-4">{!messages.length ? <div className="py-12 text-center"><Bot className="mx-auto size-12 text-[var(--br-brand)]" /><h2 className="mt-4 text-2xl font-black text-ink">What should I inspect?</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--br-text-muted)]">Ask about courses, lessons, quizzes, OBE readiness, media, notifications, or the BrenUp architecture.</p><div className="mt-6 flex flex-wrap justify-center gap-2">{examples.map((example) => <button key={example} type="button" onClick={() => send(example)} className="rounded-2xl border border-[var(--br-border)] bg-surface px-3 py-2 text-left text-xs font-bold text-ink hover:border-[var(--br-brand)]">{example}</button>)}</div></div> : messages.map((message, index) => <div key={`${message.role}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[92%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "bg-[var(--br-dark-card)] text-white" : "border border-[var(--br-border)] bg-[var(--br-surface-muted)] text-ink"}`}>{message.content}</div></div>)}{pending ? <div className="flex items-center gap-2 text-sm font-semibold text-[var(--br-text-muted)]"><Loader2 className="size-4 animate-spin" /> Inspecting BrenUp safely…</div> : null}<div ref={endRef} /></div></div>
      <form onSubmit={(event) => { event.preventDefault(); void send(); }} className="border-t border-[var(--br-border)] p-3 sm:p-4"><div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-[var(--br-border)] bg-surface p-2 focus-within:border-[var(--br-brand)]"><textarea value={input} onChange={(event) => setInput(event.target.value)} rows={2} placeholder="Ask BrenUp AI to inspect…" className="min-h-12 min-w-0 flex-1 resize-none border-0 bg-transparent px-2 py-1 text-sm outline-none" /><button disabled={!input.trim() || pending} className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--br-brand)] text-on-dark disabled:opacity-40"><Send className="size-4" /></button></div></form>
    </section>
    <aside className="space-y-4"><section className="rounded-3xl border border-[var(--br-border)] bg-surface p-4 shadow-sm"><div className="flex items-center gap-2"><ShieldCheck className="size-5 text-emerald-600" /><h2 className="font-black text-ink">Safety boundary</h2></div><p className="mt-3 text-sm leading-6 text-[var(--br-text-muted)]">Coding and content modes draft first. Production writes, publishing, deletion, deployment, secrets, and private learner data remain blocked.</p><p className="mt-3 text-xs font-bold text-emerald-700">Approval required for future write actions</p></section><section className="rounded-3xl border border-[var(--br-border)] bg-surface p-4 shadow-sm"><label className="text-xs font-black uppercase tracking-wide text-[var(--br-text-muted)]">Provider<select value={provider} onChange={(event) => { const next = event.target.value as Provider; setProvider(next); setModel(next === "deepseek" ? "deepseek-v4-flash" : "qwen2.5:7b"); }} className="mt-2 w-full rounded-xl border border-[var(--br-border)] bg-surface px-3 py-2 text-sm font-bold text-ink"><option value="ollama">Ollama · local</option><option value="deepseek" disabled={health.providers?.deepseek?.configured === false}>DeepSeek · paid API</option></select></label><label className="mt-3 block text-xs font-black uppercase tracking-wide text-[var(--br-text-muted)]">Model<select value={model} onChange={(event) => setModel(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--br-border)] bg-surface px-3 py-2 text-sm font-bold text-ink">{providerModels.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="mt-3 block text-xs font-black uppercase tracking-wide text-[var(--br-text-muted)]">Capability<select value={mode} onChange={(event) => setMode(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--br-border)] bg-surface px-3 py-2 text-sm font-bold text-ink"><option value="research">Research</option><option value="audit">Audit</option><option value="review">Review</option><option value="code-review">Code review</option><option value="coding">Coding draft</option><option value="content">Content draft</option></select></label><div className="mt-4 space-y-2 text-xs text-[var(--br-text-muted)]"><p><strong className="text-ink">Active:</strong> {provider} · {model}</p><p><strong className="text-ink">Gateway:</strong> {health.connected ? "Connected" : "Offline"}</p></div></section><section className="rounded-3xl border border-[var(--br-border)] bg-surface p-4 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-black text-ink">Session</h2><button type="button" onClick={() => setMessages([])} className="grid size-8 place-items-center rounded-lg border border-[var(--br-border)] text-[var(--br-text-muted)]"><Plus className="size-4" /></button></div><p className="mt-3 text-sm text-[var(--br-text-muted)]">Start a clean agent session.</p>{lastAnswer ? <button type="button" onClick={() => { void navigator.clipboard?.writeText(lastAnswer); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-[var(--br-brand)]"><Copy className="size-3" />{copied ? "Copied" : "Copy last answer"}</button> : null}</section></aside>
  </main>;
}
