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
  if (lesson.status !== "PUBLISHED" && profile?.role !== "ADMIN") redirect("/dashboard");

  const [{ data: slides }, { data: audioFiles }, { data: progress }] = await Promise.all([
    adminSupabase
      .from("slides")
      .select("*, slide_activities(*)")
      .eq("lesson_id", lessonId)
      .order("slide_number", { ascending: true }),
    adminSupabase.from("lesson_audio_files").select("*").eq("lesson_id", lessonId),
    supabase.from("lesson_progress").select("*").eq("lesson_id", lessonId).eq("user_id", user.id).maybeSingle()
  ]);

  const audioWithUrls = await Promise.all(
    (audioFiles ?? []).map(async (file) => {
      const { data } = await adminSupabase.storage.from("lesson-audio").createSignedUrl(file.storage_path, 60 * 60);
      return { ...file, signed_url: data?.signedUrl ?? null };
    })
  );
  if (!progress) {
    await supabase.from("lesson_progress").insert({
      user_id: user.id,
      lesson_id: lessonId,
      current_slide_number: 1
    });
  }

  return (
    <LessonPlayer
      userId={user.id}
      lesson={lesson}
      slides={slides ?? []}
      audioFiles={audioWithUrls}
      pdfUrl={`/api/lessons/${lessonId}/pdf`}
      initialProgress={progress}
    />
  );
}
