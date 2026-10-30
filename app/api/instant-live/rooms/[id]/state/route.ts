import { NextResponse } from "next/server";
import { z } from "zod";
import { roomAccess } from "@/lib/instant-live/server";
import { boardSchema, emptyState } from "@/lib/instant-live/types";
import type { SharedState } from "@/lib/instant-live/types";

const commandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("board"),
    board: boardSchema,
    revision: z.number().int().min(0),
  }),
  z.object({
    action: z.literal("claim"),
    stage: z.enum(["screen", "camera", "image"]),
    session: z.string().uuid(),
    assetId: z.string().uuid().optional(),
  }),
  z.object({ action: z.literal("release"), session: z.string().uuid() }),
  z.object({ action: z.literal("show-whiteboard"), session: z.string().uuid() }),
  z.object({ action: z.literal("media-page"), assetId: z.string().uuid(), page: z.number().int().min(1).max(10000) }),
  z.object({ action: z.literal("heartbeat"), session: z.string().uuid() }),
]);
const fail = (error: string, status = 400) =>
  NextResponse.json({ error }, { status });
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const access = await roomAccess(id, false, new URL(request.url).searchParams.get("adminSupport") === "1");
  if (access.error) return access.error;
  const { admin, user, room, creator } = access;
  const { error: initError } = await admin
    .from("instant_live_state")
    .upsert({ room_id: id }, { onConflict: "room_id", ignoreDuplicates: true });
  if (initError)
    return fail(
      "Live classroom update is not ready. Please try again shortly.",
      503,
    );
  const { data, error } = await admin
    .from("instant_live_state")
    .select("*")
    .eq("room_id", id)
    .single();
  if (error) return fail("Could not load the live stage.", 503);
  let state = data as SharedState;
  if (
    room.status === "LIVE" &&
    state.presenter_id &&
    state.lease_until &&
    Date.parse(state.lease_until) < Date.now()
  ) {
    const { data: cleared } = await admin
      .from("instant_live_state")
      .update({
        stage: "whiteboard",
        presenter_id: null,
        presenter_session: null,
        asset_id: null,
        media_page: 1,
        lease_until: null,
        revision: state.revision + 1,
      })
      .eq("room_id", id)
      .eq("revision", state.revision)
      .select("*")
      .maybeSingle();
    if (cleared) state = cleared as SharedState;
  }
  await admin
    .from("instant_live_participants")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("room_id", id)
    .eq("user_id", user.id)
    .eq("status", "JOINED");
  let query = admin
    .from("instant_live_assets")
    .select("id,owner_id,name,width,height,created_at")
    .eq("room_id", id)
    .order("created_at");
  if (!creator) query = query.eq("owner_id", user.id);
  const { data: listedAssets } = await query;
  const assets = [...(listedAssets ?? [])];
  if (!creator && state.asset_id && (state.stage === "image" || state.stage === "whiteboard") && !assets.some(asset => asset.id === state.asset_id)) {
    const { data: projectedAsset } = await admin.from("instant_live_assets")
      .select("id,owner_id,name,width,height,created_at")
      .eq("room_id", id).eq("id", state.asset_id).maybeSingle();
    if (projectedAsset) assets.push(projectedAsset);
  }
  const { data: participants, error: participantsError } = await admin
    .from("instant_live_participants")
    .select("user_id,role,mic_muted,joined_at,last_seen_at")
    .eq("room_id", id)
    .eq("status", "JOINED")
    .gte("last_seen_at", new Date(Date.now() - 90_000).toISOString());
  if (participantsError)
    return fail("Could not load participant settings.", 503);
  const participantIds = [...new Set((participants ?? []).map(({ user_id }) => user_id))];
  const { data: profiles } = participantIds.length
    ? await admin
        .from("profiles")
        .select("id,full_name,first_name,last_name")
        .in("id", participantIds)
    : { data: [] };
  const names = new Map(
    (profiles ?? []).map((profile) => [
      profile.id,
      profile.full_name?.trim() ||
        [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
        "Learner",
    ]),
  );
  let waitingParticipants: { userId: string; name: string; joinedAt: number }[] = [];
  if (creator) {
    const { data: waiting } = await admin.from("instant_live_participants")
      .select("user_id,joined_at").eq("room_id", id).eq("role", "LEARNER").eq("status", "WAITING").order("joined_at");
    const waitingIds = [...new Set((waiting ?? []).map(person => person.user_id))];
    const { data: waitingProfiles } = waitingIds.length
      ? await admin.from("profiles").select("id,full_name,first_name,last_name").in("id", waitingIds)
      : { data: [] };
    const waitingNames = new Map((waitingProfiles ?? []).map(profile => [profile.id, profile.full_name?.trim() || [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Learner"]));
    waitingParticipants = (waiting ?? []).map(person => ({ userId: person.user_id, name: waitingNames.get(person.user_id) ?? "Learner", joinedAt: Date.parse(person.joined_at) }));
  }
  return NextResponse.json(
    {
      state: state ?? emptyState(id),
      assets,
      room,
      participants: (participants ?? []).map((person) => ({
        userId: person.user_id,
        name: names.get(person.user_id) ?? "Learner",
        role: person.role,
        joinedAt: Date.parse(person.joined_at),
        micMuted: person.mic_muted,
      })),
      waitingParticipants,
      moderation: (participants ?? []).map(({ user_id, mic_muted }) => ({
        userId: user_id,
        micMuted: mic_muted,
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
  const { admin, user, creator } = access;
  const text = await request.text();
  if (text.length > 900_000)
    return fail("The board is too large. Remove unused objects.", 413);
  let parsed;
  try {
    parsed = commandSchema.safeParse(JSON.parse(text));
  } catch {
    return fail("Invalid classroom update.");
  }
  if (!parsed.success) return fail("Invalid classroom update.");
  const command = parsed.data;
  if (command.action === "claim" && !creator && command.stage === "screen" && !access.room.learner_screen_share_enabled)
    return fail("The teacher has disabled learner screen sharing.", 403);
  const { data } = await admin
    .from("instant_live_state")
    .select("*")
    .eq("room_id", id)
    .single();
  if (!data)
    return fail("The live stage is not ready. Refresh and try again.", 503);
  const state = data as SharedState;
  if (command.action === "board") {
    if (!creator) return fail("Only the teacher can edit this board.", 403);
    const ids = command.board.flatMap((item) =>
      item.assetId ? [item.assetId] : [],
    );
    if (ids.length) {
      const { data: assets } = await admin
        .from("instant_live_assets")
        .select("id")
        .eq("room_id", id)
        .in("id", ids);
      const valid = new Set(assets?.map((asset) => asset.id));
      if (ids.some((asset) => !valid.has(asset)))
        return fail("An image is not available in this class.");
    }
    const { data: updated, error } = await admin
      .from("instant_live_state")
      .update({
        board: command.board,
        board_revision: state.board_revision + 1,
      })
      .eq("room_id", id)
      .eq("board_revision", command.revision)
      .select("*")
      .maybeSingle();
    if (error) return fail("Could not save the board.", 503);
    if (!updated)
      return fail(
        "The board changed in another window. Refresh before editing again.",
        409,
      );
    return NextResponse.json({ state: updated });
  }
  if (command.action === "show-whiteboard") {
    if (!creator) return fail("Only the teacher can switch to the whiteboard.", 403);
    if (state.stage !== "image" || !state.asset_id || state.presenter_id !== user.id || state.presenter_session !== command.session)
      return fail("The projected media changed. Refresh and try again.", 409);
    const { data: updated } = await admin.from("instant_live_state")
      .update({ stage: "whiteboard", revision: state.revision + 1 })
      .eq("room_id", id).eq("revision", state.revision).select("*").maybeSingle();
    if (!updated) return fail("The classroom stage changed. Try again.", 409);
    return NextResponse.json({ state: updated });
  }
  if (command.action === "media-page") {
    if (!creator) return fail("Only the teacher can change the shared media page.", 403);
    if (state.stage !== "image" || state.asset_id !== command.assetId)
      return fail("That media is no longer on the class stage.", 409);
    const { data: asset } = await admin.from("instant_live_assets")
      .select("name,path").eq("room_id", id).eq("id", command.assetId).maybeSingle();
    if (!asset || !(asset.name.toLowerCase().endsWith(".pdf") || asset.path.toLowerCase().endsWith(".pdf")))
      return fail("Choose a PDF that is currently shared.");
    const { data: updated, error } = await admin.from("instant_live_state")
      .update({ media_page: command.page, revision: state.revision + 1 })
      .eq("room_id", id).eq("revision", state.revision).select("*").maybeSingle();
    if (error) return fail("Could not change the shared PDF page.", 503);
    if (!updated) return fail("The class stage changed. Try again.", 409);
    return NextResponse.json({ state: updated });
  }
  const isOwner =
    state.presenter_id === user.id &&
    state.presenter_session === command.session;
  if (command.action === "heartbeat") {
    if (isOwner)
      await admin
        .from("instant_live_state")
        .update({ lease_until: new Date(Date.now() + 60000).toISOString() })
        .eq("room_id", id)
        .eq("presenter_session", command.session)
        .eq("presenter_id", user.id);
    return NextResponse.json({ ok: true });
  }
  if (command.action === "release") {
    if (!creator && !isOwner)
      return fail("Only the presenter or teacher can stop sharing.", 403);
    const { data: updated } = await admin
      .from("instant_live_state")
      .update({
        stage: "whiteboard",
        asset_id: null,
        media_page: 1,
        presenter_id: null,
        presenter_session: null,
        lease_until: null,
        revision: state.revision + 1,
      })
      .eq("room_id", id)
      .eq("revision", state.revision)
      .select("*")
      .maybeSingle();
    if (!updated) return fail("The presenter changed. Try again.", 409);
    return NextResponse.json({ state: updated });
  }
  // Compare-and-swap below arbitrates simultaneous share requests across devices.
  const occupied =
    state.presenter_id &&
    (!state.lease_until || Date.parse(state.lease_until) > Date.now());
  if (occupied && !isOwner)
    return fail("Someone is presenting. Wait until they stop sharing.", 409);
  if (command.stage === "image") {
    if (!creator)
      return fail(
        "The teacher chooses which gallery image is shown to the class.",
        403,
      );
    const { data: asset } = await admin
      .from("instant_live_assets")
      .select("id")
      .eq("room_id", id)
      .eq("id", command.assetId ?? "")
      .maybeSingle();
    if (!asset) return fail("Choose an image from this class.");
  }
  const { data: updated, error } = await admin
    .from("instant_live_state")
    .update({
      stage: command.stage,
      asset_id: command.stage === "image" ? command.assetId : null,
      media_page: command.stage === "image" && state.asset_id === command.assetId ? state.media_page : 1,
      presenter_id: user.id,
      presenter_session: command.session,
      lease_until: new Date(Date.now() + 60000).toISOString(),
      revision: state.revision + 1,
    })
    .eq("room_id", id)
    .eq("revision", state.revision)
    .select("*")
    .maybeSingle();
  if (error) return fail("Could not start sharing.", 503);
  if (!updated)
    return fail("Someone else started sharing. Please try later.", 409);
  return NextResponse.json({ state: updated });
}
