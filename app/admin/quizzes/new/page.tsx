import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { QuizVisualBuilder } from "@/components/QuizVisualBuilder";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function NewQuizPage() {
  await requireAdmin();
  const admin = createAdminClient();
  const [{ data: bankQuestions }, { data: skills }, { data: targets }] = await Promise.all([
    admin
      .from("quiz_questions")
      .select("id, question_type, question_text, description, options, correct_answer, quizzes(id, title, topic, level)")
      .order("created_at", { ascending: false })
      .limit(500),
    admin.from("learning_skills").select("id,parent_id,name,slug").eq("status", "ACTIVE").order("position"),
    admin.from("learning_targets").select("id,target_type,label").eq("status", "ACTIVE").order("label"),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/admin/quizzes" className="inline-flex items-center gap-2 text-sm text-black/60 hover:text-black">
        <ArrowLeft size={16} /> Back to quizzes
      </Link>
      <div className="mt-5">
        <QuizVisualBuilder questionBank={(bankQuestions ?? []).map((question) => {
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
        assessmentItems={[]}
        assessmentSkills={[]}
        assessmentTargets={[]}
        />
      </div>
    </main>
  );
}
