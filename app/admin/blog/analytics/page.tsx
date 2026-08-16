import { notFound } from "next/navigation";
import { BlogAnalyticsWorkspace, type BlogMetricRow, type BlogTopPost } from "@/components/BlogAnalyticsWorkspace";
import { getBlogSession } from "@/lib/blog-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function BlogAnalyticsPage() {
  const session = await getBlogSession();
  if (!["PLATFORM_ADMIN", "EDITOR"].includes(session.blogRole || "")) notFound();
  const admin = createAdminClient();
  const start = new Date(); start.setUTCDate(start.getUTCDate() - 29); start.setUTCHours(0, 0, 0, 0);
  const [{ data: metrics, error }, { data: posts, count: publishedCount }] = await Promise.all([
    admin.from("blog_post_daily_metrics").select("post_id,metric_date,views,unique_visitors").gte("metric_date", start.toISOString().slice(0, 10)).order("metric_date"),
    admin.from("blog_posts").select("id,title,slug,published_at", { count: "exact" }).eq("status", "PUBLISHED").eq("visibility", "PUBLIC").is("deleted_at", null),
  ]);
  if (error) return <main className="rounded-2xl border border-[var(--br-border)] bg-surface p-8 text-center shadow-sm"><h1 className="text-xl font-bold text-ink">Journal analytics is being prepared</h1><p className="mt-2 text-sm leading-6 text-[var(--br-text-muted)]">Run the Blog Analytics migration, then published Journal articles will begin collecting private first-party reading data.</p></main>;
  const dayMap = new Map<string, BlogMetricRow>();
  for (let offset = 29; offset >= 0; offset -= 1) { const date = new Date(); date.setUTCDate(date.getUTCDate() - offset); const key = date.toISOString().slice(0, 10); dayMap.set(key, { metricDate: key, views: 0, uniqueVisitors: 0 }); }
  const postMap = new Map((posts ?? []).map((post) => [post.id, { id: post.id, title: post.title, slug: post.slug, publishedAt: post.published_at, views: 0, uniqueVisitors: 0 }]));
  for (const metric of metrics ?? []) { const day = dayMap.get(metric.metric_date); if (day) { day.views += metric.views; day.uniqueVisitors += metric.unique_visitors; } const post = postMap.get(metric.post_id); if (post) { post.views += metric.views; post.uniqueVisitors += metric.unique_visitors; } }
  const topPosts = Array.from(postMap.values()).sort((left, right) => right.views - left.views).slice(0, 8) as BlogTopPost[];
  return <BlogAnalyticsWorkspace daily={Array.from(dayMap.values())} topPosts={topPosts} publishedCount={publishedCount ?? 0} />;
}
