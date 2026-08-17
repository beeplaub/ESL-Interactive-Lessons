import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type PublicBlogPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: { type?: string; content?: Array<Record<string, unknown>> };
  contentText: string;
  publishedAt: string | null;
  updatedAt: string;
  seoTitle: string | null;
  seoDescription: string | null;
  socialTitle: string | null;
  socialDescription: string | null;
  canonicalUrl: string | null;
  allowIndex: boolean;
  primaryKeyword: string | null;
  coverUrl: string | null;
  authorName: string;
  authorBio: string | null;
  authorAvatarUrl: string | null;
  categoryNames: string[];
  tagNames: string[];
  visibility: "PUBLIC" | "UNLISTED";
};

function minutes(text: string) {
  return Math.max(
    1,
    Math.ceil(text.trim().split(/\s+/).filter(Boolean).length / 220),
  );
}

async function hydrate(
  rows: Array<Record<string, unknown>>,
): Promise<PublicBlogPost[]> {
  if (!rows.length) return [];
  const admin = createAdminClient();
  const postIds = rows.map((row) => String(row.id));
  const authorIds = Array.from(
    new Set(
      rows
        .map((row) => row.author_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  );
  const coverAssetIds = Array.from(
    new Set(
      rows
        .map((row) => row.cover_asset_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  );
  const [
    authorsResult,
    categoriesResult,
    mappingsResult,
    tagMappingsResult,
    tagsResult,
    assetsResult,
  ] = await Promise.all([
    authorIds.length
      ? admin
          .from("blog_authors")
          .select("user_id,display_name,bio,avatar_url")
          .in("user_id", authorIds)
      : { data: [] },
    admin.from("blog_categories").select("id,name").eq("is_active", true),
    admin
      .from("blog_post_categories")
      .select("post_id,category_id")
      .in("post_id", postIds),
    admin
      .from("blog_post_tags")
      .select("post_id,tag_id")
      .in("post_id", postIds),
    admin.from("blog_tags").select("id,name").eq("is_active", true),
    coverAssetIds.length
      ? admin.from("media_assets").select("id,url").in("id", coverAssetIds)
      : { data: [] },
  ]);
  const authors = new Map(
    (authorsResult.data ?? []).map((author) => [
      author.user_id,
      {
        name: author.display_name || "BrenUp author",
        bio: author.bio || null,
        avatarUrl: author.avatar_url || null,
      },
    ]),
  );
  const categoryNames = new Map(
    (categoriesResult.data ?? []).map((category) => [
      category.id,
      category.name,
    ]),
  );
  const tagNames = new Map(
    (tagsResult.data ?? []).map((tag) => [tag.id, tag.name]),
  );
  const categoriesByPost = new Map<string, string[]>();
  for (const mapping of mappingsResult.data ?? [])
    categoriesByPost.set(mapping.post_id, [
      ...(categoriesByPost.get(mapping.post_id) ?? []),
      categoryNames.get(mapping.category_id) || "",
    ]);
  const tagsByPost = new Map<string, string[]>();
  for (const mapping of tagMappingsResult.data ?? [])
    tagsByPost.set(mapping.post_id, [
      ...(tagsByPost.get(mapping.post_id) ?? []),
      tagNames.get(mapping.tag_id) || "",
    ]);
  const assets = new Map(
    (assetsResult.data ?? []).map((asset) => [asset.id, asset.url]),
  );
  return rows.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    slug: String(row.slug),
    excerpt: typeof row.excerpt === "string" ? row.excerpt : null,
    content: (row.content && typeof row.content === "object"
      ? row.content
      : { type: "doc", content: [] }) as PublicBlogPost["content"],
    contentText: typeof row.content_text === "string" ? row.content_text : "",
    publishedAt: typeof row.published_at === "string" ? row.published_at : null,
    updatedAt: String(row.updated_at),
    seoTitle: typeof row.seo_title === "string" ? row.seo_title : null,
    seoDescription:
      typeof row.seo_description === "string" ? row.seo_description : null,
    socialTitle: typeof row.social_title === "string" ? row.social_title : null,
    socialDescription:
      typeof row.social_description === "string"
        ? row.social_description
        : null,
    canonicalUrl:
      typeof row.canonical_url === "string" ? row.canonical_url : null,
    allowIndex: row.allow_index !== false,
    primaryKeyword:
      typeof row.primary_keyword === "string" ? row.primary_keyword : null,
    coverUrl:
      typeof row.cover_asset_id === "string"
        ? assets.get(row.cover_asset_id) || null
        : null,
    authorName:
      typeof row.author_id === "string"
        ? authors.get(row.author_id)?.name || "BrenUp author"
        : "BrenUp author",
    authorBio:
      typeof row.author_id === "string"
        ? authors.get(row.author_id)?.bio || null
        : null,
    authorAvatarUrl:
      typeof row.author_id === "string"
        ? authors.get(row.author_id)?.avatarUrl || null
        : null,
    categoryNames: (categoriesByPost.get(String(row.id)) ?? []).filter(Boolean),
    tagNames: (tagsByPost.get(String(row.id)) ?? []).filter(Boolean),
    visibility: row.visibility === "UNLISTED" ? "UNLISTED" : "PUBLIC",
  }));
}

export async function getPublishedBlogPosts() {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("blog_posts")
      .select(
        "id,title,slug,excerpt,content,content_text,published_at,updated_at,seo_title,seo_description,social_title,social_description,canonical_url,allow_index,primary_keyword,cover_asset_id,author_id,primary_category_id,visibility",
      )
      .eq("status", "PUBLISHED")
      .eq("visibility", "PUBLIC")
      .is("deleted_at", null)
      .order("published_at", { ascending: false });
    if (error) return [];
    return hydrate((data ?? []) as Array<Record<string, unknown>>);
  } catch {
    return [];
  }
}

export async function getPublishedBlogPost(slug: string) {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("blog_posts")
      .select(
        "id,title,slug,excerpt,content,content_text,published_at,updated_at,seo_title,seo_description,social_title,social_description,canonical_url,allow_index,primary_keyword,cover_asset_id,author_id,primary_category_id,visibility",
      )
      .eq("slug", slug)
      .eq("status", "PUBLISHED")
      .in("visibility", ["PUBLIC", "UNLISTED"])
      .is("deleted_at", null)
      .maybeSingle();
    if (error || !data) return null;
    return (await hydrate([data as Record<string, unknown>]))[0] || null;
  } catch {
    return null;
  }
}

export async function getBlogRedirect(slug: string) {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("blog_slug_redirects")
      .select("post_id")
      .eq("from_slug", slug)
      .eq("is_active", true)
      .maybeSingle();
    if (error || !data?.post_id) return null;
    const { data: post } = await admin
      .from("blog_posts")
      .select("slug,status,visibility,deleted_at")
      .eq("id", data.post_id)
      .maybeSingle();
    return post?.status === "PUBLISHED" &&
      ["PUBLIC", "UNLISTED"].includes(post.visibility) &&
      !post.deleted_at
      ? post.slug
      : null;
  } catch {
    return null;
  }
}

export function getReadingMinutes(post: Pick<PublicBlogPost, "contentText">) {
  return minutes(post.contentText);
}
