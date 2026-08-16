"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink, Mail, RotateCcw, Share2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteNotification, markNotificationUnread, restoreNotification } from "@/app/notifications/actions";

type Notice = { id: string; title: string; detail: string | null; href: string | null; action_label: string | null; category: string; tone: string; created_at: string; archived_at: string | null };

export function NotificationMessageReader({ notice }: { notice: Notice }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState("");
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: notice.title, text: notice.detail || notice.title, url });
      else { await navigator.clipboard.writeText(url); setStatus("Link copied."); }
    } catch { /* User cancelled sharing or the browser refused it. */ }
  };
  const external = Boolean(notice.href?.startsWith("http"));
  return <section className="mx-auto w-full max-w-4xl rounded-[22px] border border-[var(--br-border)] bg-surface p-4 shadow-[var(--br-shadow)] sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--br-border)] pb-4"><Link href="/notifications" className="inline-flex items-center gap-2 text-xs font-extrabold text-[var(--br-brand)]"><ArrowLeft className="size-4" /> Inbox</Link><div className="flex items-center gap-1"><button type="button" onClick={() => void share()} title="Share" className="grid size-9 place-items-center rounded-xl text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]"><Share2 className="size-4" /></button>{notice.archived_at ? <button type="button" disabled={pending} onClick={() => startTransition(async () => { await restoreNotification(notice.id); router.push("/notifications"); })} title="Restore" className="grid size-9 place-items-center rounded-xl text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]"><RotateCcw className="size-4" /></button> : <><button type="button" disabled={pending} onClick={() => startTransition(async () => { await markNotificationUnread(notice.id); router.push("/notifications"); })} title="Mark unread" className="grid size-9 place-items-center rounded-xl text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)]"><Mail className="size-4" /></button><button type="button" disabled={pending} onClick={() => startTransition(async () => { await deleteNotification(notice.id); router.push("/notifications"); })} title="Move to trash" className="grid size-9 place-items-center rounded-xl text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)] hover:text-[var(--br-danger)]"><Trash2 className="size-4" /></button></>}</div></div><div className="pt-6"><p className="text-[10px] font-black uppercase tracking-[0.15em] text-[var(--br-brand)]">{notice.category.replaceAll("_", " ")}</p><h1 className="mt-2 text-2xl font-black text-ink sm:text-3xl">{notice.title}</h1><p className="mt-2 text-xs font-bold text-[var(--br-text-muted)]">{new Date(notice.created_at).toLocaleString()}</p><div className="mt-7 whitespace-pre-wrap text-[15px] leading-7 text-[var(--br-text-muted)]">{notice.detail || "There is an update waiting for you in BrenUp."}</div>{notice.href ? <a href={notice.href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[var(--br-action)] px-4 py-3 text-sm font-extrabold text-on-dark shadow-[var(--br-shadow)] transition hover:brightness-95">{notice.action_label || "Open update"}<ExternalLink className="size-4" /></a> : null}{status ? <p className="mt-3 text-xs font-bold text-[var(--br-success)]">{status}</p> : null}</div></section>;
}
