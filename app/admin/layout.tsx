import { requireStaff } from "@/lib/auth";
import { AdminShell } from "@/components/AdminShell";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile, user } = await requireStaff();
  const role = profile?.role === "ADMIN" ? "ADMIN" : profile?.role === "SCHOOL_ADMIN" ? "SCHOOL_ADMIN" : "TEACHER";
  const blogEnabled = profile?.role === "ADMIN" || Boolean((await createAdminClient()
    .from("blog_editor_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle()).data);
  return (
    <AdminShell name={profile?.full_name} role={role} blogEnabled={blogEnabled}>
      {children}
    </AdminShell>
  );
}
