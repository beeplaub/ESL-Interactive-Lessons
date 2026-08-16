import type { MetadataRoute } from "next";
import { getKnowledgeEntries } from "@/lib/knowledge-base";

const baseUrl = "https://www.brenup.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ["", "/courses", "/quizzes", "/level-test", "/pricing", "/our-story", "/privacy", "/terms", "/docs", "/blog"];
  const knowledgeRoutes = ["docs", "blog"] as const;
  return [
    ...staticRoutes.map((route) => ({ url: `${baseUrl}${route || "/"}`, lastModified: new Date(), changeFrequency: route === "" ? "weekly" as const : "monthly" as const, priority: route === "" ? 1 : 0.7 })),
    ...knowledgeRoutes.flatMap((kind) => getKnowledgeEntries(kind).map((entry) => ({ url: `${baseUrl}${entry.url}`, lastModified: entry.publishedAt ? new Date(entry.publishedAt) : new Date(), changeFrequency: kind === "blog" ? "monthly" as const : "yearly" as const, priority: kind === "blog" ? 0.75 : 0.6 }))),
  ];
}
