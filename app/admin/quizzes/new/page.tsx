import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { QuizVisualBuilder } from "@/components/QuizVisualBuilder";
import { requireAdmin } from "@/lib/auth";

export default async function NewQuizPage() {
  await requireAdmin();
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/admin/quizzes" className="inline-flex items-center gap-2 text-sm text-black/60 hover:text-black">
        <ArrowLeft size={16} /> Back to quizzes
      </Link>
      <div className="mt-5">
        <QuizVisualBuilder />
      </div>
    </main>
  );
}
