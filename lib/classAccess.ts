import { redirect } from "next/navigation";
import { isPlatformAdmin, requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Platform admins may access any class; teachers only their own. */
export async function requireClassAccess(classId: string) {
  const session = await requireStaff();
  if (isPlatformAdmin(session.profile?.role)) return session;

  const admin = createAdminClient();
  const { data: klass } = await admin
    .from("classes")
    .select("id,teacher_id,created_by")
    .eq("id", classId)
    .maybeSingle();
  if (!klass || (klass.teacher_id !== session.user.id && klass.created_by !== session.user.id)) {
    redirect("/admin/classes");
  }
  return session;
}
