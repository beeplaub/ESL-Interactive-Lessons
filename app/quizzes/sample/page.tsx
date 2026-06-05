import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SampleQuiz } from "@/components/SampleQuiz";

export default async function SampleQuizPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?next=${encodeURIComponent("/quizzes/sample")}`);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/quizzes" className="inline-flex items-center gap-2 text-sm text-black/60 hover:text-black">
        <ArrowLeft size={16} /> Back to quizzes
      </Link>
      <section className="mb-6 mt-5 rounded-lg border border-black/10 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-moss">Sample quiz</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Rumor Review MCQ</h1>
        <p className="mt-2 text-sm leading-6 text-black/60">
          Answer each question, submit, and review your score immediately.
        </p>
      </section>
      <SampleQuiz />
    </main>
  );
}
