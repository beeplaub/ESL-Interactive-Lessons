import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { reelByteRange } from "@/lib/reels";
import { reelAccess, reelError, reelFolder, ReelHttpError } from "@/lib/reels-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const querySchema = z.object({ batch: z.union([z.literal("samples"), z.string().uuid()]), reel: z.string().regex(/^00[1-5]$/), asset: z.enum(["video", "thumbnail", "script", "captions"]) });
const assets = { video: ["reel.mp4", "video/mp4"], thumbnail: ["thumbnail.jpg", "image/jpeg"], script: ["script.json", "application/json"], captions: ["captions.srt", "application/x-subrip"] } as const;
export async function GET(request: Request) {
  try {
    const { user } = await reelAccess();
    const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) throw new ReelHttpError("File not found.", 404);
    const { batch, reel, asset } = query.data;
    const [filename, contentType] = assets[asset];
    const directory = path.join(reelFolder(user.id, batch), reel);
    const data = await readFile(path.join(directory, filename)).catch(() => null);
    if (!data) throw new ReelHttpError("This file is not ready yet.", 404);
    const download = new URL(request.url).searchParams.get("download") === "1";
    const headers = new Headers({ "Content-Type": contentType, "Cache-Control": "private, no-store", "Accept-Ranges": "bytes", "X-Content-Type-Options": "nosniff", "Content-Disposition": `${download ? "attachment" : "inline"}; filename="reel-${reel}-${filename}"` });
    const rangeHeader = request.headers.get("range");
    if (rangeHeader) {
      const range = reelByteRange(rangeHeader, data.length);
      if (!range) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${data.length}` } });
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${data.length}`);
      headers.set("Content-Length", String(range.end - range.start + 1));
      return new Response(new Uint8Array(data.subarray(range.start, range.end + 1)), { status: 206, headers });
    }
    headers.set("Content-Length", String(data.length));
    return new Response(new Uint8Array(data), { headers });
  } catch (error) { return reelError(error); }
}
