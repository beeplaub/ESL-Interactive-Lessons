import { reelBatchSchema } from "@/lib/reels";
import { reelAccess, reelBatches, reelBody, reelEngineStatus, reelError, ReelHttpError, startReelBatch } from "@/lib/reels-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { user } = await reelAccess();
    const [engine, batches] = await Promise.all([reelEngineStatus(), reelBatches(user.id)]);
    return Response.json({ engine, batches }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return reelError(error); }
}
export async function POST(request: Request) {
  try {
    const { user } = await reelAccess();
    const input = reelBatchSchema.safeParse(await reelBody(request));
    if (!input.success) throw new ReelHttpError(input.error.issues[0]?.message || "Check the batch settings.");
    if (!(await reelEngineStatus()).available) throw new ReelHttpError("Open this studio on your Mac to render reels.", 503);
    const id = await startReelBatch(user.id, input.data.requestId, input.data.scripts, input.data.voice, input.data.provider);
    return Response.json({ id }, { status: 202 });
  } catch (error) { return reelError(error); }
}
