import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock3, Sparkles } from "lucide-react";
import { getKnowledgeEntries } from "@/lib/knowledge-base";

export const metadata: Metadata = {
  title: "BrenUp Journal | English learning, teaching, and outcomes",
  description: "Practical ideas for English learners, teachers, and course creators.",
};

export default function BlogPage() {
  const articles = getKnowledgeEntries("blog").sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  return <main className="min-h-screen bg-[var(--br-canvas-elevated)] px-4 py-10 sm:px-6 sm:py-14">
    <section className="mx-auto max-w-6xl">
      <header className="rounded-3xl bg-[var(--br-dark-card)] px-6 py-10 text-on-dark shadow-[var(--br-shadow)] sm:px-10 sm:py-14"><span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-extrabold text-white/85"><Sparkles className="size-3.5" /> BrenUp Journal</span><h1 className="mt-4 max-w-3xl text-3xl font-black tracking-[-0.03em] sm:text-5xl">English learning that becomes alive.</h1><p className="mt-4 max-w-2xl text-base leading-7 text-white/75">Ideas for learners, educators, and course creators who care about meaningful practice and measurable growth.</p></header>
      <div className="mt-8 grid gap-5 md:grid-cols-2">{articles.map((article) => <Link key={article.url} href={article.url} className="group rounded-2xl border border-[var(--br-border)] bg-surface p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[var(--br-shadow)]"><div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[var(--br-text-muted)]"><span className="rounded-full bg-[var(--br-brand-soft)] px-2.5 py-1 text-[var(--br-brand)]">{article.tags[0] ?? "BrenUp"}</span>{article.publishedAt ? <span>{new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(article.publishedAt))}</span> : null}</div><h2 className="mt-5 text-xl font-black tracking-[-0.02em] text-[var(--br-text)]">{article.title}</h2><p className="mt-3 text-sm leading-6 text-[var(--br-text-muted)]">{article.description}</p><div className="mt-6 flex items-center justify-between text-sm font-extrabold text-[var(--br-brand)]"><span className="flex items-center gap-1.5"><Clock3 className="size-4" /> {article.readingMinutes} min read</span><ArrowRight className="size-4 transition group-hover:translate-x-1" /></div></Link>)}</div>
    </section>
  </main>;
}
