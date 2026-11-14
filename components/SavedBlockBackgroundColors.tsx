"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getLessonBlockBackgroundColors, saveLessonBlockBackgroundColors } from "@/app/admin/lessons/actions";

type SavedColorsContextValue = {
  colors: string[];
  error: string | null;
  status: "account" | "device";
  save: (color: string) => Promise<void>;
  remove: (color: string) => Promise<void>;
};

const SavedColorsContext = createContext<SavedColorsContextValue | null>(null);

export function SavedBlockBackgroundColorsProvider({ lessonId, children }: { lessonId: string; children: ReactNode }) {
  const [colors, setColors] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<"account" | "device">("account");

  useEffect(() => {
    let active = true;
    void getLessonBlockBackgroundColors(lessonId).then((result) => {
      if (!active) return;
      setUserId(result.userId);
      const storageKey = `brenup_saved_block_background_colors:${result.userId}`;
      let localColors: string[] = [];
      try {
        const saved = localStorage.getItem(storageKey);
        const parsed = saved ? JSON.parse(saved) : [];
        if (Array.isArray(parsed)) localColors = parsed.filter((color): color is string => typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)).map((color) => color.toUpperCase()).slice(0, 24);
      } catch { /* Ignore invalid local preferences. */ }

      if (!result.error) {
        const accountColors = result.colors;
        if (accountColors.length || !localColors.length) {
          setColors(accountColors);
          setStatus("account");
          try { localStorage.setItem(storageKey, JSON.stringify(accountColors)); } catch { /* Account storage remains authoritative. */ }
        } else {
          setColors(localColors);
          setStatus("device");
          void saveLessonBlockBackgroundColors(lessonId, localColors).then((saved) => {
            if (active && saved.success) {
              setColors(saved.colors ?? localColors);
              setStatus("account");
            }
          });
        }
        setError(null);
      } else {
        setColors(localColors);
        setStatus("device");
        setError(localColors.length ? "Saved on this device. Apply the migration to sync colors across devices." : null);
      }
    }).catch(() => {
      if (!active) return;
      setStatus("device");
      setError("Could not load saved colors.");
    });
    return () => { active = false; };
  }, [lessonId]);

  const persist = useCallback(async (nextColors: string[]) => {
    setError(null);
    const normalized = [...new Set(nextColors.map((color) => color.toUpperCase()))].slice(0, 24);
    if (userId) {
      try { localStorage.setItem(`brenup_saved_block_background_colors:${userId}`, JSON.stringify(normalized)); } catch { /* Continue with account storage. */ }
    }
    setColors(normalized);
    let result: Awaited<ReturnType<typeof saveLessonBlockBackgroundColors>>;
    try {
      result = await saveLessonBlockBackgroundColors(lessonId, normalized);
    } catch {
      setStatus("device");
      setError("Saved on this device. Account sync is unavailable right now.");
      return;
    }
    if (!result.success) {
      setStatus("device");
      setError("Saved on this device. Apply the migration to sync colors across devices.");
      return;
    }
    setStatus("account");
    setColors(result.colors ?? nextColors);
    setError(null);
  }, [lessonId, userId]);

  const value = useMemo<SavedColorsContextValue>(() => ({
    colors,
    error,
    status,
    save: async (color) => {
      const normalized = color.toUpperCase();
      if (!/^#[0-9A-F]{6}$/.test(normalized) || colors.includes(normalized)) return;
      if (colors.length >= 24) {
        setError("You can save up to 24 colors.");
        return;
      }
      await persist([...colors, normalized]);
    },
    remove: async (color) => persist(colors.filter((savedColor) => savedColor !== color)),
  }), [colors, error, persist, status]);

  return <SavedColorsContext.Provider value={value}>{children}</SavedColorsContext.Provider>;
}

export function useSavedBlockBackgroundColors() {
  return useContext(SavedColorsContext);
}
