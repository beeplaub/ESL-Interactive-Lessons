import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSignedR2MediaUrl } from "@/lib/storage/mediaStorage";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await context.params;
  const { data: media, error } = await supabase.from("community_media").select("provider, bucket, path, mime_type, post_id, reply_id, status").eq("id", id).eq("status", "ACTIVE").maybeSingle();
  if (error || !media) return NextResponse.json({ error: "Recording unavailable." }, { status: 404 });
  if (media.post_id) {
    const { data: post } = await supabase.from("community_posts").select("id").eq("id", media.post_id).eq("status", "PUBLISHED").maybeSingle();
    if (!post) return NextResponse.json({ error: "Recording unavailable." }, { status: 404 });
  } else if (media.reply_id) {
    const { data: reply } = await supabase.from("community_replies").select("id,post_id").eq("id", media.reply_id).eq("status", "PUBLISHED").maybeSingle();
    if (!reply) return NextResponse.json({ error: "Recording unavailable." }, { status: 404 });
    const { data: post } = await supabase.from("community_posts").select("id").eq("id", reply.post_id).eq("status", "PUBLISHED").maybeSingle();
    if (!post) return NextResponse.json({ error: "Recording unavailable." }, { status: 404 });
  }
  const range = request.headers.get("range");
  const objectHeaders = range ? { Range: range } : undefined;
  let signedUrl = await createSignedR2MediaUrl({ bucket: media.bucket, path: media.path });
  let object = await fetch(signedUrl, { cache: "no-store", headers: objectHeaders });
  // Older uploads stored the path before the "ai-recordings/" R2 key prefix
  // was added. Try the actual storage key so those existing voice notes remain playable.
  if (!object.ok && media.provider === "r2" && !media.path.startsWith("ai-recordings/")) {
    signedUrl = await createSignedR2MediaUrl({ bucket: media.bucket, path: `ai-recordings/${media.path}` });
    object = await fetch(signedUrl, { cache: "no-store", headers: objectHeaders });
  }
  if (!object.ok || !object.body) return NextResponse.json({ error: "Recording unavailable." }, { status: 404 });
  const headers = new Headers({ "Content-Type": media.mime_type || object.headers.get("content-type") || "audio/webm", "Cache-Control": "private, max-age=300", "Accept-Ranges": object.headers.get("accept-ranges") || "bytes" });
  for (const name of ["content-length", "content-range"]) {
    const value = object.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(object.body, { status: object.status, headers });
}
