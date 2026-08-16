"use client";

import { BellRing, Loader2 } from "lucide-react";
import { useState } from "react";
import { getApps, initializeApp } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { getFirebaseClientConfig, getFirebaseVapidKey } from "@/lib/firebase-client-config";

const firebaseConfig = getFirebaseClientConfig();
const vapidKey = getFirebaseVapidKey();

const configured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.messagingSenderId && firebaseConfig.appId && vapidKey);

export function PushNotificationControl({ initialEnabled = false }: { initialEnabled?: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  async function enable() {
    if (!configured) { setMessage("Push is not configured for BrenUp yet."); return; }
    setWorking(true); setMessage("");
    try {
      if (!(await isSupported())) throw new Error("This browser does not support push notifications.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notification permission was not granted.");
      const registration = await navigator.serviceWorker.register("/api/push/worker", { scope: "/" });
      const app = getApps()[0] ?? initializeApp(firebaseConfig);
      const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: registration });
      if (!token) throw new Error("Your browser did not provide a push token.");
      const response = await fetch("/api/push/devices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not save this device.");
      localStorage.setItem("brenup_push_token", token);
      setEnabled(true); setMessage("Push notifications are enabled on this device.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not enable push notifications.");
    } finally { setWorking(false); }
  }

  async function disable() {
    setWorking(true); setMessage("");
    try {
      const token = localStorage.getItem("brenup_push_token");
      if (token) await fetch("/api/push/devices", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      localStorage.removeItem("brenup_push_token");
      setEnabled(false); setMessage("Push notifications are disabled on this device.");
    } finally { setWorking(false); }
  }

  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--br-border)] bg-surface p-4">
    <div className="min-w-0"><div className="flex items-center gap-2"><BellRing className="size-4 text-[var(--br-brand)]" /><p className="text-sm font-extrabold text-ink">Browser push</p></div><p className="mt-1 text-xs leading-5 text-[var(--br-text-muted)]">Receive timely class, assignment, and learning updates on this device.</p>{message ? <p className="mt-2 text-xs font-semibold text-[var(--br-text-muted)]">{message}</p> : null}</div>
    <button type="button" disabled={working} onClick={enabled ? disable : enable} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-extrabold ${enabled ? "border border-[var(--br-border)] bg-[var(--br-surface-muted)] text-[var(--br-text)]" : "bg-[var(--br-brand)] text-on-dark"} disabled:opacity-60`}>{working ? <Loader2 className="size-3.5 animate-spin" /> : null}{enabled ? "On" : "Enable"}</button>
  </div>;
}
