import type { MetadataRoute } from "next";
import { getKnowledgeEntries } from "@/lib/knowledge-base";
import { getPublishedBlogPosts } from "@/lib/blog-public";

const baseUrl = "https://www.brenup.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes = ["", "/courses", "/quizzes", "/level-test", "/pricing", "/our-story", "/privacy", "/terms", "/docs", "/blog"];
  const knowledgeRoutes = ["docs", "blog"] as const;
  const livePosts = await getPublishedBlogPosts();
  const liveSlugs = new Set(livePosts.map((post) => post.slug));
  return [
    ...staticRoutes.map((route) => ({ url: `${baseUrl}${route || "/"}`, lastModified: new Date(), changeFrequency: route === "" ? "weekly" as const : "monthly" as const, priority: route === "" ? 1 : 0.7 })),
    ...knowledgeRoutes.flatMap((kind) => getKnowledgeEntries(kind).filter((entry) => kind !== "blog" || !liveSlugs.has(entry.slug[0] || "")).map((entry) => ({ url: `${baseUrl}${entry.url}`, lastModified: entry.publishedAt ? new Date(entry.publishedAt) : new Date(), changeFrequency: kind === "blog" ? "monthly" as const : "yearly" as const, priority: kind === "blog" ? 0.75 : 0.6 }))),
    ...livePosts.filter((post) => post.allowIndex).map((post) => ({ url: `${baseUrl}/blog/${post.slug}`, lastModified: new Date(post.updatedAt), changeFrequency: "monthly" as const, priority: 0.75 })),
  ];
}
