import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, RotateCcw } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { levelGuidance, type CefrLevel } from "@/lib/levelTestBank";

export default async function LevelTestResultPage({ searchParams }: { searchParams: Promise<{ resultId?: string }> }) {
  const { resultId } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?next=${encodeURIComponent(`/level-test/result${resultId ? `?resultId=${resultId}` : ""}`)}`);
  if (!resultId) redirect("/level-test");

  const admin = createAdminClient();
  const { data: result } = await admin.from("level_test_results").select("*").eq("id", resultId).eq("user_id", user.id).single();
  if (!result) notFound();

  const level = result.cefr_level as CefrLevel;
  const guidance = levelGuidance[level];
  const { data: card } = await admin.from("level_test_result_cards").select("guidance_text").eq("cefr_level", level).maybeSingle();
  const sectionScores = result.section_scores as { use_of_english?: number; reading?: number };

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <section className="overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm">
        <div className="bg-ink px-6 py-8 text-white md:px-10">
          <p className="text-sm font-semibold uppercase tracking-wide text-white/60">Your CEFR result</p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-6xl font-semibold tracking-tight">{level}</h1>
              <p className="mt-2 text-xl text-white/80">{guidance.name}</p>
            </div>
            <p className="rounded-md bg-white px-4 py-3 text-sm font-semibold text-ink">
              Score {result.raw_score}/25
            </p>
          </div>
        </div>
        <div className="grid gap-6 p-6 md:grid-cols-[0.85fr_1.15fr] md:p-10">
          <div className="rounded-lg bg-skywash p-5">
            <h2 className="font-semibold">Score breakdown</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between"><span>Use of English</span><strong>{sectionScores.use_of_english ?? 0}/15</strong></div>
              <div className="flex justify-between"><span>Reading</span><strong>{sectionScores.reading ?? 0}/10</strong></div>
              <div className="flex justify-between"><span>Weighted score</span><strong>{Number(result.weighted_score).toFixed(1)}</strong></div>
            </div>
          </div>
          <div>
            <h2 className="text-xl font-semibold">Guidance</h2>
            <p className="mt-3 leading-7 text-black/70">{card?.guidance_text ?? guidance.guidance}</p>
            <p className="mt-4 rounded-md bg-slate-50 p-4 text-sm text-black/60">{guidance.summary}</p>
          </div>
        </div>
      </section>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/quizzes" className="inline-flex items-center gap-2 rounded-md bg-moss px-5 py-3 text-sm font-semibold text-white">
          Go to quizzes <ArrowRight size={16} />
        </Link>
        <Link href="/level-test/test" className="inline-flex items-center gap-2 rounded-md border border-black/15 px-5 py-3 text-sm font-medium">
          <RotateCcw size={16} /> Retake level test
        </Link>
      </div>
    </main>
  );
}
