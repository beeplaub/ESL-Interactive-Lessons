"use client";

import { useCallback, useEffect, useState } from "react";

export type VoiceGenerationPreferences = {
  provider: "auto" | "kokoro" | "google";
  languageCode: string;
  voiceName: string;
  style: string;
  pace: string;
  locked: boolean;
};

const defaults: VoiceGenerationPreferences = {
  provider: "auto",
  languageCode: "en-US",
  voiceName: "Aoede",
  style: "Natural",
  pace: "Natural",
  locked: false,
};

export function useVoiceGenerationPreferences(initial: VoiceGenerationPreferences) {
  const [preferences, setPreferences] = useState<VoiceGenerationPreferences>({ ...defaults, ...initial });
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/creator-tools/voiceover/preferences", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not load voice settings.");
        if (active && data.preferences) setPreferences({ ...defaults, ...data.preferences });
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load voice settings."); })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  const update = useCallback((patch: Partial<VoiceGenerationPreferences>) => {
    setPreferences((current) => ({ ...current, ...patch }));
    setError(null);
  }, []);

  const save = useCallback(async (next: VoiceGenerationPreferences) => {
    setSaving(true); setError(null);
    try {
      const response = await fetch("/api/creator-tools/voiceover/preferences", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not save voice settings.");
      setPreferences({ ...defaults, ...data.preferences });
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save voice settings.");
      return false;
    } finally { setSaving(false); }
  }, []);

  const toggleLock = useCallback(() => save({ ...preferences, locked: !preferences.locked }), [preferences, save]);
  return { preferences, ready, saving, error, update, save, toggleLock };
}
