import Link from "next/link";
import { AudioLines, ArrowRight, Clapperboard, ImageIcon, Link2, MessageCircle, Sparkles, Subtitles } from "lucide-react";
import { requireStaff } from "@/lib/auth";

export default async function CreatorToolsPage() {
  await requireStaff();
  return (
    <main className="min-w-0 space-y-5 pb-12">
      <section className="overflow-hidden rounded-2xl border border-[var(--br-border)] bg-dark p-5 text-on-dark shadow-lg sm:p-7">
        <div className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10"><Sparkles size={22} /></span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/55">Creator Tools</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Turn ideas into reusable teaching media</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">Generate, review, and save production-ready assets without leaving BrenUp. Nothing becomes permanent until you approve it.</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Link href="/admin/creator-tools/reels" className="group rounded-2xl border border-[var(--br-border)] bg-surface p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-start justify-between gap-4">
            <span className="grid size-11 place-items-center rounded-xl bg-[var(--br-brand)]/10 text-[var(--br-brand)]"><Clapperboard size={22} /></span>
            <span className="rounded-full bg-[var(--br-success)]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--br-success)]">Local engine</span>
          </div>
          <h2 className="mt-5 text-lg font-semibold">Reel Machine</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--br-text-muted)]">Turn ideas into faceless reels with editable scripts, illustrated backgrounds, on-screen text, and narration.</p>
          <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--br-brand)]">Create reels <ArrowRight size={15} className="transition group-hover:translate-x-1" /></span>
        </Link>
        <Link href="/admin/creator-tools/voiceover" className="group rounded-2xl border border-[var(--br-border)] bg-surface p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-start justify-between gap-4">
            <span className="grid size-11 place-items-center rounded-xl bg-[var(--br-brand)]/10 text-[var(--br-brand)]"><AudioLines size={22} /></span>
            <span className="rounded-full bg-[var(--br-success)]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--br-success)]">Available</span>
          </div>
          <h2 className="mt-5 text-lg font-semibold">AI Voiceover Studio</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--br-text-muted)]">Turn a script into styled narration, preview it, then save it permanently to your Media Library.</p>
          <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--br-brand)]">Open studio <ArrowRight size={15} className="transition group-hover:translate-x-1" /></span>
        </Link>

        <Link href="/admin/creator-tools/conversation" className="group rounded-2xl border border-[var(--br-border)] bg-surface p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-start justify-between gap-4"><span className="grid size-11 place-items-center rounded-xl bg-[var(--br-action)]/10 text-[var(--br-action)]"><MessageCircle size={22} /></span><span className="rounded-full bg-[var(--br-success)]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--br-success)]">Available</span></div>
          <h2 className="mt-5 text-lg font-semibold">AI Conversation Studio</h2><p className="mt-2 text-sm leading-6 text-[var(--br-text-muted)]">Give each speaker a voice, turn a script into one polished conversation, and save the compact audio to your Media Library.</p><span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--br-action)]">Open studio <ArrowRight size={15} className="transition group-hover:translate-x-1" /></span>
        </Link>

        <Link href="/admin/creator-tools/qr-code" className="group rounded-2xl border border-[var(--br-border)] bg-surface p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-start justify-between gap-4"><span className="grid size-11 place-items-center rounded-xl bg-[var(--br-action)]/10 text-[var(--br-action)]"><Link2 size={22} /></span><span className="rounded-full bg-[var(--br-success)]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--br-success)]">Free</span></div>
          <h2 className="mt-5 text-lg font-semibold">Audio QR Code Maker</h2><p className="mt-2 text-sm leading-6 text-[var(--br-text-muted)]">Turn any public audio link into a downloadable QR code for worksheets and classroom materials.</p><span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--br-action)]">Make a QR code <ArrowRight size={15} className="transition group-hover:translate-x-1" /></span>
        </Link>

        <ToolPlaceholder icon={Subtitles} title="Transcript & captions" description="Generate accessible transcripts and timed captions from creator audio." />
        <ToolPlaceholder icon={ImageIcon} title="Visual studio" description="Create lesson thumbnails, image prompts, and accessible alt text." />
      </section>
    </main>
  );
}

function ToolPlaceholder({ icon: Icon, title, description }: { icon: typeof AudioLines; title: string; description: string }) {
  return (
    <article className="rounded-2xl border border-dashed border-[var(--br-border)] bg-surface-muted/60 p-5 opacity-75">
      <div className="flex items-start justify-between gap-4">
        <span className="grid size-11 place-items-center rounded-xl bg-surface text-[var(--br-text-muted)]"><Icon size={22} /></span>
        <span className="rounded-full border border-[var(--br-border)] bg-surface px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--br-text-muted)]">Planned</span>
      </div>
      <h2 className="mt-5 text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[var(--br-text-muted)]">{description}</p>
    </article>
  );
}
