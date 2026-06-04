import { createAdminClient } from "@/lib/supabase/admin";
import { extractActivity, parseAnswerKey, type SlideInput } from "@/lib/activityExtractor";
import type { SlideType } from "@/types/database.types";

function haystack(slide: Pick<SlideInput, "title" | "section_label" | "raw_text">) {
  return `${slide.title}\n${slide.section_label ?? ""}\n${slide.raw_text}`.toUpperCase();
}

export function classifySlide(slide: Pick<SlideInput, "title" | "section_label" | "raw_text">): SlideType {
  const text = haystack(slide);

  if (/\b(ANSWERS?|POSSIBLE ANSWERS?|ANSWER KEY)\b/.test(text)) return "ANSWERS";
  if (/HOT SEAT|RELAY GAME|RUMOR CHAIN|LET'?S PLAY|TEAM CHALLENGE/.test(text)) return "GAME";
  if (/HOMEWORK|WRITE AN EMAIL|MINI-WRITING|EXIT TICKET|FULL SENTENCES|WRITING/.test(text)) return "WRITING";
  if (/LISTENING|LISTEN AGAIN|CHECK YOUR LISTENING|BEFORE LISTENING|PRE-LISTEN|POST-LISTEN/.test(text)) {
    if (/TRUE\s*\/\s*FALSE|T\s*\/\s*F/.test(text)) return "TRUE_FALSE";
    if (/\b[A-C][\).]\s/.test(text) || /CHOOSE THE BEST ANSWER/.test(text)) return "MCQ";
    return "LISTENING";
  }
  if (/MATCH THE WORD|WORD\s+.*DEFINITION|DEFINITION\s+.*WORD/.test(text)) return "MATCHING";
  if (/COMPLETE THE SENTENCES|GAP[- ]?FILL|FILL IN|_{2,}|SPREAD\/DENY|TRUE\.\s+\w+\/\w+/.test(text)) return "GAP_FILL";
  if (/TRUE\s*\/\s*FALSE|T\s*\/\s*F/.test(text)) return "TRUE_FALSE";
  if (/CHOOSE THE BEST ANSWER|MULTIPLE CHOICE|\b[A-C][\).]\s/.test(text)) return "MCQ";
  if (/TALK ABOUT|CLASS DISCUSSION|DISCUSS|REAL WORLD|WHAT CHANGED|ONE THING I LEARNED|DEBRIEF/.test(text)) {
    return "DISCUSSION";
  }
  if (/ANSWER IN FULL SENTENCES|SHORT ANSWER|REFLECT/.test(text)) return "OPEN_RESPONSE";

  return "INFO";
}

export async function classifyAndExtractLesson(lessonId: string) {
  const supabase = createAdminClient();

  const { data: slides, error } = await supabase
    .from("slides")
    .select("*")
    .eq("lesson_id", lessonId)
    .order("slide_number", { ascending: true });

  if (error) throw error;
  if (!slides?.length) return;

  const classified = slides.map((slide) => ({ ...slide, type: classifySlide(slide) }));

  const { error: slideUpdateError } = await supabase.from("slides").upsert(classified, { onConflict: "id" });
  if (slideUpdateError) throw slideUpdateError;

  await supabase.from("slide_activities").delete().in(
    "slide_id",
    classified.map((slide) => slide.id)
  );

  const activities = classified.flatMap((slide) => {
    const activity = extractActivity(slide);
    if (!activity) return [];
    return [{
      slide_id: slide.id,
      activity_type: activity.activity_type,
      prompt: activity.prompt,
      items: activity.items,
      answer_key: activity.answer_key
    }];
  });

  if (activities.length > 0) {
    const { error: activityInsertError } = await supabase.from("slide_activities").insert(activities);
    if (activityInsertError) throw activityInsertError;
  }

  for (const answerSlide of classified.filter((slide) => slide.type === "ANSWERS")) {
    const target = [...classified]
      .reverse()
      .find(
        (slide) =>
          slide.slide_number < answerSlide.slide_number &&
          ["MATCHING", "GAP_FILL", "MCQ", "TRUE_FALSE", "WRITING", "GAME", "OPEN_RESPONSE"].includes(slide.type)
      );

    if (!target) continue;

    const answerKey = parseAnswerKey(answerSlide.raw_text);
    await supabase.from("slides").update({ linked_answer_slide_id: answerSlide.id }).eq("id", target.id);

    const { data: activity } = await supabase.from("slide_activities").select("id").eq("slide_id", target.id).maybeSingle();
    if (activity && Object.keys(answerKey).length > 0) {
      await supabase.from("slide_activities").update({ answer_key: answerKey }).eq("id", activity.id);
    }
  }
}
