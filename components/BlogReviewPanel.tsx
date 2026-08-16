"use client";

import { useState, useTransition } from "react";
import { Check, MessageCircleMore, Send } from "lucide-react";
import { addBlogEditorialComment, resolveBlogEditorialComment } from "@/app/admin/blog/actions";

export type BlogEditorialComment = { id: string; body: string; status: "OPEN" | "RESOLVED"; createdAt: string; createdByName: string };

export function BlogReviewPanel({ postId, comments, canComment }: { postId: string; comments: BlogEditorialComment[]; canComment: boolean }) {
  const [body, setBody] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  function add() { startTransition(async () => { const result = await addBlogEditorialComment(postId, body); setNotice(result.success ? "Review note saved." : result.error || "Could not save your note."); if (result.success) setBody(""); }); }
  function resolve(id: string) { startTransition(async () => { const result = await resolveBlogEditorialComment(id); setNotice(result.success ? "Review note resolved." : result.error || "Could not resolve the note."); }); }
  return <section className="rounded-2xl border border-[var(--br-border)] bg-surface p-4 shadow-sm"><div className="flex items-center gap-2"><MessageCircleMore size={16} className="text-[var(--br-brand)]" /><h2 className="text-sm font-bold text-ink">Editorial notes</h2></div><div className="mt-3 max-h-52 divide-y divide-[var(--br-border)] overflow-y-auto">{comments.map((comment) => <article key={comment.id} className="py-3"><div className="flex items-start gap-2"><p className={`min-w-0 flex-1 text-xs leading-5 ${comment.status === "RESOLVED" ? "text-[var(--br-text-muted)] line-through" : "text-ink"}`}>{comment.body}</p>{comment.status === "OPEN" && canComment ? <button type="button" disabled={isPending} onClick={() => resolve(comment.id)} className="grid size-7 shrink-0 place-items-center rounded-lg border border-[var(--br-border)] text-emerald-600" aria-label="Resolve note"><Check size={14} /></button> : null}</div><p className="mt-1 text-[10px] text-[var(--br-text-muted)]">{comment.createdByName} · {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(comment.createdAt))}</p></article>)}{!comments.length ? <p className="py-3 text-xs text-[var(--br-text-muted)]">No review notes yet.</p> : null}</div>{canComment ? <div className="mt-3"><textarea value={body} onChange={(event) => setBody(event.target.value)} rows={3} placeholder="Leave a clear editorial note…" className="w-full resize-none rounded-xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] px-3 py-2 text-sm text-ink outline-none focus:border-[var(--br-brand)]" /><button type="button" disabled={isPending || !body.trim()} onClick={add} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[var(--br-dark-card)] px-3 py-2 text-xs font-bold text-on-dark"><Send size={13} /> Add note</button></div> : null}{notice ? <p className="mt-2 text-xs font-semibold text-[var(--br-brand)]">{notice}</p> : null}</section>;
}
