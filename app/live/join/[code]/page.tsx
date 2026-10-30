import { redirect } from "next/navigation";
import { LiveClassCodeJoin } from "@/components/LiveClassCodeJoin";
import { createClient } from "@/lib/supabase/server";

export default async function InstantLiveJoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (normalized.length !== 12) redirect("/live-classes");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/live/join/${normalized}`)}`);
  return <main className="grid min-h-screen place-items-center bg-[#0d1421] px-4 py-8 text-white"><div className="w-full max-w-xl"><p className="mb-3 text-xs font-bold uppercase tracking-[.18em] text-white/55">BrenUp · Live classroom</p><LiveClassCodeJoin initialCode={normalized} /></div></main>;
}
