import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { BuilderLessonPlayer } from "@/components/BuilderLessonPlayer";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { resolveMediaUrl } from "@/lib/storage/mediaStorage";

export default async function LessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ lessonId: string }>;
  searchParams: Promise<{ courseItem?: string; review?: string }>;
}) {
  const { lessonId } = await params;
  const { courseItem = null, review = null } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect(`/login?next=${encodeURIComponent(`/lessons/${lessonId}`)}`);

  const admin = createAdminClient();

  // Lessons that belong to a course must be opened in a verified course
  // context. This prevents a direct lesson URL from bypassing paid enrollment
  // or sequential unlocking.
  let courseId: string | null = null;
  let resolvedCourseItemId: string | null = null;
  let courseTitle: string | null = null;
  let isEnrolledInCourse = false;
  let isFreePreview = false;
  if (courseItem) {
    const { data: cItem } = await admin
      .from("course_items")
      .select("*")
      .eq("id", courseItem)
      .maybeSingle();
    if (cItem?.lesson_id === lessonId) {
      courseId = cItem.course_id;
      resolvedCourseItemId = courseItem;
      isFreePreview = Boolean(cItem.is_free_preview);
    } else {
      notFound();
    }
  } else {
    const { data: placement } = await admin
      .from("course_items")
      .select("course_id")
      .eq("lesson_id", lessonId)
      .limit(1)
      .maybeSingle();
    if (placement?.course_id) {
      redirect(`/courses/${placement.course_id}`);
    }
  }

  if (courseId) {
    const [{ data: enrollment }, { data: course }] = await Promise.all([
      admin
        .from("course_enrollments")
        .select("status")
        .eq("user_id", user.id)
        .eq("course_id", courseId)
        .maybeSingle(),
      admin.from("courses").select("title,status").eq("id", courseId).is("deleted_at", null).maybeSingle(),
    ]);
    if (!course || course.status !== "PUBLISHED") notFound();
    courseTitle = course.title;
    isEnrolledInCourse = enrollment?.status === "ACTIVE" || enrollment?.status === "COMPLETED";
    if (!isEnrolledInCourse && !isFreePreview) redirect(`/courses/${courseId}`);
  }

  // Opening a course item marks it "in progress" app-wide, regardless of
  // whether the learner got here from the course landing page, the
  // dashboard, or a direct link. This is the only place that needs to know
  // about it - no separate "learn" page or manual step required.
  if (resolvedCourseItemId && courseId && isEnrolledInCourse) {
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
    await admin.from("course_progress").upsert({
      user_id: user.id,
      course_id: courseId,
      current_item_id: resolvedCourseItemId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,course_id" });
  }

  if (courseId) {
    const [{ data: sections }, { data: items }, { data: itemProgress }] = await Promise.all([
      admin.from("course_sections").select("id").eq("course_id", courseId).order("position", { ascending: true }),
      admin.from("course_items").select("*").eq("course_id", courseId),
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
      const unlocked = Boolean(matchingItem.is_free_preview) || (
        isEnrolledInCourse && (
          globalIndex === 0 ||
          isComplete ||
          Boolean(matchingItem.bypass_sequential_unlock) ||
          (globalIndex > 0 && completedIds.has(courseItems[globalIndex - 1].id))
        )
      );

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
    admin.from("slides").select("id,slide_number,title,section_label,content_order,require_practice_before_learn").eq("lesson_id", lessonId).is("deleted_at", null).order("slide_number", { ascending: true }),
    admin.from("lesson_blocks").select("id,slide_id,position,block_type,content").eq("lesson_id", lessonId).order("position", { ascending: true }),
    admin.from("lesson_slide_activities").select("id,slide_id,slide_number,activity_type,activity_data").eq("lesson_id", lessonId).order("slide_number", { ascending: true }),
    admin.from("lesson_progress").select("current_slide_number,completed,notes").eq("lesson_id", lessonId).eq("user_id", user.id).maybeSingle(),
    admin.from("quiz_attempts").select("lesson_slide_activity_id,score,total,answers,completed_at").eq("user_id", user.id).not("lesson_slide_activity_id", "is", null).order("completed_at", { ascending: false }),
    admin.from("lesson_audio_files").select("id,slide_id,storage_path,storage_provider,storage_bucket,public_url,external_url,source_type,label,linked_slide_number,translation_enabled,narration_language").eq("lesson_id", lessonId).eq("label", "narration"),
  ]);

  if (!lesson) notFound();

  // Generate signed URLs for narrations
  const narrations = await Promise.all(
    (audioFiles ?? []).map(async (af) => {
      const url = af.external_url || await resolveMediaUrl(admin, {
        provider: af.storage_provider,
        bucket: af.storage_bucket ?? "lesson-audio",
        path: af.storage_path,
        publicUrl: af.public_url,
      });
      const narrationLanguage: "en" | "bn" = af.narration_language === "bn" ? "bn" : "en";
      const sourceType = af.source_type === "LINK" ? "LINK" as const : af.source_type === "UPLOADED" ? "UPLOADED" as const : "RECORDED" as const;
      return { slideId: af.slide_id, signedUrl: url, translationEnabled: Boolean(af.translation_enabled), narrationLanguage, sourceType };
    })
  );

  // Map slideId → signedUrl
  const narrationMap: Record<string, string> = {};
  const narrationConfigMap: Record<string, { translationEnabled: boolean; narrationLanguage: "en" | "bn"; sourceType: "RECORDED" | "UPLOADED" | "LINK" }> = {};
  for (const n of narrations) {
    if (n.slideId && n.signedUrl) {
      narrationMap[n.slideId] = n.signedUrl;
      narrationConfigMap[n.slideId] = { translationEnabled: n.translationEnabled, narrationLanguage: n.narrationLanguage, sourceType: n.sourceType };
    }
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
        narrationConfigMap={narrationConfigMap}
        courseItemId={courseItem}
        backHref={courseId ? `/courses/${courseId}` : "/courses"}
        startInReviewMode={review === "1"}
      />
    </LearnerAppShell>
  );
}
