import Link from "next/link";
import { ArrowLeft, Radio } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { InstantLiveStartForm } from "@/components/InstantLiveStartForm";

export default async function InstantLiveClassPage() {
  await requireStaff();
  return <main className="min-w-0 space-y-5 pb-12"><Link href="/admin/creator-tools" className="inline-flex items-center gap-2 text-sm font-bold text-[var(--br-brand)]"><ArrowLeft size={16} /> Creator Tools</Link><section className="rounded-2xl bg-dark p-5 text-on-dark shadow-lg sm:p-7"><div className="flex items-start gap-4"><span className="grid size-12 place-items-center rounded-2xl bg-white/10"><Radio size={24} /></span><div><p className="text-xs font-bold uppercase tracking-[.16em] text-white/55">Creator Tools</p><h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">Instant Live Class</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/70">A temporary audio-first classroom with screen sharing, whiteboard, image sharing, and chat. No camera and no recording.</p></div></div></section><div className="grid max-w-3xl gap-4 lg:grid-cols-[minmax(0,1fr)_300px]"><InstantLiveStartForm /><aside className="rounded-2xl border border-[var(--br-border)] bg-[var(--br-surface-muted)] p-5"><p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--br-brand)]">Pilot limits</p><ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--br-text-muted)]"><li>Up to 10 learners</li><li>Two-hour room expiry</li><li>Audio only — no camera</li><li>Direct WebRTC media</li><li>Room link becomes inactive when ended</li></ul></aside></div></main>;
}
