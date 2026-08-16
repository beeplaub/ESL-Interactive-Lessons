import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Clock3 } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { getKnowledgeEntry, getKnowledgeEntries, renderKnowledgeMarkdown } from "@/lib/knowledge-base";
import { getBlogRedirect, getPublishedBlogPost, getReadingMinutes } from "@/lib/blog-public";
import { BlogViewTracker } from "@/components/BlogViewTracker";

export const dynamicParams = true;
export const revalidate = 300;

export function generateStaticParams() { return getKnowledgeEntries("blog").map((entry) => ({ slug: entry.slug[0] })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const databasePost = await getPublishedBlogPost(slug);
  if (databasePost) return { title: `${databasePost.seoTitle || databasePost.title} | BrenUp Journal`, description: databasePost.seoDescription || databasePost.excerpt || undefined, alternates: databasePost.canonicalUrl ? { canonical: databasePost.canonicalUrl } : undefined, robots: databasePost.allowIndex ? undefined : { index: false, follow: false } };
  const entry = getKnowledgeEntry("blog", [slug]);
  return entry ? { title: `${entry.title} | BrenUp Journal`, description: entry.description } : {};
}

export default async function BlogArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const databasePost = await getPublishedBlogPost(slug);
  if (databasePost) return <DatabaseArticle post={databasePost} />;
  const destinationSlug = await getBlogRedirect(slug);
  if (destinationSlug) redirect(`/blog/${destinationSlug}`);
  const article = getKnowledgeEntry("blog", [slug]);
  if (!article) notFound();
  const body = await renderKnowledgeMarkdown(article.content);
  const structuredData = { "@context": "https://schema.org", "@type": "Article", headline: article.title, description: article.description, author: { "@type": "Organization", name: article.author ?? "BrenUp Team" }, datePublished: article.publishedAt, mainEntityOfPage: `https://www.brenup.com${article.url}` };
  return <main className="min-h-screen bg-[var(--br-canvas-elevated)] px-4 py-10 sm:px-6 sm:py-14"><article className="mx-auto max-w-3xl"><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} /><Link href="/blog" className="inline-flex items-center gap-2 text-sm font-extrabold text-[var(--br-brand)] hover:text-[var(--br-action)]"><ArrowLeft className="size-4" /> Back to Journal</Link><header className="mt-7 rounded-3xl bg-surface p-6 shadow-[var(--br-shadow)] sm:p-10"><div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[var(--br-text-muted)]">{article.tags.map((tag) => <span key={tag} className="rounded-full bg-[var(--br-brand-soft)] px-2.5 py-1 text-[var(--br-brand)]">{tag}</span>)}<span className="ml-1 flex items-center gap-1"><Clock3 className="size-3.5" /> {article.readingMinutes} min read</span></div><h1 className="mt-5 text-3xl font-black leading-tight tracking-[-0.03em] sm:text-5xl">{article.title}</h1><p className="mt-4 text-base leading-7 text-[var(--br-text-muted)]">{article.description}</p><p className="mt-5 text-sm font-bold text-[var(--br-text-muted)]">{article.author ?? "BrenUp Team"}{article.publishedAt ? ` · ${new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" }).format(new Date(article.publishedAt))}` : ""}</p></header><div className="knowledge-prose mt-9 rounded-3xl bg-surface p-6 shadow-[var(--br-shadow)] sm:p-10" dangerouslySetInnerHTML={{ __html: body }} /></article></main>;
}

function DatabaseArticle({ post }: { post: Awaited<ReturnType<typeof getPublishedBlogPost>> & {} }) {
  if (!post) return null;
  const structuredData = { "@context": "https://schema.org", "@type": "Article", headline: post.title, description: post.excerpt, author: { "@type": "Person", name: post.authorName }, datePublished: post.publishedAt, dateModified: post.updatedAt, mainEntityOfPage: `https://www.brenup.com/blog/${post.slug}`, keywords: [...post.categoryNames, ...post.tagNames, post.primaryKeyword].filter(Boolean).join(", ") };
  const blocks = Array.isArray(post.content?.content) ? post.content.content : [];
  return <main className="min-h-screen bg-[var(--br-canvas-elevated)] px-4 py-10 sm:px-6 sm:py-14"><BlogViewTracker slug={post.slug} /><article className="mx-auto max-w-3xl"><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} /><Link href="/blog" className="inline-flex items-center gap-2 text-sm font-extrabold text-[var(--br-brand)] hover:text-[var(--br-action)]"><ArrowLeft className="size-4" /> Back to Journal</Link><header className="mt-7 rounded-3xl bg-surface p-6 shadow-[var(--br-shadow)] sm:p-10">{post.coverUrl ? <img src={post.coverUrl} alt="" className="mb-6 aspect-[16/8] w-full rounded-2xl object-cover" /> : null}<div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[var(--br-text-muted)]">{[...post.categoryNames, ...post.tagNames].map((tag) => <span key={tag} className="rounded-full bg-[var(--br-brand-soft)] px-2.5 py-1 text-[var(--br-brand)]">{tag}</span>)}<span className="ml-1 flex items-center gap-1"><Clock3 className="size-3.5" /> {getReadingMinutes(post)} min read</span></div><h1 className="mt-5 text-3xl font-black leading-tight tracking-[-0.03em] sm:text-5xl">{post.title}</h1>{post.excerpt ? <p className="mt-4 text-base leading-7 text-[var(--br-text-muted)]">{post.excerpt}</p> : null}<p className="mt-5 text-sm font-bold text-[var(--br-text-muted)]">{post.authorName}{post.publishedAt ? ` · ${new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" }).format(new Date(post.publishedAt))}` : ""}</p></header><div className="knowledge-prose mt-9 rounded-3xl bg-surface p-6 shadow-[var(--br-shadow)] sm:p-10"><DatabaseBlocks blocks={blocks} /></div></article></main>;
}

function DatabaseBlocks({ blocks }: { blocks: Array<Record<string, unknown>> }) {
  return <>{blocks.map((block, index) => { const type = block.type; const text = typeof block.text === "string" ? block.text : ""; if (type === "heading") { const Tag = (Number(block.level) === 2 ? "h2" : Number(block.level) === 3 ? "h3" : "h4") as "h2" | "h3" | "h4"; return <Tag key={String(block.id || index)}>{text}</Tag>; } if (type === "quote") return <blockquote key={String(block.id || index)}><p>{text}</p>{typeof block.attribution === "string" && block.attribution ? <cite>— {block.attribution}</cite> : null}</blockquote>; if (type === "callout") return <aside key={String(block.id || index)} className="my-5 rounded-2xl border border-[var(--br-action)]/30 bg-[var(--br-action)]/5 p-4">{text}</aside>; if (type === "list") { const items = Array.isArray(block.items) ? block.items.filter((item): item is string => typeof item === "string") : []; return block.style === "NUMBERED" ? <ol key={String(block.id || index)}>{items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ol> : <ul key={String(block.id || index)}>{items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>; } if (type === "image") return typeof block.src === "string" && block.src ? <figure key={String(block.id || index)}><img src={block.src} alt={typeof block.alt === "string" ? block.alt : ""} className="w-full rounded-2xl" />{typeof block.caption === "string" && block.caption ? <figcaption>{block.caption}</figcaption> : null}</figure> : null; if (type === "cta") return <aside key={String(block.id || index)} className="my-6 rounded-2xl bg-[var(--br-dark-card)] p-5 text-on-dark"><p className="text-lg font-black">{typeof block.label === "string" ? block.label : "Explore BrenUp"}</p>{typeof block.description === "string" && block.description ? <p className="mt-2 text-sm text-white/75">{block.description}</p> : null}{typeof block.href === "string" && block.href ? <Link href={block.href} className="mt-4 inline-flex rounded-xl bg-white px-3 py-2 text-sm font-bold text-[var(--br-dark-card)]">Continue</Link> : null}</aside>; return <p key={String(block.id || index)}>{text}</p>; })}</>;
}
