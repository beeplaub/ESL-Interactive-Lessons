import { getKnowledgeEntries } from "@/lib/knowledge-base";
import { getPublishedBlogPosts } from "@/lib/blog-public";

const baseUrl = "https://www.brenup.com";

function escapeXml(value: string) {
  return value.replace(/[<>&'\"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '\"': "&quot;" })[character] ?? character);
}

export async function GET() {
  const live = await getPublishedBlogPosts();
  const liveSlugs = new Set(live.map((post) => post.slug));
  const articles = [
    ...live.map((post) => ({ title: post.title, url: `/blog/${post.slug}`, description: post.excerpt || "Practical guidance from BrenUp.", publishedAt: post.publishedAt || post.updatedAt })),
    ...getKnowledgeEntries("blog").filter((article) => !liveSlugs.has(article.slug[0] || "")),
  ].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  const items = articles.map((article) => `<item><title>${escapeXml(article.title)}</title><link>${baseUrl}${article.url}</link><guid>${baseUrl}${article.url}</guid><description>${escapeXml(article.description)}</description>${article.publishedAt ? `<pubDate>${new Date(article.publishedAt).toUTCString()}</pubDate>` : ""}</item>`).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>BrenUp Journal</title><link>${baseUrl}/blog</link><description>English learning, teaching, and course creation from BrenUp.</description><language>en</language>${items}</channel></rss>`;
  return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
