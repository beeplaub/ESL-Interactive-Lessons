import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { LessonsGrid } from "@/components/LessonsGrid";

export default async function LessonsPage() {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const [{ data: lessons }, { data: progress }, { data: wishlist }] = await Promise.all([
    adminSupabase.from("lessons").select("*").eq("status", "PUBLISHED").order("created_at", { ascending: false }),
    user ? supabase.from("lesson_progress").select("*").eq("user_id", user.id) : Promise.resolve({ data: [] }),
    user
      ? adminSupabase.from("wishlist_items").select("lesson_id").eq("user_id", user.id).not("lesson_id", "is", null)
      : Promise.resolve({ data: [] })
  ]);

  const lessonIds = (lessons ?? []).map((l) => l.id);
  const { data: slides } = lessonIds.length
    ? await adminSupabase.from("slides").select("lesson_id, type").in("lesson_id", lessonIds)
    : { data: [] };

  const slideCounts: Record<string, number> = {};
  for (const slide of slides ?? []) {
    slideCounts[slide.lesson_id] = (slideCounts[slide.lesson_id] ?? 0) + 1;
  }

  const wishlistLessonIds = (wishlist ?? []).map((item) => item.lesson_id).filter(Boolean) as string[];

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <section className="mb-5 rounded-lg border border-black/10 bg-white px-5 py-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-moss">Lessons</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Choose a BrenUp lesson</h1>
        <p className="mt-1 max-w-4xl text-sm text-black/60">
          Browse published lessons. Sign in to start, save progress, complete lessons, and keep study notes.
        </p>
      </section>

      {(lessons?.length ?? 0) > 0 ? (
        <LessonsGrid
          lessons={lessons ?? []}
          slideCounts={slideCounts}
          progress={progress ?? []}
          wishlistLessonIds={wishlistLessonIds}
          isLoggedIn={Boolean(user)}
        />
      ) : (
        <div className="rounded-lg border border-black/10 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-black/60">No published lessons yet.</p>
        </div>
      )}
    </main>
  );
}