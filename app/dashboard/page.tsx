import Link from "next/link";
import { BookOpen } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function DashboardPage() {
  const { user } = await requireUser();
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const [{ data: lessons }, { data: progress }] = await Promise.all([
    adminSupabase.from("lessons").select("*").eq("status", "PUBLISHED").order("created_at", { ascending: false }),
    supabase.from("learner_progress").select("*").eq("user_id", user.id)
  ]);

  const lessonIds = (lessons ?? []).map((lesson) => lesson.id);
  const { data: slides } = lessonIds.length
    ? await adminSupabase.from("slides").select("lesson_id, type").in("lesson_id", lessonIds)
    : { data: [] };

  const slideCounts = new Map<string, number>();
  for (const slide of slides ?? []) {
    if (slide.type === "ANSWERS") continue;
    slideCounts.set(slide.lesson_id, (slideCounts.get(slide.lesson_id) ?? 0) + 1);
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Choose a lesson</h1>
        <p className="mt-2 text-black/60">Pick a topic and move through the activities one slide at a time.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(lessons ?? []).map((lesson) => {
          const saved = progress?.find((item) => item.lesson_id === lesson.id);
          const totalSlides = slideCounts.get(lesson.id) ?? 0;
          const current = Math.min(saved?.current_slide_number ?? 1, totalSlides || 1);
          const percent = totalSlides ? Math.round((current / totalSlides) * 100) : 0;

          return (
            <article key={lesson.id} className="rounded-lg border border-black/10 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="rounded-full bg-skywash px-2 py-1 text-xs font-medium text-ink">{lesson.level}</span>
                  <h2 className="mt-3 text-xl font-semibold">{lesson.title}</h2>
                  <p className="mt-1 text-sm text-black/55">{lesson.topic}</p>
                </div>
                <BookOpen className="text-moss" size={22} />
              </div>
              <p className="mt-4 min-h-12 text-sm text-black/65">{lesson.description}</p>
              <div className="mt-5">
                <div className="mb-2 flex justify-between text-xs text-black/55">
                  <span>{saved?.completed ? "Completed" : `${current}/${totalSlides || "?"} slides`}</span>
                  <span>{percent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-black/10">
                  <div className="h-full bg-moss" style={{ width: `${percent}%` }} />
                </div>
              </div>
              <Link href={`/lessons/${lesson.id}`} className="mt-5 block rounded-md bg-ink px-4 py-2 text-center text-sm font-medium text-white">
                {saved ? "Continue" : "Start"}
              </Link>
            </article>
          );
        })}
      </div>

      {!lessons?.length ? (
        <div className="rounded-lg border border-black/10 bg-white p-8 text-center text-black/60">No published lessons yet.</div>
      ) : null}
    </main>
  );
}
