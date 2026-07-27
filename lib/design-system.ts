import { createAdminClient } from "@/lib/supabase/admin";

export type PlatformStyleSettings = {
  brandPrimary: string; action: string; canvas: string; surface: string; surfaceMuted: string;
  text: string; textMuted: string; border: string; success: string; danger: string;
  achievement: string; orgAccent: string;
  learnerDensity: "COMFORTABLE" | "COMPACT";
  adminDensity: "COMFORTABLE" | "COMPACT";
  radius: "BALANCED" | "SHARP" | "SOFT";
};

export const DEFAULT_PLATFORM_STYLE: PlatformStyleSettings = {
  brandPrimary: "#3e3a72", action: "#ff7a59", canvas: "#fcf8ff", surface: "#ffffff",
  surfaceMuted: "#f5f2fe", text: "#1b1b23", textMuted: "#6e6e85", border: "#e4e4ee",
  success: "#2fae7a", danger: "#a7391e", achievement: "#f2b705", orgAccent: "#ff7a59",
  learnerDensity: "COMFORTABLE", adminDensity: "COMPACT", radius: "BALANCED",
};

const hex = /^#[0-9a-fA-F]{6}$/;
const density = new Set(["COMFORTABLE", "COMPACT"]);
const radius = new Set(["BALANCED", "SHARP", "SOFT"]);

export function normalizePlatformStyle(input: unknown): PlatformStyleSettings {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const color = (key: keyof PlatformStyleSettings) => typeof value[key] === "string" && hex.test(value[key] as string) ? value[key] as string : DEFAULT_PLATFORM_STYLE[key] as string;
  return {
    brandPrimary: color("brandPrimary"), action: color("action"), canvas: color("canvas"), surface: color("surface"), surfaceMuted: color("surfaceMuted"),
    text: color("text"), textMuted: color("textMuted"), border: color("border"), success: color("success"), danger: color("danger"), achievement: color("achievement"), orgAccent: color("orgAccent"),
    learnerDensity: density.has(value.learnerDensity as string) ? value.learnerDensity as PlatformStyleSettings["learnerDensity"] : DEFAULT_PLATFORM_STYLE.learnerDensity,
    adminDensity: density.has(value.adminDensity as string) ? value.adminDensity as PlatformStyleSettings["adminDensity"] : DEFAULT_PLATFORM_STYLE.adminDensity,
    radius: radius.has(value.radius as string) ? value.radius as PlatformStyleSettings["radius"] : DEFAULT_PLATFORM_STYLE.radius,
  };
}

export async function getPlatformStyle() {
  const admin = createAdminClient();
  const { data } = await admin.from("platform_style_settings").select("settings,revision").eq("id", true).maybeSingle();
  return { settings: normalizePlatformStyle(data?.settings), revision: data?.revision ?? 1 };
}

export async function getPlatformStyleRevisions() {
  const admin = createAdminClient();
  const { data } = await admin.from("platform_style_revisions").select("id,revision,settings,created_at").order("revision", { ascending: false }).limit(8);
  return (data ?? []).map((row) => ({ id: row.id, revision: row.revision, settings: normalizePlatformStyle(row.settings), createdAt: row.created_at }));
}

export function platformStyleVariables(settings: PlatformStyleSettings) {
  const radiusValue = settings.radius === "SHARP" ? "0.375rem" : settings.radius === "SOFT" ? "1rem" : "0.75rem";
  return {
    "--br-canvas": settings.canvas, "--br-surface": settings.surface, "--br-surface-muted": settings.surfaceMuted,
    "--br-text": settings.text, "--br-text-muted": settings.textMuted, "--br-border": settings.border,
    "--br-brand": settings.brandPrimary, "--br-action": settings.action, "--br-success": settings.success,
    "--br-danger": settings.danger, "--br-achievement": settings.achievement, "--org-accent-color": settings.orgAccent,
    "--br-radius": radiusValue,
  } as Record<string, string>;
}
