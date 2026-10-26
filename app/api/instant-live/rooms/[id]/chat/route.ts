import { NextResponse } from "next/server";
import { z } from "zod";
import { roomAccess } from "@/lib/instant-live/server";

const messageSchema = z.object({ body: z.string().trim().min(1).max(2000) });

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const access = await roomAccess(id);
  if (access.error) return access.error;

  const { data, error } = await access.admin
    .from("instant_live_chat_messages")
    .select("id,user_id,body,created_at")
    .eq("room_id", id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error)
    return NextResponse.json(
      { error: "Could not load class chat." },
      { status: 503 },
    );

  const messages = data ?? [];
  const userIds = [...new Set(messages.map((message) => message.user_id))];
  const { data: profiles } = userIds.length
    ? await access.admin
        .from("profiles")
        .select("id,full_name,first_name,last_name")
        .in("id", userIds)
    : { data: [] };
  const names = new Map(
    (profiles ?? []).map((profile) => [
      profile.id,
      profile.full_name ||
        [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
        "Learner",
    ]),
  );
  return NextResponse.json(
    {
      messages: messages.reverse().map((message) => ({
        id: message.id,
        userId: message.user_id,
        name: names.get(message.user_id) ?? "Learner",
        body: message.body,
        createdAt: message.created_at,
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const access = await roomAccess(id, true);
  if (access.error) return access.error;

  const text = await request.text();
  if (text.length > 10000)
    return NextResponse.json({ error: "Message is too long." }, { status: 413 });
  let parsed;
  try {
    parsed = messageSchema.safeParse(JSON.parse(text));
  } catch {
    return NextResponse.json({ error: "Invalid chat message." }, { status: 400 });
  }
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid chat message." }, { status: 400 });

  const { data: inserted, error } = await access.admin
    .from("instant_live_chat_messages")
    .insert({ room_id: id, user_id: access.user.id, body: parsed.data.body })
    .select("id,user_id,body,created_at")
    .single();
  if (error)
    return NextResponse.json(
      { error: "Could not save chat message." },
      { status: 503 },
    );

  const { data: profile } = await access.admin
    .from("profiles")
    .select("full_name,first_name,last_name")
    .eq("id", access.user.id)
    .maybeSingle();
  return NextResponse.json({
    message: {
      id: inserted.id,
      userId: inserted.user_id,
      name:
        profile?.full_name ||
        [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
        "Learner",
      body: inserted.body,
      createdAt: inserted.created_at,
    },
  });
}
