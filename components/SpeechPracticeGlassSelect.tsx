"use client";

import { useId, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export function SpeechPracticeGlassSelect({ label, value, options, onChange, className = "" }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const listboxId = useId();
  const selected = options.find((option) => option.value === value);
  return <div className={`relative min-w-0 ${className}`} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <button type="button" role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={listboxId} onClick={() => setOpen((current) => !current)} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); if ((event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") && !open) { event.preventDefault(); setOpen(true); } }} className="flex min-h-10 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-white/90 bg-white/80 px-3 text-left text-sm font-semibold text-slate-800 shadow-[0_6px_20px_-12px_rgba(67,56,202,.38)] outline-none ring-1 ring-slate-900/[0.05] backdrop-blur-xl transition hover:bg-white focus-visible:border-indigo-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-indigo-300">
      <span className="truncate">{selected?.label ?? `Choose ${label.toLocaleLowerCase()}`}</span><ChevronDown size={15} className={`shrink-0 text-indigo-500 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    {open ? <div id={listboxId} role="listbox" aria-label={label} className="absolute inset-x-0 top-[calc(100%+7px)] z-40 max-h-64 overflow-y-auto rounded-2xl border border-white/90 bg-white/90 p-1.5 shadow-[0_22px_55px_-20px_rgba(30,41,59,.42)] ring-1 ring-slate-900/[0.06] backdrop-blur-2xl">
      {options.map((option) => <button key={option.value} type="button" role="option" aria-selected={value === option.value} onClick={() => { onChange(option.value); setOpen(false); }} className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition focus-visible:bg-indigo-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-indigo-300 ${value === option.value ? "bg-indigo-50/90 font-bold text-indigo-800" : "font-medium text-slate-700 hover:bg-slate-50"}`}><span>{option.label}</span>{value === option.value ? <Check size={15} className="shrink-0 text-indigo-600" /> : null}</button>)}
    </div> : null}
  </div>;
}
