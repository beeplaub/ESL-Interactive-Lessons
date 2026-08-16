import { notFound } from "next/navigation";
import { BlogPostEditor, type EditableBlogPost } from "@/components/BlogPostEditor";
import type { BlogRevisionSummary } from "@/components/BlogRevisionPanel";
import type { BlogPattern } from "@/components/BlogPatternLibrary";
import { getBlogSession } from "@/lib/blog-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminBlogPostEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getBlogSession();
  if (!session.blogRole) notFound();
  const admin = createAdminClient();
  let query = admin.from("blog_posts").select("id,title,slug,excerpt,content,status,visibility,primary_category_id,seo_title,seo_description,social_title,social_description,canonical_url,primary_keyword,allow_index,is_featured,updated_at,scheduled_at,created_by").eq("id", id);
  if (["AUTHOR", "CONTRIBUTOR"].includes(session.blogRole)) query = query.eq("created_by", session.user.id);
  const { data: post } = await query.maybeSingle();
  if (!post) notFound();
  const [{ data: mappings }, { data: tagMappings }, { data: categories }, { data: tags }, { data: media }, { data: revisionRows }, { data: patternRows }] = await Promise.all([
    admin.from("blog_post_categories").select("category_id").eq("post_id", id),
    admin.from("blog_post_tags").select("tag_id").eq("post_id", id),
    admin.from("blog_categories").select("id,name").eq("is_active", true).order("position").order("name"),
    admin.from("blog_tags").select("id,name").eq("is_active", true).order("name").limit(100),
    admin.from("media_assets").select("id,title,url,type").is("deleted_at", null).order("created_at", { ascending: false }).limit(80),
    admin.from("blog_post_revisions").select("id,version,event_type,title,created_at,created_by").eq("post_id", id).order("version", { ascending: false }).limit(30),
    admin.from("blog_post_patterns").select("id,name,description,scope,content,created_by").eq("is_active", true).or(`scope.eq.GLOBAL,created_by.eq.${session.user.id}`).order("updated_at", { ascending: false }).limit(50),
  ]);
  const revisionCreatorIds = Array.from(new Set((revisionRows ?? []).map((revision) => revision.created_by).filter((id): id is string => Boolean(id))));
  const { data: revisionCreators } = revisionCreatorIds.length ? await admin.from("profiles").select("id,full_name,first_name,last_name").in("id", revisionCreatorIds) : { data: [] };
  const revisionCreatorNames = new Map((revisionCreators ?? []).map((profile) => [profile.id, profile.full_name || [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "BrenUp editor"]));
  const revisions: BlogRevisionSummary[] = (revisionRows ?? []).map((revision) => ({ id: revision.id, version: revision.version, eventType: revision.event_type, title: revision.title, createdAt: revision.created_at, createdByName: revisionCreatorNames.get(revision.created_by || "") || "BrenUp editor" }));
  const patternCreatorIds = Array.from(new Set((patternRows ?? []).map((pattern) => pattern.created_by).filter((id): id is string => Boolean(id))));
  const { data: patternCreators } = patternCreatorIds.length ? await admin.from("profiles").select("id,full_name,first_name,last_name").in("id", patternCreatorIds) : { data: [] };
  const patternCreatorNames = new Map((patternCreators ?? []).map((profile) => [profile.id, profile.full_name || [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "BrenUp editor"]));
  const patterns: BlogPattern[] = (patternRows ?? []).map((pattern) => ({ id: pattern.id, name: pattern.name, description: pattern.description, scope: pattern.scope, content: pattern.content as BlogPattern["content"], createdByName: patternCreatorNames.get(pattern.created_by) || "BrenUp editor" }));
  const editable: EditableBlogPost = {
    id: post.id, title: post.title, slug: post.slug, excerpt: post.excerpt, content: post.content as EditableBlogPost["content"], status: post.status, visibility: post.visibility, primaryCategoryId: post.primary_category_id, categoryIds: (mappings ?? []).map((row) => row.category_id), tagIds: (tagMappings ?? []).map((row) => row.tag_id), seoTitle: post.seo_title, seoDescription: post.seo_description, socialTitle: post.social_title, socialDescription: post.social_description, canonicalUrl: post.canonical_url, primaryKeyword: post.primary_keyword, allowIndex: post.allow_index, isFeatured: post.is_featured, updatedAt: post.updated_at, scheduledAt: post.scheduled_at,
  };
  return <BlogPostEditor post={editable} role={session.blogRole} categories={categories ?? []} tags={tags ?? []} media={media ?? []} revisions={revisions} patterns={patterns} />;
}
