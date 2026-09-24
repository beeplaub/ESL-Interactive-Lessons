"use client";

import { BookOpen, Headphones, Image as ImageIcon, Mic2, PenLine, Sparkles, Type } from "lucide-react";
import { useState } from "react";
import Link from "next/link";

const categories = [
  { id: "GRAMMAR", label: "Grammar", Icon: Type },
  { id: "VOCABULARY", label: "Vocabulary", Icon: BookOpen },
  { id: "READING", label: "Reading", Icon: BookOpen },
  { id: "WRITING", label: "Writing", Icon: PenLine },
  { id: "LISTENING", label: "Listening", Icon: Headphones },
  { id: "SPEAKING", label: "Speaking", Icon: Mic2 },
] as const;

type PublishedModule = { id: string; title: string; description: string | null; category: string; level: string; access_type: string; feature_image_path?: string | null };

function resolveModuleImage(value?: string | null) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return value.startsWith("/") ? value : `/${value}`;
}

export function ActivitiesLibrary({ modules, hasPremiumAccess, isAuthenticated }: { modules: PublishedModule[]; hasPremiumAccess: boolean; isAuthenticated: boolean }) {
  const [selected, setSelected] = useState<(typeof categories)[number]["id"]>("GRAMMAR");
  const category = categories.find((item) => item.id === selected) ?? categories[0];
  return <>
    <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Practice categories">
      {categories.map(({ id, label, Icon }) => <button key={id} type="button" role="tab" aria-selected={selected === id} onClick={() => setSelected(id)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-extrabold transition ${selected === id ? "bg-[var(--br-action)] text-on-dark shadow-sm" : "border border-[var(--br-border)] bg-surface text-[var(--br-text-muted)] hover:border-[var(--br-action)]/50 hover:text-[var(--br-action)]"}`}><Icon size={16} />{label}</button>)}
    </div>
    {modules.filter((item) => item.category === selected).length ? <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{modules.filter((item) => item.category === selected).map((module) => { const locked = (module.access_type === "PREMIUM" && !hasPremiumAccess) || !isAuthenticated; const href = !isAuthenticated ? `/login?next=${encodeURIComponent(`/activities/${module.id}`)}` : locked ? "/activities/subscribe" : `/activities/${module.id}`; const image = resolveModuleImage(module.feature_image_path); return <Link key={module.id} href={href} className={`group aspect-square overflow-hidden rounded-2xl border border-[var(--br-border)] bg-surface shadow-sm transition hover:border-[var(--br-action)]/50 hover:shadow-md ${locked ? "opacity-90" : ""}`}><div className="relative h-1/2 overflow-hidden bg-[var(--br-surface-muted)]">{image ? <><img src={image} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" loading="lazy" /><div className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" /></> : <div className="grid h-full place-items-center text-[var(--br-text-muted)]"><ImageIcon size={32} /></div>}<span className="absolute left-3 top-3 rounded-full bg-surface/95 px-2.5 py-1 text-[11px] font-extrabold text-[var(--br-action)]">{module.level}</span><span className="absolute right-3 top-3 rounded-full bg-surface/95 px-2.5 py-1 text-[11px] font-bold text-[var(--br-text-muted)]">{module.access_type === "PREMIUM" ? "Premium" : "Free"}</span></div><div className="flex h-1/2 flex-col p-4"><h3 className="line-clamp-2 font-extrabold">{module.title}</h3><p className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--br-text-muted)]">{module.description || "Focused practice module"}</p><p className="mt-auto pt-3 text-xs font-extrabold text-[var(--br-action)]">{locked ? isAuthenticated ? "See access options →" : "Sign in to practise →" : "Open module →"}</p></div></Link>; })}</div> : <div className="mt-5 rounded-2xl border border-dashed border-[var(--br-border)] bg-[var(--br-surface-muted)]/55 px-5 py-12 text-center"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[var(--br-action)]/10 text-[var(--br-action)]"><Sparkles size={21} /></div><h3 className="mt-4 text-lg font-extrabold">No {category.label.toLowerCase()} activities yet</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--br-text-muted)]">New {category.label.toLowerCase()} practice will appear here when it is published.</p></div>}
  </>;
}
