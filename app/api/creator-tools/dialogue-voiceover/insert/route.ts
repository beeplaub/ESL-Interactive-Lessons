import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCreatorAiAccess, creatorAccessError } from "@/lib/ai/creatorAccess";
import { KOKORO_VOICEOVER_MODEL } from "@/lib/ai/voiceover";
import { requireLessonAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { registerMediaAsset } from "@/lib/storage/mediaLibrary";
import { audioExtension, audioMimeType } from "@/lib/media/audioStorage";
import { copyMediaObject, deleteMediaObject, type StoredMediaObject } from "@/lib/storage/mediaStorage";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  lessonId: z.string().uuid(),
  blockId: z.string().uuid(),
  baseContent: z.record(z.unknown()),
  title: z.string().trim().max(240).nullable(),
  languageCode: z.enum(["en-US", "en-GB"]),
  pace: z.enum(["Very slow", "Slow", "Natural", "Brisk"]),
  people: z.array(z.object({
    id: z.string().trim().min(1).max(120),
    name: z.string().trim().min(1).max(160),
    color: z.string().trim().min(1).max(120),
    voiceName: z.string().trim().min(1).max(80),
  })).min(1).max(20),
  turns: z.array(z.object({
    id: z.string().trim().min(1).max(160),
    speakerId: z.string().trim().min(1).max(120),
    line: z.string().trim().min(1).max(4_000),
    audio: z.string().max(4_000),
    voiceover: z.record(z.unknown()).nullable(),
  })).min(1).max(200),
  generatedTurns: z.array(z.object({
    turnId: z.string().trim().min(1).max(160),
    turnIndex: z.number().int().min(0),
    line: z.string().trim().min(1).max(4_000),
    generationId: z.string().uuid(),
  })).min(1).max(100),
});

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function scriptHash(value: string) {
  return createHash("sha256").update(value.trim()).digest("hex");
}

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "turn";
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export async function POST(request: Request) {
  let access;
  try {
    access = await getCreatorAiAccess();
  } catch (error) {
    const known = creatorAccessError(error);
    return NextResponse.json({ error: known?.message ?? "Could not verify Creator Tools access." }, { status: known?.status ?? 500 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the dialogue voice settings." }, { status: 400 });
  }

  const input = parsed.data;
  await requireLessonAccess(input.lessonId);
  const admin = createAdminClient();
  const [{ data: lesson }, { data: block, error: blockError }, { data: generations, error: generationsError }] = await Promise.all([
    admin.from("lessons").select("id,title,created_by").eq("id", input.lessonId).maybeSingle(),
    admin.from("lesson_blocks").select("id,lesson_id,block_type,content").eq("id", input.blockId).eq("lesson_id", input.lessonId).maybeSingle(),
    admin.from("ai_voiceover_generations").select("*").eq("creator_id", access.user.id).in("id", input.generatedTurns.map((turn) => turn.generationId)),
  ]);

  if (!lesson || blockError || !block || block.block_type !== "DIALOGUE") {
    return NextResponse.json({ error: "This dialogue block could not be found." }, { status: 404 });
  }
  if (generationsError) return NextResponse.json({ error: generationsError.message }, { status: 500 });

  const generationById = new Map((generations ?? []).map((generation) => [generation.id, generation]));
  const content = record(block.content);
  if (stableJson(content) !== stableJson(input.baseContent)) {
    return NextResponse.json({ error: "This dialogue changed in another tab or session. Reopen the block before inserting voices." }, { status: 409 });
  }
  // Some legacy lessons do not have created_by populated. Media assets still
  // require a valid UUID owner, so fall back to the authenticated creator.
  const mediaOwnerId = text(lesson.created_by) || access.user.id;
  const databaseTurns = Array.isArray(content.turns) ? content.turns.map(record) : [];
  const currentPeople = input.people.map((person) => ({ id: person.id, name: person.name, color: person.color, voice_name: person.voiceName }));
  const currentTurns = input.turns.map((turn) => ({
    id: turn.id,
    speaker_id: turn.speakerId,
    speaker: input.people.find((person) => person.id === turn.speakerId)?.name || "Speaker",
    line: turn.line,
    audio_url: turn.audio || null,
    voiceover: turn.voiceover,
  }));
  const copied: Array<{ stored: StoredMediaObject; mediaAssetId: string; oldVoiceover: JsonRecord; index: number; turnId: string; generationId: string; metadata: JsonRecord }> = [];
  try {
    const resolved = input.generatedTurns.map((requested) => {
      const idIndex = currentTurns.findIndex((turn) => text(turn.id) === requested.turnId);
      const index = idIndex >= 0 ? idIndex : requested.turnIndex;
      const turn = currentTurns[index];
      const generation = generationById.get(requested.generationId);
      if (!turn || text(turn.line) !== requested.line.trim()) throw new Error("DIALOGUE_CHANGED");
      if (!generation || !["PREVIEW", "SAVED"].includes(String(generation.status))) throw new Error("PREVIEW_MISSING");
      if (text(generation.script) !== requested.line.trim()) throw new Error("PREVIEW_STALE");
      return { ...requested, index, turn, generation };
    });

    for (const item of resolved) {
      const hash = scriptHash(item.line);
      const mimeType = audioMimeType(item.generation.mime_type);
      const extension = audioExtension(mimeType);
      const stored = await copyMediaObject({
        supabase: admin,
        source: {
          provider: item.generation.storage_provider,
          bucket: item.generation.storage_bucket,
          path: item.generation.storage_path,
          url: item.generation.public_url,
        },
        supabaseBucket: "ai-recordings",
        path: `dialogues/${lesson.id}/${block.id}/${safeFilePart(item.turnId)}-${hash.slice(0, 12)}-${item.generationId.slice(0, 8)}-${Date.now()}.${extension}`,
        contentType: mimeType,
      });
      const speakerId = text(item.turn.speaker_id);
      const speaker = currentPeople.find((person) => text(person.id) === speakerId);
      const mediaAssetId = await registerMediaAsset(admin, {
        ownerId: mediaOwnerId,
        type: "AUDIO",
        source: "UPLOAD",
        url: stored.url,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        title: `${text(speaker?.name) || text(item.turn.speaker) || "Speaker"} · dialogue turn ${item.index + 1}`,
        caption: `${item.generation.voice_name} · Kokoro dialogue voiceover`,
        fileName: `${safeFilePart(item.turnId)}.${extension}`,
        mimeType,
        fileSize: Number(item.generation.file_size || 0),
        tags: ["ai-voiceover", "dialogue-voiceover", `block:${block.id}`, `turn:${item.turnId}`],
      });
      const metadata = {
        source: "AI_KOKORO",
        provider: "kokoro",
        model: item.generation.model_used || KOKORO_VOICEOVER_MODEL,
        voice_name: item.generation.voice_name,
        language_code: input.languageCode,
        pace: input.pace,
        generation_id: item.generation.id,
        media_asset_id: mediaAssetId,
        script_hash: hash,
        source_text: item.line,
        storage_provider: stored.provider,
        storage_bucket: stored.bucket,
        storage_path: stored.path,
        generated_at: new Date().toISOString(),
      };
      copied.push({
        stored,
        mediaAssetId,
        oldVoiceover: record(item.turn.voiceover),
        index: item.index,
        turnId: item.turnId,
        generationId: item.generation.id,
        metadata,
      });
    }

    const nextTurns = currentTurns.map((turn, index) => {
      const replacement = copied.find((item) => item.index === index);
      if (!replacement) return turn;
      return { ...turn, id: replacement.turnId, audio_url: replacement.stored.url, voiceover: replacement.metadata };
    });
    const nextPeople = currentPeople;
    const nextContent = {
      ...content,
      title: input.title,
      people: nextPeople,
      turns: nextTurns,
      voiceover_settings: {
        provider: "kokoro",
        model: KOKORO_VOICEOVER_MODEL,
        language_code: input.languageCode,
        pace: input.pace,
      },
    };
    const { error: updateError } = await admin.from("lesson_blocks").update({ content: nextContent }).eq("id", block.id).eq("lesson_id", lesson.id);
    if (updateError) throw new Error(updateError.message);

    const firstCopyByGeneration = new Map<string, (typeof copied)[number]>();
    for (const item of copied) if (!firstCopyByGeneration.has(item.generationId)) firstCopyByGeneration.set(item.generationId, item);
    await Promise.all(Array.from(firstCopyByGeneration.entries()).map(async ([generationId, item]) => {
      const original = generationById.get(generationId);
      const { error } = await admin.from("ai_voiceover_generations").update({
        status: "SAVED",
        title: `${lesson.title} dialogue`,
        storage_provider: item.stored.provider,
        storage_bucket: item.stored.bucket,
        storage_path: item.stored.path,
        public_url: item.stored.url,
        media_asset_id: item.mediaAssetId,
        saved_at: new Date().toISOString(),
        expires_at: null,
        updated_at: new Date().toISOString(),
      }).eq("id", generationId).eq("creator_id", access.user.id);
      if (error) console.error("Dialogue voiceover generation update failed", error);
      if (original?.status === "PREVIEW") {
        await deleteMediaObject(admin, { provider: original.storage_provider, bucket: original.storage_bucket, path: original.storage_path })
          .catch((cleanupError) => console.error("Dialogue voiceover preview cleanup failed", cleanupError));
      }
    }));

    const finalUrls = new Set(nextTurns.map((turn) => text(turn.audio_url)).filter(Boolean));
    for (const item of copied) {
      const oldTurn = databaseTurns.find((turn) => text(turn.id) === item.turnId) ?? databaseTurns[item.index];
      const oldUrl = text(oldTurn?.audio_url);
      if (item.oldVoiceover.source === "AI_KOKORO" && oldUrl && !finalUrls.has(oldUrl)) {
        await deleteMediaObject(admin, {
          provider: text(item.oldVoiceover.storage_provider),
          bucket: text(item.oldVoiceover.storage_bucket),
          path: text(item.oldVoiceover.storage_path),
        }).catch((cleanupError) => console.error("Previous dialogue voice cleanup failed", cleanupError));
        await admin.from("media_assets").delete().eq("owner_id", mediaOwnerId).eq("url", oldUrl);
      }
    }

    revalidatePath(`/admin/lessons/${lesson.id}/builder`);
    revalidatePath(`/lessons/${lesson.id}`);

    return NextResponse.json({
      ok: true,
      settings: nextContent.voiceover_settings,
      people: nextPeople,
      content: nextContent,
      turns: copied.map((item) => ({ index: item.index, id: item.turnId, audioUrl: item.stored.url, voiceover: item.metadata })),
      message: `${copied.length} dialogue voice${copied.length === 1 ? "" : "s"} saved and inserted.`,
    });
  } catch (error) {
    await Promise.all(copied.map(async (item) => {
      await admin.from("media_assets").delete().eq("id", item.mediaAssetId);
      await deleteMediaObject(admin, item.stored).catch(() => undefined);
    }));
    const message = error instanceof Error ? error.message : "Could not insert the dialogue voices.";
    if (message === "DIALOGUE_CHANGED" || message === "PREVIEW_STALE") {
      return NextResponse.json({ error: "The dialogue changed after generation. Generate fresh previews before inserting." }, { status: 409 });
    }
    if (message === "PREVIEW_MISSING") return NextResponse.json({ error: "One or more voice previews expired. Generate them again." }, { status: 410 });
    console.error("Dialogue voiceover insert failed", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
