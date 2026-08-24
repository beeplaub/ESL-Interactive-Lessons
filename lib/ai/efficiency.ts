import { createHash, randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export type AiUserRole = "ADMIN" | "LEARNER" | "TEACHER" | "SCHOOL_ADMIN" | "SYSTEM";

export type AiCallContext = {
  userId?: string | null;
  userRole?: AiUserRole | string | null;
  featureKey?: string;
  cefrLevel?: string | null;
  promptVersion?: string;
  assessmentCritical?: boolean;
  cache?: boolean | { ttlSeconds?: number };
};

export type AiUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
};

const CREDIT_WEIGHTS: Record<string, number> = {
  learner_hint_coach: 1,
  learner_answer_explainer: 1,
  learner_short_answer_feedback: 2,
  learner_roleplay_coach: 1,
  learner_roleplay_evaluator: 4,
  learner_writing_grading_v1: 4,
  learner_oral_response_grading_v1: 4,
  learner_oral_response_transcription_v1: 2,
  learner_dialogue_grading_v1: 4,
  creator_activity_generator: 3,
  creator_course_architect: 8,
  creator_lesson_designer: 8,
  creator_quiz_builder: 6,
};

const CACHE_TTLS: Record<string, number> = {
  learner_hint_coach: 90 * 24 * 60 * 60,
  learner_answer_explainer: 90 * 24 * 60 * 60,
  learner_short_answer_feedback: 365 * 24 * 60 * 60,
  learner_roleplay_evaluator: 365 * 24 * 60 * 60,
  learner_writing_grading_v1: 365 * 24 * 60 * 60,
  learner_oral_response_grading_v1: 365 * 24 * 60 * 60,
  learner_oral_response_transcription_v1: 30 * 24 * 60 * 60,
  learner_dialogue_grading_v1: 365 * 24 * 60 * 60,
  creator_activity_generator: 30 * 24 * 60 * 60,
  creator_course_architect: 30 * 24 * 60 * 60,
  creator_lesson_designer: 30 * 24 * 60 * 60,
  creator_quiz_builder: 30 * 24 * 60 * 60,
};

export function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function featureCredits(featureKey: string) {
  return CREDIT_WEIGHTS[featureKey] ?? 2;
}

export function defaultCacheTtl(featureKey: string) {
  return CACHE_TTLS[featureKey] ?? 0;
}

export function dailyCreditLimit(role?: string | null) {
  const creator = ["ADMIN", "TEACHER", "SCHOOL_ADMIN"].includes(String(role));
  const configured = creator ? process.env.AI_DAILY_CREATOR_CREDITS : process.env.AI_DAILY_LEARNER_CREDITS;
  const parsed = Number(configured);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : creator ? 100 : 30;
}

export async function getCachedAiResponse<T>(cacheKey: string): Promise<T | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_response_cache")
    .select("response_json,expires_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();
  if (error || !data) return null;
  if (data.expires_at && new Date(data.expires_at) <= new Date()) return null;
  return data.response_json as T;
}

export async function markAiCacheHit(cacheKey: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("ai_response_cache").select("hit_count").eq("cache_key", cacheKey).maybeSingle();
  if (!data) return;
  await admin.from("ai_response_cache").update({
    hit_count: Number(data.hit_count ?? 0) + 1,
    last_hit_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("cache_key", cacheKey);
}

export async function saveAiResponseCache(input: {
  cacheKey: string;
  featureKey: string;
  model: string;
  promptVersion: string;
  inputHash: string;
  response: unknown;
  ttlSeconds: number;
}) {
  const admin = createAdminClient();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + input.ttlSeconds * 1000).toISOString();
  await admin.from("ai_response_cache").upsert({
    cache_key: input.cacheKey,
    feature_key: input.featureKey,
    model: input.model,
    prompt_version: input.promptVersion,
    input_hash: input.inputHash,
    response_json: input.response,
    expires_at: expiresAt,
    updated_at: now.toISOString(),
  }, { onConflict: "cache_key" });
}

export async function claimAiGeneration(cacheKey: string, ttlSeconds = 90) {
  const admin = createAdminClient();
  const ownerToken = randomUUID();
  const { data, error } = await admin.rpc("claim_ai_generation_lock", {
    p_cache_key: cacheKey,
    p_owner_token: ownerToken,
    p_ttl_seconds: ttlSeconds,
  });
  if (error) return { claimed: true, ownerToken, supported: false };
  return { claimed: data === true, ownerToken, supported: true };
}

export async function releaseAiGeneration(cacheKey: string, ownerToken: string) {
  const admin = createAdminClient();
  await admin.rpc("release_ai_generation_lock", { p_cache_key: cacheKey, p_owner_token: ownerToken });
}

export async function waitForCachedAiResponse<T>(cacheKey: string, timeoutMs = 4_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const cached = await getCachedAiResponse<T>(cacheKey);
    if (cached) return cached;
  }
  return null;
}

export async function reserveAiCredits(userId: string, role: string | null | undefined, credits: number) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("reserve_ai_credits", {
    p_user_id: userId,
    p_credits: credits,
    p_daily_limit: dailyCreditLimit(role),
  });
  if (error) return { supported: false, allowed: true, remaining: dailyCreditLimit(role) };
  const row = Array.isArray(data) ? data[0] : data;
  return { supported: true, allowed: row?.allowed === true, remaining: Number(row?.remaining ?? 0) };
}

export async function settleAiCredits(input: {
  userId: string;
  featureKey: string;
  reservedCredits: number;
  actualCredits?: number;
  usage?: Partial<AiUsage>;
  audioSeconds?: number;
  cacheHit?: boolean;
}) {
  const admin = createAdminClient();
  await admin.rpc("settle_ai_credits", {
    p_user_id: input.userId,
    p_feature_key: input.featureKey,
    p_reserved_credits: input.reservedCredits,
    p_actual_credits: input.actualCredits ?? input.reservedCredits,
    p_input_tokens: input.usage?.inputTokens ?? 0,
    p_output_tokens: input.usage?.outputTokens ?? 0,
    p_audio_seconds: input.audioSeconds ?? 0,
    p_cache_hit: input.cacheHit ?? false,
  });
}

export async function releaseAiCredits(userId: string, reservedCredits: number) {
  const admin = createAdminClient();
  await admin.rpc("release_ai_credits", { p_user_id: userId, p_reserved_credits: reservedCredits });
}

export function estimateModelCost(model: string, usage: AiUsage) {
  const rates = model.includes("gemini-3.5-flash")
    ? { input: 1.5, output: 9 }
    : model.includes("gemini-2.5-flash")
      ? { input: 0.3, output: 2.5 }
      : null;
  if (!rates) return null;
  const billableInput = Math.max(0, usage.inputTokens - usage.cachedTokens);
  return (billableInput / 1_000_000) * rates.input + (usage.outputTokens / 1_000_000) * rates.output;
}
