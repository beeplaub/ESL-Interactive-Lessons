import { NextResponse } from "next/server";
import { z } from "zod";
import { roomAccess } from "@/lib/instant-live/server";

const actionSchema = z.object({
  action: z.enum(["mute", "unmute", "remove"]),
  userId: z.string().uuid(),
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
  if (!parsed.success || parsed.data.userId === access.user.id)
    return NextResponse.json({ error: "Choose a learner to manage." }, { status: 400 });

  const { action, userId } = parsed.data;
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
