import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { LessonsGrid } from "@/components/LessonsGrid";

export default async function LessonsPage() {
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const [{ data: lessons }, { data: slides }, { data: wishlist }, { data: progress }] = await Promise.all([
    admin.from("lessons").select("*").eq("status", "PUBLISHED").is("deleted_at", null).order("created_at", { ascending: false }),
    admin.from("slides").select("lesson_id").is("deleted_at", null).order("slide_number", { ascending: true }),
    user
      ? admin.from("wishlist_items").select("lesson_id").eq("user_id", user.id).not("lesson_id", "is", null)
      : Promise.resolve({ data: [] }),
    user
      ? admin.from("lesson_progress").select("lesson_id, current_slide_number, completed").eq("user_id", user.id)
      : Promise.resolve({ data: [] })
  ]);

  const slideCounts: Record<string, number> = {};
  for (const slide of slides ?? []) {
    slideCounts[slide.lesson_id] = (slideCounts[slide.lesson_id] ?? 0) + 1;
  }
  const wishlistLessonIds = (wishlist ?? []).map((item) => item.lesson_id).filter(Boolean) as string[];

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <section className="mb-5 rounded-lg border border-black/10 bg-white px-5 py-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-moss">Lessons</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Learn with guided BrenUp lessons</h1>
        <p className="mt-1 max-w-4xl text-sm text-black/60">
          Choose a published lesson, move through the slides, and complete interactive checks along the way.
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
