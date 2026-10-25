import { redirect } from "next/navigation";

export default async function InstantLiveJoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (normalized.length !== 12) redirect("/account");
  const { data: room } = await (await import("@/lib/supabase/admin")).createAdminClient().from("instant_live_rooms").select("id,join_code").eq("join_code", `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}-${normalized.slice(8, 12)}`).maybeSingle();
  if (!room) redirect("/account");
  redirect(`/live/instant/${room.id}`);
}
