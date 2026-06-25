import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { QuizVisualBuilder } from "@/components/QuizVisualBuilder";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function EditQuizPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const admin = createAdminClient();
  const [{ data: quiz }, { data: questions }] = await Promise.all([
    admin.from("quizzes").select("*").eq("id", id).single(),
    admin.from("quiz_questions").select("*").eq("quiz_id", id).order("question_number", { ascending: true })
  ]);

  if (!quiz) notFound();

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <Link href="/admin/quizzes" className="inline-flex items-center gap-2 text-sm text-black/60 hover:text-black">
        <ArrowLeft size={16} /> Back to quizzes
      </Link>
      <div className="mt-5">
        <QuizVisualBuilder
          initialQuiz={{
            id: quiz.id,
            title: quiz.title,
            topic: quiz.topic ?? "",
            level: quiz.level ?? "B1",
            status: quiz.status
          }}
          initialQuestions={(questions ?? []).map((question) => ({
            id: question.id,
            question_type: question.question_type,
            question_text: question.question_text,
            description: question.description,
            options: question.options,
            correct_answer: question.correct_answer
          }))}
        />
      </div>
    </main>
  );
}
