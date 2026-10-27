"use client";

import { BellRing, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getApps, initializeApp } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { getFirebaseClientConfig, getFirebaseVapidKey } from "@/lib/firebase-client-config";
import { deleteNativePushToken, getNativePushToken, isBrenUpNativeApp, setNativePushRegistrationEnabled } from "@/lib/nativeBridge";

const firebaseConfig = getFirebaseClientConfig();
const vapidKey = getFirebaseVapidKey();

const configured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.messagingSenderId && firebaseConfig.appId && vapidKey);

export function PushNotificationControl({ initialEnabled = false }: { initialEnabled?: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [working, setWorking] = useState(false);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem("brenup_push_token");
    if (!token) {
      setEnabled(false);
      setChecking(false);
      return () => { cancelled = true; };
    }
    void fetch("/api/push/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "status", token }),
    }).then(async (response) => {
      if (!response.ok) throw new Error("Could not check notification settings.");
      const payload = await response.json().catch(() => ({}));
      if (!cancelled) {
        setEnabled(payload.enabled === true);
        if (payload.enabled === true && isBrenUpNativeApp()) {
          void setNativePushRegistrationEnabled(true, token).catch(() => undefined);
        }
        setChecking(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setMessage("Could not check notification settings.");
        setChecking(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onNativeTokenRefresh = () => {
      setEnabled(true);
      setMessage("Push notifications are enabled on this device.");
    };
    const onNativeRegistrationRequired = () => {
      setEnabled(false);
      setMessage("Enable notifications again to register this account on this device.");
    };
    window.addEventListener("brenup-push-token-refreshed", onNativeTokenRefresh);
    window.addEventListener("brenup-push-registration-required", onNativeRegistrationRequired);
    return () => {
      window.removeEventListener("brenup-push-token-refreshed", onNativeTokenRefresh);
      window.removeEventListener("brenup-push-registration-required", onNativeRegistrationRequired);
    };
  }, []);

  async function enable() {
    const native = isBrenUpNativeApp();
    if (!native && !configured) { setMessage("Push is not configured for BrenUp yet."); return; }
    setWorking(true); setMessage("");
    try {
      let token: string;
      if (native) {
        token = await getNativePushToken();
      } else {
        if (!(await isSupported())) throw new Error("This browser does not support push notifications.");
        const permission = await Notification.requestPermission();
        if (permission !== "granted") throw new Error("Notification permission was not granted.");
        const registration = await navigator.serviceWorker.register("/api/push/worker", { scope: "/" });
        const app = getApps()[0] ?? initializeApp(firebaseConfig);
        token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: registration });
      }
      if (!token) throw new Error("Your browser did not provide a push token.");
      const response = await fetch("/api/push/devices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, platform: native ? "ANDROID" : "WEB" }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not save this device.");
      localStorage.setItem("brenup_push_token", token);
      if (native) await setNativePushRegistrationEnabled(true, token);
      setEnabled(true); setMessage("Push notifications are enabled on this device.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not enable push notifications.");
    } finally { setWorking(false); }
  }

  async function disable() {
    setWorking(true); setMessage("");
    try {
      const token = localStorage.getItem("brenup_push_token");
      if (token) {
        const response = await fetch("/api/push/devices", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
        if (!response.ok) throw new Error("Could not disable push notifications on this device.");
      }
      if (isBrenUpNativeApp()) {
        await setNativePushRegistrationEnabled(false);
        await deleteNativePushToken();
      }
      localStorage.removeItem("brenup_push_token");
      setEnabled(false); setMessage("Push notifications are disabled on this device.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not disable push notifications on this device.");
    } finally { setWorking(false); }
  }

  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--br-border)] bg-surface p-4">
    <div className="min-w-0"><div className="flex items-center gap-2"><BellRing className="size-4 text-[var(--br-brand)]" /><p className="text-sm font-extrabold text-ink">Device push</p></div><p className="mt-1 text-xs leading-5 text-[var(--br-text-muted)]">Receive timely class, assignment, and learning updates on this device.</p>{message ? <p className="mt-2 text-xs font-semibold text-[var(--br-text-muted)]">{message}</p> : null}</div>
    <button type="button" disabled={working || checking} onClick={enabled ? disable : enable} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-extrabold ${enabled ? "border border-[var(--br-border)] bg-[var(--br-surface-muted)] text-[var(--br-text)]" : "bg-[var(--br-brand)] text-on-dark"} disabled:opacity-60`}>{working || checking ? <Loader2 className="size-3.5 animate-spin" /> : null}{enabled ? "On" : "Enable"}</button>
  </div>;
}
