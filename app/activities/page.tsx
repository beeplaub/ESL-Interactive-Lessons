import { BookOpen, ChevronRight, Sparkles } from "lucide-react";
import { LearnerAppShell } from "@/components/LearnerAppShell";
import { LESSON_ACTIVITY_CATALOG } from "@/lib/lessonActivityCatalog";

const skills = [
  { id: "CORE", label: "Core practice" },
  { id: "READING", label: "Reading" },
  { id: "WRITING", label: "Writing" },
  { id: "LISTENING", label: "Listening" },
  { id: "SPEAKING", label: "Speaking" },
] as const;

export default function ActivitiesPage() {
  return (
    <LearnerAppShell active="home">
      <section className="rounded-[24px] bg-[var(--br-dark-card)] p-5 text-on-dark shadow-[var(--br-shadow)] sm:p-7">
        <div className="flex items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--br-action)] text-white"><Sparkles size={21} /></div>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-white/60">Practice Library</p>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Build skill through focused practice.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">Explore short, topic-focused learning modules built from BrenUp’s interactive practice activities.</p>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-[22px] border border-[var(--br-border)] bg-surface p-4 shadow-[var(--br-shadow)] sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--br-border)] pb-4">
          <div><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--br-action)]">Activity collection</p><h2 className="mt-1 text-xl font-extrabold">Choose a skill to practise</h2></div>
          <p className="text-sm font-semibold text-[var(--br-text-muted)]">{LESSON_ACTIVITY_CATALOG.length} practice formats</p>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {skills.map((skill) => <span key={skill.id} className="rounded-full border border-[var(--br-border)] bg-[var(--br-surface-muted)] px-3 py-1.5 text-xs font-extrabold text-[var(--br-text-muted)]">{skill.label}</span>)}
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {LESSON_ACTIVITY_CATALOG.filter((item, index, all) => all.findIndex((candidate) => candidate.label === item.label) === index).map((activity) => <article key={activity.type} className="group rounded-2xl border border-[var(--br-border)] bg-[var(--br-surface)] p-4 transition hover:-translate-y-0.5 hover:border-[var(--br-action)]/50 hover:shadow-md">
            <div className="flex items-start justify-between gap-3"><div className="grid size-9 place-items-center rounded-xl bg-[var(--br-action)]/10 text-[var(--br-action)]"><BookOpen size={17} /></div><ChevronRight size={17} className="text-[var(--br-text-muted)] transition group-hover:translate-x-0.5" /></div>
            <h3 className="mt-4 font-extrabold">{activity.label}</h3><p className="mt-1 text-sm leading-5 text-[var(--br-text-muted)]">{activity.description}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">{activity.skills.slice(0, 2).map((skill) => <span key={skill} className="rounded-full bg-[var(--br-surface-muted)] px-2 py-1 text-[11px] font-bold text-[var(--br-text-muted)]">{skills.find((item) => item.id === skill)?.label ?? skill}</span>)}</div>
          </article>)}
        </div>
      </section>
    </LearnerAppShell>
  );
}
