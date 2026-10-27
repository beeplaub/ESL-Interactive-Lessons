import { NextResponse } from "next/server";
import { z } from "zod";
import { roomAccess } from "@/lib/instant-live/server";

const actionSchema = z.object({
  action: z.enum(["mute", "unmute", "remove", "allow", "deny", "allow_all"]),
  userId: z.string().uuid().optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const access = await roomAccess(id, true);
  if (access.error) return access.error;
  if (!access.creator)
    return NextResponse.json(
      { error: "Only the teacher can manage participants." },
      { status: 403 },
    );

  let parsed;
  try {
    parsed = actionSchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }
  if (!parsed.success || (parsed.data.action !== "allow_all" && (!parsed.data.userId || parsed.data.userId === access.user.id)))
    return NextResponse.json({ error: "Choose a learner to manage." }, { status: 400 });

  const { action, userId } = parsed.data;
  if (action === "allow_all") {
    const { count } = await access.admin.from("instant_live_participants").select("id", { count: "exact", head: true }).eq("room_id", id).eq("role", "LEARNER").eq("status", "JOINED").gte("last_seen_at", new Date(Date.now() - 90_000).toISOString());
    const { data: waiting, error } = await access.admin.from("instant_live_participants").select("user_id").eq("room_id", id).eq("role", "LEARNER").eq("status", "WAITING").order("joined_at");
    if (error) return NextResponse.json({ error: "Could not load the waiting list." }, { status: 503 });
    const slots = Math.max(0, access.room.max_learners - (count ?? 0));
    const admitted = (waiting ?? []).slice(0, slots).map(person => person.user_id);
    if (admitted.length) {
      const { error: updateError } = await access.admin.from("instant_live_participants").update({ status: "JOINED", joined_at: new Date().toISOString(), left_at: null, last_seen_at: new Date().toISOString() }).eq("room_id", id).eq("status", "WAITING").in("user_id", admitted);
      if (updateError) return NextResponse.json({ error: "Could not admit the waiting learners." }, { status: 503 });
    }
    return NextResponse.json({ admitted: admitted.length, remaining: (waiting ?? []).length - admitted.length });
  }
  if (!userId) return NextResponse.json({ error: "Choose a learner to manage." }, { status: 400 });
  if (action === "allow" || action === "deny") {
    const query = access.admin.from("instant_live_participants").update(action === "allow" ? { status: "JOINED", joined_at: new Date().toISOString(), left_at: null, last_seen_at: new Date().toISOString() } : { status: "REMOVED", left_at: new Date().toISOString(), mic_muted: true }).eq("room_id", id).eq("user_id", userId).eq("role", "LEARNER").eq("status", "WAITING");
    if (action === "allow") {
      const { count } = await access.admin.from("instant_live_participants").select("id", { count: "exact", head: true }).eq("room_id", id).eq("role", "LEARNER").eq("status", "JOINED").gte("last_seen_at", new Date(Date.now() - 90_000).toISOString());
      if ((count ?? 0) >= access.room.max_learners) return NextResponse.json({ error: "The classroom is full." }, { status: 409 });
    }
    const { data, error } = await query.select("user_id,status").maybeSingle();
    if (error || !data) return NextResponse.json({ error: "That learner is no longer waiting." }, { status: 409 });
    return NextResponse.json({ participant: data });
  }
  const query = access.admin
    .from("instant_live_participants")
    .update(
      action === "remove"
        ? {
            status: "REMOVED",
            left_at: new Date().toISOString(),
            mic_muted: true,
          }
        : { mic_muted: action === "mute" },
    )
    .eq("room_id", id)
    .eq("user_id", userId)
    .eq("role", "LEARNER")
    .eq("status", "JOINED");
  const { data, error } = await query
    .select("user_id,status,mic_muted")
    .maybeSingle();
  if (error)
    return NextResponse.json(
      { error: "Could not update learner access." },
      { status: 503 },
    );
  if (!data)
    return NextResponse.json(
      { error: "That learner is no longer in the class." },
      { status: 409 },
    );
  return NextResponse.json({ participant: data });
}
