import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { BuilderLessonPlayer } from "@/components/BuilderLessonPlayer";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { resolveMediaUrl } from "@/lib/storage/mediaStorage";
import type { Json } from "@/types/database.types";

export default async function LessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ lessonId: string }>;
  searchParams: Promise<{ courseItem?: string; review?: string; slide?: string; tab?: string; activity?: string }>;
}) {
  const { lessonId } = await params;
  const { courseItem = null, review = null, slide = null, tab = null, activity = null } = await searchParams;
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
    const { data: placements } = await admin
      .from("course_items")
      .select("id,course_id,is_free_preview")
      .eq("lesson_id", lessonId)
      .order("position", { ascending: true });

    if (placements?.length) {
      const courseIds = [...new Set(placements.map((placement) => placement.course_id))];
      const [{ data: enrollments }, { data: courses }] = await Promise.all([
        admin.from("course_enrollments").select("course_id,status").eq("user_id", user.id).in("course_id", courseIds),
        admin.from("courses").select("id,status,visibility").in("id", courseIds).is("deleted_at", null),
      ]);
      const enrollmentByCourse = new Map((enrollments ?? []).map((enrollment) => [enrollment.course_id, enrollment.status]));
      const courseById = new Map((courses ?? []).map((course) => [course.id, course]));
      const accessiblePlacement = placements.find((placement) => {
        const course = courseById.get(placement.course_id);
        const enrolled = enrollmentByCourse.get(placement.course_id) === "ACTIVE" || enrollmentByCourse.get(placement.course_id) === "COMPLETED";
        return course?.status === "PUBLISHED" && (enrolled || (course.visibility !== "PRIVATE" && placement.is_free_preview));
      });

      if (accessiblePlacement) {
        courseId = accessiblePlacement.course_id;
        resolvedCourseItemId = accessiblePlacement.id;
        isFreePreview = Boolean(accessiblePlacement.is_free_preview);
      } else {
        redirect(`/courses/${placements[0].course_id}`);
      }
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
      admin.from("courses").select("title,status,visibility").eq("id", courseId).is("deleted_at", null).maybeSingle(),
    ]);
    if (!course || course.status !== "PUBLISHED") notFound();
    courseTitle = course.title;
    isEnrolledInCourse = enrollment?.status === "ACTIVE" || enrollment?.status === "COMPLETED";
    if (course.visibility === "PRIVATE" && !isEnrolledInCourse) notFound();
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
    const [{ data: sections }, { data: items }, { data: itemProgress }, { data: savedLessonProgress }] = await Promise.all([
      admin.from("course_sections").select("id").eq("course_id", courseId).order("position", { ascending: true }),
      admin.from("course_items").select("*").eq("course_id", courseId),
      admin.from("course_item_progress").select("course_item_id,completed").eq("course_id", courseId).eq("user_id", user.id),
      admin.from("lesson_progress").select("lesson_id").eq("lesson_id", lessonId).eq("user_id", user.id).maybeSingle(),
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
          Boolean(savedLessonProgress) ||
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
    { data: legacyAttempts },
    { data: assessmentAttempts },
    { data: audioFiles },
  ] = await Promise.all([
    admin.from("lessons").select("id,title,topic,level,status,timer_minutes").eq("id", lessonId).eq("status", "PUBLISHED").is("deleted_at", null).maybeSingle(),
    admin.from("slides").select("id,slide_number,title,section_label,content_order,require_practice_before_learn").eq("lesson_id", lessonId).is("deleted_at", null).order("slide_number", { ascending: true }),
    admin.from("lesson_blocks").select("id,slide_id,position,block_type,content").eq("lesson_id", lessonId).order("position", { ascending: true }),
    admin.from("lesson_slide_activities").select("id,slide_id,slide_number,activity_type,activity_data").eq("lesson_id", lessonId).is("deleted_at", null).order("slide_number", { ascending: true }),
    admin.from("lesson_progress").select("current_slide_number,completed,notes").eq("lesson_id", lessonId).eq("user_id", user.id).maybeSingle(),
    admin.from("quiz_attempts").select("id,lesson_slide_activity_id,score,total,answers,completed_at,status,grading_source").eq("user_id", user.id).not("lesson_slide_activity_id", "is", null).order("completed_at", { ascending: false }),
    admin.from("assessment_attempts").select("id,lesson_activity_id,legacy_quiz_attempt_id,score,maximum_score,completed_at,submitted_at,created_at,status,grading_source").eq("user_id", user.id).eq("source_type", "LESSON_ACTIVITY").not("lesson_activity_id", "is", null).order("completed_at", { ascending: false }),
    admin.from("lesson_audio_files").select("id,slide_id,storage_path,storage_provider,storage_bucket,public_url,external_url,source_type,label,linked_slide_number,translation_enabled,narration_language,transcript,glossary").eq("lesson_id", lessonId).eq("label", "narration"),
  ]);

  if (!lesson) notFound();

  // Keep creator-only AI instructions out of the learner client payload. The
  // server actions and live-token route read the private instruction directly
  // from the activity record when they need it.
  const learnerActivities = (activities ?? []).map((activity) => {
    if (!activity.activity_data || typeof activity.activity_data !== "object" || Array.isArray(activity.activity_data)) return activity;
    const { ai_instruction: _privateInstruction, ...learnerData } = activity.activity_data as Record<string, Json>;
    return { ...activity, activity_data: learnerData as Json };
  });

  // Assessment tables are canonical for new activity submissions. Build the
  // legacy-shaped payload expected by the existing player, preferring detailed
  // assessment evidence and retaining legacy-only historical attempts.
  const activityIds = new Set((activities ?? []).map((item) => item.id));
  const canonical = (assessmentAttempts ?? []).filter((attempt) => attempt.lesson_activity_id && activityIds.has(attempt.lesson_activity_id));
  const canonicalIds = canonical.map((attempt) => attempt.id);
  const [{ data: assessmentResponses }, { data: assessmentItems }] = canonicalIds.length
    ? await Promise.all([
        admin.from("assessment_responses").select("attempt_id,assessment_item_id,response_data,feedback,rubric_data,item_snapshot").in("attempt_id", canonicalIds),
        admin.from("assessment_items").select("id,source_item_key").in("id", (await admin.from("assessment_responses").select("assessment_item_id").in("attempt_id", canonicalIds)).data?.map((row) => row.assessment_item_id) ?? []),
      ])
    : [{ data: [] }, { data: [] }];
  const itemKeyById = new Map((assessmentItems ?? []).map((item) => [item.id, item.source_item_key]));
  const answersByAttempt = new Map<string, Record<string, Json>>();
  for (const response of assessmentResponses ?? []) {
    if (!response.attempt_id) continue;
    const answerKey = itemKeyById.get(response.assessment_item_id) ?? response.assessment_item_id;
    if (!answerKey) continue;
    const answers = answersByAttempt.get(response.attempt_id) ?? {};
    answers[answerKey] = response.response_data as Json;
    answersByAttempt.set(response.attempt_id, answers);
  }
  const linkedLegacyIds = new Set(canonical.map((attempt) => attempt.legacy_quiz_attempt_id).filter((id): id is string => Boolean(id)));
  const canonicalAttempts = canonical.map((attempt) => ({
    id: attempt.legacy_quiz_attempt_id ?? attempt.id,
    lesson_slide_activity_id: attempt.lesson_activity_id,
    score: Number(attempt.score ?? 0),
    total: Number(attempt.maximum_score ?? 0),
    answers: (answersByAttempt.get(attempt.id) ?? null) as Json | null,
    completed_at: attempt.completed_at ?? attempt.submitted_at ?? attempt.created_at,
    status: attempt.status,
    grading_source: attempt.grading_source,
  }));
  const attempts = [
    ...canonicalAttempts,
    ...(legacyAttempts ?? []).filter((attempt) => !linkedLegacyIds.has(attempt.id)),
  ].sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());

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
      return { slideId: af.slide_id, signedUrl: url, translationEnabled: Boolean(af.translation_enabled), narrationLanguage, sourceType, transcript: af.transcript || "", glossary: Array.isArray(af.glossary) ? af.glossary : [] };
    })
  );

  // Map slideId → signedUrl
  const narrationMap: Record<string, string> = {};
  const narrationConfigMap: Record<string, { translationEnabled: boolean; narrationLanguage: "en" | "bn"; sourceType: "RECORDED" | "UPLOADED" | "LINK"; transcript?: string; glossary?: unknown[] }> = {};
  for (const n of narrations) {
    if (!n.slideId) continue;
    if (n.signedUrl) narrationMap[n.slideId] = n.signedUrl;
    // Keep study-support metadata even when an external audio URL cannot be
    // resolved at render time. The learner can still read the saved script.
    narrationConfigMap[n.slideId] = { translationEnabled: n.translationEnabled, narrationLanguage: n.narrationLanguage, sourceType: n.sourceType, transcript: n.transcript, glossary: n.glossary };
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
        activities={learnerActivities}
        initialProgress={progress ?? null}
        activityAttempts={attempts ?? []}
        initialNotes={progress?.notes ?? {}}
        narrationMap={narrationMap}
        narrationConfigMap={narrationConfigMap}
        courseItemId={courseItem}
        backHref={courseId ? `/courses/${courseId}` : "/courses"}
        startInReviewMode={review === "1"}
        initialSlideNumber={slide ? Number(slide) : undefined}
        initialTab={tab === "practice" ? "practice" : tab === "learn" ? "learn" : undefined}
        focusActivityId={activity}
      />
    </LearnerAppShell>
  );
}
