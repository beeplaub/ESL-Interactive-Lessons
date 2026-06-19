import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { BuilderLessonPlayer } from "@/components/BuilderLessonPlayer";

export default async function LessonPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect(`/login?next=${encodeURIComponent(`/lessons/${lessonId}`)}`);

  const admin = createAdminClient();
  const [
    { data: lesson },
    { data: slides },
    { data: blocks },
    { data: activities },
    { data: progress },
    { data: attempts },
    { data: audioFiles },
  ] = await Promise.all([
    admin.from("lessons").select("id,title,topic,level,status").eq("id", lessonId).eq("status", "PUBLISHED").single(),
    admin.from("slides").select("id,slide_number,title,section_label").eq("lesson_id", lessonId).order("slide_number", { ascending: true }),
    admin.from("lesson_blocks").select("id,slide_id,position,block_type,content").eq("lesson_id", lessonId).order("position", { ascending: true }),
    admin.from("lesson_slide_activities").select("id,slide_id,slide_number,activity_type,activity_data").eq("lesson_id", lessonId).order("slide_number", { ascending: true }),
    admin.from("lesson_progress").select("current_slide_number,completed,notes").eq("lesson_id", lessonId).eq("user_id", user.id).maybeSingle(),
    admin.from("quiz_attempts").select("lesson_slide_activity_id,score,total,answers,completed_at").eq("user_id", user.id).not("lesson_slide_activity_id", "is", null).order("completed_at", { ascending: false }),
    admin.from("lesson_audio_files").select("id,slide_id,storage_path,label,linked_slide_number").eq("lesson_id", lessonId).eq("label", "narration"),
  ]);

  if (!lesson) notFound();

  // Generate signed URLs for narrations
  const narrations = await Promise.all(
    (audioFiles ?? []).map(async (af) => {
      const { data } = await admin.storage
        .from("lesson-audio")
        .createSignedUrl(af.storage_path, 60 * 60);
      return { slideId: af.slide_id, signedUrl: data?.signedUrl ?? null };
    })
  );

  // Map slideId → signedUrl
  const narrationMap: Record<string, string> = {};
  for (const n of narrations) {
    if (n.slideId && n.signedUrl) narrationMap[n.slideId] = n.signedUrl;
  }

  return (
    <BuilderLessonPlayer
      lesson={lesson}
      slides={slides ?? []}
      blocks={blocks ?? []}
      activities={activities ?? []}
      initialProgress={progress ?? null}
      activityAttempts={attempts ?? []}
      initialNotes={progress?.notes ?? {}}
      narrationMap={narrationMap}
    />
  );
}