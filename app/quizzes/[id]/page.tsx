import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { QuizPlayer } from "@/components/QuizPlayer";

export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/quizzes/${id}`)}`);

  const admin = createAdminClient();
  const [{ data: quiz }, { data: questions }] = await Promise.all([
    admin.from("quizzes").select("*").eq("id", id).eq("status", "PUBLISHED").single(),
    admin.from("quiz_questions").select("*").eq("quiz_id", id).order("question_number", { ascending: true })
  ]);
  if (!quiz) notFound();

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/quizzes" className="inline-flex items-center gap-2 text-sm text-black/60 hover:text-black">
        <ArrowLeft size={16} /> Back to quizzes
      </Link>
      <section className="mb-6 mt-5 rounded-lg border border-black/10 bg-white p-6 shadow-sm">
        <span className="rounded-full bg-skywash px-2 py-1 text-xs font-medium text-ink">{quiz.level}</span>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{quiz.title}</h1>
        <p className="mt-2 text-sm text-black/60">{quiz.topic} · {(questions ?? []).length} questions</p>
      </section>
      <QuizPlayer quizId={quiz.id} questions={(questions ?? []) as Parameters<typeof QuizPlayer>[0]["questions"]} />
    </main>
  );
}
