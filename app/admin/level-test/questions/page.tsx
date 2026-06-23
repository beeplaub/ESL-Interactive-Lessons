import Link from "next/link";
import { Plus } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminLevelTestQuestionsPage() {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: questions } = await admin.from("level_test_questions").select("*").order("created_at", { ascending: false }).limit(100);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Level test questions</h1>
          <p className="mt-1 text-sm text-black/60">Manage the Supabase question bank.</p>
        </div>
        <Link href="/admin/level-test/questions/new" className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white">
          <Plus size={16} /> New question
        </Link>
      </div>
      <div className="overflow-x-auto rounded-lg border border-black/10 bg-white shadow-sm">
        <table className="min-w-[700px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-black/50">
            <tr><th className="p-3">Section</th><th className="p-3">Band</th><th className="p-3">Question</th><th className="p-3">Answer</th></tr>
          </thead>
          <tbody>
            {(questions ?? []).map((question) => (
              <tr key={question.id} className="border-t border-black/10">
                <td className="p-3">{question.section}</td>
                <td className="p-3">{question.cefr_band}</td>
                <td className="p-3">{question.question_text}</td>
                <td className="p-3">{question.correct_answer}</td>
              </tr>
            ))}
            {!questions?.length ? <tr><td colSpan={4} className="p-6 text-center text-black/55">No database questions yet. The learner test currently uses the built-in starter bank.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
