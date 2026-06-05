import Link from "next/link";
import { ArrowRight, BookOpen, CheckCircle2, Clock3, LockKeyhole } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function LessonsPage() {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const [{ data: lessons }, { data: progress }] = await Promise.all([
    adminSupabase.from("lessons").select("*").eq("status", "PUBLISHED").order("created_at", { ascending: false }),
    user ? supabase.from("lesson_progress").select("*").eq("user_id", user.id) : Promise.resolve({ data: [] })
  ]);

  const lessonIds = (lessons ?? []).map((lesson) => lesson.id);
  const { data: slides } = lessonIds.length
    ? await adminSupabase.from("slides").select("lesson_id, type").in("lesson_id", lessonIds)
    : { data: [] };

  const slideCounts = new Map<string, number>();
  for (const slide of slides ?? []) {
    slideCounts.set(slide.lesson_id, (slideCounts.get(slide.lesson_id) ?? 0) + 1);
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <section className="mb-7 rounded-lg border border-black/10 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-moss">Lessons</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Choose a BrenUp lesson</h1>
        <p className="mt-2 max-w-2xl text-black/60">
          Browse published lessons. Sign in to start, save progress, complete lessons, and keep study notes.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(lessons ?? []).map((lesson) => {
          const saved = progress?.find((item) => item.lesson_id === lesson.id);
          const totalSlides = slideCounts.get(lesson.id) ?? 0;
          const current = Math.min(saved?.current_slide_number ?? 1, totalSlides || 1);
          const percent = saved && totalSlides ? Math.round((current / totalSlides) * 100) : 0;
          const href = user ? `/lessons/${lesson.id}` : `/login?next=${encodeURIComponent(`/lessons/${lesson.id}`)}`;
          const action = user ? (saved?.completed ? "Review" : saved ? "Continue" : "Start") : "Start";

          return (
            <article key={lesson.id} className="flex min-h-72 flex-col rounded-lg border border-black/10 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="rounded-full bg-skywash px-2 py-1 text-xs font-medium text-ink">{lesson.level}</span>
                  <h2 className="mt-3 text-xl font-semibold">{lesson.title}</h2>
                  <p className="mt-1 text-sm text-black/55">{lesson.topic}</p>
                </div>
                <BookOpen className="text-moss" size={22} />
              </div>
              <p className="mt-4 text-sm leading-6 text-black/65">{lesson.description || "A focused English lesson with guided slide practice."}</p>
              <div className="mt-auto pt-5">
                {user ? (
                  <>
                    <div className="mb-3 flex items-center gap-2 text-xs font-medium text-black/55">
                      {saved?.completed ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}
                      <span>{saved?.completed ? "Completed" : saved ? "In progress" : "Not started"}</span>
                    </div>
                    <div className="mb-2 flex justify-between text-xs text-black/55">
                      <span>{saved?.completed ? "Completed" : saved ? `${current}/${totalSlides || "?"} slides` : `${totalSlides || "?"} slides`}</span>
                      <span>{saved?.completed ? 100 : percent}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-black/10">
                      <div className="h-full bg-moss" style={{ width: `${saved?.completed ? 100 : percent}%` }} />
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2 rounded-md bg-slate-50 p-3 text-sm text-slate-600">
                    <LockKeyhole size={16} /> Sign in to save progress and study notes.
                  </div>
                )}
              </div>
              <Link href={href} className="mt-5 inline-flex items-center justify-center gap-2 rounded-md bg-ink px-4 py-2 text-center text-sm font-medium text-white">
                {action} <ArrowRight size={16} />
              </Link>
            </article>
          );
        })}
      </div>

      {!lessons?.length ? (
        <div className="rounded-lg border border-black/10 bg-white p-8 text-center shadow-sm">
          <BookOpen className="mx-auto text-moss" size={28} />
          <h2 className="mt-4 text-lg font-semibold">No published lessons yet</h2>
          <p className="mt-2 text-sm text-black/60">Once Bren publishes a lesson, it will appear here automatically.</p>
        </div>
      ) : null}
    </main>
  );
}
