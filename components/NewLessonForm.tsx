"use client";

import { Plus, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createLessonFromPaths } from "@/app/admin/lessons/actions";

type AudioRow = { id: number; label: string; file: File | null };

export function NewLessonForm() {
  const [rows, setRows] = useState<AudioRow[]>([{ id: 0, label: "", file: null }]);
  const [pdf, setPdf] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!pdf) {
      setError("Please select a PDF file.");
      return;
    }

    setUploading(true);
    const supabase = createClient();
    const lessonId = crypto.randomUUID();

    try {
      // Upload PDF directly to Supabase Storage from the browser
      const pdfExt = pdf.name.split(".").pop()?.toLowerCase() ?? "pdf";
      const pdfPath = `${lessonId}/lesson.${pdfExt}`;
      const { error: pdfErr } = await supabase.storage
        .from("lessons")
        .upload(pdfPath, pdf, { contentType: pdf.type || "application/pdf", upsert: true });
      if (pdfErr) throw new Error(`PDF upload failed: ${pdfErr.message}`);

      // Upload each audio file directly to Supabase Storage from the browser
      const audioPaths: { label: string; path: string }[] = [];
      for (const row of rows) {
        if (!row.file) continue;
        const ext = row.file.name.split(".").pop()?.toLowerCase() ?? "mp3";
        const audioPath = `${lessonId}/${crypto.randomUUID()}.${ext}`;
        const { error: audioErr } = await supabase.storage
          .from("lesson-audio")
          .upload(audioPath, row.file, { contentType: row.file.type || "audio/mpeg", upsert: true });
        if (audioErr) throw new Error(`Audio upload failed: ${audioErr.message}`);
        audioPaths.push({ label: row.label || row.file.name, path: audioPath });
      }

      // Now call the server action with just text/paths — no files
      const form = e.currentTarget;
      const data = new FormData(form);
      data.set("lessonId", lessonId);
      data.set("pdfPath", pdfPath);
      data.set("audioPaths", JSON.stringify(audioPaths));

      const result = await createLessonFromPaths(data);
      if (result.message) throw new Error(result.message);
      if (result.lessonId) {
        window.location.href = `/admin/lessons/${result.lessonId}/edit`;
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-lg border border-black/10 bg-white p-6 shadow-sm">
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
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
          className="mt-1 w-full rounded-md border border-black/15 px-3 py-2"
        />
      </label>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Audio files</h2>
          <button
            type="button"
            onClick={() => setRows((r) => [...r, { id: Date.now(), label: "", file: null }])}
            className="inline-flex items-center gap-2 rounded-md border border-black/15 px-3 py-2 text-sm hover:bg-black/5"
          >
            <Plus size={16} /> Add audio
          </button>
        </div>
        {rows.map((row) => (
          <div key={row.id} className="grid gap-3 rounded-md bg-black/[0.03] p-3 md:grid-cols-[1fr_1fr_auto]">
            <input
              placeholder="Listening - The Birthday Surprise"
              value={row.label}
              onChange={(e) => setRows((r) => r.map((x) => x.id === row.id ? { ...x, label: e.target.value } : x))}
              className="rounded-md border border-black/15 px-3 py-2 text-sm"
            />
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => setRows((r) => r.map((x) => x.id === row.id ? { ...x, file: e.target.files?.[0] ?? null } : x))}
              className="rounded-md border border-black/15 px-3 py-2 text-sm"
            />
            <button
              type="button"
              aria-label="Remove audio"
              onClick={() => setRows((r) => r.filter((x) => x.id !== row.id))}
              className="rounded-md border border-black/15 px-3 py-2 hover:bg-black/5"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </section>

      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={uploading}
        className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        <Upload size={16} /> {uploading ? "Uploading..." : "Upload and parse"}
      </button>
    </form>
  );
}
