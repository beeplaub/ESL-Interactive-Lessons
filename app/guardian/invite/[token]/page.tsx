import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { acceptGuardianInvitation } from "@/app/guardian/actions";

export default async function GuardianInvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <main className="mx-auto grid min-h-screen max-w-lg place-items-center px-4"><section className="w-full rounded-3xl border border-black/10 bg-white p-7 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-violetglow">BrenUp guardian access</p><h1 className="mt-2 text-2xl font-extrabold text-ink">Sign in to view learner progress</h1><p className="mt-3 text-sm leading-6 text-slate-600">Use the email address that received this invitation. You will only be able to view the linked learner’s progress.</p><Link href={`/login?next=/guardian/invite/${token}`} className="mt-6 inline-flex rounded-xl bg-violetglow px-4 py-3 text-sm font-bold text-white">Sign in or create account</Link></section></main>;
  return <main className="mx-auto grid min-h-screen max-w-lg place-items-center px-4"><section className="w-full rounded-3xl border border-black/10 bg-white p-7 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-violetglow">BrenUp guardian access</p><h1 className="mt-2 text-2xl font-extrabold text-ink">Confirm learner access</h1><p className="mt-3 text-sm leading-6 text-slate-600">This will link your account to one learner. You can view their learning activity, assignments, course progress, and next steps. You cannot edit their work.</p><form action={acceptGuardianInvitation.bind(null, token)}><button className="mt-6 rounded-xl bg-violetglow px-4 py-3 text-sm font-bold text-white">Confirm access</button></form></section></main>;
}
