"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, getFreshProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { callGemini } from "@/lib/ai/gemini";
import { checkUsageQuota, recordUsageEvent } from "@/lib/ai/usage";

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

  // Check daily creator quota
  const quota = await checkUsageQuota(user.id, profile.role);
  if (!quota.allowed) {
    throw new Error(quota.message || "Quota exceeded.");
  }

  // Call Gemini
  const draft = await callGemini<any>({
    templateKey: "creator_lesson_designer",
    variables: { topic, level, outcomes, style, slideCount },
    responseSchema: slideBlockSchema
  });

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

  // Record usage event
  await recordUsageEvent(user.id, "creator_lesson_designer", 1000);

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

    const quota = await checkUsageQuota(user.id, profile.role);
    if (!quota.allowed) {
      return { error: quota.message };
    }

    const response = await callGemini<{ explanation: string }>({
      templateKey: "learner_answer_explainer",
      variables: {
        questionText,
        correctAnswer,
        learnerAnswer,
        level: profile.cefr_level || "B1"
      }
    });

    await recordUsageEvent(user.id, "learner_answer_explainer", 300);
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
export async function startRoleplaySessionAction(activityId: string) {
  let isAdmin = false;
  try {
    const { user, profile } = await getSessionUser();
    isAdmin = profile?.role === "ADMIN";
    const supabase = createAdminClient();

    // Close/complete any lingering IN_PROGRESS sessions first to prevent duplicate active sessions
    await supabase
      .from("ai_roleplay_sessions")
      .update({ status: "COMPLETED" })
      .eq("user_id", user.id)
      .eq("lesson_activity_id", activityId)
      .eq("status", "IN_PROGRESS");

    // Fetch the roleplay activity details to capture context
    const { data: activity } = await supabase
      .from("lesson_slide_activities")
      .select("activity_data, lessons(level)")
      .eq("id", activityId)
      .single();

    if (!activity) throw new Error("AI Roleplay activity not found.");

    const data = activity.activity_data as any;
    const scenario = data?.prompt || "Standard Conversation";
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

    // Insert first character turn message
    await supabase.from("ai_roleplay_messages").insert({
      session_id: session.id,
      sender: "AI",
      message_text: firstTurn
    });

    return { sessionId: session.id };
  } catch (error: any) {
    console.error("Error in startRoleplaySessionAction:", error);
    return {
      error: "We are having trouble connecting to the AI tutor right now. Please try again shortly."
    };
  }
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

    // Check quota
    const quota = await checkUsageQuota(user.id, profile.role);
    if (!quota.allowed) {
      throw new Error(quota.message || "Daily quota exceeded.");
    }

    // A. Fetch session and message history
    const { data: session } = await supabase
      .from("ai_roleplay_sessions")
      .select("scenario_context, cefr_level")
      .eq("id", sessionId)
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
      responseSchema: roleplayTurnSchema
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

    // E. Record usage event
    await recordUsageEvent(user.id, "learner_roleplay_coach", 500);

    return {
      characterReply: response.character_reply,
      corrections: response.corrections
    };
  } catch (error: any) {
    console.error("Error in submitRoleplayTurnAction:", error);
    const isQuotaError = error.message?.includes("quota") || error.message?.includes("limit");
    if (isQuotaError) {
      return { error: error.message || "Daily conversation quota exceeded." };
    }
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
      responseSchema: scorecardSchema
    });

    // Save evaluation scorecard to DB
    await supabase
      .from("ai_roleplay_sessions")
      .update({
        status: "COMPLETED",
        scorecard
      })
      .eq("id", sessionId);

    // Save attempt to quiz_attempts table so standard components fetch it
    const overallScore = scorecard.scores?.overall ?? 0;
    await supabase
      .from("quiz_attempts")
      .insert({
        user_id: user.id,
        lesson_slide_activity_id: session.lesson_activity_id,
        score: overallScore,
        total: 100,
        answers: {
          sessionId: sessionId,
          scorecard: scorecard
        }
      });

    // Record usage event
    await recordUsageEvent(user.id, "learner_roleplay_evaluator", 800);

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

/**
 * Action: Test prompt execution with mock variables.
 */
export async function testPromptAction(templateKey: string, variablesJson: string) {
  await requireAdmin();
  let vars: Record<string, string> = {};
  try {
    vars = JSON.parse(variablesJson);
  } catch {
    throw new Error("Variables must be a valid JSON object.");
  }

  const result = await callGemini<any>({
    templateKey,
    variables: vars
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
    const supabase = createAdminClient();
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
    const feedback = await callGemini<{ corrected_text: string; explanation: string }>({
      templateKey: "learner_short_answer_feedback",
      variables: {
        prompt: prompt || "Write a response.",
        submission: submission || "",
        sampleAnswer: sampleAnswer || ""
      },
      responseSchema: shortAnswerFeedbackSchema
    });
    return { feedback };
  } catch (error) {
    console.error("Error generating short answer feedback:", error);
    return {
      error: "We couldn't generate AI feedback for this response. Please try again shortly."
    };
  }
}

