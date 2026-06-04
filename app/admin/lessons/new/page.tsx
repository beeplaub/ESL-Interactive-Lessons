import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { NewLessonForm } from "@/components/NewLessonForm";

export const maxDuration = 60;

export default async function NewLessonPage() {
  await requireAdmin();

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/admin/lessons" className="text-sm text-black/60 hover:text-black">
        Back to lessons
      </Link>
      <div className="mb-6 mt-4">
        <h1 className="text-3xl font-semibold tracking-tight">Upload lesson</h1>
        <p className="mt-2 text-black/60">Add a PDF and audio files. The app will parse learner-facing slides into editable activities.</p>
      </div>
      <NewLessonForm />
    </main>
  );
}
