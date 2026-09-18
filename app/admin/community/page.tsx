import Link from "next/link";
import { ArrowRight, Flag, Mic2, MessagesSquare, UsersRound } from "lucide-react";
import { requireStaff } from "@/lib/auth";

export default async function AdminCommunityPage() {
  await requireStaff();
  return (
    <main className="min-w-0 pb-12">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--br-action)]">Teach together</p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-3xl font-extrabold tracking-tight">Community</h1><p className="mt-2 max-w-2xl text-sm text-[var(--br-text-muted)]">Create guided speaking activities, support learner circles, and keep peer practice safe.</p></div>
        <Link href="/admin/community/activities" className="inline-flex items-center gap-2 rounded-xl bg-[var(--br-action)] px-4 py-2.5 text-sm font-extrabold text-on-dark"><Mic2 size={16} /> Create activity</Link>
      </div>
      <section className="mt-7 grid gap-4 md:grid-cols-3">
        <Link href="/admin/community/activities" className="group rounded-2xl border border-[var(--br-border)] bg-surface p-5 shadow-sm transition hover:-translate-y-0.5"><Mic2 className="text-[var(--br-action)]" size={22}/><h2 className="mt-4 font-extrabold">Practice activities</h2><p className="mt-2 text-sm text-[var(--br-text-muted)]">Publish Speak &amp; Share prompts for your course circles.</p><span className="mt-4 inline-flex items-center gap-1 text-xs font-extrabold text-[var(--br-action)]">Open activities <ArrowRight size={14}/></span></Link>
        <Link href="/community" className="group rounded-2xl border border-[var(--br-border)] bg-surface p-5 shadow-sm transition hover:-translate-y-0.5"><UsersRound className="text-[var(--br-action)]" size={22}/><h2 className="mt-4 font-extrabold">Learner community</h2><p className="mt-2 text-sm text-[var(--br-text-muted)]">Open the learner feed to see circles, replies, and practice threads.</p><span className="mt-4 inline-flex items-center gap-1 text-xs font-extrabold text-[var(--br-action)]">View community <ArrowRight size={14}/></span></Link>
        <Link href="/admin/community/reports" className="group rounded-2xl border border-[var(--br-border)] bg-surface p-5 shadow-sm transition hover:-translate-y-0.5"><Flag className="text-[var(--br-action)]" size={22}/><h2 className="mt-4 font-extrabold">Safety reports</h2><p className="mt-2 text-sm text-[var(--br-text-muted)]">Review learner reports and resolve community issues.</p><span className="mt-4 inline-flex items-center gap-1 text-xs font-extrabold text-[var(--br-action)]">Open reports <ArrowRight size={14}/></span></Link>
      </section>
      <section className="mt-6 rounded-2xl bg-[var(--br-dark-card)] p-6 text-on-dark"><div className="flex items-center gap-3"><MessagesSquare size={20}/><h2 className="font-extrabold">A simple creator loop</h2></div><p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">Create a prompt, publish it to a circle, then let learners practice privately and share their response in one thread.</p></section>
    </main>
  );
}
