import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { QuizVisualBuilder } from "@/components/QuizVisualBuilder";
import { requireQuizAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function EditQuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireQuizAccess(id);
  const admin = createAdminClient();
  const [{ data: quiz }, { data: questions }, { data: bankQuestions }, { data: skills }, { data: targets }, { data: placements }] = await Promise.all([
    admin.from("quizzes").select("*").eq("id", id).single(),
    admin.from("quiz_questions").select("*").eq("quiz_id", id).order("question_number", { ascending: true }),
    admin
      .from("quiz_questions")
      .select("id, question_type, question_text, description, options, correct_answer, quizzes(id, title, topic, level)")
      .order("created_at", { ascending: false })
      .limit(500),
    admin.from("learning_skills").select("id,parent_id,name,slug").eq("status", "ACTIVE").order("position"),
    admin.from("learning_targets").select("id,target_type,label").eq("status", "ACTIVE").order("label"),
    admin.from("course_items").select("id,course_id,courses(title)").eq("quiz_id", id).limit(1)
  ]);

  if (!quiz) notFound();

  const placement = placements?.[0];
  const courseId = placement?.course_id;
  const courseTitle = Array.isArray(placement?.courses)
    ? placement?.courses[0]?.title
    : (placement?.courses as unknown as { title?: string } | null)?.title || "Course";

  const questionIds = (questions ?? []).map((question) => question.id);
  const { data: assessmentItems } = questionIds.length
    ? await admin.from("assessment_items").select("*").in("quiz_question_id", questionIds)
    : { data: [] };
  const assessmentIds = (assessmentItems ?? []).map((item) => item.id);
  const [{ data: assessmentSkills }, { data: assessmentTargets }] = assessmentIds.length
    ? await Promise.all([
        admin.from("assessment_item_skills").select("*").in("assessment_item_id", assessmentIds),
        admin.from("assessment_item_targets").select("*").in("assessment_item_id", assessmentIds),
      ])
    : [{ data: [] }, { data: [] }];

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <nav className="flex items-center gap-1.5 text-sm text-black/60 mb-5">
        <Link href="/admin/courses" className="hover:text-black">Courses</Link>
        {courseId ? (
          <>
            <ChevronRight size={14} className="text-black/35" />
            <Link href={`/admin/courses/${courseId}/builder`} className="hover:text-black">{courseTitle}</Link>
          </>
        ) : null}
        <ChevronRight size={14} className="text-black/35" />
        <span className="font-medium text-black">{quiz.title}</span>
      </nav>
      <div className="mt-5">
        <QuizVisualBuilder
          initialQuiz={{
            id: quiz.id,
            title: quiz.title,
            topic: quiz.topic ?? "",
            level: quiz.level ?? "B1",
            status: quiz.status,
            timerMinutes: quiz.timer_minutes ?? null
          }}
          initialQuestions={(questions ?? []).map((question) => ({
            id: question.id,
            question_type: question.question_type,
            question_text: question.question_text,
            description: question.description,
            options: question.options,
            correct_answer: question.correct_answer
          }))}
          questionBank={(bankQuestions ?? []).map((question) => {
            const sourceQuiz = Array.isArray(question.quizzes) ? question.quizzes[0] : question.quizzes;
            return {
              id: question.id,
              question_type: question.question_type,
              question_text: question.question_text,
              description: question.description,
              options: question.options,
              correct_answer: question.correct_answer,
              quiz_title: sourceQuiz?.title ?? "Untitled quiz",
              quiz_topic: sourceQuiz?.topic ?? "",
              quiz_level: sourceQuiz?.level ?? ""
            };
          })}
          skills={skills ?? []}
          learningTargets={targets ?? []}
          assessmentItems={assessmentItems ?? []}
          assessmentSkills={assessmentSkills ?? []}
          assessmentTargets={assessmentTargets ?? []}
        />
      </div>
    </main>
  );
}
