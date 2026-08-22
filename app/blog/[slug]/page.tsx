import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Clock3 } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import {
  getKnowledgeEntry,
  getKnowledgeEntries,
  renderKnowledgeMarkdown,
} from "@/lib/knowledge-base";
import {
  getBlogRedirect,
  getPublishedBlogPost,
  getPublishedBlogPosts,
  getReadingMinutes,
  type PublicBlogPost,
} from "@/lib/blog-public";
import { BlogViewTracker } from "@/components/BlogViewTracker";
import { parseBlogRichText } from "@/lib/blog-rich-text";

export const dynamicParams = true;
export const revalidate = 300;

export function generateStaticParams() {
  return getKnowledgeEntries("blog").map((entry) => ({ slug: entry.slug[0] }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const databasePost = await getPublishedBlogPost(slug);
  if (databasePost)
    return {
      title: `${databasePost.seoTitle || databasePost.title} | BrenUp Journal`,
      description:
        databasePost.seoDescription || databasePost.excerpt || undefined,
      alternates: {
        canonical:
          databasePost.canonicalUrl ||
          `https://www.brenup.com/blog/${databasePost.slug}`,
      },
      openGraph: {
        type: "article",
        title: databasePost.seoTitle || databasePost.title,
        description:
          databasePost.seoDescription || databasePost.excerpt || undefined,
        url:
          databasePost.canonicalUrl ||
          `https://www.brenup.com/blog/${databasePost.slug}`,
        images: databasePost.coverUrl
          ? [{ url: databasePost.coverUrl }]
          : undefined,
      },
      robots: databasePost.allowIndex
        ? undefined
        : { index: false, follow: false },
    };
  const entry = getKnowledgeEntry("blog", [slug]);
  return entry
    ? {
        title: `${entry.title} | BrenUp Journal`,
        description: entry.description,
      }
    : {};
}

export default async function BlogArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const databasePost = await getPublishedBlogPost(slug);
  if (databasePost) {
    const allPosts = await getPublishedBlogPosts();
    const terms = new Set(
      [...databasePost.categoryNames, ...databasePost.tagNames].map((term) =>
        term.toLowerCase(),
      ),
    );
    const related = allPosts
      .filter((post) => post.id !== databasePost.id)
      .sort((left, right) => {
        const leftMatches = [...left.categoryNames, ...left.tagNames].filter(
          (term) => terms.has(term.toLowerCase()),
        ).length;
        const rightMatches = [...right.categoryNames, ...right.tagNames].filter(
          (term) => terms.has(term.toLowerCase()),
        ).length;
        return (
          rightMatches - leftMatches ||
          (right.publishedAt || right.updatedAt).localeCompare(
            left.publishedAt || left.updatedAt,
          )
        );
      })
      .slice(0, 3);
    return <DatabaseArticle post={databasePost} related={related} />;
  }
  const destinationSlug = await getBlogRedirect(slug);
  if (destinationSlug) redirect(`/blog/${destinationSlug}`);
  const article = getKnowledgeEntry("blog", [slug]);
  if (!article) notFound();
  const body = await renderKnowledgeMarkdown(article.content);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    author: { "@type": "Organization", name: article.author ?? "BrenUp Team" },
    datePublished: article.publishedAt,
    mainEntityOfPage: `https://www.brenup.com${article.url}`,
  };
  return (
    <main className="min-h-0 px-1 pb-10 sm:px-2">
      <article className="mx-auto w-full max-w-4xl">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 text-sm font-extrabold text-[var(--br-brand)] hover:text-[var(--br-action)]"
        >
          <ArrowLeft className="size-4" /> Back to Journal
        </Link>
        <header className="mt-5 rounded-3xl bg-surface p-6 shadow-[var(--br-shadow)] sm:p-10">
          <div className="flex flex-wrap items-center justify-center gap-2 text-center text-xs font-bold text-[var(--br-text-muted)]">
            {article.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-[var(--br-brand-soft)] px-2.5 py-1 text-[var(--br-brand)]"
              >
                {tag}
              </span>
            ))}
            <span className="ml-1 flex items-center gap-1">
              <Clock3 className="size-3.5" /> {article.readingMinutes} min read
            </span>
          </div>
          <h1 className="mx-auto mt-5 max-w-5xl text-center text-3xl font-black leading-tight tracking-[-0.02em] sm:text-4xl">
            {article.title}
          </h1>
          <p className="mx-auto mt-4 max-w-4xl text-center text-base leading-7 text-[var(--br-text-muted)]">
            {article.description}
          </p>
          <p className="mt-5 text-sm font-bold text-[var(--br-text-muted)]">
            {article.author ?? "BrenUp Team"}
            {article.publishedAt
              ? ` · ${new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" }).format(new Date(article.publishedAt))}`
              : ""}
          </p>
        </header>
        <div
          className="knowledge-prose mt-5 rounded-3xl bg-surface p-6 shadow-[var(--br-shadow)] sm:p-10"
          dangerouslySetInnerHTML={{ __html: body }}
        />
      </article>
    </main>
  );
}

function DatabaseArticle({
  post,
  related,
}: {
  post: Awaited<ReturnType<typeof getPublishedBlogPost>> & {};
  related: PublicBlogPost[];
}) {
  if (!post) return null;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    author: { "@type": "Person", name: post.authorName },
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    mainEntityOfPage: `https://www.brenup.com/blog/${post.slug}`,
    keywords: [...post.categoryNames, ...post.tagNames, post.primaryKeyword]
      .filter(Boolean)
      .join(", "),
  };
  const blocks = Array.isArray(post.content?.content)
    ? post.content.content
    : [];
  const navigation = buildArticleNavigation(blocks, post);
  return (
    <main className="min-h-0 px-1 pb-10 sm:px-2">
      <BlogViewTracker slug={post.slug} />
      <article className="mx-auto w-full max-w-4xl">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 text-sm font-extrabold text-[var(--br-brand)] hover:text-[var(--br-action)]"
        >
          <ArrowLeft className="size-4" /> Back to Journal
        </Link>
        <header className="mt-5 overflow-hidden rounded-3xl bg-surface shadow-[var(--br-shadow)]">
          <div className="w-full p-6 sm:p-10">
            <div className="flex flex-wrap items-center justify-center gap-2 text-center text-xs font-bold text-[var(--br-text-muted)]">
              {[...post.categoryNames, ...post.tagNames].map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-[var(--br-brand-soft)] px-2.5 py-1 text-[var(--br-brand)]"
                >
                  {tag}
                </span>
              ))}
              <span className="ml-1 flex items-center gap-1">
                <Clock3 className="size-3.5" /> {getReadingMinutes(post)} min
                read
              </span>
            </div>
            <h1 className="mx-auto mt-5 max-w-4xl text-center text-3xl font-black leading-tight tracking-[-0.02em] sm:text-4xl">
              {post.title}
            </h1>
            {post.excerpt ? (
              <p className="mx-auto mt-4 max-w-3xl text-center text-base leading-7 text-[var(--br-text-muted)]">
                {post.excerpt}
              </p>
            ) : null}
          </div>
          {post.coverUrl ? (
            <img
              src={post.coverUrl}
              alt=""
              className="aspect-[16/7] w-full rounded-2xl object-cover"
            />
          ) : null}
          <div className="w-full border-t border-[var(--br-border)] px-6 py-4 text-sm font-bold text-[var(--br-text-muted)] sm:px-10">
            {post.authorName}
            {post.publishedAt
              ? ` · ${new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" }).format(new Date(post.publishedAt))}`
              : ""}
          </div>
        </header>
        <div className="knowledge-prose mt-5 max-w-none rounded-3xl bg-surface p-6 shadow-[var(--br-shadow)] sm:p-10">
          {(() => {
            const firstTocBlockIndex = blocks.findIndex((block, index) => {
              const key = String(block.id || index);
              return block.type === "heading" && navigation.anchors.has(key) && navigation.items.some((item) => item.id === navigation.anchors.get(key));
            });
            if (!navigation.items.length || firstTocBlockIndex < 0) return <DatabaseBlocks blocks={blocks} anchors={navigation.anchors} />;
            return <>
              <DatabaseBlocks blocks={blocks.slice(0, firstTocBlockIndex)} anchors={navigation.anchors} startIndex={0} />
              <TableOfContents title={post.tocTitle} items={navigation.items} />
              <DatabaseBlocks blocks={blocks.slice(firstTocBlockIndex)} anchors={navigation.anchors} startIndex={firstTocBlockIndex} />
            </>;
          })()}
        </div>
        <AuthorCard post={post} />
        <RelatedReading posts={related} />
      </article>
    </main>
  );
}

type TocItem = { id: string; label: string; level: number };

function slugForHeading(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72) || "section"
  );
}

function buildArticleNavigation(
  blocks: Array<Record<string, unknown>>,
  post: PublicBlogPost,
) {
  const items: TocItem[] = [];
  const anchors = new Map<string, string>();
  blocks.forEach((block, index) => {
    if (
      block.type !== "heading" ||
      typeof block.text !== "string" ||
      !block.text.trim()
    )
      return;
    const level = Number(block.level) || 2;
    const id = `section-${slugForHeading(block.text)}-${index + 1}`;
    anchors.set(String(block.id || index), id);
    const included =
      level === 2 ||
      (level === 3 && post.tocIncludeH3) ||
      (level === 4 && post.tocIncludeH4) ||
      (level === 5 && post.tocIncludeH5) ||
      (level === 6 && post.tocIncludeH6);
    if (post.tocEnabled && included)
      items.push({ id, label: block.text, level });
  });
  return { items, anchors };
}

function TableOfContents({
  title,
  items,
}: {
  title: string;
  items: TocItem[];
}) {
  return (
    <nav
      aria-label={title}
      className="mx-auto mb-8 max-w-[46rem] rounded-2xl border border-[var(--br-border)] bg-white p-5 shadow-sm sm:p-6"
    >
      <h2 className="text-[1.7rem] font-black leading-tight tracking-[-0.01em] text-ink">{title}</h2>
      <ol className="mt-4 space-y-1.5">
        {items.map((item) => (
          <li key={item.id} className={item.level > 2 ? "pl-4" : ""}>
            <a
              href={`#${item.id}`}
              className="group flex items-start gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-[var(--br-text-muted)] no-underline transition hover:bg-[var(--br-brand-soft)] hover:text-[var(--br-brand)]"
            >
              <span>{item.label}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function AuthorCard({ post }: { post: PublicBlogPost }) {
  const initials =
    post.authorName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "B";
  return (
    <section className="mx-auto mt-5 flex w-full max-w-[46rem] items-center gap-5 rounded-2xl border border-[var(--br-border)] bg-white p-5 shadow-sm sm:p-6">
      <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-[var(--br-brand)] bg-[var(--br-brand-soft)] font-black text-[var(--br-brand)] sm:size-24">
        {post.authorAvatarUrl ? (
          <img
            src={post.authorAvatarUrl}
            alt={`${post.authorName} profile`}
            className="size-full object-cover"
          />
        ) : (
          initials
        )}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--br-brand)]">
          Written by
        </p>
        <h2 className="mt-1 text-xl font-black text-ink">{post.authorName}</h2>
        <p className="mt-1 text-sm leading-6 text-[var(--br-text-muted)]">
          {post.authorBio ||
            "A BrenUp contributor helping learners build confident, practical English."}
        </p>
      </div>
    </section>
  );
}

function RelatedReading({ posts }: { posts: PublicBlogPost[] }) {
  if (!posts.length) return null;
  return (
    <section className="mt-5 rounded-3xl bg-surface p-6 shadow-[var(--br-shadow)] sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--br-brand)]">
            Keep exploring
          </p>
          <h2 className="mt-1 text-xl font-black text-ink">Related reading</h2>
        </div>
        <Link
          href="/blog"
          className="text-sm font-bold text-[var(--br-brand)] hover:underline"
        >
          All articles
        </Link>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {posts.map((related) => (
          <Link
            key={related.id}
            href={`/blog/${related.slug}`}
            className="group overflow-hidden rounded-2xl border border-[var(--br-border)] bg-[var(--br-canvas-elevated)] transition hover:-translate-y-0.5 hover:shadow-sm"
          >
            {related.coverUrl ? (
              <img
                src={related.coverUrl}
                alt=""
                className="aspect-[16/8] w-full object-cover"
              />
            ) : null}
            <div className="p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--br-brand)]">
                {related.categoryNames[0] ||
                  related.tagNames[0] ||
                  "BrenUp Journal"}
              </p>
              <h3 className="mt-2 line-clamp-2 font-bold leading-5 text-ink">
                {related.title}
              </h3>
              <p className="mt-2 text-xs text-[var(--br-text-muted)]">
                {getReadingMinutes(related)} min read
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function DatabaseBlocks({
  blocks,
  anchors,
  startIndex = 0,
}: {
  blocks: Array<Record<string, unknown>>;
  anchors: Map<string, string>;
  startIndex?: number;
}) {
  return (
    <>
      {blocks.map((block, index) => {
        const type = block.type;
        const key = String(block.id || startIndex + index);
        const text = typeof block.text === "string" ? block.text : "";
        if (type === "heading") {
          const Tag = (
            Number(block.level) === 2
              ? "h2"
              : Number(block.level) === 3
                ? "h3"
                : Number(block.level) === 4
                  ? "h4"
                  : Number(block.level) === 5
                    ? "h5"
                    : "h6"
          ) as "h2" | "h3" | "h4" | "h5" | "h6";
          return (
            <Tag key={key} id={anchors.get(key)}>
              {text}
            </Tag>
          );
        }
        if (type === "quote")
          return (
            <blockquote key={key}>
              <p>{text}</p>
              {typeof block.attribution === "string" && block.attribution ? (
                <cite>— {block.attribution}</cite>
              ) : null}
            </blockquote>
          );
        if (type === "callout")
          return (
            <aside
              key={key}
              className="my-5 rounded-2xl border border-[var(--br-action)]/30 bg-[var(--br-action)]/5 p-4"
            >
              {text}
            </aside>
          );
        if (type === "list") {
          const items = Array.isArray(block.items)
            ? block.items.filter(
                (item): item is string => typeof item === "string",
              )
            : [];
          return block.style === "NUMBERED" ? (
            <ol key={key}>
              {items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ol>
          ) : (
            <ul key={key}>
              {items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ul>
          );
        }
        if (type === "image")
          return typeof block.src === "string" && block.src ? (
            <figure key={key}>
              <img
                src={block.src}
                alt={typeof block.alt === "string" ? block.alt : ""}
                className="w-full rounded-2xl"
              />
              {typeof block.caption === "string" && block.caption ? (
                <figcaption>{block.caption}</figcaption>
              ) : null}
            </figure>
          ) : null;
        if (type === "cta")
          return (
            <aside
              key={key}
              className="my-6 rounded-2xl bg-[var(--br-dark-card)] p-5 text-on-dark"
            >
              <p className="text-lg font-black">
                {typeof block.label === "string"
                  ? block.label
                  : "Explore BrenUp"}
              </p>
              {typeof block.description === "string" && block.description ? (
                <p className="mt-2 text-sm text-white/75">
                  {block.description}
                </p>
              ) : null}
              {typeof block.href === "string" && block.href ? (
                <Link
                  href={block.href}
                  className="mt-4 inline-flex rounded-xl bg-white px-3 py-2 text-sm font-bold text-[var(--br-dark-card)]"
                >
                  Continue
                </Link>
              ) : null}
            </aside>
          );
        return <RichParagraph key={key} text={text} />;
      })}
    </>
  );
}

function RichParagraph({ text }: { text: string }) {
  return (
    <>
      {parseBlogRichText(text).map((segment, index) => {
        if (segment.kind === "bullet")
          return (
            <ul key={index}>
              {segment.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ul>
          );
        if (segment.kind === "numbered")
          return (
            <ol key={index}>
              {segment.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ol>
          );
        return <p key={index}>{segment.text}</p>;
      })}
    </>
  );
}
