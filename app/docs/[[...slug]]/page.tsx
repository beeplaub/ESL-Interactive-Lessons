import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, GraduationCap, Settings2 } from "lucide-react";
import { notFound } from "next/navigation";
import { KnowledgeBreadcrumb, KnowledgeDocsShell, NeedHelpCard } from "@/components/KnowledgeDocsShell";
import { getKnowledgeEntry, getKnowledgeGroups, renderKnowledgeMarkdown } from "@/lib/knowledge-base";

export const dynamicParams = false;

export function generateStaticParams() {
  return getKnowledgeGroups("docs").flatMap((group) => group.entries.map((entry) => ({ slug: entry.slug })));
}

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }): Promise<Metadata> {
  const { slug } = await params;
  const entry = getKnowledgeEntry("docs", slug);
  return entry ? { title: `${entry.title} | BrenUp Help`, description: entry.description } : {};
}

export default async function DocsPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const entry = getKnowledgeEntry("docs", slug);
  if (!entry) notFound();
  const groups = getKnowledgeGroups("docs");
  const body = await renderKnowledgeMarkdown(entry.content);
  const isHome = entry.slug.length === 0;

  return <KnowledgeDocsShell groups={groups}>
    <article className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8 lg:px-12 lg:py-14">
      {!isHome ? <KnowledgeBreadcrumb group={entry.group} title={entry.title} /> : null}
      <header className={isHome ? "rounded-3xl bg-[var(--br-dark-card)] px-6 py-9 text-on-dark shadow-[var(--br-shadow)] sm:px-10 sm:py-12" : "mt-6"}>
        {isHome ? <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-extrabold text-white/85"><BookOpen className="size-3.5" /> BrenUp support</span> : <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--br-action)]">{entry.group}</p>}
        <h1 className={`mt-4 max-w-3xl font-black tracking-[-0.03em] ${isHome ? "text-3xl leading-tight sm:text-5xl" : "text-3xl leading-tight text-[var(--br-text)] sm:text-4xl"}`}>{entry.title}</h1>
        {entry.description ? <p className={`mt-4 max-w-2xl text-base leading-7 ${isHome ? "text-white/75" : "text-[var(--br-text-muted)]"}`}>{entry.description}</p> : null}
      </header>
      {isHome ? <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Link href="/docs/getting-started/your-first-week" className="group rounded-2xl border border-[var(--br-border)] bg-surface p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[var(--br-shadow)]"><BookOpen className="size-5 text-[var(--br-action)]" /><h2 className="mt-4 font-extrabold">Start learning</h2><p className="mt-1 text-sm leading-6 text-[var(--br-text-muted)]">Find your level and begin a course.</p><ArrowRight className="mt-4 size-4 text-[var(--br-brand)] transition group-hover:translate-x-1" /></Link>
        <Link href="/docs/learners/notifications" className="group rounded-2xl border border-[var(--br-border)] bg-surface p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[var(--br-shadow)]"><GraduationCap className="size-5 text-[var(--br-success)]" /><h2 className="mt-4 font-extrabold">For learners</h2><p className="mt-1 text-sm leading-6 text-[var(--br-text-muted)]">Progress, activities, and support.</p><ArrowRight className="mt-4 size-4 text-[var(--br-brand)] transition group-hover:translate-x-1" /></Link>
        <Link href="/docs/creators/building-your-first-lesson" className="group rounded-2xl border border-[var(--br-border)] bg-surface p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[var(--br-shadow)]"><Settings2 className="size-5 text-[var(--br-chart-primary)]" /><h2 className="mt-4 font-extrabold">For creators</h2><p className="mt-1 text-sm leading-6 text-[var(--br-text-muted)]">Build lessons, map outcomes, and teach.</p><ArrowRight className="mt-4 size-4 text-[var(--br-brand)] transition group-hover:translate-x-1" /></Link>
      </div> : null}
      <div className="knowledge-prose mt-9" dangerouslySetInnerHTML={{ __html: body }} />
      <NeedHelpCard />
    </article>
  </KnowledgeDocsShell>;
}
