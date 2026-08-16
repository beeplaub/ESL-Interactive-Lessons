"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Archive, BarChart3, CheckCircle2, ChevronRight, Clock3, Copy, FilePenLine, Filter, Inbox, Plus, Search, Send, Settings2, Trash2 } from "lucide-react";
import { changeBlogPostStatus, createBlogPost, duplicateBlogPost, importLegacyJournalPosts } from "@/app/admin/blog/actions";

export type BlogPostSummary = {
  id: string;
  title: string;
  slug: string;
  status: "DRAFT" | "IN_REVIEW" | "CHANGES_REQUESTED" | "APPROVED" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED" | "TRASH";
  authorName: string;
  categoryName: string | null;
  updatedAt: string;
  publishedAt: string | null;
  scheduledAt: string | null;
  excerpt: string | null;
};

type BlogWorkspaceProps = {
  posts: BlogPostSummary[];
  blogRole: "PLATFORM_ADMIN" | "EDITOR" | "AUTHOR" | "CONTRIBUTOR" | "REVIEWER";
  categories: Array<{ id: string; name: string }>;
  legacyArticleCount: number;
};

const labels: Record<BlogPostSummary["status"], string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  CHANGES_REQUESTED: "Needs changes",
  APPROVED: "Approved",
  SCHEDULED: "Scheduled",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
  TRASH: "Trash",
};

const tones: Record<BlogPostSummary["status"], string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  IN_REVIEW: "bg-amber-50 text-amber-700",
  CHANGES_REQUESTED: "bg-rose-50 text-rose-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  SCHEDULED: "bg-blue-50 text-blue-700",
  PUBLISHED: "bg-violet-50 text-violet-700",
  ARCHIVED: "bg-slate-100 text-slate-600",
  TRASH: "bg-rose-50 text-rose-700",
};

function formatDate(value: string | null) {
  if (!value) return "Not published";
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

export function BlogWorkspace({ posts, blogRole, categories, legacyArticleCount }: BlogWorkspaceProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | BlogPostSummary["status"]>("ALL");
  const [category, setCategory] = useState("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const canCreate = !["REVIEWER"].includes(blogRole);
  const canPublish = ["PLATFORM_ADMIN", "EDITOR"].includes(blogRole);

  const filtered = useMemo(() => posts.filter((post) => {
    if (status !== "ALL" && post.status !== status) return false;
    if (category !== "ALL" && post.categoryName !== category) return false;
    const needle = query.trim().toLowerCase();
    return !needle || [post.title, post.excerpt, post.authorName, post.categoryName].filter(Boolean).join(" ").toLowerCase().includes(needle);
  }), [posts, query, status, category]);

  const counts = useMemo(() => ({
    drafts: posts.filter((post) => ["DRAFT", "CHANGES_REQUESTED"].includes(post.status)).length,
    review: posts.filter((post) => post.status === "IN_REVIEW").length,
    scheduled: posts.filter((post) => post.status === "SCHEDULED").length,
    published: posts.filter((post) => post.status === "PUBLISHED").length,
  }), [posts]);

  function create() {
    startTransition(async () => {
      const result = await createBlogPost(title);
      if (!result.success || !result.id) { setNotice(result.error || "Could not create the draft."); return; }
      window.location.assign(`/admin/blog/${result.id}/edit`);
    });
  }

  function action(postId: string, nextStatus: BlogPostSummary["status"], success: string) {
    startTransition(async () => {
      const result = await changeBlogPostStatus(postId, nextStatus);
      setNotice(result.success ? success : result.error || "Could not update the post.");
    });
  }

  function duplicate(postId: string) {
    startTransition(async () => {
      const result = await duplicateBlogPost(postId);
      if (!result.success || !result.id) { setNotice(result.error || "Could not duplicate the post."); return; }
      window.location.assign(`/admin/blog/${result.id}/edit`);
    });
  }
  function importLegacy() { if (!window.confirm("Import the original Markdown Journal articles as editable published copies? Existing public links will stay the same.")) return; startTransition(async () => { const result = await importLegacyJournalPosts(); setNotice(result.success ? `${result.imported || 0} legacy articles imported.` : result.error || "Could not import the legacy articles."); if (result.success) window.setTimeout(() => window.location.reload(), 400); }); }

  return (
    <main className="min-w-0 space-y-5">
      <section className="rounded-2xl border border-[var(--br-border)] bg-surface p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--br-brand)]">Publishing workspace</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">BrenUp Journal</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--br-text-muted)]">Plan, write, review, and publish useful learning stories without leaving BrenUp.</p>
          </div>
          <div className="flex items-center gap-2">{["PLATFORM_ADMIN", "EDITOR"].includes(blogRole) ? <><Link href="/admin/blog/analytics" className="grid size-10 place-items-center rounded-xl border border-[var(--br-border)] text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]" aria-label="Journal analytics"><BarChart3 size={17} /></Link><Link href="/admin/blog/settings" className="grid size-10 place-items-center rounded-xl border border-[var(--br-border)] text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]" aria-label="Journal settings"><Settings2 size={17} /></Link></> : null}{blogRole === "PLATFORM_ADMIN" && legacyArticleCount ? <button type="button" disabled={isPending} onClick={importLegacy} className="hidden rounded-xl border border-[var(--br-border)] px-3 py-2 text-xs font-bold text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)] lg:inline-flex">Import {legacyArticleCount} legacy</button> : null}{canCreate ? <button type="button" onClick={() => setCreateOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--br-brand)] px-4 py-2.5 text-sm font-bold text-on-dark shadow-sm hover:brightness-95"><Plus size={17} /> New article</button> : null}</div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Drafts", counts.drafts, FilePenLine, "Keep shaping your next useful idea."],
          ["Awaiting review", counts.review, Inbox, "Ready for an editorial decision."],
          ["Scheduled", counts.scheduled, Clock3, "Planned posts that will publish next."],
          ["Published", counts.published, CheckCircle2, "Public, indexable BrenUp Journal posts."],
        ].map(([label, count, Icon, detail]) => {
          const CardIcon = Icon as typeof FilePenLine;
          return <div key={String(label)} className="rounded-2xl border border-[var(--br-border)] bg-surface p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-[var(--br-text-muted)]">{String(label)}</p><p className="mt-1 text-2xl font-bold text-ink">{String(count)}</p></div><div className="grid size-9 place-items-center rounded-xl bg-[var(--br-brand-soft)] text-[var(--br-brand)]"><CardIcon size={17} /></div></div><p className="mt-2 text-xs leading-5 text-[var(--br-text-muted)]">{String(detail)}</p></div>;
        })}
      </section>

      <section className="overflow-hidden rounded-2xl border border-[var(--br-border)] bg-surface shadow-sm">
        <div className="flex flex-col gap-3 border-b border-[var(--br-border)] p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] px-3 py-2"><Search size={16} className="shrink-0 text-[var(--br-text-muted)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, author, or content" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--br-text-muted)]" /></div>
          <div className="flex gap-2"><label className="sr-only" htmlFor="blog-status-filter">Status</label><select id="blog-status-filter" value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="min-w-0 rounded-xl border border-[var(--br-border)] bg-surface px-3 py-2 text-sm font-medium"><option value="ALL">All states</option>{Object.entries(labels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select><label className="sr-only" htmlFor="blog-category-filter">Category</label><select id="blog-category-filter" value={category} onChange={(event) => setCategory(event.target.value)} className="min-w-0 rounded-xl border border-[var(--br-border)] bg-surface px-3 py-2 text-sm font-medium"><option value="ALL">All topics</option>{categories.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></div>
        </div>
        <div className="divide-y divide-[var(--br-border)]">
          {filtered.map((post) => <article key={post.id} className="flex flex-col gap-3 p-4 transition hover:bg-[var(--br-surface-muted)]/55 lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${tones[post.status]}`}>{labels[post.status]}</span>{post.categoryName ? <span className="text-xs font-medium text-[var(--br-text-muted)]">{post.categoryName}</span> : null}</div><Link href={`/admin/blog/${post.id}/edit`} className="mt-2 block truncate text-base font-bold text-ink hover:text-[var(--br-brand)]">{post.title}</Link><p className="mt-1 line-clamp-1 text-sm text-[var(--br-text-muted)]">{post.excerpt || "No excerpt yet. Open the editor to give readers a clear reason to continue."}</p><p className="mt-2 text-xs text-[var(--br-text-muted)]">By {post.authorName} · Updated {formatDate(post.updatedAt)}</p></div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end"><Link href={`/admin/blog/${post.id}/edit`} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--br-border)] px-3 py-2 text-xs font-bold text-ink hover:bg-surface"><FilePenLine size={14} /> Edit</Link><button type="button" disabled={isPending} onClick={() => duplicate(post.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--br-border)] px-3 py-2 text-xs font-bold text-[var(--br-text-muted)] hover:bg-surface"><Copy size={14} /> Copy</button>{post.status === "DRAFT" || post.status === "CHANGES_REQUESTED" ? <button type="button" disabled={isPending} onClick={() => action(post.id, "IN_REVIEW", "Sent to review.")} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--br-border)] px-3 py-2 text-xs font-bold text-[var(--br-brand)] hover:bg-[var(--br-brand-soft)]"><Send size={14} /> Review</button> : null}{canPublish && ["DRAFT", "APPROVED", "SCHEDULED"].includes(post.status) ? <button type="button" disabled={isPending} onClick={() => action(post.id, "PUBLISHED", "Post published.")} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--br-brand)] px-3 py-2 text-xs font-bold text-on-dark"><CheckCircle2 size={14} /> Publish</button> : null}{post.status !== "TRASH" ? <button type="button" disabled={isPending} onClick={() => action(post.id, "TRASH", "Post moved to trash.")} className="grid size-8 place-items-center rounded-lg border border-[var(--br-border)] text-[var(--br-text-muted)] hover:bg-rose-50 hover:text-rose-600" aria-label="Move to trash"><Trash2 size={14} /></button> : <button type="button" disabled={isPending} onClick={() => action(post.id, "DRAFT", "Post restored to drafts.")} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--br-border)] px-3 py-2 text-xs font-bold text-ink"><Archive size={14} /> Restore</button>}</div>
          </article>)}
          {!filtered.length ? <div className="p-12 text-center"><Filter className="mx-auto text-[var(--br-text-muted)]" size={26} /><p className="mt-3 font-semibold text-ink">No articles match those filters.</p><p className="mt-1 text-sm text-[var(--br-text-muted)]">Try another filter or start a fresh draft.</p></div> : null}
        </div>
      </section>
      {notice ? <div role="status" className="fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border border-[var(--br-border)] bg-surface px-4 py-3 text-sm font-semibold text-ink shadow-xl">{notice}<button type="button" onClick={() => setNotice(null)} className="ml-3 text-[var(--br-brand)]">Close</button></div> : null}
      {createOpen ? <div className="fixed inset-0 z-[90] grid place-items-center bg-black/35 p-4" role="dialog" aria-modal="true" aria-label="Create article"><div className="w-full max-w-md rounded-2xl border border-[var(--br-border)] bg-surface p-5 shadow-2xl"><h2 className="text-lg font-bold text-ink">Start a new article</h2><p className="mt-1 text-sm text-[var(--br-text-muted)]">A draft opens next. You can refine its title, content, SEO, and workflow there.</p><label className="mt-4 block text-sm font-semibold text-ink">Working title<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") create(); }} placeholder="e.g. How to practise English every day" className="mt-1.5 w-full rounded-xl border border-[var(--br-border)] px-3 py-2.5 text-sm outline-none focus:border-[var(--br-brand)]" /></label><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setCreateOpen(false)} className="rounded-xl px-3 py-2 text-sm font-bold text-[var(--br-text-muted)]">Cancel</button><button type="button" disabled={isPending} onClick={create} className="rounded-xl bg-[var(--br-brand)] px-4 py-2 text-sm font-bold text-on-dark">{isPending ? "Creating…" : "Create draft"}<ChevronRight className="ml-1 inline" size={15} /></button></div></div></div> : null}
    </main>
  );
}
