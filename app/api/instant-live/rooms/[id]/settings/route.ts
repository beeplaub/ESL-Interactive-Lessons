import { NextResponse } from "next/server";
import { z } from "zod";
import { roomAccess } from "@/lib/instant-live/server";

const settingsSchema = z.object({
  room_locked: z.boolean().optional(),
  learner_mic_enabled: z.boolean().optional(),
  learner_chat_enabled: z.boolean().optional(),
  learner_screen_share_enabled: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const access = await roomAccess(id, true);
  if (access.error) return access.error;
  if (!access.creator) return NextResponse.json({ error: "Only the teacher can change room settings." }, { status: 403 });
  let parsed;
  try { parsed = settingsSchema.safeParse(await request.json()); }
  catch { return NextResponse.json({ error: "Invalid room settings." }, { status: 400 }); }
  if (!parsed.success) return NextResponse.json({ error: "Invalid room settings." }, { status: 400 });
  const { data, error } = await access.admin.from("instant_live_rooms")
    .update(parsed.data).eq("id", id).eq("creator_id", access.user.id)
    .select("room_locked,learner_mic_enabled,learner_chat_enabled,learner_screen_share_enabled").single();
  if (error || !data) return NextResponse.json({ error: "Could not save room settings." }, { status: 503 });
  if (parsed.data.room_locked === false) {
    const activeSince = new Date(Date.now() - 90_000).toISOString();
    const [{ count }, { data: waiting }] = await Promise.all([
      access.admin.from("instant_live_participants").select("id", { count: "exact", head: true }).eq("room_id", id).eq("role", "LEARNER").eq("status", "JOINED").gte("last_seen_at", activeSince),
      access.admin.from("instant_live_participants").select("user_id").eq("room_id", id).eq("role", "LEARNER").eq("status", "WAITING").order("joined_at"),
    ]);
    const admitted = (waiting ?? []).slice(0, Math.max(0, access.room.max_learners - (count ?? 0))).map(person => person.user_id);
    if (admitted.length) await access.admin.from("instant_live_participants").update({ status: "JOINED", joined_at: new Date().toISOString(), left_at: null, last_seen_at: new Date().toISOString() }).eq("room_id", id).eq("status", "WAITING").in("user_id", admitted);
  }
  return NextResponse.json({ settings: data }, { headers: { "Cache-Control": "private, no-store" } });
}
