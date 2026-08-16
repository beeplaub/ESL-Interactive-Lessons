import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Clock3 } from "lucide-react";
import { notFound } from "next/navigation";
import { getKnowledgeEntry, getKnowledgeEntries, renderKnowledgeMarkdown } from "@/lib/knowledge-base";

export const dynamicParams = false;

export function generateStaticParams() { return getKnowledgeEntries("blog").map((entry) => ({ slug: entry.slug[0] })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const entry = getKnowledgeEntry("blog", [slug]);
  return entry ? { title: `${entry.title} | BrenUp Journal`, description: entry.description } : {};
}

export default async function BlogArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getKnowledgeEntry("blog", [slug]);
  if (!article) notFound();
  const body = await renderKnowledgeMarkdown(article.content);
  const structuredData = { "@context": "https://schema.org", "@type": "Article", headline: article.title, description: article.description, author: { "@type": "Organization", name: article.author ?? "BrenUp Team" }, datePublished: article.publishedAt, mainEntityOfPage: `https://www.brenup.com${article.url}` };
  return <main className="min-h-screen bg-[var(--br-canvas-elevated)] px-4 py-10 sm:px-6 sm:py-14"><article className="mx-auto max-w-3xl"><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} /><Link href="/blog" className="inline-flex items-center gap-2 text-sm font-extrabold text-[var(--br-brand)] hover:text-[var(--br-action)]"><ArrowLeft className="size-4" /> Back to Journal</Link><header className="mt-7 rounded-3xl bg-surface p-6 shadow-[var(--br-shadow)] sm:p-10"><div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[var(--br-text-muted)]">{article.tags.map((tag) => <span key={tag} className="rounded-full bg-[var(--br-brand-soft)] px-2.5 py-1 text-[var(--br-brand)]">{tag}</span>)}<span className="ml-1 flex items-center gap-1"><Clock3 className="size-3.5" /> {article.readingMinutes} min read</span></div><h1 className="mt-5 text-3xl font-black leading-tight tracking-[-0.03em] sm:text-5xl">{article.title}</h1><p className="mt-4 text-base leading-7 text-[var(--br-text-muted)]">{article.description}</p><p className="mt-5 text-sm font-bold text-[var(--br-text-muted)]">{article.author ?? "BrenUp Team"}{article.publishedAt ? ` · ${new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" }).format(new Date(article.publishedAt))}` : ""}</p></header><div className="knowledge-prose mt-9 rounded-3xl bg-surface p-6 shadow-[var(--br-shadow)] sm:p-10" dangerouslySetInnerHTML={{ __html: body }} /></article></main>;
}
