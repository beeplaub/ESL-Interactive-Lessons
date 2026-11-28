"use client";

import { useRef, useState } from "react";
import { ExternalLink, FileText, Globe2, LoaderCircle, Link2, Trash2, UploadCloud } from "lucide-react";
import { formatResourceSize, type CourseResourceView } from "@/components/courseResourcesTypes";

export function CourseResourcesManager({ courseId, initialResources }: { courseId: string; initialResources: CourseResourceView[] }) {
  const [resources, setResources] = useState(initialResources);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [resourceType, setResourceType] = useState<"UPLOAD" | "FILE_LINK" | "WEB_LINK">("UPLOAD");
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(formData: FormData) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/admin/courses/${encodeURIComponent(courseId)}/resources`, { method: "POST", body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Upload failed.");
      setResources((current) => [...current, result.resource]);
      setMessage(resourceType === "UPLOAD" ? "Resource uploaded to private R2." : "Resource link added.");
      if (fileRef.current) fileRef.current.value = "";
      const form = document.getElementById("course-resource-upload-form") as HTMLFormElement | null;
      form?.reset();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not upload the file."); }
    finally { setBusy(false); }
  }

  async function remove(resource: CourseResourceView) {
    if (!window.confirm(`Delete “${resource.title}” from this course?`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/admin/courses/${encodeURIComponent(courseId)}/resources/${encodeURIComponent(resource.id)}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not delete the resource.");
      setResources((current) => current.filter((item) => item.id !== resource.id));
      setMessage("Resource deleted.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete the file."); }
    finally { setBusy(false); }
  }

  const modes = [
    { id: "UPLOAD" as const, label: "Upload file", detail: "Private R2", Icon: UploadCloud },
    { id: "FILE_LINK" as const, label: "File link", detail: "PDF, image, audio…", Icon: Link2 },
    { id: "WEB_LINK" as const, label: "Website", detail: "Article or page", Icon: Globe2 },
  ];

  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
    <section className="min-w-0 rounded-2xl border border-[var(--br-border)] bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--br-border)] px-4 py-4 sm:px-5"><div><h3 className="font-bold text-ink">Shared resources</h3><p className="mt-1 text-sm text-[var(--br-text-muted)]">Private files and links available to enrolled learners.</p></div><span className="rounded-full bg-[var(--br-brand-soft)] px-2.5 py-1 text-xs font-bold text-[var(--br-brand)]">{resources.length}</span></header>
      <div className="divide-y divide-[var(--br-border)]">{resources.map((resource) => <article key={resource.id} className="flex min-w-0 items-center gap-3 px-4 py-3.5 sm:px-5"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--br-brand-soft)] text-[var(--br-brand)]">{resource.resource_type === "WEB_LINK" ? <Globe2 size={17} /> : resource.resource_type === "FILE_LINK" ? <ExternalLink size={17} /> : <FileText size={17} />}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{resource.title}</p><p className="truncate text-xs text-[var(--br-text-muted)]">{resource.file_name} · {resource.resource_type === "UPLOAD" ? formatResourceSize(resource.file_size) : resource.resource_type === "WEB_LINK" ? "Website link" : "File link"}</p></div><button type="button" disabled={busy} onClick={() => void remove(resource)} className="grid size-9 shrink-0 place-items-center rounded-lg text-[var(--br-danger)] hover:bg-[var(--br-danger)]/10 disabled:opacity-50" aria-label={`Delete ${resource.title}`}><Trash2 size={16} /></button></article>)}
      {!resources.length ? <p className="px-5 py-10 text-center text-sm text-[var(--br-text-muted)]">No course resources yet. Upload the first file using the card beside this list.</p> : null}</div>
    </section>
    <form id="course-resource-upload-form" action={upload} className="h-fit rounded-2xl border border-[var(--br-border)] bg-surface p-4 sm:p-5">
      <input type="hidden" name="resourceType" value={resourceType} />
      <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[var(--br-brand-soft)] text-[var(--br-brand)]">{resourceType === "UPLOAD" ? <UploadCloud size={19} /> : resourceType === "FILE_LINK" ? <Link2 size={19} /> : <Globe2 size={19} />}</span><div><h3 className="font-bold text-ink">Add a resource</h3><p className="text-xs text-[var(--br-text-muted)]">Choose how to share it</p></div></div>
      <div className="mt-4 grid grid-cols-3 gap-1.5 rounded-xl bg-[var(--br-surface-muted)] p-1" role="group" aria-label="Resource type">{modes.map(({ id, label, detail, Icon }) => <button key={id} type="button" aria-pressed={resourceType === id} onClick={() => { setResourceType(id); setError(""); setMessage(""); }} className={`min-w-0 rounded-lg px-1.5 py-2 text-center transition ${resourceType === id ? "bg-surface text-[var(--br-brand)] shadow-sm ring-1 ring-[var(--br-brand)]/10" : "text-[var(--br-text-muted)] hover:text-[var(--br-text)]"}`}><Icon size={16} className="mx-auto" /><span className="mt-1 block truncate text-[11px] font-bold">{label}</span><span className="hidden truncate text-[9px] sm:block">{detail}</span></button>)}</div>
      <p className="mt-3 text-xs leading-5 text-[var(--br-text-muted)]">{resourceType === "UPLOAD" ? "Your file is stored privately in R2. Enrolled learners get a short-lived download." : resourceType === "FILE_LINK" ? "Paste a direct file URL. We use its filename extension for the file type; if it has none, it appears as a linked file." : "Share an article, resource page, or other website. Learners open it in a new tab."}</p>
      <label className="mt-4 block text-sm font-semibold text-ink">Display title<input name="title" required maxLength={120} placeholder="e.g. Intonation Practice Pack" className="mt-1.5 w-full rounded-lg border border-[var(--br-border)] px-3 py-2.5 text-sm" /></label>
      <label className="mt-3 block text-sm font-semibold text-ink">Short description <span className="font-normal text-[var(--br-text-muted)]">(optional)</span><textarea name="description" maxLength={300} rows={2} placeholder="What learners will find in this file" className="mt-1.5 w-full resize-y rounded-lg border border-[var(--br-border)] px-3 py-2.5 text-sm" /></label>
      {resourceType === "UPLOAD" ? <label className="mt-3 block text-sm font-semibold text-ink">Choose a file<input ref={fileRef} name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp,.mp3,.m4a,.wav,.docx,.xlsx" className="mt-1.5 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--br-brand-soft)] file:px-3 file:py-2 file:font-bold file:text-[var(--br-brand)]" /></label> : <label className="mt-3 block text-sm font-semibold text-ink">{resourceType === "FILE_LINK" ? "Direct file URL" : "Website URL"}<input name="url" type="url" required placeholder={resourceType === "FILE_LINK" ? "https://example.com/practice-pack.pdf" : "https://example.com/article"} className="mt-1.5 w-full rounded-lg border border-[var(--br-border)] px-3 py-2.5 text-sm" /></label>}
      {error ? <p role="alert" className="mt-3 text-sm font-semibold text-[var(--br-danger)]">{error}</p> : null}{message ? <p role="status" className="mt-3 text-sm font-semibold text-emerald-700">{message}</p> : null}
      <button type="submit" disabled={busy} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--br-brand)] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:brightness-105 disabled:opacity-60">{busy ? <LoaderCircle size={16} className="animate-spin" /> : resourceType === "UPLOAD" ? <UploadCloud size={16} /> : <ExternalLink size={16} />}{busy ? "Working…" : resourceType === "UPLOAD" ? "Upload to R2" : "Add link"}</button>
    </form>
  </div>;
}
