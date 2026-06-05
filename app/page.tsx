import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Headphones,
  MessageCircle,
  MousePointer2,
  PenLine,
  PlayCircle,
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
              <Sparkles size={15} /> Interactive English learning
            </div>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-ink sm:text-5xl md:text-6xl">
              BrenUp helps you speak English with more confidence.
            </h1>
            <p className="mt-5 text-lg leading-8 text-slate-600">
              Learn through guided lessons that turn reading, listening, vocabulary, grammar, speaking, and writing into active practice.
            </p>
            <div className="mt-8 grid gap-3 sm:flex sm:flex-wrap">
              <Link href="/login" className="inline-flex items-center justify-center gap-2 rounded-md bg-moss px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
                Create your account <ArrowRight size={16} />
              </Link>
              <Link href="/lessons" className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-ink hover:bg-slate-50">
                Go to lessons
              </Link>
            </div>
            <div className="mt-7 grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
              {["Self-paced practice", "Listening + speaking", "Progress tracking"].map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="text-moss" size={17} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl shadow-blue-950/10">
            <div className="border-b border-slate-200 bg-ink px-5 py-4 text-white">
              <p className="text-sm text-white/70">BrenUp lesson player</p>
              <h2 className="mt-1 text-2xl font-semibold">Real English, one task at a time</h2>
            </div>
            <div className="space-y-4 p-5">
              <div className="rounded-md bg-blue-50 p-4">
                <div className="mb-3 flex items-center justify-between text-sm">
                  <span className="font-medium text-blue-700">Lesson progress</span>
                  <span className="text-slate-500">8 of 24</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white">
                  <div className="h-full w-1/3 rounded-full bg-moss" />
                </div>
              </div>
              {[
                { title: "Listen", text: "Replay audio and catch key details", Icon: Headphones },
                { title: "Practice", text: "Answer questions with instant feedback", Icon: MousePointer2 },
                { title: "Speak", text: "Prepare ideas for real conversation", Icon: MessageCircle }
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
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink md:text-4xl">A better way to turn lessons into practice.</h2>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            { title: "Interactive practice", text: "Move through focused tasks instead of passively reading a PDF.", Icon: PlayCircle },
            { title: "Complete skills", text: "Practice listening, speaking, vocabulary, grammar, reading, and writing together.", Icon: BookOpen },
            { title: "Clear progress", text: "Continue from where you stopped and see how far you have moved through a lesson.", Icon: BarChart3 },
            { title: "Confidence first", text: "Build answers step by step before using English in real conversation.", Icon: Trophy },
            { title: "Personal account", text: "Save your work, revisit lessons, and keep your learning organized.", Icon: UserRound },
            { title: "Practical writing", text: "Finish lessons with notes, reflections, and short writing tasks.", Icon: PenLine }
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
            ["1", "Choose a lesson", "Pick a published topic from your lesson catalog."],
            ["2", "Work through activities", "Listen, answer, discuss, write, and check your understanding."],
            ["3", "Continue anytime", "Your progress is saved so you can return when you are ready."]
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
              <h2 className="text-3xl font-semibold tracking-tight">Ready to practice English in a more active way?</h2>
              <p className="mt-3 max-w-2xl text-white/70">
                Create an account, open your lessons page, and start learning through guided interactive lessons.
              </p>
            </div>
            <Link href="/login" className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-5 py-3 text-sm font-semibold text-ink hover:bg-blue-50">
              Get started <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
