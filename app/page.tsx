import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowRight,
  BarChart3,
  BadgeCheck,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Filter,
  GraduationCap,
  Sparkles,
  Trophy,
  UserRound
} from "lucide-react";
import { getFreshProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getQuizBadge } from "@/lib/quizBadges";

export const metadata: Metadata = {
  title: "BrenUp | ESL Quizzes, Lessons, Level Test and Leaderboard",
  description: "Practice English with interactive ESL quizzes, timed attempts, lesson activities, CEFR level guidance, instant feedback, progress tracking and leaderboard badges.",
  alternates: { canonical: "/" }
};

export default async function HomePage() {
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    const profile = await getFreshProfile(user.id);
    if (profile?.role === "ADMIN") redirect("/admin");
  }

  const [{ count: publishedQuizCount }, { data: latestQuiz }, { count: publishedLessonCount }, { data: topPoints }] = await Promise.all([
    admin.from("quizzes").select("id", { count: "exact", head: true }).eq("status", "PUBLISHED"),
    admin
      .from("quizzes")
      .select("id, title, level, topic, created_at, timer_minutes")
      .eq("status", "PUBLISHED")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from("lessons").select("id", { count: "exact", head: true }).eq("status", "PUBLISHED"),
    admin.from("quiz_leaderboard_points").select("points").order("points", { ascending: false }).limit(1000)
  ]);
  const quizCount = publishedQuizCount ?? 0;
  const lessonCount = publishedLessonCount ?? 0;
  const topTotal = (topPoints ?? []).reduce((sum, row) => sum + Number(row.points ?? 0), 0);
  const topBadge = getQuizBadge(topTotal);

  return (
    <main className="bg-slate-50">
      <section className="border-b border-black/10 bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 md:grid-cols-[1.02fr_0.98fr] md:items-center md:py-16 lg:py-20">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
              <Sparkles size={15} /> ESL quiz, lesson and level practice
            </div>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-ink sm:text-5xl md:text-6xl">
              Build stronger English with quizzes, lessons and badges.
            </h1>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              Practice grammar, vocabulary, reading, listening and functional English with instant feedback, timed attempts, CEFR guidance and motivating leaderboard progress.
            </p>
            <div className="mt-8 grid gap-3 sm:flex sm:flex-wrap">
              <Link href="/quizzes" className="inline-flex items-center justify-center gap-2 rounded-md bg-moss px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
                Browse quizzes <ArrowRight size={16} />
              </Link>
              <Link href="/level-test" className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-ink hover:bg-slate-50">
                Take level test
              </Link>
              <Link href="/lessons" className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-ink hover:bg-slate-50">
                Explore lessons
              </Link>
            </div>
            <div className="mt-7 grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
              {["Timed attempts", "Leaderboard badges", "Progress tracking"].map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="text-moss" size={17} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl shadow-blue-950/10">
              <div className="border-b border-slate-200 bg-ink px-5 py-4 text-white">
                <p className="text-sm text-white/70">Live platform</p>
                <h2 className="mt-1 text-2xl font-semibold">Fresh practice, ready now</h2>
              </div>
              <div className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-moss">Live learning library</p>
                    <p className="mt-1 text-3xl font-semibold tracking-tight text-ink">
                      {quizCount} quiz{quizCount === 1 ? "" : "zes"} available
                    </p>
                    <p className="mt-1 text-sm text-black/55">{lessonCount} published lesson{lessonCount === 1 ? "" : "s"}</p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-black/55 shadow-sm">
                    Updated live
                  </span>
                </div>
                {latestQuiz ? (
                  <div className="mt-4 rounded-md bg-white p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-black/45">Latest quiz added</p>
                    <h3 className="mt-1 text-lg font-semibold text-ink">{latestQuiz.title}</h3>
                    <p className="mt-1 text-sm text-black/60">
                      {[latestQuiz.level, latestQuiz.topic].filter(Boolean).join(" • ")}
                      {latestQuiz.timer_minutes ? ` • ${latestQuiz.timer_minutes} min timer` : ""}
                    </p>
                    <Link
                      href={`/quizzes/${latestQuiz.id}`}
                      className="mt-4 inline-flex items-center gap-2 rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      Try the latest quiz <ArrowRight size={15} />
                    </Link>
                  </div>
                ) : (
                  <div className="mt-4 rounded-md bg-white p-4 text-sm text-black/60 shadow-sm">
                    Published quizzes will appear here as soon as they are added.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-lg shadow-blue-950/5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-blue-700">Badge energy</p>
                  <h2 className="mt-1 text-xl font-semibold text-ink">Climb from Bronze to Legend</h2>
                </div>
                <span className={`grid size-12 place-items-center rounded-2xl bg-gradient-to-br ${topBadge.gradient} text-sm font-black text-white shadow-sm`}>
                  {topBadge.icon}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Quiz points unlock visible player badges on the leaderboard and in learner accounts.
              </p>
              <div className="mt-4 flex items-center justify-between rounded-md bg-blue-50 px-3 py-2 text-sm">
                <span className="font-medium text-blue-700">Current top energy</span>
                <span className="font-semibold text-ink">{topBadge.name}</span>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-lg shadow-blue-950/5">
              <h2 className="text-xl font-semibold text-ink">How practice works</h2>
              <div className="mt-4 space-y-3">
                {[
                  { title: "Choose your level", text: "Filter quizzes and lessons from A1 to C2", Icon: Filter },
                  { title: "Answer and check", text: "Submit timed or untimed attempts with instant feedback", Icon: ClipboardList },
                  { title: "Climb badges", text: "Earn points from quizzes and move up the leaderboard", Icon: BarChart3 }
                ].map(({ title, text, Icon }) => (
                  <div key={title} className="flex items-center gap-4 rounded-md border border-slate-200 bg-white p-4">
                    <span className="grid size-10 place-items-center rounded-md bg-blue-50 text-moss">
                      <Icon size={20} />
                    </span>
                    <div>
                      <h3 className="font-medium">{title}</h3>
                      <p className="text-sm text-black/60">{text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-moss">Why learners use BrenUp</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink md:text-4xl">Simple practice that still feels personal.</h2>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            { title: "Timed practice", text: "Creators can set quiz and lesson timers for focused individual attempts.", Icon: Clock3 },
            { title: "Level guidance", text: "Take the free level test and use CEFR badges to choose suitable practice.", Icon: BadgeCheck },
            { title: "Leaderboard badges", text: "Earn points and unlock Bronze through Legend as your quiz history grows.", Icon: Trophy },
            { title: "Focused skills", text: "Practise grammar, vocabulary, reading, and useful English expressions.", Icon: GraduationCap },
            { title: "Saved quizzes", text: "Keep interesting quizzes in your saved list and return when you are ready.", Icon: UserRound },
            { title: "Interactive lessons", text: "Learn through slides, activities, notes, media blocks and self-paced progress.", Icon: ClipboardList }
          ].map(({ title, text, Icon }) => (
            <div key={title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <span className="grid size-10 place-items-center rounded-md bg-blue-50 text-moss">
                <Icon size={20} />
              </span>
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 md:grid-cols-3 md:py-16">
          {[
            ["1", "Find your level", "Take the free level test or choose any CEFR level manually."],
            ["2", "Pick a quiz or lesson", "Filter by topic, level, timer, title, or learning goal."],
            ["3", "Check and improve", "Submit, review feedback, retake, and climb the badge ladder."]
          ].map(([number, title, text]) => (
            <div key={number} className="rounded-lg bg-slate-50 p-5">
              <span className="grid size-9 place-items-center rounded-full bg-moss text-sm font-semibold text-white">{number}</span>
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <div className="rounded-lg bg-ink px-5 py-8 text-white md:px-10 md:py-12">
          <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">Ready to check your English today?</h2>
              <p className="mt-3 max-w-2xl text-white/70">
                Open the quiz library, choose a topic, and get instant feedback on your answers.
              </p>
            </div>
            <Link href="/quizzes" className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-5 py-3 text-sm font-semibold text-ink hover:bg-blue-50">
              Start practising <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
