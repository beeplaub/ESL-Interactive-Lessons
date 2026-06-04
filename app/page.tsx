import Link from "next/link";
import { ArrowRight, BookOpen, Headphones, MessageCircle, PenLine, Sparkles } from "lucide-react";

export default function HomePage() {
  return (
    <main>
      <section className="border-b border-black/10 bg-skywash">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-[1.05fr_0.95fr] md:items-center md:py-20">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-moss">BrenUp</p>
            <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-ink md:text-6xl">
              Build confident English with interactive lessons.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-black/70">
              Practice speaking, listening, vocabulary, grammar, and writing through guided lessons made for real-world communication.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className="inline-flex items-center gap-2 rounded-md bg-moss px-5 py-3 text-sm font-medium text-white shadow-sm hover:bg-blue-700">
                Start learning <ArrowRight size={16} />
              </Link>
              <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-md border border-black/15 bg-white px-5 py-3 text-sm font-medium hover:bg-black/5">
                View lessons
              </Link>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm">
            <div className="bg-ink px-5 py-4 text-white">
              <p className="text-sm text-white/70">Today&apos;s interactive class</p>
              <h2 className="mt-1 text-2xl font-semibold">Real English, step by step</h2>
            </div>
            <div className="grid gap-3 p-5">
              {[
                { title: "Warm up", text: "Talk about real-life experiences", Icon: MessageCircle },
                { title: "Listening", text: "Catch meaning, tone, and detail", Icon: Headphones },
                { title: "Vocabulary", text: "Use phrases in your own examples", Icon: BookOpen },
                { title: "Writing", text: "Finish with a short practical task", Icon: PenLine }
              ].map(({ title, text, Icon }) => (
                <div key={title} className="flex items-center gap-4 rounded-md bg-black/[0.03] p-4">
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

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-10 md:grid-cols-3">
        {[
          ["Interactive practice", "Move through focused tasks instead of passive PDF pages."],
          ["Real communication", "Speaking, listening, vocabulary, grammar, and writing stay connected."],
          ["Clear progress", "Continue from where you stopped and build steady momentum."]
        ].map(([title, text]) => (
          <div key={title} className="rounded-lg border border-black/10 bg-white p-5 shadow-sm">
            <Sparkles className="text-moss" size={20} />
            <h2 className="mt-4 text-lg font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-black/65">{text}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
