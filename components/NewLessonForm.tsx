"use client";

import { Plus, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { createLesson } from "@/app/admin/lessons/actions";

export function NewLessonForm() {
  const [rows, setRows] = useState([0]);

  return (
    <form action={createLesson} className="space-y-6 rounded-lg border border-black/10 bg-white p-6 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm">
          Title
          <input name="title" required className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
        <label className="text-sm">
          Topic
          <input name="topic" required placeholder="Rumor" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
        </label>
        <label className="text-sm">
          Level
          <select name="level" defaultValue="B1" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">
            {["A1", "A2", "B1", "B2", "C1", "C2"].map((level) => (
              <option key={level}>{level}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm">
        Description
        <textarea name="description" rows={3} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
      </label>
      <label className="block text-sm">
        Lesson PDF
        <input name="pdf" type="file" accept="application/pdf" required className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
      </label>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Audio files</h2>
          <button
            type="button"
            onClick={() => setRows((current) => [...current, Date.now()])}
            className="inline-flex items-center gap-2 rounded-md border border-black/15 px-3 py-2 text-sm hover:bg-black/5"
          >
            <Plus size={16} /> Add audio
          </button>
        </div>
        {rows.map((row, index) => (
          <div key={row} className="grid gap-3 rounded-md bg-black/[0.03] p-3 md:grid-cols-[1fr_1fr_auto]">
            <input name={`audioLabel-${index}`} placeholder="Listening - The Birthday Surprise" className="rounded-md border border-black/15 px-3 py-2 text-sm" />
            <input name={`audioFile-${index}`} type="file" accept="audio/*" className="rounded-md border border-black/15 px-3 py-2 text-sm" />
            <button
              type="button"
              aria-label="Remove audio"
              onClick={() => setRows((current) => current.filter((item) => item !== row))}
              className="rounded-md border border-black/15 px-3 py-2 hover:bg-black/5"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </section>

      <button className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white">
        <Upload size={16} /> Upload and parse
      </button>
    </form>
  );
}
