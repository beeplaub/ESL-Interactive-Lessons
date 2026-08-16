"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function markNotificationRead(notificationId: string) {
  const { user } = await requireUser();
  const admin = createAdminClient();
  const { error } = await admin
    .from("user_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", user.id)
    .is("read_at", null);
  if (error) throw new Error(error.message);
  revalidatePath("/account");
}

export async function markNotificationUnread(notificationId: string) {
  const { user } = await requireUser();
  const admin = createAdminClient();
  const { error } = await admin
    .from("user_notifications")
    .update({ read_at: null })
    .eq("id", notificationId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/account");
}

export async function deleteNotification(notificationId: string) {
  const { user } = await requireUser();
  const admin = createAdminClient();
  const { error } = await admin
    .from("user_notifications")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/account");
  revalidatePath("/notifications");
}

export async function restoreNotification(notificationId: string) {
  const { user } = await requireUser();
  const admin = createAdminClient();
  const { error } = await admin
    .from("user_notifications")
    .update({ archived_at: null })
    .eq("id", notificationId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/notifications");
}

export async function saveNotificationPreferences(formData: FormData): Promise<{ success: boolean; error?: string }> {
  try {
    const { user } = await requireUser();
    const categories = ["LEARNING", "ASSIGNMENTS", "LIVE_CLASSES", "ACHIEVEMENTS", "ANNOUNCEMENT", "ACCOUNT", "SUPPORT"];
    const admin = createAdminClient();
    const rows = categories.map((category) => ({
      user_id: user.id,
      category,
      in_app_enabled: formData.get(`${category}:IN_APP`) === "on",
      push_enabled: formData.get(`${category}:PUSH`) === "on",
      email_enabled: formData.get(`${category}:EMAIL`) === "on",
      updated_at: new Date().toISOString(),
    }));
    const { error } = await admin.from("notification_preferences").upsert(rows, { onConflict: "user_id,category" });
    if (error) return { success: false, error: error.message };
    revalidatePath("/notifications");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not save preferences." };
  }
}

export async function markAllNotificationsRead() {
  const { user } = await requireUser();
  const admin = createAdminClient();
  const { error } = await admin
    .from("user_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);
  if (error) throw new Error(error.message);
  revalidatePath("/account");
  revalidatePath("/notifications");
}
