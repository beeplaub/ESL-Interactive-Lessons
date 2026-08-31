"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireLessonAccess, getFreshProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { callGemini } from "@/lib/ai/gemini";
import { recordQuizAttempt } from "@/app/quizzes/actions";

// 1. Zod schemas for structured responses from Gemini
import { z } from "zod";

// Schema for lesson slides and blocks (JSON schema representation)
const slideBlockSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    topic: { type: "string" },
    description: { type: "string" },
    slides: {
      type: "array",
      items: {
        type: "object",
        properties: {
          slide_number: { type: "integer" },
          title: { type: "string" },
          section_label: { type: "string" },
          blocks: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: {
                block_type: { type: "string" },
                content: { type: "object" }
              },
              required: ["block_type", "content"]
            }
          },
          activities: {
            type: "array",
            items: {
              type: "object",
              properties: {
                activity_type: { type: "string" },
                activity_data: { type: "object" }
              },
              required: ["activity_type", "activity_data"]
            }
          }
        },
        required: ["slide_number", "title", "blocks"]
      }
    }
  },
  required: ["title", "topic", "slides"]
};

const supportedLessonBlockTypes = new Set([
  "TEXT", "HEADING", "BULLETS", "QUOTE", "CALLOUT", "IMAGE", "IMAGE_TEXT", "AUDIO", "VIDEO",
  "VOCABULARY", "GRAMMAR", "READING", "DIALOGUE", "FLASHCARD", "TABLE", "COMMON_MISTAKE", "CONTRAST_PAIR", "IMAGE_PAIR", "TONGUE_TWISTER", "STEPS", "DIVIDER",
]);

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function normalizeLessonDraft(input: any, fallback: { topic: string; level: string; slideCount: number }) {
  const rawSlides = Array.isArray(input?.slides) ? input.slides : [];
  const slides = rawSlides.slice(0, fallback.slideCount).map((slide: any, index: number) => {
    const title = nonEmptyString(slide?.title) || `Slide ${index + 1}`;
    const blocks = (Array.isArray(slide?.blocks) ? slide.blocks : [])
      .map((block: any) => {
        const blockType = nonEmptyString(block?.block_type).toUpperCase();
        const content = block?.content && typeof block.content === "object" && !Array.isArray(block.content) ? block.content : {};
        if (!supportedLessonBlockTypes.has(blockType)) return null;
        if (blockType === "TEXT" && !nonEmptyString(content.body)) return null;
        if (blockType === "HEADING" && !nonEmptyString(content.text)) return null;
        return { block_type: blockType, content };
      })
      .filter(Boolean);

    if (!blocks.length) {
      blocks.push({
        block_type: "TEXT",
        content: {
          body: nonEmptyString(slide?.framing_text) || nonEmptyString(slide?.description)
            || `Explore ${title.toLowerCase()} through the examples and practice on this slide.`,
        },
      });
    }

    return {
      slide_number: index + 1,
      title,
      section_label: nonEmptyString(slide?.section_label) || "Lesson",
      blocks,
      activities: Array.isArray(slide?.activities)
        ? slide.activities.filter((activity: any) => nonEmptyString(activity?.activity_type) && activity?.activity_data && typeof activity.activity_data === "object")
        : [],
    };
  });

  return {
    title: nonEmptyString(input?.title) || fallback.topic,
    topic: nonEmptyString(input?.topic) || fallback.topic,
    description: nonEmptyString(input?.description) || `A ${fallback.level} lesson about ${fallback.topic}.`,
    slides,
  };
}

// Schema for roleplay turn replies
const roleplayTurnSchema = {
  type: "object",
  properties: {
    character_reply: { type: "string" },
    corrections: {
      type: "object",
      properties: {
        has_errors: { type: "boolean" },
        errors: {
          type: "array",
          items: {
            type: "object",
            properties: {
              original: { type: "string" },
              corrected: { type: "string" },
              explanation: { type: "string" }
            },
            required: ["original", "corrected", "explanation"]
          }
        }
      },
      required: ["has_errors"]
    }
  },
  required: ["character_reply", "corrections"]
};

// Schema for roleplay scorecard evaluation
const scorecardSchema = {
  type: "object",
  properties: {
    scores: {
      type: "object",
      properties: {
        task_achievement: { type: "integer" },
        vocabulary_range: { type: "integer" },
        grammar_accuracy: { type: "integer" },
        fluency: { type: "integer" },
        pronunciation_clarity: { type: "integer" },
        sentence_structure: { type: "integer" },
        overall: { type: "integer" }
      },
      required: ["task_achievement", "vocabulary_range", "grammar_accuracy", "overall"]
    },
    feedback: {
      type: "object",
      properties: {
        strengths: { type: "array", items: { type: "string" } },
        weaknesses: { type: "array", items: { type: "string" } },
        cefr_alignment: { type: "string" },
        improvement_tips: { type: "array", items: { type: "string" } }
      },
      required: ["strengths", "weaknesses", "cefr_alignment", "improvement_tips"]
    }
  },
  required: ["scores", "feedback"]
};

// Schema for short answer AI feedback
const shortAnswerFeedbackSchema = {
  type: "object",
  properties: {
    corrected_text: { type: "string" },
    explanation: { type: "string" }
  },
  required: ["corrected_text", "explanation"]
};

// Helper to retrieve the current session user details
async function getSessionUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized access. Please log in.");
  
  const profile = await getFreshProfile(user.id);
  return { user, profile: profile || { id: user.id, role: "LEARNER" } };
}

/**
 * Action: Generates a lesson structure draft using Gemini, and saves it in ai_saved_drafts.
 */
export async function generateLessonDraftAction(formData: FormData) {
  await requireAdmin();
  const { user, profile } = await getSessionUser();

  const topic = String(formData.get("topic") || "");
  const level = String(formData.get("level") || "B1");
  const outcomes = String(formData.get("outcomes") || "General practice");
  const style = String(formData.get("style") || "Communicative ESL");
  const slideCount = String(formData.get("slideCount") || "6");

  // Call Gemini
  const generated = await callGemini<any>({
    templateKey: "creator_lesson_designer",
    variables: { topic, level, outcomes, style, slideCount },
    responseSchema: slideBlockSchema,
    context: { userId: user.id, userRole: profile.role, cefrLevel: level, cache: true }
  });

  const draft = normalizeLessonDraft(generated, { topic, level, slideCount: Number(slideCount) || 6 });
  if (!draft.slides.length) throw new Error("The lesson generator returned no usable slides. Please try again.");
  const supabase = createAdminClient();
  
  // Insert draft in intermediate drafts table
  const { data: savedRow, error: saveError } = await supabase
    .from("ai_saved_drafts")
    .insert({
      creator_id: user.id,
      draft_type: "LESSON",
      draft_metadata: { topic, level, outcomes, slideCount },
      draft_content: draft
    })
    .select("id")
    .single();

  if (saveError) throw saveError;

  return { draftId: savedRow.id, draftContent: draft };
}

/**
 * Action: Merges a completed AI draft directly into live lesson tables.
 */
export async function insertDraftIntoLessonAction(draftId: string, lessonId: string) {
  await requireAdmin();
  const supabase = createAdminClient();

  const { data: draftRow, error: draftError } = await supabase
    .from("ai_saved_drafts")
    .select("draft_content")
    .eq("id", draftId)
    .single();

  if (draftError || !draftRow) {
    throw new Error("AI draft not found or already merged.");
  }

  const content = draftRow.draft_content as any;
  const slides = content.slides ?? [];

  // A. Create slide records
  const slideInserts = slides.map((slide: any) => ({
    lesson_id: lessonId,
    slide_number: slide.slide_number,
    title: slide.title,
    section_label: slide.section_label || "AI Content",
    raw_text: slide.title,
    type: "INFO"
  }));

  const { data: createdSlides, error: slideInsertError } = await supabase
    .from("slides")
    .insert(slideInserts)
    .select("id, slide_number");

  if (slideInsertError) throw slideInsertError;

  const slideIdMap = new Map(createdSlides.map((s) => [s.slide_number, s.id]));

  // B. Create visual blocks and interactive activity records
  const blockInserts: any[] = [];
  const activityInserts: any[] = [];

  for (const slide of slides) {
    const slideId = slideIdMap.get(slide.slide_number);
    if (!slideId) continue;

    // Map visual blocks
    if (slide.blocks && Array.isArray(slide.blocks)) {
      slide.blocks.forEach((block: any, pos: number) => {
        blockInserts.push({
          lesson_id: lessonId,
          slide_id: slideId,
          position: pos + 1,
          block_type: block.block_type || "TEXT",
          content: block.content || {}
        });
      });
    }

    // Map slide activities
    if (slide.activities && Array.isArray(slide.activities)) {
      slide.activities.forEach((act: any) => {
        activityInserts.push({
          lesson_id: lessonId,
          slide_id: slideId,
          slide_number: slide.slide_number,
          activity_type: act.activity_type || "MCQ",
          activity_data: act.activity_data || {},
          needs_review: false
        });
      });
    }
  }

  if (blockInserts.length > 0) {
    const { error: blockErr } = await supabase.from("lesson_blocks").insert(blockInserts);
    if (blockErr) throw blockErr;
  }

  if (activityInserts.length > 0) {
    const { error: actErr } = await supabase.from("lesson_slide_activities").insert(activityInserts);
    if (actErr) throw actErr;
  }

  // C. Cleanup draft
  await supabase.from("ai_saved_drafts").delete().eq("id", draftId);

  revalidatePath(`/admin/lessons/${lessonId}/edit`);
  return { success: true };
}

/**
 * Action: Explains why a quiz response is correct or incorrect.
 */
export async function explainQuizAnswerAction(
  questionText: string,
  correctAnswer: string,
  learnerAnswer: string
) {
  let isAdmin = false;
  try {
    const { user, profile } = await getSessionUser();
    isAdmin = profile?.role === "ADMIN";

    const response = await callGemini<{ explanation: string }>({
      templateKey: "learner_answer_explainer",
      variables: {
        questionText,
        correctAnswer,
        learnerAnswer,
        level: profile.cefr_level || "B1"
      },
      context: { userId: user.id, userRole: profile.role, provider: "ollama", cefrLevel: profile.cefr_level || "B1", cache: true }
    });
    return { explanation: response.explanation };
  } catch (error: any) {
    console.error("Error in explainQuizAnswerAction:", error);
    return {
      error: isAdmin
        ? (error.message || "Failed to fetch explanation from Gemini.")
        : "We couldn't generate an explanation right now. Please try again shortly."
    };
  }
}

/**
 * Action: Starts a new AI Roleplay Session.
 */
export async function startRoleplaySessionAction(activityId: string, includeOpeningMessage = true) {
  let isAdmin = false;
  try {
    const { user, profile } = await getSessionUser();
    isAdmin = profile?.role === "ADMIN";
    const supabase = createAdminClient();

    // Fetch the roleplay activity details to capture context
    const { data: activity } = await supabase
      .from("lesson_slide_activities")
      .select("activity_data, lessons(level)")
      .eq("id", activityId)
      .single();

    if (!activity) throw new Error("AI Roleplay activity not found.");

    const data = activity.activity_data as any;
    await supabase.from("ai_roleplay_sessions").update({ status: "ABANDONED" }).eq("user_id", user.id).eq("status", "IN_PROGRESS").lt("updated_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());
    const attemptQuota = Math.max(0, Math.min(1000, Number(data?.attempt_quota) || 0));
    if (attemptQuota > 0) {
      const { count, error: quotaError } = await supabase
        .from("ai_roleplay_sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("lesson_activity_id", activityId)
        .neq("status", "ABANDONED");
      if (quotaError) throw quotaError;
      if ((count ?? 0) >= attemptQuota) {
        return { error: `You have used all ${attemptQuota} conversation attempt${attemptQuota === 1 ? "" : "s"} for this activity. You can still listen to your saved conversations.` };
      }
    }
    const scenario = data?.ai_instruction || data?.prompt || "Standard Conversation";
    const character = data?.character || "Assistant";
    const firstTurn = data?.first_turn || "Hello! Shall we begin?";
    const level = (activity.lessons as any)?.level || "B1";

    // Create session
    const { data: session, error } = await supabase
      .from("ai_roleplay_sessions")
      .insert({
        user_id: user.id,
        lesson_activity_id: activityId,
        scenario_context: `Scenario: ${scenario} · Partner: ${character}`,
        cefr_level: level,
        status: "IN_PROGRESS"
      })
      .select("id")
      .single();

    if (error) throw error;

    if (includeOpeningMessage) {
      await supabase.from("ai_roleplay_messages").insert({
        session_id: session.id,
        sender: "AI",
        message_text: firstTurn
      });
    }

    return { sessionId: session.id };
  } catch (error: any) {
    console.error("Error in startRoleplaySessionAction:", error);
    return {
      error: "We are having trouble connecting to the AI tutor right now. Please try again shortly."
    };
  }
}

/** Saves finalized Live API transcript turns into the existing roleplay history. */
export async function saveRoleplayVoiceTranscriptAction(sessionId: string, turns: Array<{ sender: "AI" | "LEARNER"; text: string }>) {
  const { user } = await getSessionUser();
  const supabase = createAdminClient();
  const { data: session } = await supabase.from("ai_roleplay_sessions").select("id,user_id,status").eq("id", sessionId).eq("user_id", user.id).maybeSingle();
  if (!session) return { error: "Conversation session not found." };
  const rows = turns.map((turn) => ({ session_id: sessionId, sender: turn.sender, message_text: turn.text.trim() })).filter((turn) => turn.message_text);
  if (rows.length) {
    const { error } = await supabase.from("ai_roleplay_messages").insert(rows);
    if (error) {
      console.error("Voice roleplay transcript save failed", error);
      return { error: "Could not save the conversation transcript." };
    }
  }
  return { success: true };
}

export async function getRoleplayHistoryAction(activityId: string) {
  const { user } = await getSessionUser();
  const supabase = createAdminClient();
  const { data: activity } = await supabase.from("lesson_slide_activities").select("activity_data").eq("id", activityId).maybeSingle();
  const attemptQuota = Math.max(0, Math.min(1000, Number((activity?.activity_data as any)?.attempt_quota) || 0));
  const { data, error } = await supabase.from("ai_roleplay_sessions")
    .select("id,scorecard,created_at,updated_at,status")
    .eq("lesson_activity_id", activityId).eq("user_id", user.id).eq("status", "COMPLETED")
    .order("updated_at", { ascending: false }).limit(10);
  if (error) {
    console.error("Roleplay history lookup failed", error);
    return { sessions: [], attemptQuota, attemptsUsed: 0, quotaReached: false };
  }
  const { count } = await supabase.from("ai_roleplay_sessions").select("id", { count: "exact", head: true }).eq("lesson_activity_id", activityId).eq("user_id", user.id);
  return { sessions: data ?? [], attemptQuota, attemptsUsed: count ?? 0, quotaReached: attemptQuota > 0 && (count ?? 0) >= attemptQuota };
}

/**
 * Action: Submits a learner turn message to an active roleplay session and returns character reply.
 */
export async function submitRoleplayTurnAction(sessionId: string, learnerText: string) {
  let isAdmin = false;
  try {
    const { user, profile } = await getSessionUser();
    isAdmin = profile?.role === "ADMIN";
    const supabase = createAdminClient();

    // A. Fetch session and message history
    const { data: session } = await supabase
      .from("ai_roleplay_sessions")
      .select("scenario_context, cefr_level")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .eq("status", "IN_PROGRESS")
      .single();

    if (!session) throw new Error("Conversation session not found.");

    const { data: history } = await supabase
      .from("ai_roleplay_messages")
      .select("sender, message_text")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    const historyStr = (history ?? [])
      .map((m) => `${m.sender}: ${m.message_text}`)
      .join("\n");

    const scenarioMeta = session.scenario_context.split("·");
    const scenario = scenarioMeta[0]?.replace("Scenario:", "").trim() || "";
    const character = scenarioMeta[1]?.replace("Partner:", "").trim() || "";

    // B. Call Gemini
    const response = await callGemini<any>({
      templateKey: "learner_roleplay_coach",
      variables: {
        character,
        scenario,
        learnerResponse: learnerText,
        level: session.cefr_level,
        history: historyStr
      },
      responseSchema: roleplayTurnSchema,
      context: { userId: user.id, userRole: profile.role, provider: "ollama", cefrLevel: session.cefr_level, cache: false }
    });

    // C. Insert learner turn with corrections metadata
    await supabase.from("ai_roleplay_messages").insert({
      session_id: sessionId,
      sender: "LEARNER",
      message_text: learnerText,
      corrections: response.corrections
    });

    // D. Insert AI characters response
    await supabase.from("ai_roleplay_messages").insert({
      session_id: sessionId,
      sender: "AI",
      message_text: response.character_reply
    });

    return {
      characterReply: response.character_reply,
      corrections: response.corrections
    };
  } catch (error: any) {
    console.error("Error in submitRoleplayTurnAction:", error);
    return {
      error: "We couldn't get a response from the AI tutor right now. Please try again shortly."
    };
  }
}

/**
 * Action: Completes a roleplay session, grades it, and generates scorecard.
 */
export async function completeRoleplaySessionAction(sessionId: string) {
  let isAdmin = false;
  try {
    const { user, profile } = await getSessionUser();
    isAdmin = profile?.role === "ADMIN";
    const supabase = createAdminClient();

    const { data: session } = await supabase
      .from("ai_roleplay_sessions")
      .select("lesson_activity_id, scenario_context, cefr_level")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .eq("status", "IN_PROGRESS")
      .single();

    if (!session) throw new Error("Conversation session not found.");

    const { data: history } = await supabase
      .from("ai_roleplay_messages")
      .select("sender, message_text")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    const transcript = (history ?? [])
      .map((m) => `${m.sender}: ${m.message_text}`)
      .join("\n");

    // Call Gemini evaluator
    const scorecard = await callGemini<any>({
      templateKey: "learner_roleplay_evaluator",
      variables: {
        scenario: session.scenario_context,
        level: session.cefr_level,
        transcript
      },
      responseSchema: scorecardSchema,
      context: {
        userId: user.id,
        userRole: profile.role,
        provider: "ollama",
        cefrLevel: session.cefr_level,
        assessmentCritical: true,
        cache: true,
      }
    });

    // Save evaluation scorecard to DB
    await supabase
      .from("ai_roleplay_sessions")
      .update({
        status: "COMPLETED",
        scorecard
      })
      .eq("id", sessionId);

    // Save the legacy compatibility row and the canonical detailed assessment
    // evidence through the shared submission path. Historical roleplay rows
    // remain untouched, while new completions are available in both systems.
    const overallScore = scorecard.scores?.overall ?? 0;
    const attempt = await recordQuizAttempt({
      lessonSlideActivityId: session.lesson_activity_id,
      score: overallScore,
      total: 100,
      answers: {
        sessionId,
        scorecard,
      },
      submissionKey: sessionId,
      responseScores: [{
        itemKey: `roleplay:${sessionId}`,
        answer: { sessionId, scorecard },
        earnedPoints: overallScore,
        maximumPoints: 100,
        isCorrect: overallScore >= 60,
      }],
    });

    // Roleplay is AI-graded even though the generic assessment writer treats
    // an activity without answer-key scoring as automatic by default.
    await Promise.all([
      supabase.from("assessment_attempts").update({ grading_source: "AI" }).eq("id", attempt.assessmentAttemptId),
      supabase.from("quiz_attempts").update({ grading_source: "AI" }).eq("id", attempt.attemptId),
    ]);

    return { scorecard };
  } catch (error: any) {
    console.error("Error in completeRoleplaySessionAction:", error);
    return {
      error: "We couldn't generate your scorecard right now. Please try again shortly."
    };
  }
}

/**
 * Action: Seeds missing default prompt templates into Supabase public.ai_prompt_templates.
 */
export async function seedDefaultTemplatesAction() {
  await requireAdmin();
  const supabase = createAdminClient();
  const { DEFAULT_PROMPTS } = await import("@/lib/ai/gemini");

  const seeded: string[] = [];

  for (const [key, defaults] of Object.entries(DEFAULT_PROMPTS)) {
    const { data: existing } = await supabase
      .from("ai_prompt_templates")
      .select("id")
      .eq("template_key", key)
      .maybeSingle();

    if (!existing) {
      await supabase.from("ai_prompt_templates").insert({
        template_key: key,
        role_description: defaults.role_description,
        prompt_text: defaults.prompt_text
      });
      seeded.push(key);
    }
  }

  // Seed default feature flags if missing
  const defaultFlags = [
    { key: "creator_lesson_designer", roles: ["ADMIN"] },
    { key: "creator_course_architect", roles: ["ADMIN"] },
    { key: "creator_quiz_builder", roles: ["ADMIN"] },
    { key: "learner_answer_explainer", roles: ["LEARNER", "ADMIN"] },
    { key: "learner_roleplay_coach", roles: ["LEARNER", "ADMIN"] }
  ];

  for (const flag of defaultFlags) {
    const { data: existing } = await supabase
      .from("ai_feature_flags")
      .select("id")
      .eq("feature_key", flag.key)
      .maybeSingle();

    if (!existing) {
      await supabase.from("ai_feature_flags").insert({
        feature_key: flag.key,
        enabled: true,
        allowed_roles: flag.roles
      });
    }
  }

  revalidatePath("/admin/ai-studio");
  return { seeded };
}

/**
 * Action: Updates a prompt template in the database.
 */
export async function updatePromptTemplateAction(
  id: string,
  roleDescription: string,
  promptText: string
) {
  await requireAdmin();
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("ai_prompt_templates")
    .update({
      role_description: roleDescription,
      prompt_text: promptText,
      updated_at: new Date().toISOString()
    })
    .eq("id", id);

  if (error) throw error;
  revalidatePath("/admin/ai-studio");
  return { success: true };
}

/**
 * Action: Toggles a feature flag.
 */
export async function toggleFeatureFlagAction(featureKey: string, enabled: boolean) {
  await requireAdmin();
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("ai_feature_flags")
    .update({
      enabled,
      updated_at: new Date().toISOString()
    })
    .eq("feature_key", featureKey);

  if (error) throw error;
  revalidatePath("/admin/ai-studio");
  return { success: true };
}

export async function updateAiFeatureRolesAction(featureKey: string, roles: string[]) {
  await requireAdmin();
  const supabase = createAdminClient();
  const allowed = Array.from(new Set(["ADMIN", ...roles.filter((role) => ["TEACHER", "SCHOOL_ADMIN", "LEARNER"].includes(role))]));
  const { error } = await supabase.from("ai_feature_flags").update({
    allowed_roles: allowed,
    updated_at: new Date().toISOString(),
  }).eq("feature_key", featureKey);
  if (error) throw error;
  revalidatePath("/admin/ai-studio");
  return { success: true, roles: allowed };
}

/**
 * Action: Test prompt execution with mock variables.
 */
export async function testPromptAction(templateKey: string, variablesJson: string) {
  await requireAdmin();
  const { user, profile } = await getSessionUser();
  let vars: Record<string, string> = {};
  try {
    vars = JSON.parse(variablesJson);
  } catch {
    throw new Error("Variables must be a valid JSON object.");
  }

  const result = await callGemini<any>({
    templateKey,
    variables: vars,
    context: { userId: user.id, userRole: profile.role, cache: false }
  });

  return result;
}

/**
 * Action: Finds any IN_PROGRESS roleplay session for the user & activity, and retrieves history.
 */
export async function getActiveRoleplaySessionAction(activityId: string) {
  try {
    const { user } = await getSessionUser();
    const supabase = createAdminClient();

    // Check for active session (select the latest IN_PROGRESS one)
    const { data: sessions } = await supabase
      .from("ai_roleplay_sessions")
      .select("id, status, scorecard")
      .eq("user_id", user.id)
      .eq("lesson_activity_id", activityId)
      .eq("status", "IN_PROGRESS")
      .order("created_at", { ascending: false })
      .limit(1);

    const session = sessions && sessions.length > 0 ? sessions[0] : null;

    if (!session) return { session: null, messages: [] };

    // Fetch messages
    const { data: messages } = await supabase
      .from("ai_roleplay_messages")
      .select("sender, message_text, corrections")
      .eq("session_id", session.id)
      .order("created_at", { ascending: true });

    return {
      session: {
        id: session.id,
        status: session.status,
        scorecard: session.scorecard
      },
      messages: (messages ?? []).map((m) => ({
        sender: m.sender,
        text: m.message_text,
        corrections: m.corrections
      }))
    };
  } catch (error) {
    console.error("Error in getActiveRoleplaySessionAction:", error);
    return { session: null, messages: [] };
  }
}

/**
 * Action: Retrieves all messages for a specific session ID (for past attempts viewing).
 */
export async function getRoleplaySessionMessagesAction(sessionId: string) {
  try {
    const { user } = await getSessionUser();
    const supabase = createAdminClient();
    const { data: ownerSession } = await supabase.from("ai_roleplay_sessions").select("id,user_id").eq("id", sessionId).eq("user_id", user.id).maybeSingle();
    if (!ownerSession) return { messages: [] };
    const { data: messages } = await supabase
      .from("ai_roleplay_messages")
      .select("sender, message_text, corrections")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    return {
      messages: (messages ?? []).map((m) => ({
        sender: m.sender,
        text: m.message_text,
        corrections: m.corrections
      }))
    };
  } catch (error) {
    console.error("Error in getRoleplaySessionMessagesAction:", error);
    return { messages: [] };
  }
}

/**
 * Action: Generates brief, structured AI feedback with corrected text and explanation for Short Answer submissions.
 */
export async function getShortAnswerAiFeedbackAction(prompt: string, submission: string, sampleAnswer: string) {
  try {
    const { user, profile } = await getSessionUser();
    const feedback = await callGemini<{ corrected_text: string; explanation: string }>({
      templateKey: "learner_short_answer_feedback",
      variables: {
        prompt: prompt || "Write a response.",
        submission: submission || "",
        sampleAnswer: sampleAnswer || ""
      },
      responseSchema: shortAnswerFeedbackSchema,
      context: {
        userId: user.id,
        userRole: profile.role,
        provider: "ollama",
        cefrLevel: profile.cefr_level || "B1",
        assessmentCritical: true,
        cache: true,
      }
    });
    return { feedback };
  } catch (error) {
    console.error("Error generating short answer feedback:", error);
    return {
      error: "We couldn't generate AI feedback for this response. Please try again shortly."
    };
  }
}

// ── AI Question Generation Schemas and Server Action ──

const mcqGenerationSchema = {
  type: "object",
  properties: {
    prompt: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          options: {
            type: "object",
            properties: {
              A: { type: "string" },
              B: { type: "string" },
              C: { type: "string" },
              D: { type: "string" }
            },
            required: ["A", "B", "C", "D"]
          },
          answer: { type: "string", enum: ["A", "B", "C", "D"] }
        },
        required: ["text", "options", "answer"]
      }
    }
  },
  required: ["prompt", "questions"]
};

const multipleSelectGenerationSchema = {
  type: "object",
  properties: {
    prompt: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          options: {
            type: "object",
            properties: {
              A: { type: "string" },
              B: { type: "string" },
              C: { type: "string" },
              D: { type: "string" }
            },
            required: ["A", "B", "C", "D"]
          },
          answers: {
            type: "array",
            items: { type: "string", enum: ["A", "B", "C", "D"] }
          }
        },
        required: ["text", "options", "answers"]
      }
    }
  },
  required: ["prompt", "questions"]
};

const trueFalseGenerationSchema = {
  type: "object",
  properties: {
    prompt: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          statement: { type: "string" },
          answer: { type: "boolean" }
        },
        required: ["statement", "answer"]
      }
    }
  },
  required: ["prompt", "items"]
};

const matchingGenerationSchema = {
  type: "object",
  properties: {
    prompt: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question_type: { type: "string", enum: ["MATCHING"] },
          question_text: { type: "string" },
          options: {
            type: "object",
            properties: {
              a_items: { type: "array", items: { type: "string" } },
              b_items: { type: "array", items: { type: "string" } }
            },
            required: ["a_items", "b_items"]
          },
          correct_answer: {
            type: "array",
            items: {
              type: "object",
              properties: {
                a: { type: "string" },
                b: { type: "string" }
              },
              required: ["a", "b"]
            }
          }
        },
        required: ["question_type", "question_text", "options", "correct_answer"]
      }
    }
  },
  required: ["prompt", "questions"]
};

export async function generateActivityQuestionsAction(input: {
  slideId: string;
  activityType: string;
  guidelines?: string;
}): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const lookupClient = createAdminClient();
    const { data: slideRow } = await lookupClient.from("slides").select("lesson_id").eq("id", input.slideId).maybeSingle();
    if (!slideRow) throw new Error("That slide no longer exists.");
    await requireLessonAccess(slideRow.lesson_id);
    const { user, profile } = await getSessionUser();
    const supabase = createAdminClient();
    const { data: blocks, error: blocksError } = await supabase
      .from("lesson_blocks")
      .select("*")
      .eq("slide_id", input.slideId)
      .order("position", { ascending: true });

    if (blocksError) throw blocksError;

    let context = "";
    for (const block of blocks ?? []) {
      const content = block.content || {};
      const type = block.block_type;
      if (type === "HEADING") {
        context += `Heading: ${content.text || ""}\n`;
      } else if (type === "TEXT" || type === "BULLETS") {
        context += `Text: ${content.body || ""}\n`;
      } else if (type === "CALLOUT") {
        context += `Callout: ${content.title ? content.title + " - " : ""}${content.body || ""}\n`;
      } else if (type === "IMAGE" || type === "IMAGE_TEXT") {
        context += `Image details: Caption: "${content.caption || ""}", Alt text: "${content.alt || ""}", Heading: "${content.heading || ""}", Body: "${content.body || ""}"\n`;
      } else if (type === "AUDIO" || type === "VIDEO") {
        context += `Media details: Label: "${content.label || content.title || ""}", URL: "${content.path || content.url || ""}"\n`;
      } else if (type === "VOCABULARY") {
        const entries = Array.isArray(content.entries) ? content.entries : [];
        const words = entries.map((e: any) => `${e.word || ""}: ${e.meaning || ""} (${e.example || ""})`).join("; ");
        context += `Vocabulary items: ${words}\n`;
      } else if (type === "GRAMMAR") {
        const examples = Array.isArray(content.examples) ? content.examples.join("; ") : "";
        context += `Grammar focus: Title: "${content.title || ""}", Explanation: "${content.explanation || ""}", Examples: "${examples}"\n`;
      } else if (type === "READING") {
        context += `Reading passage: Title: "${content.title || ""}", Text: "${content.passage || ""}"\n`;
      } else if (type === "DIALOGUE") {
        const turns = Array.isArray(content.turns) ? content.turns : [];
        const transcript = turns.map((t: any) => `${t.speaker || ""}: ${t.line || ""}`).join("\n");
        context += `Dialogue:\n${transcript}\n`;
      } else if (type === "FLASHCARD") {
        context += `Flashcard info: Front: "${content.front || ""}", Back: "${content.back || ""}"\n`;
      }
    }
    context = context.trim();

    if (context.length < 15) {
      return {
        success: false,
        error: "Your slide does not contain enough educational content to generate questions. Please add text, grammar explanations, readings, dialogues, images or vocabulary first."
      };
    }

    let responseSchema;
    if (input.activityType === "MCQ") {
      responseSchema = mcqGenerationSchema;
    } else if (input.activityType === "MULTIPLE_SELECT") {
      responseSchema = multipleSelectGenerationSchema;
    } else if (input.activityType === "TRUE_FALSE") {
      responseSchema = trueFalseGenerationSchema;
    } else if (input.activityType === "MATCHING") {
      responseSchema = matchingGenerationSchema;
    } else {
      return { success: false, error: `AI generation is not supported for activity type: ${input.activityType}` };
    }

    const result = await callGemini<any>({
      templateKey: "creator_activity_generator",
      variables: {
        slideContent: context,
        guidelines: input.guidelines || "Keep it simple and engaging.",
        activityType: input.activityType
      },
      responseSchema: responseSchema,
      context: { userId: user.id, userRole: profile.role, cache: true }
    });

    return { success: true, data: result };
  } catch (error: any) {
    console.error("generateActivityQuestionsAction failed:", error);
    return { success: false, error: error?.message || "Failed to generate activity questions." };
  }
}
