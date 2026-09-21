import { NextResponse } from "next/server";
import { z } from "zod";
import { creatorAccessError, getCreatorAiAccess } from "@/lib/ai/creatorAccess";
import { VOICEOVER_VOICES } from "@/lib/ai/voiceoverCatalog";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const characterSchema = z.object({
  name: z.string().trim().min(1).max(100),
  role: z.string().trim().max(160).default(""),
  voiceName: z.string().trim().min(1).max(80),
  accent: z.enum(["US", "UK"]),
  style: z.string().trim().min(1).max(80),
  pace: z.enum(["Very slow", "Slow", "Natural", "Brisk"]),
  provider: z.enum(["auto", "kokoro", "google"]),
});

function errorResponse(error: unknown) {
  const known = creatorAccessError(error);
  return NextResponse.json({ error: known?.message ?? "Could not verify Creator Tools access." }, { status: known?.status ?? 500 });
}

export async function GET() {
  let access;
  try { access = await getCreatorAiAccess(); } catch (error) { return errorResponse(error); }
  const admin = createAdminClient();
  const { data, error } = await admin.from("creator_conversation_characters")
    .select("id,name,role,voice_name,accent,style,pace,provider,created_at,updated_at")
    .eq("creator_id", access.user.id)
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Saved characters could not be loaded." }, { status: 500 });
  return NextResponse.json({ characters: data ?? [] });
}

export async function POST(request: Request) {
  let access;
  try { access = await getCreatorAiAccess(); } catch (error) { return errorResponse(error); }
  const parsed = characterSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the character details." }, { status: 400 });
  const character = parsed.data;
  const selectedVoice = VOICEOVER_VOICES.find((voice) => voice.name === character.voiceName);
  if (!selectedVoice || (selectedVoice.kokoroVoice.startsWith("b") ? "UK" : "US") !== character.accent) {
    return NextResponse.json({ error: "Choose a voice that matches the selected English accent." }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin.from("creator_conversation_characters")
    .upsert({
      creator_id: access.user.id,
      name: character.name,
      role: character.role,
      voice_name: character.voiceName,
      accent: character.accent,
      style: character.style,
      pace: character.pace,
      provider: character.provider,
      updated_at: new Date().toISOString(),
    }, { onConflict: "creator_id,name" })
    .select("id,name,role,voice_name,accent,style,pace,provider,created_at,updated_at")
    .single();
  if (error || !data) return NextResponse.json({ error: "This character could not be saved." }, { status: 500 });
  return NextResponse.json({ character: data });
}

export async function DELETE(request: Request) {
  let access;
  try { access = await getCreatorAiAccess(); } catch (error) { return errorResponse(error); }
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Choose a valid saved character." }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from("creator_conversation_characters")
    .delete().eq("id", id).eq("creator_id", access.user.id);
  if (error) return NextResponse.json({ error: "This saved character could not be deleted." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
