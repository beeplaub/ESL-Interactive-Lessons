import { NextResponse } from "next/server";
import { roomAccess } from "@/lib/instant-live/server";
import { boardSchema } from "@/lib/instant-live/types";
import { cleanupAndMarkInstantLiveRoom } from "@/lib/instant-live/cleanupMedia";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const access = await roomAccess(id);
  if (access.error) return access.error;
  const { admin, room, creator } = access;
  if (!creator)
    return NextResponse.json(
      { error: "Only the creator can manage this class." },
      { status: 403 },
    );
  const body = await request.json().catch(() => ({}));
  const action = body?.action;
  if ((action === "pause" || action === "quit") && body?.board !== undefined) {
    const parsedBoard = boardSchema.safeParse(body.board);
    if (!parsedBoard.success)
      return NextResponse.json({ error: "The whiteboard data could not be saved." }, { status: 400 });
    const { data: savedState, error: boardError } = await admin
      .from("instant_live_state")
      .select("board_revision")
      .eq("room_id", id)
      .maybeSingle();
    if (boardError) return NextResponse.json({ error: "Could not save the whiteboard before pausing." }, { status: 503 });
    if (savedState) {
      const { error } = await admin
        .from("instant_live_state")
        .update({ board: parsedBoard.data, board_revision: savedState.board_revision + 1 })
        .eq("room_id", id)
        .eq("board_revision", savedState.board_revision);
      if (error) return NextResponse.json({ error: "Could not save the whiteboard before pausing." }, { status: 503 });
    }
  }
  if (action === "heartbeat") {
    if (room.status === "LIVE") {
      const { error } = await admin
        .from("instant_live_rooms")
        .update({ creator_last_seen_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "LIVE");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, status: room.status });
  }
  if (action !== "pause" && action !== "restart" && action !== "quit")
    return NextResponse.json(
      { error: "Choose pause, restart, or quit." },
      { status: 400 },
    );

  if (action === "restart") {
    if (room.status !== "PAUSED" || Date.parse(room.pause_until ?? "") <= Date.now())
      return NextResponse.json(
        { error: "This class can no longer be restarted." },
        { status: 410 },
      );
    const activeStartedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const { data, error } = await admin
      .from("instant_live_rooms")
      .update({
        status: "LIVE",
        ended_at: null,
        pause_until: null,
        active_started_at: activeStartedAt,
        expires_at: expiresAt,
        creator_last_seen_at: activeStartedAt,
      })
      .eq("id", id)
      .eq("status", "PAUSED")
      .gt("pause_until", new Date().toISOString())
      .select("id")
      .maybeSingle();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data)
      return NextResponse.json(
        { error: "This class changed state. Refresh and try again." },
        { status: 409 },
      );
    await admin
      .from("instant_live_state")
      .update({ lease_until: new Date(Date.now() + 60000).toISOString() })
      .eq("room_id", id)
      .not("presenter_id", "is", null);
    return NextResponse.json({
      ok: true,
      status: "LIVE",
      elapsedSeconds: room.elapsed_seconds ?? 0,
      activeStartedAt,
      pauseUntil: null,
    });
  }

  if (action === "pause" && room.status !== "LIVE")
    return NextResponse.json({ ok: true, status: room.status, elapsedSeconds: room.elapsed_seconds ?? 0, pauseUntil: room.pause_until ?? null });
  if (action === "quit" && room.status === "ENDED") {
    const cleanup = await cleanupAndMarkInstantLiveRoom(admin, id);
    return NextResponse.json({ ok: true, status: "ENDED", elapsedSeconds: room.elapsed_seconds ?? 0, mediaCleanupPending: !cleanup.complete });
  }
  const now = Date.now();
  const elapsedSeconds = (room.elapsed_seconds ?? 0) + (room.status === "LIVE"
    ? Math.max(0, Math.floor((now - new Date(room.active_started_at).getTime()) / 1000))
    : 0);
  const changedAt = new Date(now).toISOString();
  const pauseUntil = action === "pause" ? new Date(now + 15 * 60_000).toISOString() : null;
  const { data, error } = await admin
    .from("instant_live_rooms")
    .update({
      status: action === "pause" ? "PAUSED" : "ENDED",
      ended_at: changedAt,
      pause_until: pauseUntil,
      expires_at: pauseUntil ?? room.expires_at,
      elapsed_seconds: elapsedSeconds,
    })
    .eq("id", id)
    .eq("status", room.status)
    .select("id")
    .maybeSingle();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)
    return NextResponse.json(
      { error: "This class changed state. Refresh and try again." },
      { status: 409 },
    );
  let mediaCleanupPending = false;
  if (action === "quit") {
    const cleanup = await cleanupAndMarkInstantLiveRoom(admin, id);
    mediaCleanupPending = !cleanup.complete;
  }
  return NextResponse.json({ ok: true, status: action === "pause" ? "PAUSED" : "ENDED", elapsedSeconds, pauseUntil, mediaCleanupPending });
}
