import { notFound, redirect } from "next/navigation";
import { QuizPlayerScreen } from "@/components/QuizPlayerScreen";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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
  const [{ data: quiz }, { data: questions }, { data: attempts }] = await Promise.all([
    admin.from("quizzes").select("*").eq("id", id).eq("status", "PUBLISHED").is("deleted_at", null).single(),
    admin.from("quiz_questions").select("*").eq("quiz_id", id).order("question_number", { ascending: true }),
    user
      ? admin.from("quiz_attempts").select("id,score,total,answers,completed_at,status,grading_source").eq("quiz_id", id).eq("user_id", user.id).order("completed_at", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  if (!quiz) notFound();
  const questionIds = (questions ?? []).map((question) => question.id);
  const { data: assessmentItems } = questionIds.length
    ? await admin.from("assessment_items").select("quiz_question_id,max_points").in("quiz_question_id", questionIds)
    : { data: [] };
  const pointsByQuestion = new Map((assessmentItems ?? []).map((item) => [item.quiz_question_id, Number(item.max_points)]));
  const scoredQuestions = (questions ?? []).map((question) => ({
    ...question,
    max_points: pointsByQuestion.get(question.id) ?? null,
  }));

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
