import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AdminQuizBuilder } from "@/components/AdminQuizBuilder";
import { requireAdmin } from "@/lib/auth";

export default async function NewQuizPage() {
  await requireAdmin();
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/admin/quizzes" className="inline-flex items-center gap-2 text-sm text-black/60 hover:text-black">
        <ArrowLeft size={16} /> Back to quizzes
      </Link>
      <section className="mt-5 rounded-lg border border-black/10 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Create quiz from text</h1>
        <p className="mt-2 text-sm text-black/60">Paste the full quiz, parse it, review the rows, then save or publish.</p>
        <div className="mt-6">
          <AdminQuizBuilder />
        </div>
      </section>
    </main>
  );
}
