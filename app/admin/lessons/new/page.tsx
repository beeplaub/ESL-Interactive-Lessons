import Link from "next/link";
import { BookOpen, Sparkles } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createVisualLesson } from "@/app/admin/lessons/actions";

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
                {["A1", "A2", "B1", "B2", "C1", "C2"].map((level) => (
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
          </div>

          <label className="text-sm font-medium">
            Description
            <textarea
              name="description"
              rows={4}
              placeholder="What learners will practise and achieve in this lesson."
              className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 font-normal"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Thumbnail storage path
              <input
                name="thumbnailPath"
                placeholder="Optional"
                className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 font-normal"
              />
            </label>
            <label className="text-sm font-medium">
              Cover image storage path
              <input
                name="coverImagePath"
                placeholder="Optional"
                className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 font-normal"
              />
            </label>
          </div>

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
