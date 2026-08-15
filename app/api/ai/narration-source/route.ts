import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

function blockedHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "localhost" || host.endsWith(".local") || host === "0.0.0.0" || host === "::1"
    || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
}

function safeExternalUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !blockedHost(url.hostname) ? url : null;
  } catch {
    return null;
  }
}

async function fetchAudio(url: URL) {
  let current = url;
  for (let redirect = 0; redirect < 5; redirect += 1) {
    const response = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(20_000), cache: "no-store" });
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get("location");
      const resolved = next ? safeExternalUrl(new URL(next, current).toString()) : null;
      if (!resolved) throw new Error("The audio link redirected to an unsupported destination.");
      current = resolved;
      continue;
    }
    if (!response.ok) throw new Error("The linked audio could not be downloaded.");
    const contentType = response.headers.get("content-type") || "";
    if (/text\/html|application\/json|text\/plain/i.test(contentType)) throw new Error("This link does not point directly to an audio file.");
    const length = Number(response.headers.get("content-length") || 0);
    if (length > MAX_AUDIO_BYTES) throw new Error("Linked audio must be 25 MB or smaller to translate.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.byteLength) throw new Error("The linked audio file is empty.");
    if (bytes.byteLength > MAX_AUDIO_BYTES) throw new Error("Linked audio must be 25 MB or smaller to translate.");
    return { bytes, contentType: contentType || "audio/mpeg" };
  }
  throw new Error("The audio link redirected too many times.");
}

/**
 * Same-origin bridge for a creator-saved public audio URL. It is deliberately
 * not a general proxy: the URL comes only from the narration row for a
 * published lesson, requires an authenticated learner, allows HTTPS direct
 * files, blocks local/private hostnames, limits redirects, and caps size.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const url = new URL(request.url);
  const lessonId = url.searchParams.get("lessonId");
  const slideId = url.searchParams.get("slideId");
  if (!lessonId || !slideId) return NextResponse.json({ error: "Narration is required." }, { status: 400 });

  const admin = createAdminClient();
  const [{ data: lesson }, { data: narration }] = await Promise.all([
    admin.from("lessons").select("id,status").eq("id", lessonId).maybeSingle(),
    admin.from("lesson_audio_files").select("external_url,source_type,translation_enabled").eq("lesson_id", lessonId).eq("slide_id", slideId).eq("label", "narration").maybeSingle(),
  ]);
  if (!lesson || lesson.status !== "PUBLISHED" || !narration?.translation_enabled || narration.source_type !== "LINK") {
    return NextResponse.json({ error: "This linked narration is unavailable." }, { status: 404 });
  }
  const source = safeExternalUrl(String(narration.external_url || ""));
  if (!source) return NextResponse.json({ error: "Use a public HTTPS direct audio link for translation." }, { status: 422 });
  try {
    const audio = await fetchAudio(source);
    return new NextResponse(audio.bytes, { headers: { "Content-Type": audio.contentType, "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The linked audio could not be prepared." }, { status: 422 });
  }
}
