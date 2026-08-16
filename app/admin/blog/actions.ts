"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireBlogCapability, getBlogSession } from "@/lib/blog-auth";
import { getKnowledgeEntries } from "@/lib/knowledge-base";

type PostStatus = "DRAFT" | "IN_REVIEW" | "CHANGES_REQUESTED" | "APPROVED" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED" | "TRASH";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "untitled-post";
}

function refreshBlog(postId?: string) {
  revalidatePath("/admin/blog");
  if (postId) revalidatePath(`/admin/blog/${postId}/edit`);
  revalidatePath("/blog");
  revalidatePath("/sitemap.xml");
  revalidatePath("/blog/rss.xml");
}

async function uniqueSlug(title: string, excludedPostId?: string) {
  const admin = createAdminClient();
  const base = slugify(title);
  let candidate = base;
  let suffix = 2;
  while (true) {
    let query = admin.from("blog_posts").select("id").eq("slug", candidate).limit(1);
    if (excludedPostId) query = query.neq("id", excludedPostId);
    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return candidate;
    candidate = `${base.slice(0, Math.max(1, 86 - String(suffix).length))}-${suffix}`;
    suffix += 1;
  }
}

async function writeRevision(input: {
  postId: string;
  version: number;
  eventType: "CREATED" | "AUTOSAVED" | "SAVED" | "SUBMITTED_FOR_REVIEW" | "CHANGES_REQUESTED" | "APPROVED" | "SCHEDULED" | "PUBLISHED" | "UNPUBLISHED" | "ARCHIVED" | "RESTORED";
  title: string;
  slug: string;
  excerpt?: string | null;
  content: unknown;
  contentText?: string | null;
  createdBy: string;
  metadata?: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  const { error } = await admin.from("blog_post_revisions").upsert({
    post_id: input.postId,
    version: input.version,
    event_type: input.eventType,
    title: input.title,
    slug: input.slug,
    excerpt: input.excerpt || null,
    content: input.content,
    content_text: input.contentText || "",
    created_by: input.createdBy,
    metadata: input.metadata || {},
  }, { onConflict: "post_id,version" });
  if (error) throw new Error(error.message);
}

export async function createBlogPost(title?: string): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const session = await requireBlogCapability("create");
    const admin = createAdminClient();
    const cleanTitle = title?.trim() || "Untitled post";
    const slug = await uniqueSlug(cleanTitle);
    const { data, error } = await admin.from("blog_posts").insert({
      title: cleanTitle,
      slug,
      created_by: session.user.id,
      author_id: session.user.id,
      content: { type: "doc", content: [] },
      content_text: "",
    }).select("id,title,slug,content_version").single();
    if (error || !data) return { success: false, error: error?.message || "Could not create the post." };
    await admin.from("blog_authors").upsert({
      user_id: session.user.id,
      display_name: session.profile?.full_name || [session.profile?.first_name, session.profile?.last_name].filter(Boolean).join(" ") || "BrenUp author",
      slug: `${slugify(session.profile?.full_name || "brenup-author")}-${session.user.id.slice(0, 8)}`,
    }, { onConflict: "user_id", ignoreDuplicates: true });
    await writeRevision({ postId: data.id, version: data.content_version, eventType: "CREATED", title: data.title, slug: data.slug, content: { type: "doc", content: [] }, createdBy: session.user.id });
    refreshBlog(data.id);
    return { success: true, id: data.id };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not create the post." };
  }
}

export async function changeBlogPostStatus(postId: string, status: PostStatus): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getBlogSession();
    if (!session.blogRole) return { success: false, error: "You do not have access to BrenUp Journal." };
    const admin = createAdminClient();
    const { data: post, error: readError } = await admin.from("blog_posts").select("id,title,slug,excerpt,content,content_text,content_version,created_by").eq("id", postId).maybeSingle();
    if (readError || !post) return { success: false, error: readError?.message || "Post not found." };
    const role = session.blogRole;
    const ownsPost = post.created_by === session.user.id;
    const canPublish = role === "PLATFORM_ADMIN" || role === "EDITOR";
    const canReview = canPublish || role === "REVIEWER";
    if (status === "PUBLISHED" && !canPublish) return { success: false, error: "Only an editor can publish a post." };
    if (["APPROVED", "CHANGES_REQUESTED"].includes(status) && !canReview) return { success: false, error: "Only a reviewer can change the review decision." };
    if (!canPublish && !canReview && !ownsPost) return { success: false, error: "You can only update your own posts." };
    if (role === "CONTRIBUTOR" && !["DRAFT", "IN_REVIEW", "TRASH"].includes(status)) return { success: false, error: "Contributors can save drafts or submit work for review." };
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { status, updated_at: now };
    if (status === "PUBLISHED") { patch.published_at = now; patch.deleted_at = null; patch.archived_at = null; }
    if (status === "ARCHIVED") patch.archived_at = now;
    if (status === "TRASH") patch.deleted_at = now;
    if (status === "DRAFT" && post.created_by === session.user.id) { patch.deleted_at = null; patch.archived_at = null; }
    if (["APPROVED", "CHANGES_REQUESTED"].includes(status)) patch.last_reviewed_at = now;
    const { error } = await admin.from("blog_posts").update(patch).eq("id", postId);
    if (error) return { success: false, error: error.message };
    const eventType = status === "PUBLISHED" ? "PUBLISHED" : status === "SCHEDULED" ? "SCHEDULED" : status === "ARCHIVED" ? "ARCHIVED" : status === "IN_REVIEW" ? "SUBMITTED_FOR_REVIEW" : status === "CHANGES_REQUESTED" ? "CHANGES_REQUESTED" : status === "APPROVED" ? "APPROVED" : status === "DRAFT" ? "SAVED" : "SAVED";
    await writeRevision({ postId, version: post.content_version + 1, eventType, title: post.title, slug: post.slug, excerpt: post.excerpt, content: post.content, contentText: post.content_text, createdBy: session.user.id, metadata: { status } });
    await admin.from("blog_posts").update({ content_version: post.content_version + 1 }).eq("id", postId);
    refreshBlog(postId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not update the post." };
  }
}

export async function duplicateBlogPost(postId: string): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const session = await requireBlogCapability("create");
    const admin = createAdminClient();
    const { data: original, error: readError } = await admin.from("blog_posts").select("title,excerpt,content,content_text,visibility,cover_asset_id,og_asset_id,primary_category_id,seo_title,seo_description,social_title,social_description,canonical_url,primary_keyword,allow_index,is_featured,is_commenting_enabled").eq("id", postId).maybeSingle();
    if (readError || !original) return { success: false, error: readError?.message || "Post not found." };
    const title = `${original.title} (copy)`;
    const slug = await uniqueSlug(title);
    const { data, error } = await admin.from("blog_posts").insert({ ...original, title, slug, created_by: session.user.id, author_id: session.user.id, status: "DRAFT", published_at: null, scheduled_at: null, archived_at: null, deleted_at: null, content_version: 1 }).select("id").single();
    if (error || !data) return { success: false, error: error?.message || "Could not duplicate the post." };
    await writeRevision({ postId: data.id, version: 1, eventType: "CREATED", title, slug, excerpt: original.excerpt, content: original.content, contentText: original.content_text, createdBy: session.user.id, metadata: { duplicatedFrom: postId } });
    refreshBlog(data.id);
    return { success: true, id: data.id };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not duplicate the post." };
  }
}

type BlogBlock = {
  id?: string;
  type: "paragraph" | "heading" | "quote" | "callout" | "list" | "image" | "cta";
  text?: string;
  level?: 2 | 3 | 4;
  attribution?: string;
  tone?: "IDEA" | "TIP" | "NOTE";
  style?: "BULLET" | "NUMBERED";
  items?: string[];
  src?: string;
  alt?: string;
  caption?: string;
  label?: string;
  href?: string;
  description?: string;
};

type BlogPostInput = {
  title: string;
  slug?: string;
  coverAssetId?: string | null;
  excerpt?: string;
  content: { type: "doc"; content: BlogBlock[] };
  visibility: "PUBLIC" | "UNLISTED" | "PRIVATE";
  categoryIds: string[];
  tagIds: string[];
  primaryCategoryId?: string | null;
  seoTitle?: string;
  seoDescription?: string;
  socialTitle?: string;
  socialDescription?: string;
  canonicalUrl?: string;
  primaryKeyword?: string;
  allowIndex?: boolean;
  isFeatured?: boolean;
};

function contentTextFromBlocks(blocks: BlogBlock[]) {
  return blocks.flatMap((block) => [
    block.text || "",
    block.attribution || "",
    ...(block.items || []),
    block.alt || "",
    block.caption || "",
    block.label || "",
    block.description || "",
  ]).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function validContent(input: unknown): input is { type: "doc"; content: BlogBlock[] } {
  if (!input || typeof input !== "object") return false;
  const document = input as { type?: string; content?: unknown };
  if (document.type !== "doc" || !Array.isArray(document.content)) return false;
  return document.content.every((block) => {
    if (!block || typeof block !== "object") return false;
    const type = (block as { type?: string }).type;
    return ["paragraph", "heading", "quote", "callout", "list", "image", "cta"].includes(type || "");
  });
}

export async function saveBlogPost(postId: string, input: BlogPostInput, event: "AUTOSAVED" | "SAVED" = "SAVED"): Promise<{ success: boolean; slug?: string; error?: string }> {
  try {
    const session = await getBlogSession();
    if (!session.blogRole) return { success: false, error: "You do not have access to BrenUp Journal." };
    const cleanTitle = input.title.trim() || "Untitled post";
    if (!validContent(input.content)) return { success: false, error: "The article content has an unsupported block." };
    const admin = createAdminClient();
    const { data: post, error: readError } = await admin.from("blog_posts").select("id,created_by,slug,content_version,status").eq("id", postId).maybeSingle();
    if (readError || !post) return { success: false, error: readError?.message || "Post not found." };
    const canEditAny = ["PLATFORM_ADMIN", "EDITOR"].includes(session.blogRole);
    if (!canEditAny && post.created_by !== session.user.id) return { success: false, error: "You can only edit your own posts." };
    if (session.blogRole === "CONTRIBUTOR" && !["DRAFT", "CHANGES_REQUESTED", "IN_REVIEW"].includes(post.status)) return { success: false, error: "Contributors cannot edit this post in its current state." };
    const requestedSlug = input.slug?.trim().replace(/^\/+/, "").replace(/^blog\//, "").replace(/\/+$/, "");
    const slug = requestedSlug ? await uniqueSlug(requestedSlug, postId) : cleanTitle === "Untitled post" ? post.slug : await uniqueSlug(cleanTitle, postId);
    const categoryIds = Array.from(new Set((input.categoryIds || []).filter(Boolean)));
    const tagIds = Array.from(new Set((input.tagIds || []).filter(Boolean)));
    const contentText = contentTextFromBlocks(input.content.content);
    // Quiet autosaves keep the draft safe but do not turn every keystroke into
    // an editorial revision. Manual saves, workflow actions, and restores do.
    const nextVersion = event === "AUTOSAVED" ? post.content_version : post.content_version + 1;
    const { error } = await admin.from("blog_posts").update({
      title: cleanTitle,
      slug,
      excerpt: input.excerpt?.trim() || null,
      content: input.content,
      content_text: contentText,
      visibility: input.visibility,
      primary_category_id: categoryIds.includes(input.primaryCategoryId || "") ? input.primaryCategoryId : categoryIds[0] || null,
      seo_title: input.seoTitle?.trim() || null,
      seo_description: input.seoDescription?.trim() || null,
      social_title: input.socialTitle?.trim() || null,
      social_description: input.socialDescription?.trim() || null,
      canonical_url: input.canonicalUrl?.trim() || null,
      cover_asset_id: input.coverAssetId || null,
      primary_keyword: input.primaryKeyword?.trim() || null,
      allow_index: input.allowIndex !== false,
      is_featured: Boolean(input.isFeatured),
      content_version: nextVersion,
      updated_at: new Date().toISOString(),
    }).eq("id", postId);
    if (error) return { success: false, error: error.message };
    if (post.slug !== slug) {
      const { error: redirectError } = await admin.from("blog_slug_redirects").upsert({
        from_slug: post.slug,
        post_id: postId,
        is_active: true,
        created_by: session.user.id,
      }, { onConflict: "from_slug" });
      if (redirectError) return { success: false, error: redirectError.message };
    }
    await admin.from("blog_post_categories").delete().eq("post_id", postId);
    if (categoryIds.length) {
      const { error: categoryError } = await admin.from("blog_post_categories").insert(categoryIds.map((categoryId) => ({ post_id: postId, category_id: categoryId })));
      if (categoryError) return { success: false, error: categoryError.message };
    }
    await admin.from("blog_post_tags").delete().eq("post_id", postId);
    if (tagIds.length) {
      const { error: tagError } = await admin.from("blog_post_tags").insert(tagIds.map((tagId) => ({ post_id: postId, tag_id: tagId })));
      if (tagError) return { success: false, error: tagError.message };
    }
    if (event !== "AUTOSAVED") await writeRevision({ postId, version: nextVersion, eventType: event, title: cleanTitle, slug, excerpt: input.excerpt, content: input.content, contentText, createdBy: session.user.id, metadata: { visibility: input.visibility, categoryIds, tagIds, primaryCategoryId: input.primaryCategoryId || null, seoTitle: input.seoTitle || null, seoDescription: input.seoDescription || null, socialTitle: input.socialTitle || null, socialDescription: input.socialDescription || null, canonicalUrl: input.canonicalUrl || null, coverAssetId: input.coverAssetId || null, primaryKeyword: input.primaryKeyword || null, allowIndex: input.allowIndex !== false, isFeatured: Boolean(input.isFeatured) } });
    refreshBlog(postId);
    return { success: true, slug };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not save the post." };
  }
}

export async function scheduleBlogPost(postId: string, scheduledAt: string): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireBlogCapability("publish");
    const date = new Date(scheduledAt);
    if (!scheduledAt || Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) return { success: false, error: "Choose a future publication time." };
    const admin = createAdminClient();
    const { data: post, error: readError } = await admin.from("blog_posts").select("title,slug,excerpt,content,content_text,content_version").eq("id", postId).maybeSingle();
    if (readError || !post) return { success: false, error: readError?.message || "Post not found." };
    const version = post.content_version + 1;
    const { error } = await admin.from("blog_posts").update({ status: "SCHEDULED", scheduled_at: date.toISOString(), content_version: version, updated_at: new Date().toISOString() }).eq("id", postId);
    if (error) return { success: false, error: error.message };
    await writeRevision({ postId, version, eventType: "SCHEDULED", title: post.title, slug: post.slug, excerpt: post.excerpt, content: post.content, contentText: post.content_text, createdBy: session.user.id, metadata: { scheduledAt: date.toISOString() } });
    refreshBlog(postId);
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Could not schedule the post." }; }
}

/** Called by the same protected scheduler that dispatches BrenUp notifications. */
export async function publishDueBlogPosts() {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: posts, error } = await admin.from("blog_posts").select("id,title,slug,excerpt,content,content_text,content_version,created_by").eq("status", "SCHEDULED").lte("scheduled_at", now).is("deleted_at", null).order("scheduled_at").limit(50);
  if (error) throw new Error(error.message);
  let published = 0;
  for (const post of posts ?? []) {
    const version = post.content_version + 1;
    const { error: updateError } = await admin.from("blog_posts").update({ status: "PUBLISHED", published_at: now, scheduled_at: null, content_version: version, updated_at: now }).eq("id", post.id).eq("status", "SCHEDULED");
    if (updateError) continue;
    await writeRevision({ postId: post.id, version, eventType: "PUBLISHED", title: post.title, slug: post.slug, excerpt: post.excerpt, content: post.content, contentText: post.content_text, createdBy: post.created_by, metadata: { scheduledPublish: true } });
    refreshBlog(post.id);
    published += 1;
  }
  return published;
}

export async function saveBlogCategory(formData: FormData): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireBlogCapability("manage_taxonomy");
    const name = String(formData.get("name") || "").trim();
    if (!name) return { success: false, error: "Write a category name." };
    const admin = createAdminClient();
    const { count } = await admin.from("blog_categories").select("id", { count: "exact", head: true });
    const { error } = await admin.from("blog_categories").upsert({ name, slug: await uniqueCategorySlug(name), description: String(formData.get("description") || "").trim() || null, color: String(formData.get("color") || "").trim() || null, position: (count ?? 0) + 1, is_active: true, created_by: session.user.id }, { onConflict: "slug" });
    if (error) return { success: false, error: error.message };
    revalidatePath("/admin/blog"); revalidatePath("/admin/blog/settings");
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Could not save the category." }; }
}

async function uniqueCategorySlug(name: string) {
  const admin = createAdminClient();
  const base = slugify(name);
  let candidate = base;
  let suffix = 2;
  while (true) {
    const { data } = await admin.from("blog_categories").select("id").eq("slug", candidate).maybeSingle();
    if (!data) return candidate;
    candidate = `${base.slice(0, Math.max(1, 86 - String(suffix).length))}-${suffix}`;
    suffix += 1;
  }
}

export async function saveBlogTag(formData: FormData): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await requireBlogCapability("manage_taxonomy");
    const name = String(formData.get("name") || "").trim();
    if (!name) return { success: false, error: "Write a tag name." };
    const admin = createAdminClient();
    const base = slugify(name);
    const { data: existing } = await admin.from("blog_tags").select("id").eq("slug", base).maybeSingle();
    if (existing) return { success: false, error: "That tag already exists." };
    const { error } = await admin.from("blog_tags").insert({ name, slug: base, description: String(formData.get("description") || "").trim() || null, created_by: session.user.id });
    if (error) return { success: false, error: error.message };
    revalidatePath("/admin/blog"); revalidatePath("/admin/blog/settings");
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Could not save the tag." }; }
}

export async function setBlogEditorMember(formData: FormData): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getBlogSession();
    if (session.blogRole !== "PLATFORM_ADMIN") return { success: false, error: "Only a platform administrator can manage Journal roles." };
    const userId = String(formData.get("userId") || "");
    const role = String(formData.get("role") || "");
    if (!userId || !["EDITOR", "AUTHOR", "CONTRIBUTOR", "REVIEWER"].includes(role)) return { success: false, error: "Choose a valid team member and role." };
    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("id,role").eq("id", userId).maybeSingle();
    if (!profile || !["ADMIN", "TEACHER", "SCHOOL_ADMIN"].includes(String(profile.role))) return { success: false, error: "Journal roles can only be assigned to BrenUp staff." };
    const { error } = await admin.from("blog_editor_members").upsert({ user_id: userId, role, is_active: formData.get("isActive") !== "off", granted_by: session.user.id, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) return { success: false, error: error.message };
    revalidatePath("/admin/blog/settings");
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Could not update the Journal role." }; }
}

export async function setBlogTaxonomyStatus(kind: "category" | "tag", id: string, isActive: boolean): Promise<{ success: boolean; error?: string }> {
  try {
    await requireBlogCapability("manage_taxonomy");
    const admin = createAdminClient();
    const { error } = await admin.from(kind === "category" ? "blog_categories" : "blog_tags").update({ is_active: isActive, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return { success: false, error: error.message };
    revalidatePath("/admin/blog"); revalidatePath("/admin/blog/settings"); return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Could not update this item." }; }
}

export async function restoreBlogRevision(postId: string, revisionId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getBlogSession();
    if (!session.blogRole) return { success: false, error: "You do not have access to BrenUp Journal." };
    const admin = createAdminClient();
    const [{ data: post, error: postError }, { data: revision, error: revisionError }] = await Promise.all([
      admin.from("blog_posts").select("id,created_by,slug,content_version").eq("id", postId).maybeSingle(),
      admin.from("blog_post_revisions").select("id,post_id,title,slug,excerpt,content,content_text,metadata").eq("id", revisionId).eq("post_id", postId).maybeSingle(),
    ]);
    if (postError || !post || revisionError || !revision) return { success: false, error: postError?.message || revisionError?.message || "Revision not found." };
    const canEditAny = ["PLATFORM_ADMIN", "EDITOR"].includes(session.blogRole);
    if (!canEditAny && post.created_by !== session.user.id) return { success: false, error: "You can only restore your own post." };
    const metadata = (revision.metadata && typeof revision.metadata === "object" ? revision.metadata : {}) as Record<string, unknown>;
    const slug = await uniqueSlug(revision.slug || revision.title, postId);
    const version = post.content_version + 1;
    const { error } = await admin.from("blog_posts").update({
      title: revision.title,
      slug,
      excerpt: revision.excerpt,
      content: revision.content,
      content_text: revision.content_text,
      visibility: ["PUBLIC", "UNLISTED", "PRIVATE"].includes(String(metadata.visibility)) ? metadata.visibility : "PUBLIC",
      primary_category_id: typeof metadata.primaryCategoryId === "string" ? metadata.primaryCategoryId : null,
      seo_title: typeof metadata.seoTitle === "string" ? metadata.seoTitle : null,
      seo_description: typeof metadata.seoDescription === "string" ? metadata.seoDescription : null,
      social_title: typeof metadata.socialTitle === "string" ? metadata.socialTitle : null,
      social_description: typeof metadata.socialDescription === "string" ? metadata.socialDescription : null,
      canonical_url: typeof metadata.canonicalUrl === "string" ? metadata.canonicalUrl : null,
      cover_asset_id: typeof metadata.coverAssetId === "string" ? metadata.coverAssetId : null,
      primary_keyword: typeof metadata.primaryKeyword === "string" ? metadata.primaryKeyword : null,
      allow_index: metadata.allowIndex !== false,
      is_featured: Boolean(metadata.isFeatured),
      content_version: version,
      updated_at: new Date().toISOString(),
    }).eq("id", postId);
    if (error) return { success: false, error: error.message };
    const categoryIds = Array.isArray(metadata.categoryIds) ? metadata.categoryIds.filter((value): value is string => typeof value === "string") : [];
    const tagIds = Array.isArray(metadata.tagIds) ? metadata.tagIds.filter((value): value is string => typeof value === "string") : [];
    await admin.from("blog_post_categories").delete().eq("post_id", postId);
    if (categoryIds.length) await admin.from("blog_post_categories").insert(categoryIds.map((categoryId) => ({ post_id: postId, category_id: categoryId })));
    await admin.from("blog_post_tags").delete().eq("post_id", postId);
    if (tagIds.length) await admin.from("blog_post_tags").insert(tagIds.map((tagId) => ({ post_id: postId, tag_id: tagId })));
    if (post.slug !== slug) await admin.from("blog_slug_redirects").upsert({ from_slug: post.slug, post_id: postId, is_active: true, created_by: session.user.id }, { onConflict: "from_slug" });
    await writeRevision({ postId, version, eventType: "RESTORED", title: revision.title, slug, excerpt: revision.excerpt, content: revision.content, contentText: revision.content_text, createdBy: session.user.id, metadata });
    refreshBlog(postId);
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Could not restore the revision." }; }
}

export async function saveBlogPostPattern(input: { name: string; description?: string; content: { type: "doc"; content: BlogBlock[] }; scope: "PERSONAL" | "GLOBAL" }): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getBlogSession();
    if (!session.blogRole || !["PLATFORM_ADMIN", "EDITOR", "AUTHOR"].includes(session.blogRole)) return { success: false, error: "Your Journal role cannot save reusable patterns." };
    const name = input.name.trim();
    if (!name || !validContent(input.content) || !input.content.content.length) return { success: false, error: "Give this non-empty pattern a name." };
    if (input.scope === "GLOBAL" && !["PLATFORM_ADMIN", "EDITOR"].includes(session.blogRole)) return { success: false, error: "Only editors can share a pattern with the whole Journal team." };
    const admin = createAdminClient();
    const { error } = await admin.from("blog_post_patterns").insert({ name, description: input.description?.trim() || null, content: input.content, scope: input.scope, created_by: session.user.id, updated_by: session.user.id });
    if (error) return { success: false, error: error.message };
    revalidatePath("/admin/blog"); revalidatePath("/admin/blog/[id]/edit", "page");
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Could not save the reusable pattern." }; }
}

export async function archiveBlogPostPattern(patternId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getBlogSession();
    if (!session.blogRole) return { success: false, error: "You do not have access to BrenUp Journal." };
    const admin = createAdminClient();
    const { data: pattern, error: readError } = await admin.from("blog_post_patterns").select("created_by,scope").eq("id", patternId).maybeSingle();
    if (readError || !pattern) return { success: false, error: readError?.message || "Pattern not found." };
    if (pattern.created_by !== session.user.id && !["PLATFORM_ADMIN", "EDITOR"].includes(session.blogRole)) return { success: false, error: "You can only archive your own pattern." };
    const { error } = await admin.from("blog_post_patterns").update({ is_active: false, updated_by: session.user.id, updated_at: new Date().toISOString() }).eq("id", patternId);
    if (error) return { success: false, error: error.message };
    revalidatePath("/admin/blog/[id]/edit", "page"); return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Could not archive the pattern." }; }
}

export async function addBlogEditorialComment(postId: string, body: string, revisionId?: string | null): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getBlogSession();
    if (!session.blogRole) return { success: false, error: "You do not have access to BrenUp Journal." };
    const cleanBody = body.trim();
    if (!cleanBody) return { success: false, error: "Write a review note first." };
    const admin = createAdminClient();
    const { data: post, error: postError } = await admin.from("blog_posts").select("created_by").eq("id", postId).maybeSingle();
    if (postError || !post) return { success: false, error: postError?.message || "Post not found." };
    if (!["PLATFORM_ADMIN", "EDITOR", "REVIEWER"].includes(session.blogRole) && post.created_by !== session.user.id) return { success: false, error: "You can only comment on your own draft." };
    const { error } = await admin.from("blog_editorial_comments").insert({ post_id: postId, revision_id: revisionId || null, body: cleanBody, created_by: session.user.id });
    if (error) return { success: false, error: error.message };
    revalidatePath(`/admin/blog/${postId}/edit`); return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Could not save the review note." }; }
}

export async function resolveBlogEditorialComment(commentId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getBlogSession();
    if (!session.blogRole) return { success: false, error: "You do not have access to BrenUp Journal." };
    const admin = createAdminClient();
    const { data: comment, error: readError } = await admin.from("blog_editorial_comments").select("id,post_id").eq("id", commentId).maybeSingle();
    if (readError || !comment) return { success: false, error: readError?.message || "Review note not found." };
    const { error } = await admin.from("blog_editorial_comments").update({ status: "RESOLVED", resolved_by: session.user.id, resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", commentId);
    if (error) return { success: false, error: error.message };
    revalidatePath(`/admin/blog/${comment.post_id}/edit`); return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Could not resolve the review note." }; }
}

function legacyMarkdownBlocks(markdown: string): BlogBlock[] {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const blocks: BlogBlock[] = [];
  let paragraph: string[] = [];
  const flushParagraph = () => { const text = paragraph.join(" ").trim(); if (text) blocks.push({ type: "paragraph", text }); paragraph = []; };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) { flushParagraph(); continue; }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) { flushParagraph(); blocks.push({ type: "heading", level: Math.min(4, Math.max(2, heading[1].length)) as 2 | 3 | 4, text: heading[2] }); continue; }
    if (line.startsWith(">")) { flushParagraph(); blocks.push({ type: "quote", text: line.replace(/^>\s*/, "") }); continue; }
    if (/^[-*]\s+/.test(line)) { flushParagraph(); const items: string[] = []; while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) { items.push(lines[index].trim().replace(/^[-*]\s+/, "")); index += 1; } index -= 1; blocks.push({ type: "list", style: "BULLET", items }); continue; }
    paragraph.push(line);
  }
  flushParagraph();
  return blocks;
}

export async function importLegacyJournalPosts(): Promise<{ success: boolean; imported?: number; error?: string }> {
  try {
    const session = await getBlogSession();
    if (session.blogRole !== "PLATFORM_ADMIN") return { success: false, error: "Only a platform administrator can import legacy Journal posts." };
    const admin = createAdminClient();
    let imported = 0;
    for (const entry of getKnowledgeEntries("blog")) {
      const slug = entry.slug[0];
      if (!slug) continue;
      const { data: existing } = await admin.from("blog_posts").select("id").eq("slug", slug).maybeSingle();
      if (existing) continue;
      const content = { type: "doc" as const, content: legacyMarkdownBlocks(entry.content) };
      const contentText = contentTextFromBlocks(content.content);
      const { data: post, error } = await admin.from("blog_posts").insert({ title: entry.title, slug, excerpt: entry.description || null, content, content_text: contentText, status: "PUBLISHED", visibility: "PUBLIC", created_by: session.user.id, author_id: session.user.id, published_at: entry.publishedAt || new Date().toISOString(), allow_index: true }).select("id,content_version").single();
      if (error || !post) return { success: false, error: error?.message || "Could not import a legacy article." };
      await writeRevision({ postId: post.id, version: post.content_version, eventType: "CREATED", title: entry.title, slug, excerpt: entry.description, content, contentText, createdBy: session.user.id, metadata: { legacyImport: true } });
      imported += 1;
    }
    refreshBlog();
    return { success: true, imported };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : "Could not import the legacy Journal posts." }; }
}
