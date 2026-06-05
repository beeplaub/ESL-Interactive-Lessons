import Link from "next/link";
import { Plus } from "lucide-react";
import { saveResultCard } from "@/app/admin/level-test/actions";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { levelGuidance, type CefrLevel } from "@/lib/levelTestBank";

const levels: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

export default async function AdminLevelTestPage() {
  await requireAdmin();
  const admin = createAdminClient();
  const [{ data: questions }, { data: cards }] = await Promise.all([
    admin.from("level_test_questions").select("*").order("section").order("cefr_band"),
    admin.from("level_test_result_cards").select("*")
  ]);
  const cardMap = new Map((cards ?? []).map((card) => [card.cefr_level, card.guidance_text]));

  return (
    <main>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Level Test</h1>
          <p className="mt-2 text-sm text-black/60">Manage question bank and result-card guidance.</p>
        </div>
        <Link href="/admin/level-test/questions/new" className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white">
          <Plus size={16} /> Add Question
        </Link>
      </div>

      <section className="rounded-lg border border-black/10 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold">Questions</h2>
        <div className="mt-4 overflow-hidden rounded-md border border-black/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-black/50"><tr><th className="p-3">Section</th><th className="p-3">Band</th><th className="p-3">Question</th><th className="p-3">Answer</th></tr></thead>
            <tbody>
              {(questions ?? []).map((question) => (
                <tr key={question.id} className="border-t border-black/10">
                  <td className="p-3">{question.section}</td>
                  <td className="p-3">{question.cefr_band}</td>
                  <td className="p-3">{question.question_text}</td>
                  <td className="p-3">{question.correct_answer}</td>
                </tr>
              ))}
              {!questions?.length ? <tr><td colSpan={4} className="p-6 text-center text-black/55">No database questions yet. The learner test uses the built-in starter bank.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-black/10 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold">Result Cards</h2>
        <div className="mt-4 grid gap-4">
          {levels.map((level) => (
            <form key={level} action={saveResultCard} className="rounded-md border border-black/10 p-4">
              <input type="hidden" name="cefrLevel" value={level} />
              <label className="text-sm font-semibold">{level} · {levelGuidance[level].name}</label>
              <textarea name="guidanceText" defaultValue={cardMap.get(level) ?? levelGuidance[level].guidance} rows={4} className="mt-2 w-full rounded-md border border-black/15 px-3 py-2 text-sm leading-6" />
              <button className="mt-2 rounded-md bg-moss px-4 py-2 text-sm font-medium text-white">Save card</button>
            </form>
          ))}
        </div>
      </section>
    </main>
  );
}
