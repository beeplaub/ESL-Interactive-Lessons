import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { LessonPlayer } from "@/components/LessonPlayer";

export default async function LessonPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { user, profile } = await requireUser();
  const { lessonId } = await params;
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const { data: lesson } = await adminSupabase.from("lessons").select("*").eq("id", lessonId).single();
  if (!lesson) notFound();
  if (lesson.status !== "PUBLISHED" && profile?.role !== "ADMIN") redirect("/lessons");

  const [{ data: slides }, { data: audioFiles }, { data: progress }, { data: lessonSlideActivities }] = await Promise.all([
    adminSupabase
      .from("slides")
      .select("*, slide_activities(*)")
      .eq("lesson_id", lessonId)
      .order("slide_number", { ascending: true }),
    adminSupabase.from("lesson_audio_files").select("*").eq("lesson_id", lessonId),
    supabase.from("lesson_progress").select("*").eq("lesson_id", lessonId).eq("user_id", user.id).maybeSingle(),
    adminSupabase
      .from("lesson_slide_activities")
      .select("*")
      .eq("lesson_id", lessonId)
      .eq("needs_review", false)
      .order("slide_number", { ascending: true })
  ]);

  const audioWithUrls = await Promise.all(
    (audioFiles ?? []).map(async (file) => {
      const { data } = await adminSupabase.storage.from("lesson-audio").createSignedUrl(file.storage_path, 60 * 60);
      return { ...file, signed_url: data?.signedUrl ?? null };
    })
  );

  return (
    <LessonPlayer
      lesson={lesson}
      slides={slides ?? []}
      audioFiles={audioWithUrls}
      lessonSlideActivities={lessonSlideActivities ?? []}
      pdfUrl={`/api/lessons/${lessonId}/pdf`}
      initialProgress={progress}
    />
  );
}
