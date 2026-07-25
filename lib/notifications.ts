import { createAdminClient } from "@/lib/supabase/admin";

export type NotificationTone = "purple" | "orange" | "green" | "blue";

type NotificationInput = {
  userId: string;
  type: string;
  title: string;
  detail?: string | null;
  href?: string | null;
  tone?: NotificationTone;
  dedupeKey?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Notifications are deliberately best-effort: a missing migration or a
 * transient notification failure must never block a learner's course access,
 * assignment, certificate, or teacher grade.
 */
export async function notifyUser(input: NotificationInput) {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("user_notifications").insert({
      user_id: input.userId,
      type: input.type,
      title: input.title,
      detail: input.detail ?? null,
      href: input.href ?? null,
      tone: input.tone ?? "purple",
      metadata: input.metadata ?? {},
      dedupe_key: input.dedupeKey ?? null,
    });
    if (error && error.code !== "23505") console.error("Could not create user notification", error);
  } catch (error) {
    console.error("Could not create user notification", error);
  }
}

export async function notifyUsers(userIds: string[], input: Omit<NotificationInput, "userId" | "dedupeKey"> & { dedupeKeyPrefix?: string }) {
  await Promise.all([...new Set(userIds)].map((userId) => notifyUser({
    ...input,
    userId,
    dedupeKey: input.dedupeKeyPrefix ? `${input.dedupeKeyPrefix}:${userId}` : null,
  })));
}
