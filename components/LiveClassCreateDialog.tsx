"use client";

import { CalendarDays, Clock3, Plus, Radio, X } from "lucide-react";
import { useState } from "react";
import { BrenDateTimeField } from "./BrenDateTimeField";

type Option = { id: string; title?: string; name?: string; level?: string | null };
type Action = (formData: FormData) => void | Promise<void>;

export function LiveClassCreateDialog({ classes, courses, lessons, scheduleAction, instantAction }: { classes: Option[]; courses: Option[]; lessons: Option[]; scheduleAction: Action; instantAction: Action }) {
  const [open, setOpen] = useState(false);
  const [instant, setInstant] = useState(false);
  const show = (startNow: boolean) => { setInstant(startNow); setOpen(true); };
  return <>
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => show(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--br-success)] px-3 py-2 text-sm font-extrabold text-on-dark shadow-sm"><Radio size={15} /> Start live now</button>
      <button type="button" onClick={() => show(false)} className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-2 text-sm font-extrabold text-[var(--br-chart-primary)] shadow-sm"><Plus size={15} /> New live class</button>
    </div>
    {open ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="live-class-create-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="w-full max-w-xl rounded-2xl border border-[var(--br-border)] bg-surface p-5 shadow-2xl sm:p-6" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[var(--br-brand)]">Live classroom</p><h2 id="live-class-create-title" className="mt-1 text-xl font-extrabold">{instant ? "Start a live class" : "Create a live class"}</h2><p className="mt-1 text-sm text-[var(--br-text-muted)]">{instant ? "Open the room now. You can add whiteboards or course slides after you enter." : "Schedule a room for later or leave the date empty for a draft."}</p></div><button type="button" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-full border border-[var(--br-border)]" aria-label="Close"><X size={17} /></button></div>
        <form action={instant ? instantAction : scheduleAction} className="mt-5 grid gap-3">
          <input name="title" required placeholder="Class title" className="field" autoFocus />
          <select name="classId" required className="field"><option value="">Choose class...</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}{item.level ? ` (${item.level})` : ""}</option>)}</select>
          <div className="grid gap-3 sm:grid-cols-2"><select name="courseId" className="field"><option value="">Course context (optional)</option>{courses.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><select name="lessonId" className="field"><option value="">Lesson to present (optional)</option>{lessons.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div>
          {!instant ? <BrenDateTimeField name="scheduledAt" label="Choose date and time (optional)" /> : <input type="hidden" name="scheduledAt" value="" />}
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-[var(--br-text-muted)]"><span className="mb-1 flex items-center gap-1"><Clock3 size={13} /> Duration</span><input name="durationMinutes" type="number" min="5" max="480" defaultValue="60" className="field" /></label><label className="text-xs font-bold text-[var(--br-text-muted)]"><span className="mb-1 flex items-center gap-1"><CalendarDays size={13} /> Meeting link (optional)</span><input name="externalMeetingUrl" type="url" placeholder="Meet or WhatsApp link" className="field" /></label></div>
          <textarea name="description" rows={2} placeholder="Description (optional)" className="field" />
          <p className="text-xs leading-5 text-[var(--br-text-muted)]">Leave course and lesson empty for a whiteboard-only problem-solving class.</p>
          <div className="flex justify-end gap-2 border-t border-[var(--br-border)] pt-4"><button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm font-bold text-[var(--br-text-muted)]">Cancel</button><button className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-extrabold text-on-dark ${instant ? "bg-[var(--br-success)]" : "bg-[var(--br-chart-primary)]"}`}>{instant ? <Radio size={15} /> : <Plus size={15} />}{instant ? "Start live class" : "Create live class"}</button></div>
        </form>
      </div>
    </div> : null}
  </>;
}
