import Link from "next/link";
import { redirect } from "next/navigation";
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
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    const profile = await getFreshProfile(user.id);
    if (profile?.role === "ADMIN") redirect("/admin");
  }

  return (
    <main className="bg-slate-50">
      <section className="border-b border-black/10 bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 md:grid-cols-[1.02fr_0.98fr] md:items-center md:py-16 lg:py-20">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
              <Sparkles size={15} /> ESL quiz practice
            </div>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-ink sm:text-5xl md:text-6xl">
              Build stronger English with focused quizzes.
            </h1>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              Practice grammar, vocabulary, reading, and functional language with quick self-check quizzes, instant feedback, and level-aware progress.
            </p>
            <div className="mt-8 grid gap-3 sm:flex sm:flex-wrap">
              <Link href="/quizzes" className="inline-flex items-center justify-center gap-2 rounded-md bg-moss px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
                Browse quizzes <ArrowRight size={16} />
              </Link>
              <Link href="/level-test" className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-ink hover:bg-slate-50">
                Take level test
              </Link>
            </div>
            <div className="mt-7 grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
              {["Instant feedback", "CEFR level badges", "Progress tracking"].map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="text-moss" size={17} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl shadow-blue-950/10">
            <div className="border-b border-slate-200 bg-ink px-5 py-4 text-white">
              <p className="text-sm text-white/70">BrenUp quiz practice</p>
              <h2 className="mt-1 text-2xl font-semibold">Clear practice, quick results</h2>
            </div>
            <div className="space-y-4 p-5">
              <div className="rounded-md bg-blue-50 p-4">
                <div className="mb-3 flex items-center justify-between text-sm">
                  <span className="font-medium text-blue-700">Sample score</span>
                  <span className="text-slate-500">8 of 10</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white">
                  <div className="h-full w-4/5 rounded-full bg-moss" />
                </div>
              </div>
              {[
                { title: "Choose your level", text: "Filter quizzes from A1 to C2", Icon: Filter },
                { title: "Answer and check", text: "See correct answers immediately", Icon: ClipboardList },
                { title: "Track improvement", text: "Retake quizzes and compare scores", Icon: BarChart3 }
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
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-moss">Why learners use BrenUp</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink md:text-4xl">Simple quiz practice that still feels personal.</h2>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            { title: "Quick checks", text: "Use short quizzes to review one topic at a time without feeling overloaded.", Icon: Clock3 },
            { title: "Level guidance", text: "Take the free level test and use CEFR badges to choose suitable practice.", Icon: BadgeCheck },
            { title: "Smart review", text: "Completed attempts stay in your account so you can see what you have practised.", Icon: Trophy },
            { title: "Focused skills", text: "Practise grammar, vocabulary, reading, and useful English expressions.", Icon: GraduationCap },
            { title: "Saved quizzes", text: "Keep interesting quizzes in your saved list and return when you are ready.", Icon: UserRound },
            { title: "Admin-friendly", text: "New quizzes can be created quickly from structured plain text.", Icon: ClipboardList }
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
            ["2", "Pick a quiz", "Filter by topic, level, timer, or title."],
            ["3", "Check instantly", "Submit your answers and see your score right away."]
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
