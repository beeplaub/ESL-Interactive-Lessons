import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { hasPracticeLibraryAccess } from "@/lib/practiceAccess";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function PracticeModulePage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser();
  const { id } = await params;
  const { data: module } = await (createAdminClient() as any).from("practice_modules").select("lesson_id,status,access_type").eq("id", id).maybeSingle();
  if (!module || module.status !== "PUBLISHED" || !module.lesson_id) notFound();
  if (module.access_type === "PREMIUM" && !(await hasPracticeLibraryAccess(user.id))) redirect("/activities/subscribe");
  redirect(`/lessons/${module.lesson_id}?practice=1`);
}
