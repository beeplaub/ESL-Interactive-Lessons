"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Clock3, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type Props = { name: string; defaultValue?: string; label?: string };

function localDate(value: string) {
  if (!value) return new Date();
  const [date] = value.split("T");
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function BrenDateTimeField({ name, defaultValue = "", label }: Props) {
  const [mounted, setMounted] = useState(false);
  const [value, setValue] = useState(defaultValue);
  const initial = localDate(defaultValue);
  const [month, setMonth] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [date, setDate] = useState(defaultValue ? defaultValue.slice(0, 10) : "");
  const [time, setTime] = useState(defaultValue?.slice(11, 16) || "09:00");
  const [open, setOpen] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (open) document.body.dataset.brenDatePickerOpen = "true";
    else if (document.querySelectorAll("[data-bren-date-picker=\"open\"]").length === 0) delete document.body.dataset.brenDatePickerOpen;
    return () => { delete document.body.dataset.brenDatePickerOpen; };
  }, [open]);
  const days = useMemo(() => { const first = new Date(month.getFullYear(), month.getMonth(), 1).getDay(); const total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate(); return [...Array(first).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)]; }, [month]);
  const display = value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : label || "Choose date and time";
  const apply = () => { if (!date) return; const [year, monthNumber, day] = date.split("-").map(Number); const [hours, minutes] = time.split(":").map(Number); setValue(new Date(year, monthNumber - 1, day, hours, minutes).toISOString()); setOpen(false); };
  const chooseToday = () => { const now = new Date(); setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); setDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`); };
  return <div className="relative"><input type="hidden" name={name} value={value} /><button type="button" onClick={(event) => { event.stopPropagation(); setOpen(true); }} className="field flex h-10 w-full items-center justify-between gap-2 text-left text-sm"><span className={value ? "text-ink" : "text-[var(--br-text-muted)]"}>{display}</span><CalendarDays size={16} className="shrink-0 text-[var(--br-brand)]" /></button>{open && mounted ? createPortal(<div data-bren-date-picker="open" data-bren-date-picker-portal="true" className="bren-date-picker-portal fixed inset-0 z-[9999] grid place-items-center bg-black/35 p-3 backdrop-blur-sm pointer-events-auto" role="dialog" aria-modal="true" onClick={(event) => { event.stopPropagation(); if (event.target === event.currentTarget) setOpen(false); }} onMouseDown={(event) => { event.stopPropagation(); }}><div className="bren-date-picker-panel pointer-events-auto w-full max-w-xs rounded-2xl border border-[var(--br-border)] bg-surface p-3 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-wider text-[var(--br-brand)]">Schedule</p><h3 className="mt-0.5 text-sm font-semibold">Choose date and time</h3></div><button type="button" onClick={() => setOpen(false)} className="grid size-8 place-items-center rounded-full border border-[var(--br-border)]" aria-label="Close date picker"><X size={15} /></button></div><div className="mt-2 flex items-center justify-between"><button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="grid size-8 place-items-center rounded-lg hover:bg-[var(--br-surface-muted)]"><ChevronLeft size={16} /></button><p className="text-sm font-bold">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p><button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="grid size-8 place-items-center rounded-lg hover:bg-[var(--br-surface-muted)]"><ChevronRight size={16} /></button></div><div className="mt-1 grid grid-cols-7 gap-0.5 text-center text-[10px] font-bold text-[var(--br-text-muted)]">{["S", "M", "T", "W", "T", "F", "S"].map((day, i) => <span key={`${day}-${i}`} className="py-1">{day}</span>)}{days.map((day, i) => day ? <button type="button" key={day} onClick={() => setDate(`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`)} className={`grid aspect-square place-items-center rounded-md text-xs ${date === `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` ? "bg-[var(--br-brand)] text-on-dark" : "hover:bg-[var(--br-brand)]/10"}`}>{day}</button> : <span key={`empty-${i}`} />)}</div><label className="mt-2 block text-xs font-semibold"><span className="flex items-center gap-1"><Clock3 size={13} /> Time</span><input type="time" value={time} onChange={(event) => setTime(event.target.value)} className="field mt-1 h-9 w-full text-sm" /></label><div className="mt-3 flex justify-end gap-1.5"><button type="button" onClick={() => { setValue(""); setDate(""); setOpen(false); }} className="rounded-lg border border-[var(--br-border)] px-2.5 py-1.5 text-xs font-bold">Clear</button><button type="button" onClick={chooseToday} className="rounded-lg border border-[var(--br-border)] px-2.5 py-1.5 text-xs font-bold">Today</button><button type="button" onClick={apply} className="rounded-lg bg-[var(--br-brand)] px-3 py-1.5 text-xs font-bold text-on-dark">Apply</button></div></div></div>, document.body) : null}</div>;
}
