import Link from "next/link";
import { BookOpen, Sparkles } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createVisualLesson } from "@/app/admin/lessons/actions";
import { CONTENT_LEVELS } from "@/lib/levels";

export default async function NewLessonPage() {
  await requireAdmin();

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/admin/lessons" className="text-sm text-black/60 hover:text-black">
        Back to lessons
      </Link>

      <div className="mt-5 rounded-2xl border border-black/10 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-moss/10 px-3 py-1 text-sm font-semibold text-moss">
              <Sparkles size={15} /> Visual builder
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">Create a lesson</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-black/60">
              Start with the lesson details, then build slides, content blocks, and activities visually. No PDF upload or parsing needed.
            </p>
          </div>
          <div className="hidden rounded-xl bg-skywash p-4 text-moss sm:block">
            <BookOpen size={34} />
          </div>
        </div>

        <form action={createVisualLesson} className="mt-8 grid gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Lesson title
              <input
                name="title"
                required
                minLength={2}
                placeholder="Present Perfect in Real Life"
                className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 font-normal"
              />
            </label>
            <label className="text-sm font-medium">
              Subtitle
              <input
                name="subtitle"
                placeholder="A practical speaking and grammar lesson"
                className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 font-normal"
              />
            </label>
            <label className="text-sm font-medium">
              Topic
              <input
                name="topic"
                required
                minLength={2}
                placeholder="Grammar"
                className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 font-normal"
              />
            </label>
            <label className="text-sm font-medium">
              Category
              <input
                name="category"
                placeholder="Speaking, Vocabulary, Exam prep"
                className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 font-normal"
              />
            </label>
            <label className="text-sm font-medium">
              CEFR level
              <select name="level" defaultValue="B1" className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 font-normal">
                {CONTENT_LEVELS.map((level) => (
                  <option key={level}>{level}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              Estimated completion minutes
              <input
                name="estimatedCompletionMinutes"
                type="number"
                min="1"
                placeholder="45"
                className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 font-normal"
              />
            </label>
            <label className="text-sm font-medium">
              Attempt timer minutes
              <input
                name="timerMinutes"
                type="number"
                min="1"
                placeholder="Leave blank for untimed"
                className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 font-normal"
              />
            </label>
          </div>

          <input type="hidden" name="description" value="" />
          <label className="text-sm font-medium">
            After this lesson, learners will be able to:
            <textarea
              name="outcomes"
              rows={4}
              placeholder="Use topic vocabulary accurately&#10;Answer discussion questions with confidence&#10;Complete a short practice activity"
              className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 font-normal"
            />
            <span className="mt-1 block text-xs font-normal text-black/45">One outcome per line.</span>
          </label>

          <input type="hidden" name="thumbnailPath" value="" />
          <input type="hidden" name="coverImagePath" value="" />

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-5">
            <p className="text-sm text-black/55">This creates a draft lesson and opens the builder with the first slide ready.</p>
            <button className="rounded-md bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-black">
              Create and open builder
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
