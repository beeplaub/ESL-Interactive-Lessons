import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Gamepad2, KeyRound, Map, MoveUpRight } from "lucide-react";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { LearnerResumeHero } from "@/components/LearnerResumeHero";
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
    tag: "3 zones · 9 challenges",
  },
  {
    href: "/ipa-snakes-and-ladders",
    name: "IPA Snakes and Ladders",
    subtitle: "Sound trail",
    description: "Answer one IPA question each turn. Its hidden 1–5 point value moves your explorer up ladders and down snakes.",
    icon: Map,
    tag: "100-square board · 1 question per turn",
  },
];

export default async function GamesPage() {
  await requireUser();

  return (
    <LearnerAppShell active="games" showRightSidebar={false}>
        <LearnerResumeHero eyebrow="ENGLISH GAMES" headingLevel="h1" title="Practice English by playing." description="Choose a game, build your skills, and enjoy the challenge.">
          <Link href="#game-library" className="inline-flex items-center gap-2 rounded-xl bg-[var(--br-action)] px-5 py-3 text-sm font-bold text-on-dark transition hover:bg-[var(--br-action-strong)]">Browse games <ArrowRight className="size-4" /></Link>
          <Link href="/ipa-quest" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-bold text-on-dark transition hover:bg-white/15">Play Echo Vault <ArrowRight className="size-4" /></Link>
        </LearnerResumeHero>
        <div id="game-library" className="scroll-mt-6 grid w-full gap-4 md:grid-cols-2">
          {games.map((game) => {
            const Icon = game.icon;
            return (
              <article key={game.href} className="group flex min-h-[270px] flex-col rounded-[22px] border border-[var(--br-surface-strong)] bg-[var(--br-surface)] p-5 shadow-[0_8px_24px_rgba(37,35,72,0.07)] transition duration-200 hover:-translate-y-1 hover:border-[var(--br-brand-soft)] hover:shadow-[0_16px_34px_rgba(37,35,72,0.12)] sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <span className="grid size-12 place-items-center rounded-2xl border border-[var(--br-surface-strong)] bg-white text-[var(--br-chart-primary)] transition group-hover:scale-105"><Icon size={23} strokeWidth={2} aria-hidden="true" /></span>
                  <span className="rounded-xl border border-[var(--br-surface-strong)] bg-white px-3 py-1.5 text-[11px] font-bold text-[var(--br-chart-primary)]">{game.tag}</span>
                </div>
                <div className="mt-6 flex flex-1 flex-col">
                  <p className="text-[11px] font-extrabold uppercase tracking-[.14em] text-[var(--br-chart-primary)]">{game.subtitle}</p>
                  <h2 className="mt-1 text-xl font-black tracking-tight text-[var(--br-dark-card)]">{game.name}</h2>
                  <p className="mt-2 flex-1 text-sm leading-6 text-[var(--br-text-muted)]">{game.description}</p>
                  <Link href={game.href} className="mt-5 inline-flex min-h-11 w-fit items-center gap-2 rounded-xl bg-[var(--br-action)] px-4 text-sm font-extrabold text-on-dark transition hover:bg-[var(--br-action-strong)]">
                    Play game <ArrowRight size={16} /><MoveUpRight size={14} className="opacity-70" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
    </LearnerAppShell>
  );
}
