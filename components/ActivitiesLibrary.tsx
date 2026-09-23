"use client";

import { BookOpen, Headphones, Mic2, PenLine, Sparkles, Type } from "lucide-react";
import { useState } from "react";

const categories = [
  { id: "GRAMMAR", label: "Grammar", Icon: Type },
  { id: "VOCABULARY", label: "Vocabulary", Icon: BookOpen },
  { id: "READING", label: "Reading", Icon: BookOpen },
  { id: "WRITING", label: "Writing", Icon: PenLine },
  { id: "LISTENING", label: "Listening", Icon: Headphones },
  { id: "SPEAKING", label: "Speaking", Icon: Mic2 },
] as const;

type PublishedModule = { id: string; title: string; description: string | null; category: string; level: string; access_type: string };

export function ActivitiesLibrary({ modules }: { modules: PublishedModule[] }) {
  const [selected, setSelected] = useState<(typeof categories)[number]["id"]>("GRAMMAR");
  const category = categories.find((item) => item.id === selected) ?? categories[0];
  return <>
    <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Practice categories">
      {categories.map(({ id, label, Icon }) => <button key={id} type="button" role="tab" aria-selected={selected === id} onClick={() => setSelected(id)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-extrabold transition ${selected === id ? "bg-[var(--br-action)] text-on-dark shadow-sm" : "border border-[var(--br-border)] bg-surface text-[var(--br-text-muted)] hover:border-[var(--br-action)]/50 hover:text-[var(--br-action)]"}`}><Icon size={16} />{label}</button>)}
    </div>
    {modules.filter((item) => item.category === selected).length ? <div className="mt-5 grid gap-3 sm:grid-cols-2">{modules.filter((item) => item.category === selected).map((module) => <article key={module.id} className="rounded-2xl border border-[var(--br-border)] bg-surface p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><span className="rounded-full bg-[var(--br-action)]/10 px-2.5 py-1 text-[11px] font-extrabold text-[var(--br-action)]">{module.level}</span><span className="text-xs font-bold text-[var(--br-text-muted)]">{module.access_type === "ENROLLED" ? "Enrolled" : "Free"}</span></div><h3 className="mt-4 font-extrabold">{module.title}</h3><p className="mt-1 text-sm leading-5 text-[var(--br-text-muted)]">{module.description || "Focused practice module"}</p></article>)}</div> : <div className="mt-5 rounded-2xl border border-dashed border-[var(--br-border)] bg-[var(--br-surface-muted)]/55 px-5 py-12 text-center"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[var(--br-action)]/10 text-[var(--br-action)]"><Sparkles size={21} /></div><h3 className="mt-4 text-lg font-extrabold">No {category.label.toLowerCase()} activities yet</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--br-text-muted)]">New {category.label.toLowerCase()} practice will appear here when it is published.</p></div>}
  </>;
}
