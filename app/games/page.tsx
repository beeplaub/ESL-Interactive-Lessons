import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Gamepad2, KeyRound, Map, MoveUpRight } from "lucide-react";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Games | BrenUp",
  description: "Practice English sounds through BrenUp learning games.",
};

const games = [
  {
    href: "/ipa-quest",
    name: "Echo Vault",
    subtitle: "IPA Sound Quest",
    description: "Decode sound clues, rebuild phonemic transcriptions, and unlock the Echo Vault map.",
    icon: KeyRound,
    accent: "from-violet-500 to-indigo-700",
    tag: "3 zones · 9 challenges",
  },
  {
    href: "/ipa-snakes-and-ladders",
    name: "IPA Snakes and Ladders",
    subtitle: "Sound trail",
    description: "Answer one IPA question each turn. Its hidden 1–5 point value moves your explorer up ladders and down snakes.",
    icon: Map,
    accent: "from-sky-500 via-violet-500 to-amber-400",
    tag: "100-square board · 1 question per turn",
  },
];

export default async function GamesPage() {
  await requireUser();

  return (
    <LearnerAppShell active="games" showRightSidebar={false}>
      <section className="mx-auto grid w-full max-w-5xl gap-6">
        <header className="overflow-hidden rounded-[28px] bg-gradient-to-br from-[var(--br-brand-strong)] via-[#34256e] to-[#101a38] p-6 text-white shadow-[var(--br-shadow)] sm:p-8">
          <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.18em] text-white/70"><Gamepad2 size={16} /> BrenUp Games</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Learn by playing</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">Choose a game and turn English sound practice into an expedition.</p>
        </header>
        <div className="grid gap-4 md:grid-cols-2">
          {games.map((game) => {
            const Icon = game.icon;
            return (
              <article key={game.href} className="flex min-h-[300px] flex-col overflow-hidden rounded-[24px] border border-[var(--br-border)] bg-[var(--br-surface)] shadow-[var(--br-shadow)]">
                <div className={`relative grid h-32 place-items-center bg-gradient-to-br ${game.accent} text-white`}>
                  <span className="absolute -right-5 -top-10 size-40 rounded-full border-[20px] border-white/10" aria-hidden="true" />
                  <Icon size={48} strokeWidth={1.8} aria-hidden="true" />
                </div>
                <div className="flex flex-1 flex-col p-5 sm:p-6">
                  <p className="text-xs font-extrabold uppercase tracking-[.14em] text-[var(--br-chart-primary)]">{game.subtitle}</p>
                  <h2 className="mt-1 text-xl font-black tracking-tight">{game.name}</h2>
                  <p className="mt-2 flex-1 text-sm leading-6 text-[var(--br-text-muted)]">{game.description}</p>
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs font-bold text-[var(--br-text-muted)]">{game.tag}</span>
                    <Link href={game.href} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--br-action-strong)] px-4 text-sm font-extrabold text-white transition hover:brightness-110">
                      Play game <ArrowRight size={16} /><MoveUpRight size={14} className="opacity-70" />
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </LearnerAppShell>
  );
}
