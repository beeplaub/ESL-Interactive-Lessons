import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createLevelTestQuestion } from "@/app/admin/level-test/actions";
import { requireAdmin } from "@/lib/auth";

export default async function NewLevelTestQuestionPage() {
  await requireAdmin();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/admin/level-test/questions" className="inline-flex items-center gap-2 text-sm text-black/60 hover:text-black">
        <ArrowLeft size={16} /> Back to questions
      </Link>
      <section className="mt-5 rounded-lg border border-black/10 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Add level test question</h1>
        <form action={createLevelTestQuestion} className="mt-6 grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Section
              <select name="section" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">
                <option value="USE_OF_ENGLISH">Use of English</option>
                <option value="READING">Reading</option>
              </select>
            </label>
            <label className="text-sm font-medium">
              CEFR band
              <select name="cefr_band" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">
                {["A1", "A2", "B1", "B2", "C1", "C2"].map((level) => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="text-sm font-medium">
            Question
            <textarea name="question_text" required rows={4} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            {["a", "b", "c", "d"].map((key) => (
              <label key={key} className="text-sm font-medium">
                Option {key.toUpperCase()}
                <input name={`option_${key}`} required={key !== "d"} className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
              </label>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-sm font-medium">
              Correct answer
              <select name="correct_answer" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">
                {["A", "B", "C", "D"].map((answer) => (
                  <option key={answer} value={answer}>{answer}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              Type
              <select name="question_type" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2">
                <option value="MCQ">MCQ</option>
                <option value="TRUE_FALSE">True / False / Not Given</option>
              </select>
            </label>
            <label className="text-sm font-medium">
              Weight
              <input name="weight" type="number" step="0.5" min="0.5" max="2" defaultValue="1" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2" />
            </label>
          </div>
          <button className="rounded-md bg-ink px-4 py-3 text-sm font-semibold text-white">Save question</button>
        </form>
      </section>
    </main>
  );
}
