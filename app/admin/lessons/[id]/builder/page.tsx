import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { LessonBuilderWorkspace } from "@/components/LessonBuilderWorkspace";

export default async function LessonBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const supabase = createAdminClient();

  const [{ data: lesson }, { data: slides }, { data: activities }, { data: blocks }] = await Promise.all([
    supabase.from("lessons").select("*").eq("id", id).single(),
    supabase.from("slides").select("id, slide_number, title, section_label, raw_text").eq("lesson_id", id).order("slide_number", { ascending: true }),
    supabase.from("lesson_slide_activities").select("*, slides(title)").eq("lesson_id", id).order("slide_number", { ascending: true }),
    supabase.from("lesson_blocks").select("*").eq("lesson_id", id).order("position", { ascending: true })
  ]);

  if (!lesson) notFound();

  return (
    <LessonBuilderWorkspace
      lesson={lesson}
      slides={slides ?? []}
      blocks={blocks ?? []}
      activities={activities ?? []}
    />
  );
}
