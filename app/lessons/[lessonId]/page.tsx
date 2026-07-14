import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { BuilderLessonPlayer } from "@/components/BuilderLessonPlayer";
import { LearnerAppShell } from "@/components/LearnerAppShell";

export default async function LessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ lessonId: string }>;
  searchParams: Promise<{ courseItem?: string }>;
}) {
  const { lessonId } = await params;
  const { courseItem = null } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect(`/login?next=${encodeURIComponent(`/lessons/${lessonId}`)}`);

  const admin = createAdminClient();

  // Enforce global sequential lock guard for enrolled courses
  let courseId: string | null = null;
  let resolvedCourseItemId: string | null = null;
  let courseTitle: string | null = null;
  if (courseItem) {
    const { data: cItem } = await admin
      .from("course_items")
      .select("course_id")
      .eq("id", courseItem)
      .maybeSingle();
    if (cItem) {
      courseId = cItem.course_id;
      resolvedCourseItemId = courseItem;
    }
  } else {
    const { data: enrollments } = await admin
      .from("course_enrollments")
      .select("course_id")
      .eq("user_id", user.id)
      .eq("status", "ACTIVE");

    if (enrollments && enrollments.length > 0) {
      const courseIds = enrollments.map(e => e.course_id);
      const { data: cItem } = await admin
        .from("course_items")
        .select("id, course_id")
        .eq("lesson_id", lessonId)
        .in("course_id", courseIds)
        .limit(1)
        .maybeSingle();
      if (cItem) {
        courseId = cItem.course_id;
        resolvedCourseItemId = cItem.id;
      }
    }
  }

  // Opening a course item marks it "in progress" app-wide, regardless of
  // whether the learner got here from the course landing page, the
  // dashboard, or a direct link. This is the only place that needs to know
  // about it - no separate "learn" page or manual step required.
  if (resolvedCourseItemId && courseId) {
    const { data: existingItemProgress } = await admin
      .from("course_item_progress")
      .select("id")
      .eq("user_id", user.id)
      .eq("course_item_id", resolvedCourseItemId)
      .maybeSingle();
    if (!existingItemProgress) {
      await admin.from("course_item_progress").insert({
        user_id: user.id,
        course_id: courseId,
        course_item_id: resolvedCourseItemId,
        completed: false,
      });
    }
    const { data: courseRow } = await admin.from("courses").select("title").eq("id", courseId).maybeSingle();
    courseTitle = courseRow?.title ?? null;
  }

  if (courseId) {
    const [{ data: sections }, { data: items }, { data: itemProgress }] = await Promise.all([
      admin.from("course_sections").select("id").eq("course_id", courseId).order("position", { ascending: true }),
      admin.from("course_items").select("id, lesson_id, section_id, position, is_free_preview").eq("course_id", courseId),
      admin.from("course_item_progress").select("course_item_id,completed").eq("course_id", courseId).eq("user_id", user.id),
    ]);

    const rawItems = items ?? [];
    const sectionsList = sections ?? [];
    const orderedCourseItems: typeof rawItems = [];
    for (const sec of sectionsList) {
      const secItems = rawItems
        .filter((item) => item.section_id === sec.id)
        .sort((a, b) => a.position - b.position);
      orderedCourseItems.push(...secItems);
    }
    const unsectionedItems = rawItems
      .filter((item) => !item.section_id)
      .sort((a, b) => a.position - b.position);
    orderedCourseItems.push(...unsectionedItems);

    const courseItems = orderedCourseItems;
    const completedIds = new Set((itemProgress ?? []).filter((ip) => ip.completed).map((ip) => ip.course_item_id));
    
    const matchingItem = courseItem 
      ? courseItems.find((i) => i.id === courseItem)
      : courseItems.find((i) => i.lesson_id === lessonId);

    if (matchingItem) {
      const globalIndex = courseItems.findIndex((ci) => ci.id === matchingItem.id);
      const isComplete = completedIds.has(matchingItem.id);
      const unlocked = globalIndex === 0 || isComplete || (globalIndex > 0 && completedIds.has(courseItems[globalIndex - 1].id)) || Boolean(matchingItem.is_free_preview);

      if (!unlocked) {
        redirect(`/courses/${courseId}`);
      }
    }
  }
  const [
    { data: lesson },
    { data: slides },
    { data: blocks },
    { data: activities },
    { data: progress },
    { data: attempts },
    { data: audioFiles },
  ] = await Promise.all([
    admin.from("lessons").select("id,title,topic,level,status,timer_minutes").eq("id", lessonId).eq("status", "PUBLISHED").is("deleted_at", null).maybeSingle(),
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
    <LearnerAppShell
      active="courses"
      contentClassName="block"
      showRightSidebar={false}
      showFooter={false}
      breadcrumbs={
        courseId && courseTitle
          ? [
              { label: "Home", href: "/account" },
              { label: "Courses", href: "/courses" },
              { label: courseTitle, href: `/courses/${courseId}` },
              { label: lesson.title },
            ]
          : [
              { label: "Home", href: "/account" },
              { label: "Courses", href: "/courses" },
              { label: lesson.title },
            ]
      }
    >
      <BuilderLessonPlayer
        lesson={lesson}
        slides={slides ?? []}
        blocks={blocks ?? []}
        activities={activities ?? []}
        initialProgress={progress ?? null}
        activityAttempts={attempts ?? []}
        initialNotes={progress?.notes ?? {}}
        narrationMap={narrationMap}
        courseItemId={courseItem}
        backHref={courseId ? `/courses/${courseId}` : "/courses"}
      />
    </LearnerAppShell>
  );
}
