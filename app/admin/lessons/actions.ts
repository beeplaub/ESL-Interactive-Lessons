"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff, requireLessonAccess, isPlatformAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isR2PublicUrl, pathFromR2PublicUrl } from "@/lib/storage/mediaStorage";
import { assertCreatorWithinLimit } from "@/lib/entitlements";
import { notifyUser } from "@/lib/notifications";
import { parsePdfPages } from "@/lib/pdfParser";
import { parseLessonSlideActivities } from "@/lib/lessonTextParser";
import { classifyAndExtractLesson } from "@/lib/slideClassifier";
import { CONTENT_LEVELS } from "@/lib/levels";
import type { Json, SlideType } from "@/types/database.types";
import { ALL_ACTIVITIES_REFERENCE } from "@/lib/allActivitiesReference";

type AdminClient = ReturnType<typeof createAdminClient>;

export type LessonActionState = {
  lessonId?: string;
  message?: string;
};

const lessonSchema = z.object({
  title: z.string().min(2),
  topic: z.string().min(2),
  level: z.enum(CONTENT_LEVELS),
  description: z.string().optional()
});

const builderLessonSchema = lessonSchema.extend({
  subtitle: z.string().optional(),
  category: z.string().optional(),
  thumbnailPath: z.string().optional(),
  coverImagePath: z.string().optional(),
  durationMinutes: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
  estimatedCompletionMinutes: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
  timerMinutes: z.coerce.number().int().positive().optional().or(z.literal("").transform(() => undefined)),
  status: z.enum(["DRAFT", "PUBLISHED"])
});

const pathLessonSchema = lessonSchema.extend({
  lessonId: z.string().uuid(),
  pdfPath: z.string().min(3),
  audioPaths: z.string().default("[]")
});

const signedUploadSchema = z.object({
  bucket: z.enum(["lessons", "lesson-audio"]),
  path: z.string().min(3)
});

const lessonBlockTypes = [
  "HEADING",
  "TEXT",
  "BULLETS",
  "QUOTE",
  "CALLOUT",
  "IMAGE",
  "IMAGE_TEXT",
  "IMAGE_ANNOTATION",
  "AUDIO",
  "VIDEO",
  "DIVIDER",
  "VOCABULARY",
  "GRAMMAR",
  "READING",
  "DIALOGUE",
  "FLASHCARD",
  "TABLE",
  "COMMON_MISTAKE",
  "CONTRAST_PAIR",
  "IMAGE_PAIR",
  "TONGUE_TWISTER"
] as const;

const lessonBlockSchema = z.object({
  blockType: z.enum(lessonBlockTypes)
});

function fileExt(file: File) {
  return file.name.split(".").pop()?.toLowerCase() ?? "bin";
}

function getErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => issue.message).join(" ");
  }

  if (error instanceof Error) {
    if (error.message.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return "The server is missing SUPABASE_SERVICE_ROLE_KEY in Vercel. Add it to Project Settings > Environment Variables and redeploy.";
    }
    return error.message;
  }

  if (error && typeof error === "object") {
    const details = error as { message?: unknown; error?: unknown; details?: unknown; hint?: unknown; code?: unknown; statusCode?: unknown };
    const parts = [details.message, details.error, details.details, details.hint, details.code, details.statusCode]
      .map((part) => (typeof part === "string" || typeof part === "number" ? String(part) : ""))
      .filter(Boolean);

    if (parts.length > 0) return parts.join(" ");
  }

  return "The upload failed on the server, but no error detail was returned.";
}

function throwStep(step: string, error: unknown): never {
  throw new Error(`${step}: ${getErrorMessage(error)}`);
}

function nullableText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function formJsonObject(value: unknown): Json | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Json : null;
  } catch {
    return null;
  }
}

function optionalPositiveInt(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
}

function splitLines(value: unknown) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function textAlignValue(value: unknown) {
  const v = String(value ?? "left");
  return v === "center" || v === "right" ? v : "left";
}

function verticalAlignValue(value: unknown) {
  const v = String(value ?? "middle");
  return v === "top" || v === "bottom" ? v : "middle";
}

function hexColorValue(value: unknown, fallback: string) {
  const v = String(value ?? "");
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
}

function blockContentFromForm(blockType: string, formData: FormData): Json {
  if (blockType === "HEADING") {
    return {
      text: String(formData.get("text") || "").trim(),
      level: String(formData.get("level") || "H2"),
      text_align: textAlignValue(formData.get("text_align"))
    };
  }
  if (blockType === "TEXT") {
    return {
      body: String(formData.get("body") || "").trim(),
      text_align: textAlignValue(formData.get("text_align"))
    };
  }
  if (blockType === "BULLETS") {
    return {
      title: nullableText(formData.get("title")),
      items: splitLines(formData.get("items"))
    };
  }
  if (blockType === "QUOTE") {
    return {
      body: String(formData.get("body") || "").trim(),
      attribution: nullableText(formData.get("attribution")),
      text_align: textAlignValue(formData.get("text_align"))
    };
  }
  if (blockType === "CALLOUT") {
    return {
      title: nullableText(formData.get("title")),
      body: String(formData.get("body") || "").trim(),
      text_align: textAlignValue(formData.get("text_align")),
      reveal_hidden: formData.get("reveal_hidden") === "on"
    };
  }
  if (blockType === "IMAGE") {
    return {
      path: String(formData.get("path") || "").trim(),
      alt: nullableText(formData.get("alt")),
      caption: nullableText(formData.get("caption"))
    };
  }
  if (blockType === "IMAGE_PAIR") {
    return {
      left_path: String(formData.get("left_path") || "").trim(), left_alt: nullableText(formData.get("left_alt")), left_caption: nullableText(formData.get("left_caption")),
      right_path: String(formData.get("right_path") || "").trim(), right_alt: nullableText(formData.get("right_alt")), right_caption: nullableText(formData.get("right_caption"))
    };
  }
  if (blockType === "TONGUE_TWISTER") {
    let items: Json[] = [];
    try {
      const parsed = JSON.parse(String(formData.get("items_json") || "[]"));
      items = Array.isArray(parsed) ? parsed as Json[] : [];
    } catch { items = []; }
    return { title: nullableText(formData.get("title")), instruction: nullableText(formData.get("instruction")), items };
  }
  if (blockType === "IMAGE_TEXT") {
    return {
      image_position: String(formData.get("image_position") || "left"),
      image_path: String(formData.get("image_path") || "").trim(),
      alt: nullableText(formData.get("alt")),
      caption: nullableText(formData.get("caption")),
      heading: nullableText(formData.get("heading")),
      body: String(formData.get("body") || "").trim(),
      text_align: textAlignValue(formData.get("text_align")),
      vertical_align: verticalAlignValue(formData.get("vertical_align"))
    };
  }
  if (blockType === "IMAGE_ANNOTATION") {
    let markers: Json[] = [];
    try {
      const parsed = JSON.parse(String(formData.get("markers") || "[]"));
      markers = Array.isArray(parsed) ? parsed as Json[] : [];
    } catch { markers = []; }
    return {
      path: String(formData.get("path") || "").trim(),
      alt: nullableText(formData.get("alt")),
      title: nullableText(formData.get("title")),
      instruction: nullableText(formData.get("instruction")),
      marker_size: Math.min(64, Math.max(20, Number(formData.get("marker_size") || 32))),
      markers
    };
  }
  if (blockType === "AUDIO") {
    return {
      path: String(formData.get("path") || "").trim(),
      label: nullableText(formData.get("label"))
    };
  }
  if (blockType === "VIDEO") {
    return {
      url: String(formData.get("url") || "").trim(),
      title: nullableText(formData.get("title")),
      startTime: nullableText(formData.get("startTime")),
      endTime: nullableText(formData.get("endTime"))
    };
  }
  if (blockType === "VOCABULARY") {
    return {
      entries: splitLines(formData.get("entries")).map((line) => {
        const [word, pronunciation, meaning, example, notes] = line.split("|").map((part) => part.trim());
        return { word, pronunciation, meaning, example, notes };
      })
    };
  }
  if (blockType === "GRAMMAR") {
    return {
      title: String(formData.get("title") || "").trim(),
      explanation: String(formData.get("explanation") || "").trim(),
      examples: splitLines(formData.get("examples")),
      notes: nullableText(formData.get("notes"))
    };
  }
  if (blockType === "COMMON_MISTAKE") {
    return {
      title: String(formData.get("title") || "").trim(),
      context: nullableText(formData.get("context")),
      mistake: String(formData.get("mistake") || "").trim(),
      correction: String(formData.get("correction") || "").trim(),
      explanation: String(formData.get("explanation") || "").trim(),
      tip: nullableText(formData.get("tip")),
      examples: splitLines(formData.get("examples")).map((line) => {
        const [context, incorrect, correct] = line.split("|").map((part) => part.trim());
        return { context, incorrect, correct };
      }).filter((example) => example.incorrect || example.correct)
    };
  }
  if (blockType === "CONTRAST_PAIR") {
    let parsedPairs: unknown[] = [];
    try {
      const raw = JSON.parse(String(formData.get("pairs_json") || "[]"));
      if (Array.isArray(raw)) parsedPairs = raw;
    } catch {
      parsedPairs = [];
    }
    if (parsedPairs.length) {
      return {
        title: nullableText(formData.get("title")),
        instruction: nullableText(formData.get("instruction")),
        pairs: parsedPairs.filter((pair): pair is Record<string, unknown> => Boolean(pair && typeof pair === "object" && !Array.isArray(pair))).map((pair) => pair as Json)
      };
    }
    return {
      title: nullableText(formData.get("title")),
      instruction: nullableText(formData.get("instruction")),
      pairs: splitLines(formData.get("pairs")).map((line) => {
        const fields = line.split("|").map((part) => part.trim());
        const examples = (value: string | undefined) => value ? value.split(";").map((item) => item.trim()).filter(Boolean) : [];
        return {
          title: fields[0] || "Contrast pair",
          context: fields[1] || null,
          left_term: fields[2] || "",
          left_meaning: fields[3] || "",
          left_pattern: fields[4] || null,
          left_examples: examples(fields[5]),
          right_term: fields[6] || "",
          right_meaning: fields[7] || "",
          right_pattern: fields[8] || null,
          right_examples: examples(fields[9]),
          key_difference: fields[10] || null,
          common_mistake: fields[11] || null
        };
      }).filter((pair) => pair.left_term || pair.right_term)
    };
  }
  if (blockType === "READING") {
    return {
      title: String(formData.get("title") || "").trim(),
      passage: String(formData.get("passage") || "").trim(),
      audio_path: nullableText(formData.get("audio_path")),
      questions: splitLines(formData.get("questions"))
    };
  }
  if (blockType === "DIALOGUE") {
    const people = formData.getAll("dialogue_person_name").map((value, index) => ({
      id: String(formData.getAll("dialogue_person_id")[index] || `person-${index + 1}`),
      name: String(value || "").trim(),
      color: String(formData.getAll("dialogue_person_color")[index] || "var(--br-brand)"),
      voice_name: nullableText(formData.getAll("dialogue_person_voice")[index]),
    })).filter((person) => person.name);
    const turns = formData.getAll("dialogue_turn_line").map((value, index) => {
      const speakerId = String(formData.getAll("dialogue_turn_speaker")[index] || "");
      const person = people.find((candidate) => candidate.id === speakerId);
      return {
        id: String(formData.getAll("dialogue_turn_id")[index] || `turn-${index + 1}`),
        speaker_id: speakerId || null,
        speaker: person?.name || "Speaker",
        line: String(value || "").trim(),
        audio_url: nullableText(formData.getAll("dialogue_turn_audio")[index]),
        voiceover: formJsonObject(formData.getAll("dialogue_turn_voiceover")[index]),
      };
    }).filter((turn) => turn.line);
    return {
      title: nullableText(formData.get("title")),
      people,
      turns,
      voiceover_settings: {
        provider: "kokoro",
        model: String(formData.get("dialogue_voiceover_model") || "kokoro-82m"),
        language_code: String(formData.get("dialogue_voiceover_language") || "en-US"),
        pace: String(formData.get("dialogue_voiceover_pace") || "Natural"),
      },
    };
  }
  if (blockType === "FLASHCARD") {
    const imagePaths = formData.getAll("flashcard_image_path").map((value) => String(value || "").trim());
    const words = formData.getAll("flashcard_word").map((value) => String(value || "").trim());
    const phonetics = formData.getAll("flashcard_phonetic").map((value) => String(value || "").trim());
    const audioPaths = formData.getAll("flashcard_audio_path").map((value) => String(value || "").trim());
    const meanings = formData.getAll("flashcard_meaning").map((value) => String(value || "").trim());
    const examplesList = formData.getAll("flashcard_examples").map((value) => splitLines(value));
    const rowCount = Math.max(imagePaths.length, words.length, meanings.length, 1);
    const cards = Array.from({ length: rowCount }, (_, index) => ({
      image_path: imagePaths[index] ?? "",
      word: words[index] ?? "",
      phonetic: phonetics[index] || null,
      audio_path: audioPaths[index] || null,
      meaning: meanings[index] ?? "",
      examples: examplesList[index] ?? []
    })).filter((card, index) => index === 0 || card.image_path || card.word || card.meaning || card.examples.length);
    const legacyCard = {
      image_path: cards[0]?.image_path ?? "",
      word: cards[0]?.word ?? "",
      phonetic: cards[0]?.phonetic ?? null,
      audio_path: cards[0]?.audio_path ?? null,
      meaning: cards[0]?.meaning ?? "",
      examples: cards[0]?.examples ?? []
    };
    return {
      card_type: String(formData.get("card_type") || "IMAGE"),
      front_side: String(formData.get("front_side") || "IMAGE"),
      cards: cards.length ? cards : [legacyCard],
      ...legacyCard
    };
  }
  if (blockType === "TABLE") {
    let parsed: { headers?: unknown; rows?: unknown } = {};
    try {
      parsed = JSON.parse(String(formData.get("table_data") || "{}"));
    } catch {
      parsed = {};
    }
    const rawHeaders = Array.isArray(parsed.headers) && parsed.headers.length ? parsed.headers : ["Column 1", "Column 2"];
    const headers = rawHeaders.map((header, index) => String(header ?? "").trim() || `Column ${index + 1}`);
    const rawRows = Array.isArray(parsed.rows) ? parsed.rows : [];
    const rows = rawRows
      .map((row) => {
        const cells = Array.isArray(row) ? row : [];
        return headers.map((_, index) => String(cells[index] ?? "").trim());
      })
      .filter((row) => row.some((cell) => cell.length > 0));
    return {
      caption: nullableText(formData.get("caption")),
      headers,
      rows,
      header_fill: hexColorValue(formData.get("header_fill"), "var(--br-info)")
    };
  }
  return {};
}

function defaultBlockContent(blockType: string): Json {
  if (blockType === "HEADING") return { text: "New heading", level: "H2" };
  if (blockType === "TEXT") return { body: "Add lesson text here." };
  if (blockType === "BULLETS") return { title: "Key points", items: ["First point", "Second point"] };
  if (blockType === "QUOTE") return { body: "Add a quote.", attribution: null };
  if (blockType === "CALLOUT") return { title: "Note", body: "Add a short note for learners.", reveal_hidden: false };
  if (blockType === "IMAGE") return { path: "", alt: "", caption: "" };
  if (blockType === "IMAGE_PAIR") return { left_path: "", left_alt: "", left_caption: "", right_path: "", right_alt: "", right_caption: "" };
  if (blockType === "TONGUE_TWISTER") return { title: "Tongue Twister Challenge", instruction: "Start slowly, then build up your speed.", items: [{ title: "Sea Shells", context: "Practise /s/ and /sh/.", text: "She sells sea shells by the sea shore.", target_sound: "/s/ and /ʃ/", highlights: ["s", "sh"], chunks: ["She sells", "sea shells", "by the sea shore"], pronunciation_note: "Keep the target sounds clear.", difficult_words: [], audio_path: "", hide_reveal_enabled: false }] };
  if (blockType === "IMAGE_TEXT") return {
    image_position: "left",
    image_path: "",
    alt: "",
    caption: null,
    heading: "Section heading",
    body: "Add supporting text here."
  };
  if (blockType === "IMAGE_ANNOTATION") return {
    path: "",
    alt: "",
    title: "Explore the image",
    instruction: "Tap a numbered marker to learn more.",
    marker_size: 32,
    markers: []
  };
  if (blockType === "AUDIO") return { path: "", label: "Audio" };
  if (blockType === "VIDEO") return { url: "", title: "Video" };
  if (blockType === "VOCABULARY") {
    return { entries: [{ word: "word", pronunciation: "", meaning: "meaning", example: "", notes: "" }] };
  }
  if (blockType === "GRAMMAR") return { title: "", explanation: "", examples: [], notes: null };
  if (blockType === "READING") return { title: "", passage: "", questions: [] };
  if (blockType === "DIALOGUE") return { title: "Dialogue", turns: [{ speaker: "A", line: "" }, { speaker: "B", line: "" }] };
  if (blockType === "FLASHCARD") return {
    card_type: "IMAGE",
    front_side: "IMAGE",
    image_path: "",
    word: "resilience",
    phonetic: "/r\u026a\u02c8z\u026al\u026a\u0259ns/",
    audio_path: null,
    meaning: "the ability to recover quickly from difficulties",
    examples: ["She showed great resilience during the crisis."],
    cards: [{
      image_path: "",
      word: "resilience",
      phonetic: "/r\u026a\u02c8z\u026al\u026a\u0259ns/",
      audio_path: null,
      meaning: "the ability to recover quickly from difficulties",
      examples: ["She showed great resilience during the crisis."]
    }]
  };
  if (blockType === "TABLE") return {
    caption: null,
    headers: ["Column 1", "Column 2"],
    rows: [["", ""], ["", ""]],
    header_fill: "var(--br-info)"
  };
  if (blockType === "COMMON_MISTAKE") return {
    title: "Common mistake",
    context: "Learners often use this form when talking about agreement.",
    mistake: "I am agree with you.",
    correction: "I agree with you.",
    explanation: "Agree is already a verb, so we do not use am before it.",
    tip: "Use agree, not am agree.",
    examples: []
  };
  if (blockType === "CONTRAST_PAIR") return {
    title: "Commonly confused words",
    instruction: "Choose a pair to compare.",
    pairs: [{
      title: "Say vs. Tell",
      context: "Both words relate to communication.",
      left_term: "say",
      left_meaning: "Express words or an idea.",
      left_pattern: "say + something",
      left_examples: ["She said hello."],
      right_term: "tell",
      right_meaning: "Give information to a person.",
      right_pattern: "tell + someone + something",
      right_examples: ["She told me the news."],
      key_difference: "Use tell when you mention the person receiving the information.",
      common_mistake: "Do not say “She said me.” Say “She told me.”"
    }]
  };
  return {};
}

// ── Media Library capture ──────────────────────────────────────────────
// Every IMAGE/IMAGE_TEXT/IMAGE_ANNOTATION/AUDIO/VIDEO/FLASHCARD block a creator saves gets
// mirrored into media_assets so it shows up in their Media Library — no
// matter whether the url came from the uploader or a pasted public link.
// This never throws into the caller: a media_assets hiccup must not break
// an actual lesson-content save.
type MediaEntry = { type: "IMAGE" | "AUDIO" | "VIDEO"; url: string; alt?: string | null; caption?: string | null };

function extractMediaFromBlock(blockType: string, content: Record<string, unknown>): MediaEntry[] {
  const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const out: MediaEntry[] = [];

  if (blockType === "IMAGE") {
    const url = str(content.path);
    if (url) out.push({ type: "IMAGE", url, alt: str(content.alt) || null, caption: str(content.caption) || null });
  } else if (blockType === "IMAGE_PAIR") {
    for (const side of ["left", "right"]) {
      const url = str(content[`${side}_path`]);
      if (url) out.push({ type: "IMAGE", url, alt: str(content[`${side}_alt`]) || null, caption: str(content[`${side}_caption`]) || null });
    }
  } else if (blockType === "IMAGE_TEXT") {
    const url = str(content.image_path);
    if (url) out.push({ type: "IMAGE", url, alt: str(content.alt) || null, caption: str(content.caption) || null });
  } else if (blockType === "IMAGE_ANNOTATION") {
    const url = str(content.path);
    if (url) out.push({ type: "IMAGE", url, alt: str(content.alt) || null, caption: str(content.title) || null });
    const markers = Array.isArray(content.markers) ? content.markers as Array<Record<string, unknown>> : [];
    for (const marker of markers) {
      const audio = str(marker.audio_url ?? marker.audioUrl);
      if (audio) out.push({ type: "AUDIO", url: audio, caption: str(marker.label) || "Image annotation" });
    }
  } else if (blockType === "AUDIO") {
    const url = str(content.path);
    if (url) out.push({ type: "AUDIO", url, caption: str(content.label) || null });
  } else if (blockType === "VIDEO") {
    const url = str(content.url);
    if (url) out.push({ type: "VIDEO", url, caption: str(content.title) || null });
  } else if (blockType === "FLASHCARD") {
    const cards = Array.isArray(content.cards) ? (content.cards as Array<Record<string, unknown>>) : [];
    for (const card of cards) {
      const image = str(card.image_path);
      if (image) out.push({ type: "IMAGE", url: image, alt: str(card.word) || null });
      const audio = str(card.audio_path);
      if (audio) out.push({ type: "AUDIO", url: audio, caption: str(card.word) || null });
    }
  } else if (blockType === "DIALOGUE") {
    const turns = Array.isArray(content.turns) ? (content.turns as Array<Record<string, unknown>>) : [];
    for (const turn of turns) {
      const audio = str(turn.audio_url ?? turn.audio);
      if (audio) out.push({ type: "AUDIO", url: audio, caption: str(turn.speaker) || "Dialogue line" });
    }
  }
  else if (blockType === "TONGUE_TWISTER") {
    const items = Array.isArray(content.items) ? content.items as Array<Record<string, unknown>> : [];
    for (const item of items) {
      const audio = str(item.audio_path);
      if (audio) out.push({ type: "AUDIO", url: audio, caption: str(item.title) || "Tongue twister" });
    }
  }
  return out;
}

function isUploadedMediaUrl(url: string) {
  return /supabase\.co\/storage\/v1\/object\/public\/(lessons|lesson-audio)\//i.test(url) || isR2PublicUrl(url);
}

function uploadedMediaStorage(url: string) {
  const r2Path = pathFromR2PublicUrl(url);
  if (r2Path) return { storage_provider: "r2", storage_bucket: process.env.R2_BUCKET ?? null, storage_path: r2Path, public_url: url };
  const match = url.match(/supabase\.co\/storage\/v1\/object\/public\/(lessons|lesson-audio)\/(.+)$/i);
  if (!match) return {};
  return {
    storage_provider: "supabase",
    storage_bucket: match[1],
    storage_path: decodeURIComponent(match[2].split("?")[0] ?? ""),
    public_url: url
  };
}

function mediaFileNameFromUrl(url: string) {
  const clean = url.split("?")[0];
  const last = clean.split("/").pop();
  return last || null;
}

async function upsertMediaAsset(supabase: AdminClient, entry: MediaEntry & { ownerId: string; lessonId: string | null; lessonTitle: string | null }) {
  const { data: existing } = await supabase
    .from("media_assets")
    .select("id, use_count")
    .eq("owner_id", entry.ownerId)
    .eq("url", entry.url)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing) {
    const update: Record<string, unknown> = {
      use_count: (existing.use_count ?? 1) + 1,
      last_used_at: new Date().toISOString(),
      lesson_id: entry.lessonId,
      lesson_title: entry.lessonTitle
    };
    if (entry.alt) update.alt_text = entry.alt;
    if (entry.caption) update.caption = entry.caption;
    await supabase.from("media_assets").update(update).eq("id", existing.id);
    return;
  }

  await supabase.from("media_assets").insert({
    owner_id: entry.ownerId,
    type: entry.type,
    source: isUploadedMediaUrl(entry.url) ? "UPLOAD" : "LINK",
    url: entry.url,
    ...uploadedMediaStorage(entry.url),
    alt_text: entry.alt ?? null,
    caption: entry.caption ?? null,
    file_name: mediaFileNameFromUrl(entry.url),
    lesson_id: entry.lessonId,
    lesson_title: entry.lessonTitle,
    use_count: 1,
    last_used_at: new Date().toISOString()
  });
}

async function registerMediaFromBlock(supabase: AdminClient, lessonId: string, blockType: string, content: Json) {
  const entries = extractMediaFromBlock(blockType, (content as Record<string, unknown>) ?? {});
  if (!entries.length) return;

  const { data: lesson } = await supabase.from("lessons").select("created_by, title").eq("id", lessonId).maybeSingle();
  const ownerId = lesson?.created_by;
  if (!ownerId) return;

  for (const entry of entries) {
    await upsertMediaAsset(supabase, { ...entry, ownerId, lessonId, lessonTitle: lesson?.title ?? null });
  }
}

async function createLessonRowsFromPdf(params: {
  lessonId: string;
  title: string;
  topic: string;
  level: string;
  description?: string;
  pdfPath: string;
  pdfBuffer: Buffer;
  audioPaths: Array<{ label: string; path: string }>;
  createdBy: string;
}) {
  const supabase = createAdminClient();

  const { error: lessonError } = await supabase.from("lessons").insert({
    id: params.lessonId,
    title: params.title,
    topic: params.topic,
    level: params.level,
    description: params.description,
    pdf_path: params.pdfPath,
    status: "DRAFT",
    created_by: params.createdBy
  });
  if (lessonError) throwStep("Create lesson row failed", lessonError);

  if (params.audioPaths.length > 0) {
    const { error: audioRowsError } = await supabase.from("lesson_audio_files").insert(
      params.audioPaths.map((audio) => ({
        lesson_id: params.lessonId,
        label: audio.label,
        storage_path: audio.path
      }))
    );
    if (audioRowsError) throwStep("Create audio rows failed", audioRowsError);
  }

  let pages: Awaited<ReturnType<typeof parsePdfPages>>;
  try {
    pages = await parsePdfPages(params.pdfBuffer);
  } catch (error) {
    throwStep("Parse PDF failed", error);
  }

  if (pages.length > 0) {
    const { error: slideError } = await supabase.from("slides").insert(
      pages.map((page) => ({
        lesson_id: params.lessonId,
        slide_number: page.pageNumber,
        title: page.title,
        section_label: page.sectionLabel,
        raw_text: page.rawText,
        type: "INFO" as SlideType
      }))
    );
    if (slideError) throwStep("Create slide rows failed", slideError);

    try {
      await classifyAndExtractLesson(params.lessonId);
    } catch (error) {
      throwStep("Classify activities failed", error);
    }
  }
}

export async function createLessonFromPaths(formData: FormData): Promise<LessonActionState> {
  const { user } = await requireStaff();

  let parsed: z.infer<typeof pathLessonSchema> | null = null;
  let audioPaths: Array<{ label: string; path: string }> = [];

  try {
    parsed = pathLessonSchema.parse({
      lessonId: formData.get("lessonId"),
      title: formData.get("title"),
      topic: formData.get("topic"),
      level: formData.get("level") || "B1",
      description: formData.get("description") || "",
      pdfPath: formData.get("pdfPath"),
      audioPaths: formData.get("audioPaths") || "[]"
    });
    audioPaths = JSON.parse(parsed.audioPaths) as Array<{ label: string; path: string }>;

    const supabase = createAdminClient();
    const { data: pdfBlob, error: downloadError } = await supabase.storage.from("lessons").download(parsed.pdfPath);
    if (downloadError) throwStep("Read uploaded PDF from storage failed", downloadError);
    if (!pdfBlob) throw new Error("The PDF was uploaded, but the server could not read it from storage.");

    await createLessonRowsFromPdf({
      lessonId: parsed.lessonId,
      title: parsed.title,
      topic: parsed.topic,
      level: parsed.level,
      description: parsed.description,
      pdfPath: parsed.pdfPath,
      pdfBuffer: Buffer.from(await pdfBlob.arrayBuffer()),
      audioPaths,
      createdBy: user.id
    });

    revalidatePath("/admin/lessons");
    return { lessonId: parsed.lessonId };
  } catch (error) {
    if (parsed) {
      try {
        const supabase = createAdminClient();
        await supabase.from("lessons").delete().eq("id", parsed.lessonId);
        await supabase.storage.from("lessons").remove([parsed.pdfPath]);
        if (audioPaths.length > 0) {
          await supabase.storage.from("lesson-audio").remove(audioPaths.map((audio) => audio.path));
        }
      } catch {
        // Best-effort cleanup only; show the original failure.
      }
    }

    return { message: getErrorMessage(error) };
  }
}

export async function createSignedStorageUpload(input: { bucket: "lessons" | "lesson-audio"; path: string }) {
  await requireStaff();

  try {
    const parsed = signedUploadSchema.parse(input);
    const supabase = createAdminClient();
    const { data, error } = await supabase.storage.from(parsed.bucket).createSignedUploadUrl(parsed.path, {
      upsert: true
    });

    if (error) throwStep("Create signed upload URL failed", error);
    return { data };
  } catch (error) {
    return { error: getErrorMessage(error) };
  }
}

export async function createLesson(formData: FormData) {
  const { user } = await requireStaff();
  const supabase = createAdminClient();

  const parsed = lessonSchema.parse({
    title: formData.get("title"),
    topic: formData.get("topic"),
    level: formData.get("level") || "B1",
    description: formData.get("description") || ""
  });

  const pdf = formData.get("pdf");
  if (!(pdf instanceof File) || pdf.size === 0) {
    throw new Error("Please upload a lesson PDF.");
  }

  const lessonId = crypto.randomUUID();
  const pdfPath = `${lessonId}/lesson.${fileExt(pdf)}`;
  const pdfBuffer = Buffer.from(await pdf.arrayBuffer());

  const { error: pdfUploadError } = await supabase.storage.from("lessons").upload(pdfPath, pdfBuffer, {
    contentType: pdf.type || "application/pdf",
    upsert: true
  });
  if (pdfUploadError) throw pdfUploadError;

  const { error: lessonError } = await supabase.from("lessons").insert({
    id: lessonId,
    title: parsed.title,
    topic: parsed.topic,
    level: parsed.level,
    description: parsed.description,
    pdf_path: pdfPath,
    status: "DRAFT",
    created_by: user.id
  });
  if (lessonError) throw lessonError;

  const audioIndexes = Array.from(formData.keys())
    .map((key) => key.match(/^audioFile-(\d+)$/)?.[1])
    .filter(Boolean) as string[];

  for (const index of audioIndexes) {
    const audioFile = formData.get(`audioFile-${index}`);
    if (!(audioFile instanceof File) || audioFile.size === 0) continue;

    const label = String(formData.get(`audioLabel-${index}`) || audioFile.name);
    const audioPath = `${lessonId}/${crypto.randomUUID()}.${fileExt(audioFile)}`;
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());

    const { error: audioError } = await supabase.storage.from("lesson-audio").upload(audioPath, audioBuffer, {
      contentType: audioFile.type || "audio/mpeg",
      upsert: true
    });
    if (audioError) throw audioError;

    await supabase.from("lesson_audio_files").insert({
      lesson_id: lessonId,
      label,
      storage_path: audioPath
    });
  }

  const pages = await parsePdfPages(pdfBuffer);
  if (pages.length > 0) {
    const { error: slideError } = await supabase.from("slides").insert(
      pages.map((page) => ({
        lesson_id: lessonId,
        slide_number: page.pageNumber,
        title: page.title,
        section_label: page.sectionLabel,
        raw_text: page.rawText,
        type: "INFO" as SlideType
      }))
    );
    if (slideError) throw slideError;
    await classifyAndExtractLesson(lessonId);
  }

  revalidatePath("/admin/lessons");
  redirect(`/admin/lessons/${lessonId}/edit`);
}

export async function createVisualLesson(formData: FormData) {
  const { user } = await requireStaff();
  const supabase = createAdminClient();

  const parsed = builderLessonSchema.parse({
    title: formData.get("title"),
    subtitle: formData.get("subtitle") || "",
    topic: formData.get("topic"),
    category: formData.get("category") || "",
    level: formData.get("level") || "B1",
    description: formData.get("description") || "",
    thumbnailPath: formData.get("thumbnailPath") || "",
    coverImagePath: formData.get("coverImagePath") || "",
    durationMinutes: formData.get("durationMinutes") || "",
    estimatedCompletionMinutes: formData.get("estimatedCompletionMinutes") || "",
    timerMinutes: formData.get("timerMinutes") || "",
    status: "DRAFT"
  });
  const outcomes = splitLines(formData.get("outcomes"));

  const lessonId = crypto.randomUUID();
  const { error: lessonError } = await supabase.from("lessons").insert({
    id: lessonId,
    title: parsed.title,
    subtitle: nullableText(parsed.subtitle),
    topic: parsed.topic,
    category: nullableText(parsed.category),
    level: parsed.level,
    description: outcomes.length > 0 ? JSON.stringify({ outcomes }) : parsed.description ?? "",
    thumbnail_path: nullableText(parsed.thumbnailPath),
    cover_image_path: nullableText(parsed.coverImagePath),
    duration_minutes: optionalPositiveInt(parsed.durationMinutes),
    estimated_completion_minutes: optionalPositiveInt(parsed.estimatedCompletionMinutes),
    timer_minutes: optionalPositiveInt(parsed.timerMinutes),
    pdf_path: `builder/${lessonId}`,
    status: "DRAFT",
    created_by: user.id
  });
  if (lessonError) throw lessonError;

  const firstSlideTitle = parsed.subtitle || parsed.title;
  const { error: slideError } = await supabase.from("slides").insert({
    lesson_id: lessonId,
    slide_number: 1,
    title: firstSlideTitle,
    section_label: "Introduction",
    raw_text: firstSlideTitle,
    type: "INFO"
  });
  if (slideError) throw slideError;

  revalidatePath("/admin/lessons");
  redirect(`/admin/lessons/${lessonId}/builder`);
}

export async function updateLessonStatus(lessonId: string, status: "DRAFT" | "PUBLISHED") {
  await requireLessonAccess(lessonId);
  const supabase = createAdminClient();
  const { data: lesson } = await supabase.from("lessons").select("title,status").eq("id", lessonId).maybeSingle();
  const { error } = await supabase.from("lessons").update({ status }).eq("id", lessonId);
  if (error) throw error;
  if (status === "PUBLISHED" && lesson?.status !== "PUBLISHED") {
    const lessonTitle = lesson?.title || "A new lesson";
    const { data: placements } = await supabase.from("course_items").select("course_id").eq("lesson_id", lessonId);
    const courseIds = [...new Set((placements ?? []).map((placement) => placement.course_id).filter(Boolean))];
    if (courseIds.length) {
      const { data: enrollments } = await supabase.from("course_enrollments").select("user_id,course_id").in("course_id", courseIds).in("status", ["ACTIVE", "COMPLETED"]);
      await Promise.all((enrollments ?? []).map((enrollment) => notifyUser({ userId: enrollment.user_id, type: "LESSON_PUBLISHED", title: "A lesson is ready", detail: lessonTitle, href: `/lessons/${lessonId}?courseId=${enrollment.course_id}`, tone: "purple", dedupeKey: `lesson-published:${lessonId}:${enrollment.user_id}` })));
    }
  }
  revalidatePath("/admin/lessons");
  revalidatePath(`/admin/lessons/${lessonId}/edit`);
}

export async function updateLessonDetails(lessonId: string, formData: FormData) {
  await requireLessonAccess(lessonId);
  const supabase = createAdminClient();
  const parsed = lessonSchema.parse({
    title: formData.get("title"),
    topic: formData.get("topic"),
    level: formData.get("level"),
    description: formData.get("description")
  });

  const { error } = await supabase
    .from("lessons")
    .update({
      title: parsed.title,
      topic: parsed.topic,
      level: parsed.level,
      description: parsed.description ?? ""
    })
    .eq("id", lessonId);

  if (error) throw error;
  revalidatePath("/admin/lessons");
  revalidatePath(`/admin/lessons/${lessonId}/edit`);
  revalidatePath(`/lessons/${lessonId}`);
}

export async function updateLessonBuilderDetails(lessonId: string, formData: FormData) {
  await requireLessonAccess(lessonId);
  const supabase = createAdminClient();
  const parsed = builderLessonSchema.parse({
    title: formData.get("title"),
    subtitle: formData.get("subtitle") || "",
    topic: formData.get("topic"),
    category: formData.get("category") || "",
    level: formData.get("level"),
    description: formData.get("description") || "",
    thumbnailPath: formData.get("thumbnailPath") || "",
    coverImagePath: formData.get("coverImagePath") || "",
    durationMinutes: formData.get("durationMinutes") || "",
    estimatedCompletionMinutes: formData.get("estimatedCompletionMinutes") || "",
    timerMinutes: formData.get("timerMinutes") || "",
    status: formData.get("status")
  });
  const outcomes = splitLines(formData.get("outcomes"));
  const description = outcomes.length > 0 ? JSON.stringify({ outcomes }) : parsed.description ?? "";

  const { error } = await supabase
    .from("lessons")
    .update({
      title: parsed.title,
      subtitle: nullableText(parsed.subtitle),
      topic: parsed.topic,
      category: nullableText(parsed.category),
      level: parsed.level,
      description,
      thumbnail_path: nullableText(parsed.thumbnailPath),
      cover_image_path: nullableText(parsed.coverImagePath),
      duration_minutes: optionalPositiveInt(parsed.durationMinutes),
      estimated_completion_minutes: optionalPositiveInt(parsed.estimatedCompletionMinutes),
      timer_minutes: optionalPositiveInt(parsed.timerMinutes),
      status: parsed.status
    })
    .eq("id", lessonId);

  if (error) throw error;
  revalidateLessonBuilder(lessonId);
}

export async function deleteLesson(lessonId: string) {
  const { user } = await requireLessonAccess(lessonId);
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("lessons")
    .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
    .eq("id", lessonId);
  if (error) throw error;
  revalidatePath("/admin");
  revalidatePath("/admin/lessons");
  revalidatePath("/admin/lessons/trash");
  revalidatePath("/lessons");
}

export async function restoreLesson(lessonId: string) {
  await requireLessonAccess(lessonId);
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("lessons")
    .update({ deleted_at: null, deleted_by: null })
    .eq("id", lessonId);
  if (error) throw error;
  revalidatePath("/admin");
  revalidatePath("/admin/lessons");
  revalidatePath("/admin/lessons/trash");
  revalidatePath("/lessons");
}

export async function permanentlyDeleteLesson(lessonId: string) {
  await requireLessonAccess(lessonId);
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("lessons")
    .delete()
    .eq("id", lessonId)
    .not("deleted_at", "is", null);
  if (error) throw error;
  revalidatePath("/admin");
  revalidatePath("/admin/lessons");
  revalidatePath("/admin/lessons/trash");
  revalidatePath("/lessons");
}

export async function duplicateLesson(lessonId: string) {
  await requireLessonAccess(lessonId);
  const supabase = createAdminClient();

  const { data: source, error: lessonErr } = await supabase
    .from("lessons")
    .select("*")
    .eq("id", lessonId)
    .single();
  if (lessonErr || !source) throw new Error("Lesson not found");

  const { data: newLesson, error: insertErr } = await supabase
    .from("lessons")
    .insert({
      title: `Copy of ${source.title}`,
      subtitle: source.subtitle,
      topic: source.topic,
      category: source.category,
      level: source.level,
      description: source.description,
      thumbnail_path: source.thumbnail_path,
      cover_image_path: source.cover_image_path,
      duration_minutes: source.duration_minutes,
      estimated_completion_minutes: source.estimated_completion_minutes,
      timer_minutes: source.timer_minutes,
      pdf_path: source.pdf_path,
      status: "DRAFT",
    })
    .select("id")
    .single();
  if (insertErr || !newLesson) throw new Error("Failed to duplicate lesson");

  const newLessonId = newLesson.id;

  const { data: slides } = await supabase
    .from("slides")
    .select("*")
    .eq("lesson_id", lessonId)
    .order("slide_number", { ascending: true });

  const slideIdMap: Record<string, string> = {};

  if (slides?.length) {
    const { data: newSlides, error: slidesErr } = await supabase
      .from("slides")
      .insert(
        slides.map((s) => ({
          lesson_id: newLessonId,
          slide_number: s.slide_number,
          title: s.title,
          section_label: s.section_label,
          raw_text: s.raw_text,
          type: s.type,
          linked_answer_slide_id: null,
        }))
      )
      .select("id, slide_number");
    if (slidesErr) throw new Error("Failed to duplicate slides");

    slides.forEach((oldSlide) => {
      const match = newSlides?.find((ns) => ns.slide_number === oldSlide.slide_number);
      if (match) slideIdMap[oldSlide.id] = match.id;
    });

    const slidesWithLinks = slides.filter((s) => s.linked_answer_slide_id);
    for (const s of slidesWithLinks) {
      const newSlideId = slideIdMap[s.id];
      const newLinkedId = s.linked_answer_slide_id ? slideIdMap[s.linked_answer_slide_id] : null;
      if (newSlideId && newLinkedId) {
        await supabase.from("slides").update({ linked_answer_slide_id: newLinkedId }).eq("id", newSlideId);
      }
    }

    const { data: activities } = await supabase.from("slide_activities").select("*").eq("lesson_id", lessonId);
    if (activities?.length) {
      const { error: actErr } = await supabase.from("slide_activities").insert(
        activities
          .filter((a) => slideIdMap[a.slide_id])
          .map((a) => ({
            lesson_id: newLessonId,
            slide_id: slideIdMap[a.slide_id],
            activity_type: a.activity_type,
            prompt: a.prompt,
            items: a.items,
            answer_key: a.answer_key,
          }))
      );
      if (actErr) throw new Error("Failed to duplicate slide activities");
    }

    const { data: blocks } = await supabase
      .from("lesson_blocks")
      .select("*")
      .eq("lesson_id", lessonId)
      .order("position", { ascending: true });
    if (blocks?.length) {
      const { error: blockErr } = await supabase.from("lesson_blocks").insert(
        blocks
          .filter((b) => slideIdMap[b.slide_id])
          .map((b) => ({
            lesson_id: newLessonId,
            slide_id: slideIdMap[b.slide_id],
            position: b.position,
            block_type: b.block_type,
            content: b.content,
          }))
      );
      if (blockErr) throw new Error("Failed to duplicate lesson blocks");
    }
  }

  const { data: audioFiles } = await supabase.from("lesson_audio_files").select("*").eq("lesson_id", lessonId);
  if (audioFiles?.length) {
    const { error: audioErr } = await supabase.from("lesson_audio_files").insert(
      audioFiles.map((af) => ({
        lesson_id: newLessonId,
        label: af.label,
        storage_path: af.storage_path,
        storage_provider: af.storage_provider ?? "supabase",
        storage_bucket: af.storage_bucket ?? "lesson-audio",
        public_url: af.public_url ?? null,
        linked_slide_number: af.linked_slide_number,
      }))
    );
    if (audioErr) throw new Error("Failed to duplicate audio files");
  }

  revalidatePath("/admin/lessons");
}

export async function updateSlide(formData: FormData) {
  const slideId = String(formData.get("slideId"));
  const lessonId = String(formData.get("lessonId"));
  await requireLessonAccess(lessonId);
  const supabase = createAdminClient();
  const activityId = String(formData.get("activityId") || "");
  const linkedAnswerSlideId = String(formData.get("linkedAnswerSlideId") || "") || null;

  const type = String(formData.get("type")) as SlideType;
  const { error: slideError } = await supabase
    .from("slides")
    .update({
      type,
      title: String(formData.get("title") || ""),
      section_label: String(formData.get("sectionLabel") || "") || null,
      linked_answer_slide_id: linkedAnswerSlideId
    })
    .eq("id", slideId);
  if (slideError) throw slideError;

  if (activityId) {
    const items = JSON.parse(String(formData.get("items") || "{}")) as Json;
    const answerKeyRaw = String(formData.get("answerKey") || "").trim();
    const answer_key = answerKeyRaw ? (JSON.parse(answerKeyRaw) as Json) : null;

    const { error: activityError } = await supabase
      .from("slide_activities")
      .update({
        activity_type: String(formData.get("activityType") || type),
        prompt: String(formData.get("prompt") || ""),
        items,
        answer_key
      })
      .eq("id", activityId);
    if (activityError) throw activityError;
  }

  const audioId = String(formData.get("audioId") || "");
  const slideNumber = Number(formData.get("slideNumber"));
  if (audioId) {
    await supabase
      .from("lesson_audio_files")
      .update({ linked_slide_number: Number.isFinite(slideNumber) ? slideNumber : null })
      .eq("id", audioId);
  }

  revalidatePath(`/admin/lessons/${lessonId}/edit`);
}

export async function addBuilderSlide(lessonId: string, formData: FormData) {
  const { user, profile } = await requireLessonAccess(lessonId);
  const supabase = createAdminClient();
  const { data: slides, error: slidesError } = await supabase
    .from("slides")
    .select("slide_number")
    .eq("lesson_id", lessonId)
    .is("deleted_at", null)
    .order("slide_number", { ascending: false })
    .limit(1);
  if (slidesError) throw slidesError;

  const nextSlideNumber = (slides?.[0]?.slide_number ?? 0) + 1;
  await assertCreatorWithinLimit(user.id, profile?.role, "SLIDES_PER_LESSON", nextSlideNumber - 1, "slides in this lesson");
  const title = String(formData.get("title") || `Slide ${nextSlideNumber}`).trim();
  const type = String(formData.get("type") || "INFO") as SlideType;
  const rawText = String(formData.get("rawText") || title).trim();

  const { error } = await supabase.from("slides").insert({
    lesson_id: lessonId,
    slide_number: nextSlideNumber,
    title,
    section_label: nullableText(formData.get("sectionLabel")),
    raw_text: rawText || title,
    type
  });

  if (error) throw error;
  revalidateLessonBuilder(lessonId);
}

export async function addBuilderSlideAt(
  lessonId: string,
  afterSlideNumber: number,
  title: string,
  sectionLabel: string
) {
  const { user, profile } = await requireLessonAccess(lessonId);
  const supabase = createAdminClient();

  const { count: slideCount } = await supabase.from("slides").select("id", { count: "exact", head: true }).eq("lesson_id", lessonId).is("deleted_at", null);
  await assertCreatorWithinLimit(user.id, profile?.role, "SLIDES_PER_LESSON", slideCount ?? 0, "slides in this lesson");

  const { data: slidesToShift } = await supabase
    .from("slides")
    .select("id, slide_number")
    .eq("lesson_id", lessonId)
    .is("deleted_at", null)
    .gt("slide_number", afterSlideNumber)
    .order("slide_number", { ascending: false });

  for (const slide of slidesToShift ?? []) {
    await supabase
      .from("slides")
      .update({ slide_number: slide.slide_number + 1 })
      .eq("id", slide.id);
  }

  const { data: insertedSlide, error: insertError } = await supabase.from("slides").insert({
    lesson_id: lessonId,
    slide_number: afterSlideNumber + 1,
    title: title || "New Slide",
    section_label: sectionLabel || null,
    raw_text: "",
    type: "INFO",
  }).select("id").single();
  if (insertError) throw insertError;

  await syncLessonSlideActivityNumbers(supabase, lessonId);
  revalidatePath(`/admin/lessons/${lessonId}/builder`);
  return insertedSlide?.id ?? null;
}

export async function updateBuilderSlide(lessonId: string, slideId: string, formData: FormData) {
  await requireLessonAccess(lessonId);
  const supabase = createAdminClient();
  const title = String(formData.get("title") || "").trim();
  const rawText = String(formData.get("rawText") || "").trim();

  const contentOrderRaw = String(formData.get("contentOrder") || "LEARN_FIRST");
  const contentOrder = contentOrderRaw === "PRACTICE_FIRST" ? "PRACTICE_FIRST" : "LEARN_FIRST";
  const requirePracticeBeforeLearn = contentOrder === "PRACTICE_FIRST" && formData.get("requirePracticeBeforeLearn") === "on";

  const { error } = await supabase
    .from("slides")
    .update({
      title: title || "Untitled slide",
      section_label: nullableText(formData.get("sectionLabel")),
      type: String(formData.get("type") || "INFO") as SlideType,
      raw_text: rawText || title || "Untitled slide",
      content_order: contentOrder,
      require_practice_before_learn: requirePracticeBeforeLearn
    })
    .eq("id", slideId)
    .eq("lesson_id", lessonId);

  if (error) throw error;
  revalidateLessonBuilder(lessonId);
}

export async function duplicateBuilderSlide(lessonId: string, slideId: string, afterSlideNumber?: number) {
  await requireLessonAccess(lessonId);
  const supabase = createAdminClient();
  const [{ data: source, error: sourceError }, { data: slides, error: slidesError }] = await Promise.all([
    supabase.from("slides").select("*").eq("id", slideId).eq("lesson_id", lessonId).is("deleted_at", null).single(),
    supabase.from("slides").select("id, slide_number").eq("lesson_id", lessonId).is("deleted_at", null).order("slide_number", { ascending: true })
  ]);
  if (sourceError) throw sourceError;
  if (slidesError) throw slidesError;

  const orderedSlides = slides ?? [];
  const maxSlideNumber = orderedSlides[orderedSlides.length - 1]?.slide_number ?? 0;
  const requestedAfter = Number.isFinite(afterSlideNumber) ? Math.round(Number(afterSlideNumber)) : source.slide_number;
  const insertAfter = Math.min(Math.max(requestedAfter, 0), maxSlideNumber);
  const nextSlideNumber = insertAfter + 1;

  const slidesToShift = orderedSlides
    .filter((slide) => slide.slide_number > insertAfter)
    .sort((a, b) => b.slide_number - a.slide_number);

  for (const slide of slidesToShift) {
    const { error: shiftError } = await supabase
      .from("slides")
      .update({ slide_number: slide.slide_number + 1 })
      .eq("id", slide.id)
      .eq("lesson_id", lessonId);
    if (shiftError) throw shiftError;
  }

  const { data: duplicatedSlide, error } = await supabase.from("slides").insert({
    lesson_id: lessonId,
    slide_number: nextSlideNumber,
    title: `${source.title} copy`,
    section_label: source.section_label,
    raw_text: source.raw_text,
    type: source.type,
    linked_answer_slide_id: null,
    content_order: source.content_order ?? "LEARN_FIRST",
    require_practice_before_learn: Boolean(source.require_practice_before_learn),
  }).select("id").single();

  if (error) throw error;
  if (!duplicatedSlide) throw new Error("The slide was duplicated, but the new slide ID was not returned.");

  const [{ data: blocks, error: blocksError }, { data: activities, error: activityError }] = await Promise.all([
    supabase.from("lesson_blocks").select("*").eq("slide_id", slideId).eq("lesson_id", lessonId).order("position", { ascending: true }),
    supabase.from("lesson_slide_activities").select("*").eq("slide_id", slideId).eq("lesson_id", lessonId)
  ]);
  if (blocksError) throw blocksError;
  if (activityError) throw activityError;

  if (blocks?.length) {
    const { error: blockInsertError } = await supabase.from("lesson_blocks").insert(
      blocks.map((block) => ({
        lesson_id: lessonId,
        slide_id: duplicatedSlide.id,
        position: block.position,
        block_type: block.block_type,
        content: block.content
      }))
    );
    if (blockInsertError) throw blockInsertError;
  }

  if (activities?.length) {
    const { error: activityInsertError } = await supabase.from("lesson_slide_activities").insert(
      activities.map((activity) => ({
        lesson_id: lessonId,
        slide_id: duplicatedSlide.id,
        slide_number: nextSlideNumber,
        activity_type: activity.activity_type,
        activity_data: activity.activity_data,
        needs_review: activity.needs_review,
        raw_text: activity.raw_text
      }))
    );
    if (activityInsertError) throw activityInsertError;
  }

  await syncLessonSlideActivityNumbers(supabase, lessonId);
  revalidateLessonBuilder(lessonId);
  return duplicatedSlide.id as string;
}

export async function deleteBuilderSlide(lessonId: string, slideId: string) {
  const { user } = await requireLessonAccess(lessonId);
  const supabase = createAdminClient();
  const { data: slide, error: slideError } = await supabase
    .from("slides")
    .select("slide_number")
    .eq("id", slideId)
    .eq("lesson_id", lessonId)
    .is("deleted_at", null)
    .single();
  if (slideError) throw slideError;

  // The slide is recoverable. Its blocks, activities, learner attempts, and
  // assessment evidence remain available when a creator restores it.
  const { error } = await supabase.from("slides").update({
    deleted_at: new Date().toISOString(),
    deleted_by: user.id,
    slide_number: -Math.abs(slide.slide_number || 1) - 100000,
  }).eq("id", slideId).eq("lesson_id", lessonId);
  if (error) throw error;

  const { data: slides, error: slidesError } = await supabase
    .from("slides")
    .select("id")
    .eq("lesson_id", lessonId)
    .is("deleted_at", null)
    .order("slide_number", { ascending: true });
  if (slidesError) throw slidesError;
  await reorderSlides(lessonId, (slides ?? []).map((slide) => slide.id));
  await syncLessonSlideActivityNumbers(supabase, lessonId);
  revalidateLessonBuilder(lessonId);
}

export async function restoreBuilderSlide(lessonId: string, slideId: string) {
  await requireLessonAccess(lessonId);
  const supabase = createAdminClient();
  const [{ data: trashedSlide, error: trashedError }, { count: activeCount, error: countError }] = await Promise.all([
    supabase.from("slides").select("id").eq("id", slideId).eq("lesson_id", lessonId).not("deleted_at", "is", null).maybeSingle(),
    supabase.from("slides").select("id", { count: "exact", head: true }).eq("lesson_id", lessonId).is("deleted_at", null),
  ]);
  if (trashedError) throw trashedError;
  if (countError) throw countError;
  if (!trashedSlide) return null;

  const { error } = await supabase.from("slides").update({
    deleted_at: null,
    deleted_by: null,
    slide_number: (activeCount ?? 0) + 1,
  }).eq("id", slideId).eq("lesson_id", lessonId);
  if (error) throw error;
  await syncLessonSlideActivityNumbers(supabase, lessonId);
  revalidateLessonBuilder(lessonId);
  return slideId;
}

export async function permanentlyDeleteBuilderSlide(lessonId: string, slideId: string) {
  await requireLessonAccess(lessonId);
  const supabase = createAdminClient();
  const { data: slide, error: slideError } = await supabase
    .from("slides")
    .select("id")
    .eq("id", slideId)
    .eq("lesson_id", lessonId)
    .not("deleted_at", "is", null)
    .maybeSingle();
  if (slideError) throw slideError;
  if (!slide) return { success: false, error: "This slide is no longer in the trash." };

  // Content can be removed from the lesson, but assessment evidence is permanent.
  // Archive the source items before deleting the activity so historical grades,
  // outcome attainment, and learner profiles remain auditable.
  const { data: activities, error: activitiesError } = await supabase
    .from("lesson_slide_activities")
    .select("id")
    .eq("lesson_id", lessonId)
    .eq("slide_id", slideId);
  if (activitiesError) throw activitiesError;
  const activityIds = (activities ?? []).map((activity) => activity.id);
  if (activityIds.length) {
    const { data: assessmentItems, error: itemError } = await supabase
      .from("assessment_items")
      .select("id,source_item_key,prompt_snapshot")
      .in("lesson_activity_id", activityIds);
    if (itemError) throw itemError;
    const itemIds = (assessmentItems ?? []).map((item) => item.id);
    if (itemIds.length) {
      const deletedAt = new Date().toISOString();
      const { error: itemArchiveError } = await supabase
        .from("assessment_items")
        .update({
          status: "ARCHIVED",
          source_deleted_at: deletedAt,
          source_label_snapshot: `Deleted lesson activity ${activityIds[0]}`,
        })
        .in("id", itemIds);
      if (itemArchiveError) throw itemArchiveError;
      const { error: attemptArchiveError } = await supabase
        .from("assessment_attempts")
        .update({
          source_deleted_at: deletedAt,
          source_label_snapshot: `Deleted lesson activity ${activityIds[0]}`,
        })
        .in("lesson_activity_id", activityIds);
      if (attemptArchiveError) throw attemptArchiveError;
    }
  }

  const { error } = await supabase.from("slides").delete().eq("id", slideId).eq("lesson_id", lessonId);
  if (error) throw error;
  revalidateLessonBuilder(lessonId);
  return { success: true };
}

export async function moveBuilderSlide(lessonId: string, slideId: string, direction: "up" | "down") {
  await requireLessonAccess(lessonId);
  const supabase = createAdminClient();
  const { data: slides, error } = await supabase
    .from("slides")
    .select("id")
    .eq("lesson_id", lessonId)
    .is("deleted_at", null)
    .order("slide_number", { ascending: true });
  if (error) throw error;

  const orderedIds = (slides ?? []).map((slide) => slide.id);
  const index = orderedIds.indexOf(slideId);
  if (index === -1) return;
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= orderedIds.length) return;

  [orderedIds[index], orderedIds[nextIndex]] = [orderedIds[nextIndex], orderedIds[index]];
  await reorderSlides(lessonId, orderedIds);
  revalidateLessonBuilder(lessonId);
}

export async function moveBuilderSlideToPosition(lessonId: string, slideId: string, formData: FormData) {
  await requireLessonAccess(lessonId);
  const targetPosition = Number(formData.get("position"));
  if (!Number.isFinite(targetPosition) || targetPosition < 1) return;

  const supabase = createAdminClient();
  const { data: slides, error } = await supabase
    .from("slides")
    .select("id")
    .eq("lesson_id", lessonId)
    .is("deleted_at", null)
    .order("slide_number", { ascending: true });
  if (error) throw error;

  const orderedIds = (slides ?? []).map((slide) => slide.id);
  const fromIndex = orderedIds.indexOf(slideId);
  const toIndex = Math.min(Math.max(Math.round(targetPosition) - 1, 0), orderedIds.length - 1);
  if (fromIndex === -1 || fromIndex === toIndex) return;

  const [moved] = orderedIds.splice(fromIndex, 1);
  orderedIds.splice(toIndex, 0, moved);
  await reorderSlides(lessonId, orderedIds);
  revalidateLessonBuilder(lessonId);
}

export async function reorderBuilderSlides(lessonId: string, orderedIds: string[]) {
  await requireLessonAccess(lessonId);
  await reorderSlides(lessonId, orderedIds);
  revalidateLessonBuilder(lessonId);
}

export async function addLessonBlock(lessonId: string, slideId: string, formData: FormData) {
  await requireLessonAccess(lessonId);
  const supabase = createAdminClient();
  const parsed = lessonBlockSchema.parse({ blockType: formData.get("blockType") });

  const { data: blocks, error: blocksError } = await supabase
    .from("lesson_blocks")
    .select("position")
    .eq("slide_id", slideId)
    .order("position", { ascending: false })
    .limit(1);
  if (blocksError) throw blocksError;

  const { error } = await supabase.from("lesson_blocks").insert({
    lesson_id: lessonId,
    slide_id: slideId,
    position: (blocks?.[0]?.position ?? 0) + 1,
    block_type: parsed.blockType,
    content: defaultBlockContent(parsed.blockType)
  });

  if (error) throw error;
  revalidateLessonBuilder(lessonId);
}

export async function updateLessonBlock(lessonId: string, blockId: string, formData: FormData) {
  await requireLessonAccess(lessonId);
  const supabase = createAdminClient();
  const parsed = lessonBlockSchema.parse({ blockType: formData.get("blockType") });
  const content = blockContentFromForm(parsed.blockType, formData);

  const { error } = await supabase
    .from("lesson_blocks")
    .update({
      block_type: parsed.blockType,
      content
    })
    .eq("id", blockId)
    .eq("lesson_id", lessonId);

  if (error) throw error;

  try {
    await registerMediaFromBlock(supabase, lessonId, parsed.blockType, content);
  } catch (mediaError) {
    console.error("media_assets registration failed", mediaError);
  }

  revalidateLessonBuilder(lessonId);
}

export async function deleteLessonBlock(lessonId: string, slideId: string, blockId: string) {
  await requireLessonAccess(lessonId);
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("lesson_blocks")
    .delete()
    .eq("id", blockId)
    .eq("lesson_id", lessonId)
    .eq("slide_id", slideId);
  if (error) throw error;

  const { data: blocks, error: blocksError } = await supabase
    .from("lesson_blocks")
    .select("id")
    .eq("slide_id", slideId)
    .order("position", { ascending: true });
  if (blocksError) throw blocksError;
  await reorderBlocks(slideId, (blocks ?? []).map((block) => block.id));
  revalidateLessonBuilder(lessonId);
}

export async function moveLessonBlock(lessonId: string, slideId: string, blockId: string, direction: "up" | "down") {
  await requireLessonAccess(lessonId);
  const supabase = createAdminClient();
  const { data: blocks, error } = await supabase
    .from("lesson_blocks")
    .select("id")
    .eq("slide_id", slideId)
    .order("position", { ascending: true });
  if (error) throw error;

  const orderedIds = (blocks ?? []).map((block) => block.id);
  const index = orderedIds.indexOf(blockId);
  if (index === -1) return;
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= orderedIds.length) return;

  [orderedIds[index], orderedIds[nextIndex]] = [orderedIds[nextIndex], orderedIds[index]];
  await reorderBlocks(slideId, orderedIds);
  revalidateLessonBuilder(lessonId);
}

export async function reorderLessonBlocks(lessonId: string, slideId: string, orderedIds: string[]) {
  await requireLessonAccess(lessonId);
  const supabase = createAdminClient();
  const { data: blocks, error } = await supabase
    .from("lesson_blocks")
    .select("id")
    .eq("lesson_id", lessonId)
    .eq("slide_id", slideId)
    .order("position", { ascending: true });
  if (error) throw error;
  const currentIds = (blocks ?? []).map((block) => block.id);
  if (currentIds.length !== orderedIds.length || currentIds.some((id) => !orderedIds.includes(id))) {
    throw new Error("The content blocks changed before the new order could be saved. Please try again.");
  }
  await reorderBlocks(slideId, orderedIds);
  revalidateLessonBuilder(lessonId);
}

export async function moveSlideActivityToSlide(lessonId: string, activityId: string, formData: FormData) {
  try {
    await requireLessonAccess(lessonId);
    const targetSlideId = String(formData.get("slideId") || "");
    const replaceExisting = formData.get("replaceExisting") === "true";
    if (!targetSlideId) return;

    const supabase = createAdminClient();
    const { data: slide, error: slideError } = await supabase
      .from("slides")
      .select("id, slide_number")
      .eq("id", targetSlideId)
      .eq("lesson_id", lessonId)
      .single();
    if (slideError) throw slideError;

    if (replaceExisting) {
      const { error: deleteError } = await supabase
        .from("lesson_slide_activities")
        .delete()
        .eq("lesson_id", lessonId)
        .eq("slide_id", slide.id)
        .neq("id", activityId);
      if (deleteError) throw deleteError;
    }

    const { error } = await supabase
      .from("lesson_slide_activities")
      .update({
        slide_id: slide.id,
        slide_number: slide.slide_number,
        updated_at: new Date().toISOString()
      })
      .eq("id", activityId)
      .eq("lesson_id", lessonId);
    if (error) throw error;
    revalidateLessonBuilder(lessonId);
    return;
  } catch (error) {
    console.error("moveSlideActivityToSlide failed", error);
    return;
  }
}

export async function copySlideActivityToSlide(lessonId: string, activityId: string, formData: FormData) {
  try {
    await requireLessonAccess(lessonId);
    const targetSlideId = String(formData.get("slideId") || "");
    const replaceExisting = formData.get("replaceExisting") === "true";
    if (!targetSlideId) return;

    const supabase = createAdminClient();
    const { data: source, error: sourceError } = await supabase
      .from("lesson_slide_activities")
      .select("activity_type, activity_data, needs_review, raw_text")
      .eq("id", activityId)
      .eq("lesson_id", lessonId)
      .single();
    if (sourceError) throw sourceError;

    const { data: slide, error: slideError } = await supabase
      .from("slides")
      .select("id, slide_number")
      .eq("id", targetSlideId)
      .eq("lesson_id", lessonId)
      .single();
    if (slideError) throw slideError;

    if (replaceExisting) {
      const { error: deleteError } = await supabase
        .from("lesson_slide_activities")
        .delete()
        .eq("lesson_id", lessonId)
        .eq("slide_id", slide.id);
      if (deleteError) throw deleteError;
    }

    const { error } = await supabase.from("lesson_slide_activities").insert({
      lesson_id: lessonId,
      slide_id: slide.id,
      slide_number: slide.slide_number,
      activity_type: source.activity_type,
      activity_data: source.activity_data,
      needs_review: source.needs_review,
      raw_text: source.raw_text
    });

    if (error) throw error;
    revalidateLessonBuilder(lessonId);
    return;
  } catch (error) {
    console.error("copySlideActivityToSlide failed", error);
    return;
  }
}

export async function moveOrCopySlideActivityToSlide(lessonId: string, activityId: string, formData: FormData) {
  const mode = String(formData.get("mode") || "move");
  return mode === "copy"
    ? copySlideActivityToSlide(lessonId, activityId, formData)
    : moveSlideActivityToSlide(lessonId, activityId, formData);
}

export async function addLessonSlideActivity(lessonId: string, slideId: string, slideNumber: number, formData: FormData) {
  try {
    await requireLessonAccess(lessonId);
    const supabase = createAdminClient();
    const { data: slide, error: slideError } = await supabase
      .from("slides")
      .select("id")
      .eq("id", slideId)
      .eq("lesson_id", lessonId)
      .is("deleted_at", null)
      .maybeSingle();
    if (slideError) throw slideError;
    if (!slide) throw new Error("This slide is no longer available.");

    const activityType = String(formData.get("activityType") || "MCQ");
    const prompt = String(formData.get("prompt") || defaultActivityPrompt(activityType)).trim();

    const { error } = await supabase.from("lesson_slide_activities").insert({
      lesson_id: lessonId,
      slide_id: slideId,
      slide_number: slideNumber,
      activity_type: activityType,
      activity_data: defaultActivityData(activityType, prompt),
      needs_review: true,
      raw_text: prompt
    });

    if (error) throw error;
    revalidateLessonBuilder(lessonId);
    return;
  } catch (error) {
    console.error("addLessonSlideActivity failed", error);
    throw new Error(getErrorMessage(error));
  }
}

export async function seedAllActivitiesReferenceLesson(lessonId: string) {
  const { profile } = await requireLessonAccess(lessonId);
  if (!isPlatformAdmin(profile?.role)) throw new Error("Only a platform admin can seed the activity reference lesson.");

  const supabase = createAdminClient();
  const { data: lesson, error: lessonError } = await supabase
    .from("lessons")
    .select("id, title, status")
    .eq("id", lessonId)
    .is("deleted_at", null)
    .single();
  if (lessonError) throw lessonError;
  if (lesson.title !== "All Activities (Admin Only)") throw new Error("This protected action only works for the All Activities (Admin Only) lesson.");
  if (lesson.status !== "DRAFT") throw new Error("Keep the activity reference lesson in draft status before seeding it.");

  const [{ data: slides, error: slidesError }, { data: activities, error: activitiesError }] = await Promise.all([
    supabase.from("slides").select("id, slide_number, title, section_label").eq("lesson_id", lessonId).is("deleted_at", null).order("slide_number", { ascending: true }),
    supabase.from("lesson_slide_activities").select("id, slide_id, slide_number, activity_type").eq("lesson_id", lessonId).is("deleted_at", null),
  ]);
  if (slidesError) throw slidesError;
  if (activitiesError) throw activitiesError;

  const referenceByType = new Map(ALL_ACTIVITIES_REFERENCE.map((item) => [item.type, item]));
  const existingByType = new Map((activities ?? []).map((activity) => [activity.activity_type, activity]));
  let nextSlideNumber = Math.max(0, ...(slides ?? []).map((slide) => slide.slide_number)) + 1;
  let added = 0;

  // Repair the original two-placeholder layout so every reference activity has its own slide.
  const originalSlide = (slides ?? []).find((slide) => slide.slide_number === 1);
  const oralActivity = existingByType.get("ORAL_RESPONSE");
  const dialogueActivity = existingByType.get("DIALOGUE_WRITING");
  if (originalSlide && oralActivity && oralActivity.slide_id === originalSlide.id) {
    const oralReference = referenceByType.get("ORAL_RESPONSE");
    await supabase.from("slides").update({ title: "ORAL_RESPONSE", section_label: "Speaking", raw_text: "ORAL_RESPONSE" }).eq("id", originalSlide.id).eq("lesson_id", lessonId);
    if (oralReference) await supabase.from("lesson_slide_activities").update({ activity_data: oralReference.data, raw_text: oralReference.prompt, updated_at: new Date().toISOString() }).eq("id", oralActivity.id).eq("lesson_id", lessonId);
  }
  if (originalSlide && dialogueActivity && dialogueActivity.slide_id === originalSlide.id) {
    const dialogueReference = referenceByType.get("DIALOGUE_WRITING");
    const { data: newSlide, error: newSlideError } = await supabase.from("slides").insert({ lesson_id: lessonId, slide_number: nextSlideNumber, title: "DIALOGUE_WRITING", section_label: "Writing", raw_text: "DIALOGUE_WRITING", type: "INFO" }).select("id, slide_number").single();
    if (newSlideError) throw newSlideError;
    if (dialogueReference) {
      const { error: moveError } = await supabase.from("lesson_slide_activities").update({ slide_id: newSlide.id, slide_number: newSlide.slide_number, activity_data: dialogueReference.data, raw_text: dialogueReference.prompt, updated_at: new Date().toISOString() }).eq("id", dialogueActivity.id).eq("lesson_id", lessonId);
      if (moveError) throw moveError;
    }
    nextSlideNumber += 1;
  }

  for (const reference of ALL_ACTIVITIES_REFERENCE) {
    if (existingByType.has(reference.type)) continue;
    const { data: slide, error: slideError } = await supabase.from("slides").insert({ lesson_id: lessonId, slide_number: nextSlideNumber, title: reference.type, section_label: reference.category, raw_text: reference.type, type: "INFO" }).select("id, slide_number").single();
    if (slideError) throw slideError;
    const { error: activityError } = await supabase.from("lesson_slide_activities").insert({ lesson_id: lessonId, slide_id: slide.id, slide_number: slide.slide_number, activity_type: reference.type, activity_data: reference.data, needs_review: false, raw_text: reference.prompt });
    if (activityError) throw activityError;
    added += 1;
    nextSlideNumber += 1;
  }

  revalidateLessonBuilder(lessonId);
  return { added, total: ALL_ACTIVITIES_REFERENCE.length };
}

export async function rerunParser(lessonId: string) {
  await requireLessonAccess(lessonId);
  await classifyAndExtractLesson(lessonId);
  revalidatePath(`/admin/lessons/${lessonId}/edit`);
}

export async function generateInLessonQuizzes(lessonId: string, formData: FormData) {
  await requireLessonAccess(lessonId);
  const fullText = String(formData.get("fullText") || "");
  const parsedActivities = parseLessonSlideActivities(fullText);
  const supabase = createAdminClient();

  if (parsedActivities.length === 0) {
    throw new Error("No [SLIDE N] sections were found. Please paste lesson text with slide markers.");
  }

  const { data: slides, error: slidesError } = await supabase
    .from("slides")
    .select("id, slide_number")
    .eq("lesson_id", lessonId);
  if (slidesError) throw slidesError;

  const slideIds = new Map((slides ?? []).map((slide) => [slide.slide_number, slide.id]));
  const rows = parsedActivities
    .filter((activity) => slideIds.has(activity.slideNumber))
    .map((activity) => ({
      lesson_id: lessonId,
      slide_id: slideIds.get(activity.slideNumber),
      slide_number: activity.slideNumber,
      activity_type: activity.activityType,
      activity_data: activity.activityData,
      needs_review: activity.needsReview,
      raw_text: activity.rawText,
      updated_at: new Date().toISOString()
    }));

  if (rows.length === 0) {
    throw new Error("The pasted slide numbers did not match any slides in this lesson.");
  }

  const slideNumbers = rows.map((row) => row.slide_number);
  if (slideNumbers.length) {
    const { error: deleteExistingError } = await supabase
      .from("lesson_slide_activities")
      .delete()
      .eq("lesson_id", lessonId)
      .in("slide_number", slideNumbers);
    if (deleteExistingError) throw deleteExistingError;
  }

  const { error } = await supabase.from("lesson_slide_activities").insert(rows);
  if (error) throw error;

  revalidatePath(`/admin/lessons/${lessonId}/edit`);
}

export async function updateInLessonActivity(formData: FormData) {
  return updateSlideActivity({
    activityId: String(formData.get("activityId")),
    lessonId: String(formData.get("lessonId")),
    activityType: String(formData.get("activityType")),
    activityData: String(formData.get("activityData") || "null"),
    needsReview: formData.get("needsReview") === "on"
  });
}

export async function updateSlideActivity(input: {
  activityId: string;
  lessonId: string;
  activityType: string;
  activityData: Json | string | null;
  needsReview?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { user } = await requireLessonAccess(input.lessonId);
    const supabase = createAdminClient();
    const activityData =
      typeof input.activityData === "string"
        ? (JSON.parse(input.activityData || "null") as Json)
        : input.activityData;
    const needsReview = input.needsReview ?? hasMissingActivityAnswers(activityData);

    const { error } = await supabase
      .from("lesson_slide_activities")
      .update({
        activity_type: input.activityType,
        activity_data: activityData,
        needs_review: needsReview,
        updated_at: new Date().toISOString()
      })
      .eq("id", input.activityId);

    if (error) throw error;
    revalidatePath(`/admin/lessons/${input.lessonId}/edit`);
    return { success: true };
  } catch (error) {
    console.error("updateSlideActivity failed", error);
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function deleteSlideActivity(input: {
  activityId: string;
  lessonId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { user } = await requireLessonAccess(input.lessonId);
    const supabase = createAdminClient();
    const { error } = await (supabase.from("lesson_slide_activities") as any)
      .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
      .eq("id", input.activityId).is("deleted_at", null);
    if (error) throw error;
    revalidatePath(`/admin/lessons/${input.lessonId}/edit`);
    return { success: true };
  } catch (error) {
    console.error("deleteSlideActivity failed", error);
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function deleteInLessonActivity(formData: FormData) {
  return deleteSlideActivity({
    activityId: String(formData.get("activityId")),
    lessonId: String(formData.get("lessonId"))
  });
}

function revalidateLessonBuilder(lessonId: string) {
  revalidatePath("/admin/lessons");
  revalidatePath(`/admin/lessons/${lessonId}/edit`);
  revalidatePath(`/admin/lessons/${lessonId}/builder`);
  revalidatePath(`/lessons/${lessonId}`);
}

function defaultActivityPrompt(activityType: string) {
  if (activityType === "MULTIPLE_SELECT") return "Choose all correct answers.";
  if (activityType === "GAP_FILL") return "Complete the sentences.";
  if (activityType === "TRUE_FALSE") return "True or False?";
  if (activityType === "MATCHING") return "Match the items.";
  if (activityType === "DRAG_DROP") return "Move each item to the correct place.";
  if (activityType === "REORDERING") return "Put the items in the correct order.";
  if (activityType === "CATEGORIZATION") return "Sort the items into the correct categories.";
  if (activityType === "SHORT_ANSWER") return "Write a short answer.";
  if (activityType === "ERROR_CORRECTION") return "Find and correct the mistake.";
  if (activityType === "PRONUNCIATION") return "Say each highlighted word clearly.";
  if (activityType === "SUMMARIZATION") return "Summarize the passage in your own words.";
  if (activityType === "INFERENCE_DETECTION") return "Read the passage. What can we infer?";
  if (activityType === "DICTATION") return "Listen to the audio and type what you hear.";
  if (activityType === "LISTEN_AND_SELECT") return "Listen to the audio clip and select the matching option.";
  if (activityType === "SHADOWING") return "Listen to the native speaker and repeat the phrase into your microphone.";
  if (activityType === "NOTE_TAKING_CHALLENGE") return "Listen to the clip, take notes in the scratchpad, and answer the questions.";
  if (activityType === "LISTEN_AND_GAP_FILL") return "Listen to the audio and fill in the missing blanks in the transcript.";
  if (activityType === "SENTENCE_COMPLETION") return "Complete the sentence stem.";
  if (activityType === "ESSAY_WRITING") return "Write an essay responding to the prompt below.";
  if (activityType === "EMAIL_LETTER_WRITING") return "Write a formal email based on the situation.";
  if (activityType === "TRANSLATION") return "Translate the sentence into target language.";
  if (activityType === "PARAPHRASE_PRACTICE") return "Paraphrase the original sentence in your own words.";
  if (activityType === "SENTENCE_COMBINING") return "Combine the simple sentences into a complex sentence.";
  if (activityType === "CREATIVE_WRITING") return "Write a short creative story incorporating the required vocabulary.";
  if (activityType === "PEER_REVIEW_EDITING") return "Edit and critique the sample peer text below.";
  if (activityType === "AI_ROLEPLAY") return "Practice speaking English with me.";
  if (activityType === "LIVE_SPEAK_TRANSLATE") return "Speak in Bangla. Listen to your English translation.";
  return "Choose the best answer.";
}

function defaultActivityData(activityType: string, prompt: string): Json {
  if (activityType === "MULTIPLE_SELECT") {
    return {
      prompt,
      questions: [{ id: 1, text: "", options: { A: "", B: "", C: "", D: "" }, answers: ["A"] }]
    };
  }
  if (activityType === "GAP_FILL") {
    return { prompt, items: [{ level: "sentence", sentence: "", answer: "" }] };
  }
  if (activityType === "TRUE_FALSE") {
    return { prompt, items: [{ statement: "", answer: true }] };
  }
  if (activityType === "MATCHING") {
    return {
      prompt,
      questions: [{ id: "1", question_number: 1, question_type: "MATCHING", question_text: prompt, options: { a_items: [], b_items: [] }, correct_answer: [] }]
    };
  }
  if (activityType === "DRAG_DROP") {
    return { prompt, targets: ["Target"], items: [{ id: "1", text: "Item", target: "Target" }] };
  }
  if (activityType === "PRONUNCIATION") {
    return { prompt, level: "word", max_attempts: 3, passage: "", targets: [{ id: "1", text: "pronunciation", color: "var(--br-achievement)" }] };
  }
  if (activityType === "ORAL_RESPONSE") {
    return {
      prompt,
      allow_self_graded: true,
      allow_ai_feedback: true,
      allow_teacher_review: true,
      questions: [{ id: 1, text: "Speak about the topic in your own words.", model_answer: "", target_phrases: [], max_seconds: 60 }]
    };
  }
  if (activityType === "SUMMARIZATION") {
    return { prompt, passage: "Enter the passage text here.", max_words: 30, sample_answer: "A concise summary." };
  }
  if (activityType === "INFERENCE_DETECTION") {
    return {
      prompt,
      passage: "Enter the passage text here.",
      questions: [{ id: 1, text: "What can we infer from the passage?", options: { A: "", B: "", C: "", D: "" }, answer: "A" }]
    };
  }
  if (activityType === "DICTATION") {
    return { prompt, audio_url: "", correct_answer: "Enter target dictation text here.", hint: "", ignore_punctuation: true };
  }
  if (activityType === "LISTEN_AND_SELECT") {
    return {
      prompt,
      audio_url: "",
      choices: [{ id: "0", text: "Option A", image_url: "" }, { id: "1", text: "Option B", image_url: "" }],
      correct_answer: "0"
    };
  }
  if (activityType === "SHADOWING") {
    return { prompt, audio_url: "", target_text: "Repeat after me.", correct_answer: "Repeat after me." };
  }
  if (activityType === "NOTE_TAKING_CHALLENGE") {
    return {
      prompt,
      media_url: "",
      audio_url: "",
      questions: [{ id: "1", text: "What was the main topic?", options: ["Topic A", "Topic B"] }],
      correct_answer: { "1": "Topic A" }
    };
  }
  if (activityType === "SOUND_DISCRIMINATION") {
    return {
      prompt,
      audio_url: "",
      pairs: [{ id: "0", word: "ship", phonetic: "/ʃɪp/", audio_url: "" }, { id: "1", word: "sheep", phonetic: "/ʃiːp/", audio_url: "" }],
      correct_answer: "0"
    };
  }
  if (activityType === "LISTEN_AND_GAP_FILL") {
    return {
      prompt,
      audio_url: "",
      transcript: "I have been working at this ___ for two years.",
      answers: ["company"],
      correct_answer: ["company"]
    };
  }
  if (activityType === "SENTENCE_COMPLETION") {
    return {
      prompt,
      sentence_stem: "Although it was raining,",
      suggested_connectors: ["nevertheless", "on the other hand"],
      model_answer: "Although it was raining, we decided to go for a hike in the national park.",
      correct_answer: "we decided to go for a hike in the national park.",
      model_description: "Completes the clause with logical contrast and correct punctuation."
    };
  }
  if (activityType === "ESSAY_WRITING") {
    return {
      prompt,
      min_words: 100,
      max_words: 250,
      sample_essay: "Modern technology has significantly changed how we communicate...",
      model_answer: "Modern technology has significantly changed how we communicate...",
      correct_answer: "Sample Essay Response",
      rubric_guidelines: "Check grammar, structure, tone, and word count."
    };
  }
  if (activityType === "EMAIL_LETTER_WRITING") {
    return {
      prompt,
      recipient_role: "Course Director",
      required_tone: "FORMAL",
      model_email: "Dear Director,\n\nI am writing to inquire about...",
      correct_answer: "Formal Email Response",
      model_description: "Formal salutation and clear request."
    };
  }
  if (activityType === "TRANSLATION") {
    return {
      prompt,
      source_text: "Ella ha estado estudiando inglés durante dos años.",
      source_language: "Spanish",
      target_language: "English",
      acceptable_translations: ["She has been studying English for two years."],
      correct_answer: "She has been studying English for two years.",
      grammar_notes: "Uses present perfect continuous."
    };
  }
  if (activityType === "PARAPHRASE_PRACTICE") {
    return {
      prompt,
      original_text: "Due to unforeseen circumstances, the meeting has been postponed.",
      forbidden_phrases: ["due to", "unforeseen circumstances"],
      model_paraphrase: "Because of unexpected events, the meeting will take place later.",
      correct_answer: "Paraphrased sentence",
      explanation: "Replaces key phrases while retaining core meaning."
    };
  }
  if (activityType === "SENTENCE_COMBINING") {
    return {
      prompt,
      input_sentences: ["The weather was cold.", "We stayed inside.", "We drank hot chocolate."],
      model_combined_sentence: "Because the weather was cold, we stayed inside and drank hot chocolate.",
      correct_answer: "Because the weather was cold, we stayed inside and drank hot chocolate.",
      explanation: "Uses causal conjunction 'because'."
    };
  }
  if (activityType === "CREATIVE_WRITING") {
    return {
      prompt,
      image_url: "",
      story_starter: "As the sun set over the quiet town...",
      required_vocabulary: ["whisper", "shadow", "discovery"],
      model_story: "As the sun set over the quiet town, Maria heard a faint whisper...",
      correct_answer: "Creative story response",
      model_description: "Includes all 3 required vocabulary words."
    };
  }
  if (activityType === "PEER_REVIEW_EDITING") {
    return {
      prompt,
      sample_draft: "Yesterday I go to market and buyed many apples.",
      error_focus_areas: ["Past tense verbs", "Article usage"],
      model_edited_draft: "Yesterday I went to the market and bought many apples.",
      correct_answer: "Yesterday I went to the market and bought many apples.",
      model_feedback_comments: "Remember irregular past tense verbs 'went' and 'bought'."
    };
  }
  if (activityType === "REORDERING") {
    return {
      prompt,
      questions: [{ level: "sentence", question_text: null, items: [{ id: "1", text: "First item" }, { id: "2", text: "Second item" }], correct_order: ["1", "2"] }]
    };
  }
  if (activityType === "CATEGORIZATION") {
    return {
      prompt,
      targets: ["Category A", "Category B"],
      items: [{ id: "1", text: "Item", target: "Category A" }]
    };
  }
  if (activityType === "SHORT_ANSWER") {
    return { prompt, questions: [{ id: 1, text: "", sample_answer: "", min_words: null, required_words: [], show_required_words: true }] };
  }
  if (activityType === "ERROR_CORRECTION") {
    return { prompt, items: [{ mode: "rewrite", text: "", error_span: "", correction: "", note: null }] };
  }
  if (activityType === "AI_ROLEPLAY") {
    return { prompt, character: "Shop Assistant", first_turn: "Hello! How can I help you today?" };
  }
  if (activityType === "LIVE_SPEAK_TRANSLATE") {
    return { prompt, max_seconds_per_attempt: 30, total_seconds_per_learner: 120, show_transcript: true };
  }
  return { prompt, questions: [{ id: 1, text: "", options: { A: "", B: "", C: "", D: "" }, answer: "A" }] };
}

async function reorderSlides(lessonId: string, orderedIds: string[]) {
  const supabase = createAdminClient();
  if (orderedIds.length === 0) return;

  const { data: currentSlides, error: currentError } = await supabase
    .from("slides")
    .select("id, slide_number")
    .eq("lesson_id", lessonId)
    .is("deleted_at", null);
  if (currentError) throw currentError;

  const currentNumberById = new Map((currentSlides ?? []).map((slide) => [slide.id, slide.slide_number]));
  const finalNumberById = new Map(orderedIds.map((id, index) => [id, index + 1]));

  for (let index = 0; index < orderedIds.length; index += 1) {
    const { error } = await supabase
      .from("slides")
      .update({ slide_number: -100000 - index })
      .eq("id", orderedIds[index])
      .eq("lesson_id", lessonId);
    if (error) throw error;
  }

  for (const id of orderedIds) {
    const slideNumber = finalNumberById.get(id);
    if (!slideNumber) continue;
    const { error } = await supabase
      .from("slides")
      .update({ slide_number: slideNumber })
      .eq("id", id)
      .eq("lesson_id", lessonId);
    if (error) throw error;

    await supabase
      .from("lesson_slide_activities")
      .update({ slide_number: slideNumber })
      .eq("slide_id", id)
      .eq("lesson_id", lessonId);
  }

  const { data: audioFiles, error: audioError } = await supabase
    .from("lesson_audio_files")
    .select("id, linked_slide_number")
    .eq("lesson_id", lessonId)
    .not("linked_slide_number", "is", null);
  if (audioError) throw audioError;

  for (const audio of audioFiles ?? []) {
    const slideId = [...currentNumberById.entries()].find(([, number]) => number === audio.linked_slide_number)?.[0];
    const nextNumber = slideId ? finalNumberById.get(slideId) : null;
    if (!nextNumber || nextNumber === audio.linked_slide_number) continue;
    await supabase
      .from("lesson_audio_files")
      .update({ linked_slide_number: nextNumber })
      .eq("id", audio.id)
      .eq("lesson_id", lessonId);
  }

  await syncLessonSlideActivityNumbers(supabase, lessonId);
}

async function syncLessonSlideActivityNumbers(supabase: AdminClient, lessonId: string) {
  const { data: slides, error } = await supabase
    .from("slides")
    .select("id, slide_number")
    .eq("lesson_id", lessonId)
    .is("deleted_at", null);
  if (error) throw error;

  const { data: activities, error: activitiesError } = await supabase
    .from("lesson_slide_activities")
    .select("id")
    .eq("lesson_id", lessonId);
  if (activitiesError) throw activitiesError;

  for (let index = 0; index < (activities ?? []).length; index += 1) {
    const activity = activities?.[index];
    if (!activity) continue;
    const { error: temporaryError } = await supabase
      .from("lesson_slide_activities")
      .update({ slide_number: -100000 - index })
      .eq("lesson_id", lessonId)
      .eq("id", activity.id);
    if (temporaryError) throw temporaryError;
  }

  for (const slide of slides ?? []) {
    const { error: activityError } = await supabase
      .from("lesson_slide_activities")
      .update({ slide_number: slide.slide_number })
      .eq("lesson_id", lessonId)
      .eq("slide_id", slide.id);
    if (activityError) throw activityError;
  }
}

async function reorderBlocks(slideId: string, orderedIds: string[]) {
  const supabase = createAdminClient();
  if (orderedIds.length === 0) return;

  for (let index = 0; index < orderedIds.length; index += 1) {
    const { error } = await supabase
      .from("lesson_blocks")
      .update({ position: -100000 - index })
      .eq("id", orderedIds[index])
      .eq("slide_id", slideId);
    if (error) throw error;
  }

  for (let index = 0; index < orderedIds.length; index += 1) {
    const { error } = await supabase
      .from("lesson_blocks")
      .update({ position: index + 1 })
      .eq("id", orderedIds[index])
      .eq("slide_id", slideId);
    if (error) throw error;
  }
}

function hasMissingActivityAnswers(activityData: Json | null) {
  if (!activityData || typeof activityData !== "object" || Array.isArray(activityData)) return true;
  const data = activityData as Record<string, unknown>;
  if ("paragraphs" in data && "headings" in data) {
    const correct = data.correct_answer as Record<string, unknown> | null | undefined;
    if (!correct || typeof correct !== "object") return true;
    const paragraphs = Array.isArray(data.paragraphs) ? data.paragraphs : [];
    if (paragraphs.length === 0) return true;
    return paragraphs.some((p) => {
      const pRecord = p as Record<string, unknown>;
      const pId = String(pRecord.id ?? "");
      return !correct[pId] || String(correct[pId]).trim() === "";
    });
  }
  if ("questions" in data && "time_limit_seconds" in data) {
    const correct = data.correct_answer as Record<string, unknown> | null | undefined;
    if (!correct || typeof correct !== "object") return true;
    const questions = Array.isArray(data.questions) ? data.questions : [];
    if (questions.length === 0) return true;
    return questions.some((q) => {
      const qRecord = q as Record<string, unknown>;
      const qId = String(qRecord.id ?? "");
      return !correct[qId] || String(correct[qId]).trim() === "";
    });
  }
  if ("choices" in data && "passage" in data) {
    const correct = data.correct_answer;
    return correct === null || correct === undefined || String(correct).trim() === "";
  }
  if (Array.isArray(data.questions)) {
    return data.questions.length === 0 || data.questions.some((item) => {
      const question = item as Record<string, unknown>;
      const answer = question.answer ?? question.correct_answer;
      return answer === null || answer === undefined || String(answer).trim() === "";
    });
  }
  if (Array.isArray(data.items)) {
    return data.items.length === 0 || data.items.some((item) => {
      const answer = (item as Record<string, unknown>).answer;
      if (Array.isArray(answer)) return answer.some((part) => String(part ?? "").trim() === "");
      return answer === null || answer === undefined || String(answer).trim() === "";
    });
  }
  return false;
}

export async function insertGeneratedQuestionsAction(input: {
  lessonId: string;
  slideId: string;
  slideNumber: number;
  activityType: string;
  generatedData: any;
  appendActivityId?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    await requireLessonAccess(input.lessonId);
    const supabase = createAdminClient();

    const localAsRecord = (val: unknown): Record<string, any> => {
      return val && typeof val === "object" && !Array.isArray(val) ? (val as Record<string, any>) : {};
    };

    if (input.appendActivityId) {
      const { data: existing, error: fetchError } = await supabase
        .from("lesson_slide_activities")
        .select("activity_data")
        .eq("id", input.appendActivityId)
        .single();
      if (fetchError || !existing) {
        throw new Error("Target activity to append to was not found.");
      }

      const existingData = localAsRecord(existing.activity_data);
      const newData = localAsRecord(input.generatedData);

      let mergedData: any = {};

      if (input.activityType === "MCQ" || input.activityType === "MULTIPLE_SELECT") {
        const existingQs = Array.isArray(existingData.questions) ? existingData.questions : [];
        const newQs = Array.isArray(newData.questions) ? newData.questions : [];
        const maxExistingId = existingQs.reduce((max: number, q: any) => {
          const idVal = parseInt(String(localAsRecord(q).id), 10);
          return isNaN(idVal) ? max : Math.max(max, idVal);
        }, 0);

        const mappedNewQs = newQs.map((q: any, idx: number) => ({
          ...localAsRecord(q),
          id: String(maxExistingId + idx + 1)
        }));

        mergedData = {
          prompt: existingData.prompt || newData.prompt || "Choose the correct answer(s).",
          questions: [...existingQs, ...mappedNewQs]
        };
      } else if (input.activityType === "TRUE_FALSE") {
        const existingItems = Array.isArray(existingData.items) ? existingData.items : [];
        const newItems = Array.isArray(newData.items) ? newData.items : [];
        mergedData = {
          prompt: existingData.prompt || newData.prompt || "True or False?",
          items: [...existingItems, ...newItems]
        };
      } else if (input.activityType === "MATCHING") {
        const existingQs = Array.isArray(existingData.questions) ? existingData.questions : [];
        const newQs = Array.isArray(newData.questions) ? newData.questions : [];
        
        if (existingQs.length > 0 && newQs.length > 0) {
          const exQ = localAsRecord(existingQs[0]);
          const newQ = localAsRecord(newQs[0]);
          const exOpts = localAsRecord(exQ.options);
          const newOpts = localAsRecord(newQ.options);
          const exAnswers = Array.isArray(exQ.correct_answer) ? exQ.correct_answer : [];
          const newAnswers = Array.isArray(newQ.correct_answer) ? newQ.correct_answer : [];

          const mergedAItems = [...(Array.isArray(exOpts.a_items) ? exOpts.a_items : []), ...(Array.isArray(newOpts.a_items) ? newOpts.a_items : [])];
          const mergedBItems = [...(Array.isArray(exOpts.b_items) ? exOpts.b_items : []), ...(Array.isArray(newOpts.b_items) ? newOpts.b_items : [])];
          const mergedCorrect = [...exAnswers, ...newAnswers];

          mergedData = {
            prompt: existingData.prompt || newData.prompt || "Match the items.",
            questions: [{
              question_type: "MATCHING",
              question_text: exQ.question_text || newQ.question_text || "Match the items.",
              options: {
                a_items: mergedAItems,
                b_items: mergedBItems
              },
              correct_answer: mergedCorrect
            }]
          };
        } else {
          mergedData = existingQs.length > 0 ? existingData : newData;
        }
      } else {
        throw new Error(`Appending questions is not supported for activity type: ${input.activityType}`);
      }

      const { error: updateError } = await supabase
        .from("lesson_slide_activities")
        .update({
          activity_data: mergedData,
          needs_review: hasMissingActivityAnswers(mergedData),
          updated_at: new Date().toISOString()
        })
        .eq("id", input.appendActivityId);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase
        .from("lesson_slide_activities")
        .insert({
          lesson_id: input.lessonId,
          slide_id: input.slideId,
          slide_number: input.slideNumber,
          activity_type: input.activityType,
          activity_data: input.generatedData,
          needs_review: hasMissingActivityAnswers(input.generatedData),
          updated_at: new Date().toISOString()
        });
      if (insertError) throw insertError;
    }

    revalidateLessonBuilder(input.lessonId);
    return { success: true };
  } catch (error: any) {
    console.error("insertGeneratedQuestionsAction failed:", error);
    return { success: false, error: error?.message || "Failed to insert generated questions." };
  }
}
