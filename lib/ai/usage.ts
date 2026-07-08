import { createAdminClient } from "@/lib/supabase/admin";

export type QuotaCheckResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
  message?: string;
};

/**
 * Checks if a user has exceeded their daily AI request quota.
 * Resolves limits from environment variables:
 * - AI_DAILY_CREATOR_LIMIT (defaults to 50)
 * - AI_DAILY_LEARNER_LIMIT (defaults to 15)
 */
export async function checkUsageQuota(
  userId: string,
  userRole: "ADMIN" | "LEARNER" | "TEACHER" | "SCHOOL_ADMIN"
): Promise<QuotaCheckResult> {
  const supabase = createAdminClient();

  // Resolve daily limits based on role
  const isCreatorOrAdmin = ["ADMIN", "TEACHER", "SCHOOL_ADMIN"].includes(userRole);
  const limitStr = isCreatorOrAdmin
    ? process.env.AI_DAILY_CREATOR_LIMIT
    : process.env.AI_DAILY_LEARNER_LIMIT;
  
  const dailyLimit = limitStr ? parseInt(limitStr, 10) : isCreatorOrAdmin ? 50 : 15;

  const todayStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format

  try {
    // Sum request_count for this user on the current date
    const { data: usageRows, error } = await supabase
      .from("ai_usage_events")
      .select("request_count")
      .eq("user_id", userId)
      .eq("request_date", todayStr);

    if (error) throw error;

    const totalUsed = (usageRows ?? []).reduce((sum, row) => sum + row.request_count, 0);

    if (totalUsed >= dailyLimit) {
      return {
        allowed: false,
        remaining: 0,
        limit: dailyLimit,
        message: `You have reached your daily limit of ${dailyLimit} AI actions. Quota resets tomorrow.`
      };
    }

    return {
      allowed: true,
      remaining: dailyLimit - totalUsed,
      limit: dailyLimit
    };
  } catch (error) {
    // If table read fails (e.g. database schema is missing during setup), fail gracefully but allow execution
    return {
      allowed: true,
      remaining: 1,
      limit: dailyLimit
    };
  }
}

/**
 * Increments the daily usage counter for the user.
 */
export async function recordUsageEvent(
  userId: string,
  featureKey: string,
  estimatedTokens: number = 0
): Promise<void> {
  const supabase = createAdminClient();
  const todayStr = new Date().toISOString().split("T")[0];

  try {
    // Fetch existing usage event for this user, feature, and date
    const { data: existing } = await supabase
      .from("ai_usage_events")
      .select("id, request_count, estimated_tokens")
      .eq("user_id", userId)
      .eq("feature_key", featureKey)
      .eq("request_date", todayStr)
      .maybeSingle();

    if (existing) {
      // Increment request count and tokens
      await supabase
        .from("ai_usage_events")
        .update({
          request_count: existing.request_count + 1,
          estimated_tokens: existing.estimated_tokens + estimatedTokens
        })
        .eq("id", existing.id);
    } else {
      // Insert new daily event row
      await supabase.from("ai_usage_events").insert({
        user_id: userId,
        feature_key: featureKey,
        request_date: todayStr,
        request_count: 1,
        estimated_tokens: estimatedTokens
      });
    }
  } catch (error) {
    console.error("Failed to record AI usage event:", error);
  }
}
