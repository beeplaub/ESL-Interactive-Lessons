import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminLevelTestPassagesPage() {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: passages } = await admin.from("reading_passages").select("*").order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-3xl font-semibold">Reading passages</h1>
      <p className="mt-2 text-sm text-black/60">Database reading passages for future editable level tests.</p>
      <div className="mt-6 grid gap-4">
        {(passages ?? []).map((passage) => (
          <article key={passage.id} className="rounded-lg border border-black/10 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className="rounded-full bg-skywash px-2 py-1 text-xs font-medium text-ink">{passage.cefr_band}</span>
                <h2 className="mt-3 text-xl font-semibold">{passage.title}</h2>
              </div>
            </div>
            <p className="mt-4 whitespace-pre-line text-sm leading-7 text-black/65">{passage.body}</p>
          </article>
        ))}
        {!passages?.length ? (
          <div className="rounded-lg border border-black/10 bg-white p-8 text-center text-sm text-black/55 shadow-sm">
            No database passages yet. The learner test currently uses the built-in starter passages.
          </div>
        ) : null}
      </div>
    </main>
  );
}
