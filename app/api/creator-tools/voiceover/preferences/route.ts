import { NextResponse } from "next/server";
import { z } from "zod";
import { creatorAccessError, getCreatorAiAccess } from "@/lib/ai/creatorAccess";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const schema = z.object({
  provider: z.enum(["auto", "kokoro", "google"]),
  languageCode: z.string().trim().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/),
  voiceName: z.string().trim().min(1).max(80),
  style: z.string().trim().min(1).max(80),
  pace: z.string().trim().min(1).max(40),
  locked: z.boolean(),
});

async function access() {
  try { return await getCreatorAiAccess(); }
  catch (error) {
    const known = creatorAccessError(error);
    throw new Response(JSON.stringify({ error: known?.message ?? "Could not verify Creator Tools access." }), { status: known?.status ?? 500 });
  }
}

export async function GET() {
  try {
    const current = await access();
    const admin = createAdminClient();
    const { data, error } = await admin.from("voice_generation_preferences").select("provider,language_code,voice_name,style,pace,locked").eq("user_id", current.user.id).maybeSingle();
    if (error && error.code !== "42P01") throw new Error(error.message);
    return NextResponse.json({ preferences: data ? {
      provider: data.provider, languageCode: data.language_code, voiceName: data.voice_name,
      style: data.style, pace: data.pace, locked: Boolean(data.locked),
    } : null });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Voice generation preferences load failed", error);
    return NextResponse.json({ error: "Could not load voice settings." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const current = await access();
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the voice settings." }, { status: 400 });
    const admin = createAdminClient();
    const { data, error } = await admin.from("voice_generation_preferences").upsert({
      user_id: current.user.id, provider: parsed.data.provider, language_code: parsed.data.languageCode,
      voice_name: parsed.data.voiceName, style: parsed.data.style, pace: parsed.data.pace,
      locked: parsed.data.locked, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" }).select("provider,language_code,voice_name,style,pace,locked").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ preferences: {
      provider: data.provider, languageCode: data.language_code, voiceName: data.voice_name,
      style: data.style, pace: data.pace, locked: Boolean(data.locked),
    } });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Voice generation preferences save failed", error);
    return NextResponse.json({ error: "Could not save voice settings." }, { status: 500 });
  }
}
