"use client";

import { useEffect } from "react";

/** A local, opt-in chime. No audio file or learner data leaves the browser. */
function playChime() {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.setValueAtTime(740, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.06, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.24);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.26);
  } catch { /* Browser audio may still require a prior user gesture. */ }
}

export function NotificationSoundWatcher({ notificationIds }: { notificationIds: string[] }) {
  useEffect(() => {
    const key = "brenup_known_notification_ids";
    const soundEnabled = localStorage.getItem("brenup_notification_sound") === "1";
    let stored: unknown = [];
    try { stored = JSON.parse(localStorage.getItem(key) || "[]"); } catch { stored = []; }
    const known = new Set<string>(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : []);
    const hasBaseline = known.size > 0;
    const hasNewMessage = hasBaseline && notificationIds.some((id) => !known.has(id));
    localStorage.setItem(key, JSON.stringify(notificationIds.slice(0, 32)));
    if (soundEnabled && hasNewMessage) playChime();
  }, [notificationIds]);
  return null;
}
