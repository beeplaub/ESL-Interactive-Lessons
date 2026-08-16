import "server-only";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type BlogRole = "PLATFORM_ADMIN" | "EDITOR" | "AUTHOR" | "CONTRIBUTOR" | "REVIEWER";
export type BlogCapability = "read" | "create" | "edit_any" | "edit_own" | "review" | "publish" | "manage_taxonomy" | "manage_members";

const capabilities: Record<BlogRole, BlogCapability[]> = {
  PLATFORM_ADMIN: ["read", "create", "edit_any", "edit_own", "review", "publish", "manage_taxonomy", "manage_members"],
  EDITOR: ["read", "create", "edit_any", "edit_own", "review", "publish", "manage_taxonomy"],
  AUTHOR: ["read", "create", "edit_own"],
  CONTRIBUTOR: ["read", "create", "edit_own"],
  REVIEWER: ["read", "review"],
};

export async function getBlogSession() {
  const session = await requireUser();
  if (session.profile?.role === "ADMIN") return { ...session, blogRole: "PLATFORM_ADMIN" as const };
  const admin = createAdminClient();
  const { data } = await admin.from("blog_editor_members").select("role,is_active").eq("user_id", session.user.id).maybeSingle();
  const role = data?.is_active ? data.role as Exclude<BlogRole, "PLATFORM_ADMIN"> : null;
  return { ...session, blogRole: role };
}

export async function requireBlogCapability(capability: BlogCapability) {
  const session = await getBlogSession();
  if (!session.blogRole || !capabilities[session.blogRole].includes(capability)) redirect("/admin");
  return session;
}

export function canBlog(role: BlogRole | null | undefined, capability: BlogCapability) {
  return Boolean(role && capabilities[role].includes(capability));
}
