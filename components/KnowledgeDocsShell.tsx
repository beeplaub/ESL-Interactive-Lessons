"use client";

import Link from "next/link";
import { BookOpen, ChevronRight, LifeBuoy, Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { KnowledgeSearch } from "@/components/KnowledgeSearch";

type NavEntry = { title: string; description: string; url: string; audience: string[] };
type NavGroup = { title: string; entries: NavEntry[] };

export function KnowledgeDocsShell({ groups, children }: { groups: NavGroup[]; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const sidebar = <nav className="space-y-6 px-4 py-5">
    <Link href="/docs" className="flex items-center gap-3 rounded-xl bg-[var(--br-brand-soft)] px-3 py-3 text-sm font-extrabold text-[var(--br-brand)]"><BookOpen className="size-4" /> Help centre</Link>
    {groups.map((group) => <section key={group.title}>
      <p className="px-3 text-[11px] font-black uppercase tracking-[0.14em] text-[var(--br-text-muted)]">{group.title}</p>
      <div className="mt-2 space-y-1">{group.entries.map((entry) => {
        const active = pathname === entry.url;
        return <Link key={entry.url} href={entry.url} onClick={() => setOpen(false)} className={`block rounded-lg px-3 py-2.5 text-sm transition ${active ? "bg-[var(--br-brand)] font-extrabold text-on-dark" : "font-semibold text-[var(--br-text-muted)] hover:bg-[var(--br-surface-muted)] hover:text-[var(--br-text)]"}`}>{entry.title}</Link>;
      })}</div>
    </section>)}
  </nav>;

  return <main className="min-h-screen bg-[var(--br-canvas-elevated)] text-[var(--br-text)]">
    <header className="sticky top-0 z-30 border-b border-[var(--br-border)] bg-[color-mix(in_srgb,var(--br-surface)_92%,transparent)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 sm:px-6">
        <button type="button" onClick={() => setOpen(true)} className="grid size-10 place-items-center rounded-xl border border-[var(--br-border)] bg-surface text-[var(--br-brand)] lg:hidden" aria-label="Open documentation navigation"><Menu className="size-5" /></button>
        <Link href="/" className="flex shrink-0 items-center"><BrandLogo variant="dark" className="h-8 w-[106px]" priority /></Link>
        <span className="hidden h-5 w-px bg-[var(--br-border)] sm:block" />
        <span className="hidden text-sm font-extrabold text-[var(--br-text-muted)] sm:block">Help centre</span>
        <div className="ml-auto w-full max-w-xl"><KnowledgeSearch /></div>
        <Link href="/account" className="hidden shrink-0 rounded-xl border border-[var(--br-border)] bg-surface px-3 py-2 text-xs font-extrabold text-[var(--br-brand)] hover:bg-[var(--br-surface-muted)] sm:inline-flex">Go to BrenUp</Link>
      </div>
    </header>
    <div className="mx-auto grid max-w-[1440px] lg:grid-cols-[270px_minmax(0,1fr)]">
      <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] overflow-y-auto border-r border-[var(--br-border)] bg-surface lg:block">{sidebar}</aside>
      <div className="min-w-0">{children}</div>
    </div>
    {open ? <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close documentation navigation" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/30" />
      <aside className="relative h-full w-[min(320px,88vw)] overflow-y-auto bg-surface shadow-2xl">
        <div className="flex h-16 items-center justify-between border-b border-[var(--br-border)] px-4"><span className="text-sm font-extrabold">Browse help</span><button type="button" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-lg hover:bg-[var(--br-surface-muted)]"><X className="size-5" /></button></div>{sidebar}
      </aside>
    </div> : null}
  </main>;
}

export function KnowledgeBreadcrumb({ group, title }: { group: string; title: string }) {
  return <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-[var(--br-text-muted)]"><Link href="/docs" className="hover:text-[var(--br-brand)]">Help centre</Link><ChevronRight className="size-3" /><span>{group}</span><ChevronRight className="size-3" /><span className="text-[var(--br-text)]">{title}</span></div>;
}

export function NeedHelpCard() {
  return <aside className="mt-10 rounded-2xl border border-[var(--br-border)] bg-[var(--br-brand-soft)] p-5"><LifeBuoy className="size-5 text-[var(--br-action)]" /><h2 className="mt-3 text-base font-extrabold">Still need a hand?</h2><p className="mt-1 text-sm leading-6 text-[var(--br-text-muted)]">Send a message from your BrenUp inbox and our team will keep the response connected to your account.</p><Link href="/notifications" className="mt-4 inline-flex items-center gap-1 text-sm font-extrabold text-[var(--br-brand)]">Open your inbox <ChevronRight className="size-4" /></Link></aside>;
}
