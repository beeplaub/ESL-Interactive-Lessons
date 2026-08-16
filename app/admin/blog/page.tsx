import { BlogWorkspace, type BlogPostSummary } from "@/components/BlogWorkspace";
import { getBlogSession } from "@/lib/blog-auth";
import { createAdminClient } from "@/lib/supabase/admin";

type BlogPostRow = Omit<BlogPostSummary, "authorName" | "categoryName" | "updatedAt" | "publishedAt" | "scheduledAt"> & {
  author_id: string | null;
  primary_category_id: string | null;
  updated_at: string;
  published_at: string | null;
  scheduled_at: string | null;
};

export default async function AdminBlogPage() {
  const session = await getBlogSession();
  if (!session.blogRole) return <main className="rounded-2xl border border-[var(--br-border)] bg-surface p-8 text-center shadow-sm"><h1 className="text-xl font-bold text-ink">BrenUp Journal is invitation-only</h1><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--br-text-muted)]">Ask a platform administrator to assign you a Journal editorial role before you start writing.</p></main>;
  const admin = createAdminClient();
  let postsQuery = admin.from("blog_posts").select("id,title,slug,status,author_id,primary_category_id,updated_at,published_at,scheduled_at,excerpt").order("updated_at", { ascending: false }).limit(160);
  if (["AUTHOR", "CONTRIBUTOR"].includes(session.blogRole)) postsQuery = postsQuery.eq("created_by", session.user.id);
  const [{ data: postRows, error }, { data: categories }] = await Promise.all([
    postsQuery,
    admin.from("blog_categories").select("id,name").order("position").order("name"),
  ]);
  if (error) {
    return <main className="rounded-2xl border border-[var(--br-border)] bg-surface p-8 text-center shadow-sm"><h1 className="text-xl font-bold text-ink">BrenUp Journal is being prepared</h1><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--br-text-muted)]">Run the Blog CMS foundation migration in Supabase, then return here to create your first article. No existing lessons, quizzes, courses, or journal Markdown files will be changed.</p></main>;
  }
  const posts = (postRows ?? []) as BlogPostRow[];
  const authorIds = Array.from(new Set(posts.map((post) => post.author_id).filter((id): id is string => Boolean(id))));
  const { data: authors } = authorIds.length ? await admin.from("profiles").select("id,full_name,first_name,last_name").in("id", authorIds) : { data: [] };
  const authorNames = new Map((authors ?? []).map((author) => [author.id, author.full_name || [author.first_name, author.last_name].filter(Boolean).join(" ") || "BrenUp author"]));
  const categoryNames = new Map((categories ?? []).map((category) => [category.id, category.name]));
  const summaries: BlogPostSummary[] = posts.map((post) => ({ id: post.id, title: post.title, slug: post.slug, status: post.status, excerpt: post.excerpt, authorName: authorNames.get(post.author_id || "") || "BrenUp author", categoryName: categoryNames.get(post.primary_category_id || "") || null, updatedAt: post.updated_at, publishedAt: post.published_at, scheduledAt: post.scheduled_at }));
  return <BlogWorkspace posts={summaries} blogRole={session.blogRole} categories={(categories ?? []) as Array<{ id: string; name: string }>} />;
}
