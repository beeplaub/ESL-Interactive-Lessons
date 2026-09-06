import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { reelAccess, reelEngineStatus, reelError, ReelHttpError, reelImagePath } from "@/lib/reels-server";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const { user } = await reelAccess();
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new ReelHttpError("Upload from the studio.", 403);
    if (!(await reelEngineStatus()).available) throw new ReelHttpError("Upload scenes on your local Mac.", 503);
    const chunks: Uint8Array[] = []; let size = 0;
    if (!request.body) throw new ReelHttpError("Choose an image.");
    for await (const chunk of request.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.length;
      if (size > 10_000_000) throw new ReelHttpError("Images must be under 10 MB.", 413);
      chunks.push(chunk);
    }
    let image: Buffer;
    try {
      const decoder = sharp(Buffer.concat(chunks), { limitInputPixels: 40_000_000 });
      const info = await decoder.metadata();
      if (!["jpeg", "png", "webp"].includes(info.format || "") || (info.pages || 1) > 1) throw new Error("format");
      image = await decoder.rotate().resize(1920, 1920, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer();
    } catch { throw new ReelHttpError("Choose a valid JPG, PNG or WebP image under 40 megapixels."); }
    const id = randomUUID(); const file = reelImagePath(user.id, id);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, image);
    return Response.json({ id }, { status: 201 });
  } catch (error) { return reelError(error); }
}
export async function GET(request: Request) {
  try {
    const { user } = await reelAccess();
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!/^[a-f0-9-]{36}$/i.test(id)) throw new ReelHttpError("Image not found.", 404);
    const image = await readFile(reelImagePath(user.id, id)).catch(() => null);
    if (!image) throw new ReelHttpError("Image not found.", 404);
    return new Response(new Uint8Array(image), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return reelError(error); }
}
