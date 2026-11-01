import { createAdminClient } from "@/lib/supabase/admin";

export type AiTutorEngine = "GEMINI" | "KOKORO";
export type AiTutorAccess = {
  has_access: boolean;
  grant_id?: string;
  engine?: AiTutorEngine;
  max_session_minutes?: number;
  daily_minutes_limit?: number | null;
  daily_minutes_used?: number;
  total_minutes_limit?: number | null;
  total_minutes_used?: number;
};

export async function getAiTutorAccess(userId: string): Promise<AiTutorAccess> {
  const admin = createAdminClient() as any;
  const { data, error } = await admin.rpc("get_ai_tutor_access", { p_user_id: userId });
  if (error) throw new Error("AI Tutor access could not be checked.");
  return data as AiTutorAccess;
}

export async function reserveAiTutorSession(userId: string, requestedMinutes: number) {
  const admin = createAdminClient() as any;
  const { data, error } = await admin.rpc("reserve_ai_tutor_session", {
    p_user_id: userId,
    p_requested_minutes: requestedMinutes,
  });
  if (error) throw new Error("AI Tutor session could not be reserved.");
  return data as {
    ok: boolean;
    reason?: "NO_ACCESS" | "QUOTA_EXHAUSTED";
    session_id?: string;
    engine?: AiTutorEngine;
    duration_minutes?: number;
    max_session_minutes?: number;
  };
}

export async function finishAiTutorSession(userId: string, sessionId: string, cancel = false) {
  const admin = createAdminClient() as any;
  const { error } = await admin.rpc("finish_ai_tutor_session", {
    p_session_id: sessionId,
    p_user_id: userId,
    p_cancel: cancel,
  });
  if (error) throw new Error("AI Tutor usage could not be finalized.");
}

export async function assertActiveTutorSession(userId: string, sessionId: string, engine: AiTutorEngine) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("ai_tutor_sessions")
    .select("id,engine,allocated_minutes,expires_at")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .eq("engine", engine)
    .eq("status", "ACTIVE")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw new Error("AI Tutor session could not be verified.");
  return data;
}

export async function claimGeminiTutorSession(userId: string, sessionId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("ai_tutor_sessions")
    .update({ token_issued_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .eq("engine", "GEMINI")
    .eq("status", "ACTIVE")
    .is("token_issued_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id,engine,allocated_minutes,expires_at")
    .maybeSingle();
  if (error) throw new Error("AI Tutor session could not be claimed.");
  return data;
}
