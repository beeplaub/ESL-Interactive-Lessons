import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Clock3, Gamepad2, HelpCircle, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { QuizPlayer } from "@/components/QuizPlayer";
import { LearnerAppShell } from "@/components/LearnerAppShell";

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

  if (user) {
    // Enforce global sequential lock guard for enrolled courses
    let courseId: string | null = null;
    let resolvedCourseItemId: string | null = null;
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
        .in("status", ["ACTIVE", "COMPLETED"]);
      
      if (enrollments && enrollments.length > 0) {
        const courseIds = enrollments.map(e => e.course_id);
        const { data: cItem } = await admin
          .from("course_items")
          .select("id, course_id")
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
        admin.from("course_items").select("id, quiz_id, section_id, position, is_free_preview").eq("course_id", courseId),
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
        const unlocked = globalIndex === 0 || isComplete || (globalIndex > 0 && completedIds.has(courseItems[globalIndex - 1].id)) || Boolean(matchingItem.is_free_preview);

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
      ? admin.from("quiz_attempts").select("score, total, completed_at").eq("quiz_id", id).eq("user_id", user.id).order("completed_at", { ascending: true }).limit(10)
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
    <LearnerAppShell
      active="quizzes"
      contentClassName="block"
      breadcrumbs={[
        { label: "Home", href: "/account" },
        { label: "Quizzes", href: "/quizzes" },
        { label: quiz.title },
      ]}
    >
      <div className="mx-auto max-w-[1120px]">
      <section className="relative mb-5 overflow-hidden rounded-[24px] bg-gradient-to-br from-[#1A1060] via-[#0C1945] to-[#0E1F5A] p-4 text-white shadow-[0_16px_48px_rgba(20,23,80,.25)] sm:p-5">
        <div className="absolute -right-16 -top-20 size-56 rounded-full bg-[#6C3BFF]/25" />
        <div className="absolute right-36 top-10 size-20 rounded-full bg-[#3CCEFF]/20 blur-xl" />
        <div className="relative z-10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-white/80">
              <Sparkles className="size-4" /> Quiz mode
            </span>
            <span className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-[#6C3BFF]">{quiz.level ?? "Quiz"}</span>
          </div>
          <h1 className="mt-3 max-w-4xl text-2xl font-extrabold tracking-tight sm:text-3xl">{quiz.title}</h1>
          <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold text-white/75">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5"><HelpCircle className="size-4" /> {(questions ?? []).length} questions</span>
            {quiz.topic ? <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5"><Gamepad2 className="size-4" /> {quiz.topic}</span> : null}
            {quiz.timer_minutes ? <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5"><Clock3 className="size-4" /> {quiz.timer_minutes} min timer</span> : <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5"><Clock3 className="size-4" /> Untimed</span>}
          </div>
        {!user ? (
          <p className="mt-3 rounded-[14px] border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white/75">
            Playing as guest · <Link href="/login" className="font-bold text-white underline decoration-white/40 underline-offset-4">Sign in</Link> to save your scores and track progress over time.
          </p>
        ) : null}
        </div>
      </section>
      <QuizPlayer
        quizId={quiz.id}
        questions={scoredQuestions as Parameters<typeof QuizPlayer>[0]["questions"]}
        pastAttempts={(attempts ?? []).map((a) => ({ score: a.score, total: a.total, completedAt: a.completed_at }))}
        isGuest={!user}
        timerMinutes={quiz.timer_minutes ?? null}
        courseItemId={courseItem}
      />
      </div>
    </LearnerAppShell>
  );
}
