"use client";

import { useState, useTransition } from "react";
import { Check, Save } from "lucide-react";
import { updatePracticeModuleMetadata } from "@/app/admin/activities/actions";

const categories = [["GRAMMAR", "Grammar"], ["VOCABULARY", "Vocabulary"], ["READING", "Reading"], ["WRITING", "Writing"], ["LISTENING", "Listening"], ["SPEAKING", "Speaking"]];

export function PracticeModuleSettings({ initial }: { initial: { id: string; title: string; description: string; category: string; level: string; accessType: string; status: "DRAFT" | "PUBLISHED" } }) {
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [category, setCategory] = useState(initial.category);
  const [level, setLevel] = useState(initial.level);
  const [accessType, setAccessType] = useState(initial.accessType === "ENROLLED" ? "FREE" : initial.accessType);
  const [status, setStatus] = useState(initial.status);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const save = (nextStatus: "DRAFT" | "PUBLISHED") => startTransition(async () => {
    try { await updatePracticeModuleMetadata(initial.id, { title, description, category, level, accessType, status: nextStatus }); setStatus(nextStatus); setMessage(nextStatus === "PUBLISHED" ? "Module published." : "Draft saved."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not save module details."); }
  });
  return <section className="mb-4 rounded-2xl border border-[var(--br-border)] bg-surface p-4 shadow-sm sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--br-brand)]">Practice Module</p><h1 className="mt-1 text-xl font-extrabold">Module details</h1></div><span className="rounded-full bg-[var(--br-surface-muted)] px-3 py-1 text-xs font-extrabold">{status}</span></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold sm:col-span-2">Title<input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded-xl border border-[var(--br-border)] px-3 py-2.5 font-normal" /></label><label className="text-sm font-bold sm:col-span-2">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-[var(--br-border)] px-3 py-2.5 font-normal" /></label><label className="text-sm font-bold">Category<select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1 w-full rounded-xl border border-[var(--br-border)] px-3 py-2.5 font-normal">{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-sm font-bold">CEFR level<select value={level} onChange={(event) => setLevel(event.target.value)} className="mt-1 w-full rounded-xl border border-[var(--br-border)] px-3 py-2.5 font-normal">{["A1", "A2", "B1", "B2", "C1"].map((value) => <option key={value}>{value}</option>)}</select></label><label className="text-sm font-bold sm:col-span-2">Access<select value={accessType} onChange={(event) => setAccessType(event.target.value)} className="mt-1 w-full rounded-xl border border-[var(--br-border)] px-3 py-2.5 font-normal"><option value="FREE">Free · account required</option><option value="PREMIUM">Premium · Practice Library access required</option></select></label></div><div className="mt-4 flex flex-wrap items-center gap-2"><button type="button" disabled={pending} onClick={() => save("DRAFT")} className="inline-flex items-center gap-2 rounded-xl border border-[var(--br-border)] px-4 py-2.5 text-sm font-bold"><Save size={15} />Save draft</button><button type="button" disabled={pending} onClick={() => save("PUBLISHED")} className="inline-flex items-center gap-2 rounded-xl bg-[var(--br-action)] px-4 py-2.5 text-sm font-bold text-on-dark"><Check size={15} />Publish module</button>{pending ? <span className="text-xs text-[var(--br-text-muted)]">Saving…</span> : null}{message ? <span role="status" className="text-xs font-bold text-[var(--br-action)]">{message}</span> : null}</div></section>;
}
