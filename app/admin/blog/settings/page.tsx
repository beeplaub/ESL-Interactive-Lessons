import { notFound } from "next/navigation";
import { BlogSettingsWorkspace } from "@/components/BlogSettingsWorkspace";
import { getBlogSession } from "@/lib/blog-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function BlogSettingsPage() {
  const session = await getBlogSession();
  if (session.blogRole !== "PLATFORM_ADMIN" && session.blogRole !== "EDITOR") notFound();
  const admin = createAdminClient();
  const [{ data: categories }, { data: tags }, { data: members }, { data: staff }] = await Promise.all([
    admin.from("blog_categories").select("id,name,description,is_active").order("position").order("name"),
    admin.from("blog_tags").select("id,name,description,is_active").order("name"),
    admin.from("blog_editor_members").select("user_id,role,is_active").order("created_at"),
    session.blogRole === "PLATFORM_ADMIN" ? admin.from("profiles").select("id,full_name,first_name,last_name,role").in("role", ["ADMIN", "TEACHER", "SCHOOL_ADMIN"]).order("full_name") : Promise.resolve({ data: [] }),
  ]);
  const ids = Array.from(new Set((members ?? []).map((member) => member.user_id)));
  const { data: memberProfiles } = ids.length ? await admin.from("profiles").select("id,full_name,first_name,last_name,role").in("id", ids) : { data: [] };
  const profileMap = new Map((memberProfiles ?? []).map((profile) => [profile.id, profile]));
  return <BlogSettingsWorkspace canManageTeam={session.blogRole === "PLATFORM_ADMIN"} categories={categories ?? []} tags={tags ?? []} staff={(staff ?? []).map((profile) => ({ id: profile.id, name: profile.full_name || [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "BrenUp staff", role: profile.role }))} members={(members ?? []).map((member) => { const profile = profileMap.get(member.user_id); return { ...member, profileName: profile?.full_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "BrenUp staff", profileRole: profile?.role || "TEACHER" }; })} />;
}
