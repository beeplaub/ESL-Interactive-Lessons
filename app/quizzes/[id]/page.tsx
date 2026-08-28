import { notFound, redirect } from "next/navigation";
import { QuizPlayerScreen } from "@/components/QuizPlayerScreen";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database.types";

export default async function QuizPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ courseItem?: string }>;
}) {
  const { id } = await params;
  const { courseItem = null } = await searchParams;

  // Do NOT redirect guests — quizzes are open to everyone.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient();

  // Course-native quizzes (picked or created from within a course builder)
  // only ever live at /courses/[courseId]/quiz/[quizId] — this path is for
  // the standalone quiz library only.
  const { data: courseNativeCheck } = await admin.from("quizzes").select("course_id").eq("id", id).maybeSingle();
  if (courseNativeCheck?.course_id) {
    redirect(`/courses/${courseNativeCheck.course_id}/quiz/${id}`);
  }

  if (user) {
    // Enforce global sequential lock guard for enrolled courses
    let courseId: string | null = null;
    let resolvedCourseItemId: string | null = null;
    if (courseItem) {
      const { data: cItem } = await admin
        .from("course_items")
        .select("*")
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
        .in("status", ["ACTIVE", "COMPLETED"]);
      
      if (enrollments && enrollments.length > 0) {
        const courseIds = enrollments.map(e => e.course_id);
        const { data: cItem } = await admin
          .from("course_items")
          .select("*")
          .eq("quiz_id", id)
          .in("course_id", courseIds)
          .limit(1)
          .maybeSingle();
        if (cItem) {
          courseId = cItem.course_id;
          resolvedCourseItemId = cItem.id;
        }
      }
    }

    // Opening a course item marks it "in progress" app-wide, same as lessons -
    // regardless of whether the learner got here from the course landing
    // page, the dashboard, or a direct link.
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
        : courseItems.find((i) => i.quiz_id === id);

      if (matchingItem) {
        const globalIndex = courseItems.findIndex((ci) => ci.id === matchingItem.id);
        const isComplete = completedIds.has(matchingItem.id);
        const unlocked = globalIndex === 0 || isComplete || Boolean(matchingItem.bypass_sequential_unlock) || (globalIndex > 0 && completedIds.has(courseItems[globalIndex - 1].id)) || Boolean(matchingItem.is_free_preview);

        if (!unlocked) {
          redirect(`/courses/${courseId}`);
        }
      }
    }
  }
  const [{ data: quiz }, { data: questions }, { data: legacyAttempts }, { data: assessmentAttempts }] = await Promise.all([
    admin.from("quizzes").select("*").eq("id", id).eq("status", "PUBLISHED").is("deleted_at", null).single(),
    admin.from("quiz_questions").select("*").eq("quiz_id", id).order("question_number", { ascending: true }),
    user
      ? admin.from("quiz_attempts").select("id,score,total,answers,completed_at,status,grading_source").eq("quiz_id", id).eq("user_id", user.id).order("completed_at", { ascending: true })
      : Promise.resolve({ data: [] }),
    user
      ? admin.from("assessment_attempts").select("id,quiz_id,legacy_quiz_attempt_id,score,maximum_score,completed_at,submitted_at,created_at,status,grading_source").eq("quiz_id", id).eq("user_id", user.id).eq("source_type", "QUIZ").order("completed_at", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  if (!quiz) notFound();
  const questionIds = (questions ?? []).map((question) => question.id);
  const { data: assessmentItems } = questionIds.length
    ? await admin.from("assessment_items").select("id,quiz_question_id,source_item_key,max_points").in("quiz_question_id", questionIds)
    : { data: [] };
  const pointsByQuestion = new Map((assessmentItems ?? []).map((item) => [item.quiz_question_id, Number(item.max_points)]));
  const scoredQuestions = (questions ?? []).map((question) => ({
    ...question,
    max_points: pointsByQuestion.get(question.id) ?? null,
  }));

  const canonicalIds = (assessmentAttempts ?? []).map((attempt) => attempt.id);
  const { data: assessmentResponses } = canonicalIds.length
    ? await admin.from("assessment_responses").select("attempt_id,assessment_item_id,response_data").in("attempt_id", canonicalIds)
    : { data: [] };
  const itemKeyById = new Map((assessmentItems ?? []).map((item) => [item.id, item.source_item_key ?? item.quiz_question_id]));
  const answersByAttempt = new Map<string, Record<string, Json>>();
  for (const response of assessmentResponses ?? []) {
    if (!response.attempt_id) continue;
    const itemKey = itemKeyById.get(response.assessment_item_id);
    if (!itemKey) continue;
    const answers = answersByAttempt.get(response.attempt_id) ?? {};
    answers[itemKey] = response.response_data as Json;
    answersByAttempt.set(response.attempt_id, answers);
  }
  const linkedLegacyIds = new Set((assessmentAttempts ?? []).map((attempt) => attempt.legacy_quiz_attempt_id).filter((id): id is string => Boolean(id)));
  const attempts = [
    ...(legacyAttempts ?? []).filter((attempt) => !linkedLegacyIds.has(attempt.id)),
    ...(assessmentAttempts ?? []).map((attempt) => ({
      id: attempt.legacy_quiz_attempt_id ?? attempt.id,
      score: Number(attempt.score ?? 0),
      total: Number(attempt.maximum_score ?? 0),
      answers: (answersByAttempt.get(attempt.id) ?? null) as Json | null,
      completed_at: attempt.completed_at ?? attempt.submitted_at ?? attempt.created_at,
      status: attempt.status,
      grading_source: attempt.grading_source,
    })),
  ].sort((a, b) => new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime());

  return (
    <QuizPlayerScreen
      quiz={quiz}
      questionCount={(questions ?? []).length}
      scoredQuestions={scoredQuestions as Parameters<typeof QuizPlayerScreen>[0]["scoredQuestions"]}
      pastAttempts={(attempts ?? []).map((a) => ({ id: a.id, score: a.score, total: a.total, answers: a.answers, completedAt: a.completed_at, status: a.status, gradingSource: a.grading_source }))}
      isGuest={!user}
      courseItemId={courseItem}
      breadcrumbs={[
        { label: "Home", href: "/account" },
        { label: "Quizzes", href: "/quizzes" },
        { label: quiz.title },
      ]}
    />
  );
}
