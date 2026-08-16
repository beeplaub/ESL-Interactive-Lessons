import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock3, Sparkles } from "lucide-react";
import { getKnowledgeEntries } from "@/lib/knowledge-base";
import { getPublishedBlogPosts } from "@/lib/blog-public";

export const metadata: Metadata = {
  title: "BrenUp Journal | English learning, teaching, and outcomes",
  description: "Practical ideas for English learners, teachers, and course creators.",
};

export const revalidate = 300;

export default async function BlogPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const selectedCategory = (await searchParams).category?.trim() || "";
  const [databasePosts, markdownPosts] = await Promise.all([
    getPublishedBlogPosts(),
    Promise.resolve(getKnowledgeEntries("blog").sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))),
  ]);
  const liveSlugs = new Set(databasePosts.map((post) => post.slug));
  const categoryCounts = new Map<string, number>();
  for (const post of databasePosts) for (const category of post.categoryNames) categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
  const articles = [
    ...databasePosts.map((post) => ({ url: `/blog/${post.slug}`, title: post.title, description: post.excerpt || "Practical guidance from BrenUp.", tags: [...post.categoryNames, ...post.tagNames], categories: post.categoryNames, publishedAt: post.publishedAt || post.updatedAt, author: post.authorName, readingMinutes: Math.max(1, Math.ceil(post.contentText.split(/\s+/).filter(Boolean).length / 220)), coverUrl: post.coverUrl })),
    ...markdownPosts.filter((post) => !liveSlugs.has(post.slug[0] || "")).map((post) => ({ ...post, categories: [] as string[], coverUrl: null })),
  ].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  const visibleArticles = selectedCategory ? articles.filter((article) => article.categories.includes(selectedCategory)) : articles;
  return <main className="min-h-0 px-1 pb-8 sm:px-2">
    <section className="mx-auto max-w-6xl">
      <header className="rounded-3xl bg-[var(--br-dark-card)] px-6 py-10 text-on-dark shadow-[var(--br-shadow)] sm:px-10 sm:py-14"><span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-extrabold text-white/85"><Sparkles className="size-3.5" /> BrenUp Journal</span><h1 className="mt-4 max-w-3xl text-3xl font-black tracking-[-0.03em] sm:text-5xl">English learning that becomes alive.</h1><p className="mt-4 max-w-2xl text-base leading-7 text-white/75">Ideas for learners, educators, and course creators who care about meaningful practice and measurable growth.</p></header>
      {categoryCounts.size ? <nav aria-label="Journal categories" className="mt-5 flex flex-wrap gap-2"><Link href="/blog" className={`rounded-full border px-3 py-2 text-sm font-bold transition ${selectedCategory ? "border-[var(--br-border)] bg-surface text-[var(--br-text-muted)] hover:border-[var(--br-brand)]" : "border-[var(--br-brand)] bg-[var(--br-brand)] text-on-dark"}`}>All articles <span className="ml-1 opacity-70">{articles.length}</span></Link>{Array.from(categoryCounts.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([category, count]) => <Link key={category} href={`/blog?category=${encodeURIComponent(category)}`} className={`rounded-full border px-3 py-2 text-sm font-bold transition ${selectedCategory === category ? "border-[var(--br-brand)] bg-[var(--br-brand)] text-on-dark" : "border-[var(--br-border)] bg-surface text-[var(--br-text-muted)] hover:border-[var(--br-brand)] hover:text-[var(--br-brand)]"}`}>{category} <span className="ml-1 opacity-70">{count}</span></Link>)}</nav> : null}
      <div className="mt-6 grid gap-5 md:grid-cols-2">{visibleArticles.map((article) => <Link key={article.url} href={article.url} className="group overflow-hidden rounded-2xl border border-[var(--br-border)] bg-surface shadow-sm transition hover:-translate-y-0.5 hover:shadow-[var(--br-shadow)]">{article.coverUrl ? <img src={article.coverUrl} alt="" className="aspect-[16/8] w-full object-cover" /> : null}<div className="p-6"><div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[var(--br-text-muted)]"><span className="rounded-full bg-[var(--br-brand-soft)] px-2.5 py-1 text-[var(--br-brand)]">{article.tags[0] ?? "BrenUp"}</span>{article.publishedAt ? <span>{new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(article.publishedAt))}</span> : null}</div><h2 className="mt-5 text-xl font-black tracking-[-0.02em] text-[var(--br-text)]">{article.title}</h2><p className="mt-3 text-sm leading-6 text-[var(--br-text-muted)]">{article.description}</p><div className="mt-6 flex items-center justify-between text-sm font-extrabold text-[var(--br-brand)]"><span className="flex items-center gap-1.5"><Clock3 className="size-4" /> {article.readingMinutes} min read</span><ArrowRight className="size-4 transition group-hover:translate-x-1" /></div></div></Link>)}{!visibleArticles.length ? <div className="rounded-2xl border border-dashed border-[var(--br-border)] bg-surface p-8 text-center text-sm text-[var(--br-text-muted)] md:col-span-2">No published articles are in this category yet.</div> : null}</div>
    </section>
  </main>;
}
