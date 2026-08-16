import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { createAdminClient } from "@/lib/supabase/admin";

type PushInput = {
  userId: string;
  notificationId: string;
  title: string;
  detail: string | null;
  href: string | null;
};

function firebaseConfigured() {
  return Boolean(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
}

function messaging() {
  if (!firebaseConfigured()) return null;
  const app = getApps()[0] ?? initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
  return getMessaging(app);
}

export async function sendPushNotification(input: PushInput) {
  const admin = createAdminClient();
  const sender = messaging();
  if (!sender) {
    await admin.from("notification_deliveries").update({
      status: "SKIPPED", provider: "FCM", attempted_at: new Date().toISOString(),
      error_message: "Firebase Cloud Messaging is not configured.", updated_at: new Date().toISOString(),
    }).eq("notification_id", input.notificationId).eq("channel", "PUSH");
    return;
  }

  const { data: devices } = await admin.from("push_devices").select("id,token").eq("user_id", input.userId).eq("enabled", true);
  if (!devices?.length) {
    await admin.from("notification_deliveries").update({
      status: "SKIPPED", provider: "FCM", attempted_at: new Date().toISOString(),
      error_message: "No enabled push device is registered.", updated_at: new Date().toISOString(),
    }).eq("notification_id", input.notificationId).eq("channel", "PUSH");
    return;
  }

  try {
    const response = await sender.sendEachForMulticast({
      tokens: devices.map((device) => device.token),
      notification: { title: input.title, body: input.detail || "Open BrenUp to see the update." },
      data: { href: input.href || "/account", notificationId: input.notificationId },
      webpush: { fcmOptions: { link: input.href ? new URL(input.href, process.env.NEXT_PUBLIC_SITE_URL || "https://www.brenup.com").toString() : "https://www.brenup.com/account" } },
    });
    const invalidDeviceIds = response.responses.flatMap((result, index) => result.success ? [] : [devices[index].id]);
    if (invalidDeviceIds.length) await admin.from("push_devices").update({ enabled: false, updated_at: new Date().toISOString() }).in("id", invalidDeviceIds);
    await admin.from("notification_deliveries").update({
      status: response.successCount ? "SENT" : "FAILED", provider: "FCM", attempted_at: new Date().toISOString(),
      delivered_at: response.successCount ? new Date().toISOString() : null,
      error_message: response.successCount ? null : response.responses.map((result) => result.error?.message).filter(Boolean).join("; ").slice(0, 1200) || "FCM delivery failed.",
      updated_at: new Date().toISOString(),
    }).eq("notification_id", input.notificationId).eq("channel", "PUSH");
  } catch (error) {
    await admin.from("notification_deliveries").update({
      status: "FAILED", provider: "FCM", attempted_at: new Date().toISOString(),
      error_message: error instanceof Error ? error.message : "FCM delivery failed.", updated_at: new Date().toISOString(),
    }).eq("notification_id", input.notificationId).eq("channel", "PUSH");
  }
}
