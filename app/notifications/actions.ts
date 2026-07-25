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
    .delete()
    .eq("id", notificationId)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/account");
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
}
