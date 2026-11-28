"use client";

import { useMemo, useState } from "react";
import { AudioLines, Download, ExternalLink, FileImage, FileSpreadsheet, FileText, Search } from "lucide-react";
import { formatResourceSize, resourceKindLabel, type CourseResourceView } from "@/components/courseResourcesTypes";

type Filter = "All files" | "PDFs" | "Images" | "Audio" | "Links";

function category(mime: string): Filter | "Other" {
  if (mime === "application/pdf") return "PDFs";
  if (mime.startsWith("image/")) return "Images";
  if (mime.startsWith("audio/")) return "Audio";
  return "Other";
}

function ResourceIcon({ resource }: { resource: CourseResourceView }) {
  const typeLabel = resourceKindLabel(resource);
  if (resource.mime_type.startsWith("image/") && resource.preview_url) {
    return <span className="relative block size-14 shrink-0 overflow-hidden rounded-xl border border-[var(--br-border)] bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element -- Private R2 preview uses a short-lived signed URL; remote creator links are also allowed. */}
      <img src={resource.preview_url} alt={`${resource.title} preview`} className="size-full object-cover" />
    </span>;
  }

  const isWebsite = resource.resource_type === "WEB_LINK";
  const isPdf = resource.mime_type === "application/pdf";
  const isAudio = resource.mime_type.startsWith("audio/");
  const isImage = resource.mime_type.startsWith("image/");
  const isSpreadsheet = /spreadsheet|excel/.test(resource.mime_type);

  if (isPdf) return <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-[#fff0ec]" aria-hidden="true">
    <svg viewBox="0 0 56 56" className="size-12" fill="none">
      <path d="M15 7h17l10 10v29a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3V10a3 3 0 0 1 3-3Z" fill="#F76855" />
      <path d="M32 7v9a2 2 0 0 0 2 2h8" fill="#FFC0B3" />
      <path d="M18 25h18M18 30h21" stroke="#FFE7E2" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="17" y="35" width="23" height="11" rx="5.5" fill="white" />
      <text x="28.5" y="43" textAnchor="middle" fill="#E95043" fontSize="6.5" fontWeight="800" fontFamily="Arial, sans-serif">PDF</text>
    </svg><span className="sr-only">{typeLabel}</span>
  </span>;

  if (isAudio) return <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-[#f1ecff]" aria-hidden="true">
    <svg viewBox="0 0 56 56" className="size-12" fill="none">
      <circle cx="27" cy="27" r="19" fill="#6840F5" />
      <path d="M17 25v5m6-12v19m6-24v29m6-22v15m6-12v9" stroke="white" strokeWidth="3" strokeLinecap="round" />
      <circle cx="42" cy="42" r="8" fill="#FF705B" stroke="#F1ECFF" strokeWidth="2.5" />
      <path d="M41 38.5v7l5-3.5-5-3.5Z" fill="white" />
    </svg><span className="sr-only">{typeLabel}</span>
  </span>;

  if (isWebsite) return <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-[#e9f8fa]" aria-hidden="true">
    <svg viewBox="0 0 56 56" className="size-12" fill="none">
      <rect x="9" y="7" width="38" height="42" rx="9" fill="#319ECB" />
      <path d="M9 16a9 9 0 0 1 9-9h20a9 9 0 0 1 9 9v3H9v-3Z" fill="#36C4BE" />
      <circle cx="28" cy="31" r="12" stroke="white" strokeWidth="2" />
      <path d="M16 31h24M28 19c-4.5 4.5-4.5 19.5 0 24m0-24c4.5 4.5 4.5 19.5 0 24" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="15" cy="12.5" r="1.3" fill="#EAFBFF" /><circle cx="19.5" cy="12.5" r="1.3" fill="#EAFBFF" />
    </svg><span className="sr-only">{typeLabel}</span>
  </span>;

  const Icon = isImage ? FileImage : isSpreadsheet ? FileSpreadsheet : isAudio ? AudioLines : FileText;
  const color = isImage || isSpreadsheet ? "bg-[#e8f8f2] text-[#15966e]" : "bg-[#eef2ff] text-[#4d5fc2]";
  return <span className={`grid size-14 shrink-0 place-items-center rounded-xl ${color}`}><Icon size={27} strokeWidth={2.1} aria-hidden="true" /><span className="sr-only">{typeLabel}</span></span>;
}

export function CourseResourcesList({ courseId, resources }: { courseId: string; resources: CourseResourceView[] }) {
  const [filter, setFilter] = useState<Filter>("All files");
  const [query, setQuery] = useState("");
  const filters: Filter[] = ["All files", "PDFs", "Images", "Audio", "Links"];
  const filtered = useMemo(() => resources.filter((resource) => {
    const matchesFilter = filter === "All files"
      || (filter === "Links" ? resource.resource_type !== "UPLOAD" : resource.resource_type !== "WEB_LINK" && category(resource.mime_type) === filter);
    const term = query.trim().toLowerCase();
    return matchesFilter && (!term || `${resource.title} ${resource.description ?? ""} ${resource.file_name}`.toLowerCase().includes(term));
  }), [filter, query, resources]);

  return <section className="min-w-0" aria-label="Course resources">
    <div className="mt-4 flex min-w-0 flex-col items-stretch gap-2.5 sm:flex-row sm:items-center sm:gap-3">
      <label className="relative block min-w-0 w-full sm:flex-1"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--br-text-muted)]" /><span className="sr-only">Search resources</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search resources" className="h-10 w-full rounded-xl border border-[var(--br-border)] bg-white pl-9 pr-2 text-xs outline-none shadow-none ring-0 transition-colors placeholder:text-[var(--br-text-muted)] focus:border-[#653cff] focus:outline-none focus:ring-0 focus:shadow-none sm:pr-3 sm:text-sm" /></label>
      <div className="grid w-full min-w-0 grid-cols-[repeat(5,minmax(0,1fr))] gap-1.5 sm:flex sm:w-auto sm:shrink-0 sm:gap-2" role="group" aria-label="Filter resources">
      {filters.map((item) => <button key={item} type="button" onClick={() => setFilter(item)} aria-pressed={filter === item} className={`h-9 min-w-0 w-full whitespace-nowrap rounded-xl border px-0.5 text-[10px] font-bold transition-colors sm:w-auto sm:px-2.5 sm:text-xs ${filter === item ? "border-[#653cff] bg-[#653cff] text-white shadow-sm" : "border-[var(--br-border)] bg-white text-[var(--br-text-muted)] hover:border-[#653cff]/60 hover:text-[#653cff]"}`}>{item}</button>)}
      </div>
    </div>
    {filtered.length ? <div className="mt-4 grid gap-3 lg:grid-cols-2">{filtered.map((resource) => <article key={resource.id} className="flex min-w-0 items-center gap-3 rounded-2xl border border-[var(--br-border)] bg-surface p-3.5 shadow-[var(--br-shadow)] sm:gap-4 sm:p-4">
      <ResourceIcon resource={resource} />
      <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-extrabold text-[var(--br-text)]">{resource.title}</h3><p className="mt-1 truncate text-xs text-[var(--br-text-muted)]">{resource.resource_type === "WEB_LINK" ? (resource.external_url ? new URL(resource.external_url).hostname : "Website") : resource.file_name} <span aria-hidden="true">·</span> {resource.resource_type === "UPLOAD" ? formatResourceSize(resource.file_size) : resourceKindLabel(resource)}</p>{resource.description ? <p className="mt-1 line-clamp-1 text-xs text-[var(--br-text-muted)]">{resource.description}</p> : null}</div>
      <a href={`/api/courses/${encodeURIComponent(courseId)}/resources/${encodeURIComponent(resource.id)}/download`} target={resource.resource_type === "WEB_LINK" ? "_blank" : undefined} rel={resource.resource_type === "WEB_LINK" ? "noreferrer" : undefined} className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--br-action)] text-white transition hover:bg-[var(--br-action-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--br-action)] focus-visible:ring-offset-2" aria-label={`${resource.resource_type === "WEB_LINK" ? "Open" : "Download"} ${resource.title}`} title={resource.resource_type === "WEB_LINK" ? "Open link" : "Download"}>{resource.resource_type === "WEB_LINK" ? <ExternalLink size={17} aria-hidden="true" /> : <Download size={17} aria-hidden="true" />}</a>
    </article>)}</div> : <div className="mt-5 rounded-2xl border border-dashed border-[var(--br-border)] px-5 py-10 text-center"><p className="text-sm font-bold text-[var(--br-text)]">{resources.length ? "No matching resources" : "No resources have been added yet"}</p><p className="mt-1 text-sm text-[var(--br-text-muted)]">{resources.length ? "Try a different search or file type." : "Course files will appear here when they are shared."}</p></div>}
  </section>;
}
