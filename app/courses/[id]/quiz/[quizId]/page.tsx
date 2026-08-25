import { notFound, redirect } from "next/navigation";
import { QuizPlayerScreen } from "@/components/QuizPlayerScreen";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Course-native quiz player. A quiz only ever lives here once it has been
 * picked or created into a course (see lib/quizFork.ts / createAndAddCourseItem)
 * — it is never reachable via /quizzes/[id] (that page redirects here itself
 * if someone lands on a course-native quiz's old-style URL), so a learner
 * taking a course quiz never sees anything that looks like the standalone
 * quiz library.
 */
export default async function CourseQuizPage({
  params,
}: {
  params: Promise<{ id: string; quizId: string }>;
}) {
  const { id: courseId, quizId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/courses/${courseId}/quiz/${quizId}`)}`);

  const admin = createAdminClient();

  const [{ data: quiz }, { data: course }, { data: courseItem }, { data: enrollment }] = await Promise.all([
    admin.from("quizzes").select("*").eq("id", quizId).eq("status", "PUBLISHED").is("deleted_at", null).maybeSingle(),
    admin.from("courses").select("title,status").eq("id", courseId).is("deleted_at", null).maybeSingle(),
    admin.from("course_items").select("*").eq("course_id", courseId).eq("quiz_id", quizId).maybeSingle(),
    admin.from("course_enrollments").select("status").eq("course_id", courseId).eq("user_id", user.id).maybeSingle(),
  ]);

  // A course-native quiz only belongs to the one course it was picked/created
  // into - guard against a mismatched courseId in the URL.
  if (!quiz || quiz.course_id !== courseId || !course || course.status !== "PUBLISHED" || !courseItem) notFound();
  const isEnrolled = enrollment?.status === "ACTIVE" || enrollment?.status === "COMPLETED";

  // Opening it marks it "in progress" app-wide, same as lessons and
  // standalone-path quizzes - regardless of how the learner navigated here.
  if (isEnrolled) {
    const { data: existingItemProgress } = await admin
      .from("course_item_progress")
      .select("id")
      .eq("user_id", user.id)
      .eq("course_item_id", courseItem.id)
      .maybeSingle();
    if (!existingItemProgress) {
      await admin.from("course_item_progress").insert({
        user_id: user.id,
        course_id: courseId,
        course_item_id: courseItem.id,
        completed: false,
      });
    }
    await admin.from("course_progress").upsert({
      user_id: user.id,
      course_id: courseId,
      current_item_id: courseItem.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,course_id" });
  }

  // Enforce the same sequential lock guard lessons/standalone quizzes use.
  const [{ data: sections }, { data: items }, { data: itemProgress }] = await Promise.all([
    admin.from("course_sections").select("id").eq("course_id", courseId).order("position", { ascending: true }),
    admin.from("course_items").select("*").eq("course_id", courseId),
    admin.from("course_item_progress").select("course_item_id,completed").eq("course_id", courseId).eq("user_id", user.id),
  ]);

  const rawItems = items ?? [];
  const sectionsList = sections ?? [];
  const orderedCourseItems: typeof rawItems = [];
  for (const sec of sectionsList) {
    const secItems = rawItems.filter((item) => item.section_id === sec.id).sort((a, b) => a.position - b.position);
    orderedCourseItems.push(...secItems);
  }
  const unsectionedItems = rawItems.filter((item) => !item.section_id).sort((a, b) => a.position - b.position);
  orderedCourseItems.push(...unsectionedItems);

  const completedIds = new Set((itemProgress ?? []).filter((ip) => ip.completed).map((ip) => ip.course_item_id));
  const globalIndex = orderedCourseItems.findIndex((ci) => ci.id === courseItem.id);
  const isComplete = completedIds.has(courseItem.id);
  const unlocked = Boolean(courseItem.is_free_preview) || (
    isEnrolled && (
      globalIndex === 0 ||
      isComplete ||
      Boolean(courseItem.bypass_sequential_unlock) ||
      (globalIndex > 0 && completedIds.has(orderedCourseItems[globalIndex - 1].id))
    )
  );

  if (!unlocked) redirect(`/courses/${courseId}`);

  const [{ data: questions }, { data: attempts }] = await Promise.all([
    admin.from("quiz_questions").select("*").eq("quiz_id", quizId).order("question_number", { ascending: true }),
    admin.from("quiz_attempts").select("id,score,total,answers,completed_at,status,grading_source").eq("quiz_id", quizId).eq("user_id", user.id).order("completed_at", { ascending: true }),
  ]);

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
      isGuest={false}
      courseItemId={courseItem.id}
      backHref={`/courses/${courseId}`}
      showRightSidebar={false}
      showFooter={false}
      active="courses"
      breadcrumbs={[
        { label: "Home", href: "/account" },
        { label: course.title, href: `/courses/${courseId}` },
        { label: quiz.title },
      ]}
    />
  );
}
