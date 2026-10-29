import type { createAdminClient } from "@/lib/supabase/admin";
import { deleteMediaObject } from "@/lib/storage/mediaStorage";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Idempotently removes uploaded room media and its gallery records. */
export async function cleanupInstantLiveRoomMedia(admin: AdminClient, roomId: string) {
  const { data: assets, error } = await admin
    .from("instant_live_assets")
    .select("id,bucket,path")
    .eq("room_id", roomId);
  if (error) return { complete: false, removed: 0 };

  let removed = 0;
  let failed = false;
  const roomAssets = assets ?? [];
  for (let start = 0; start < roomAssets.length; start += 6) {
    const batch = await Promise.all(roomAssets.slice(start, start + 6).map(async asset => {
      try {
        if (asset.bucket !== "external") {
          await deleteMediaObject(admin, {
            provider: asset.bucket === "lessons" ? "supabase" : "r2",
            bucket: asset.bucket,
            path: asset.path,
          });
        }
        const { error: deleteError } = await admin
          .from("instant_live_assets")
          .delete()
          .eq("room_id", roomId)
          .eq("id", asset.id);
        if (deleteError) throw deleteError;
        return true;
      } catch {
        console.error("Instant live media cleanup will retry for room", roomId);
        return false;
      }
    }));
    removed += batch.filter(Boolean).length;
    if (batch.some(success => !success)) failed = true;
  }

  if (failed) {
    return { complete: false, removed };
  }

  const { data: state, error: stateReadError } = await admin
    .from("instant_live_state")
    .select("board_revision")
    .eq("room_id", roomId)
    .maybeSingle();
  if (stateReadError) return { complete: false, removed };
  if (!state) return { complete: true, removed };

  const { data: clearedState, error: stateError } = await admin
    .from("instant_live_state")
    .update({ board: [], board_revision: state.board_revision + 1, stage: "whiteboard", asset_id: null, content: null, presenter_id: null, presenter_session: null, lease_until: null })
    .eq("room_id", roomId)
    .eq("board_revision", state.board_revision)
    .select("room_id")
    .maybeSingle();
  return { complete: !stateError && Boolean(clearedState), removed };
}

export async function cleanupAndMarkInstantLiveRoom(admin: AdminClient, roomId: string) {
  const result = await cleanupInstantLiveRoomMedia(admin, roomId);
  const { error } = await admin
    .from("instant_live_rooms")
    .update({
      media_cleanup_attempted_at: new Date().toISOString(),
      ...(result.complete ? { media_cleanup_at: new Date().toISOString() } : {}),
    })
    .eq("id", roomId)
    .eq("status", "ENDED");
  return { ...result, complete: result.complete && !error };
}
