import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSignedR2MediaUrl } from "@/lib/storage/mediaStorage";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await context.params;
  const { data: media, error } = await supabase.from("community_media").select("bucket, path, mime_type").eq("id", id).maybeSingle();
  if (error || !media) return NextResponse.json({ error: "Recording unavailable." }, { status: 404 });
  return NextResponse.json({ url: await createSignedR2MediaUrl({ bucket: media.bucket, path: media.path }), mimeType: media.mime_type });
}
