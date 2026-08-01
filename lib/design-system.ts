import { createAdminClient } from "@/lib/supabase/admin";

export type StyleDensity = "COMFORTABLE" | "COMPACT";
export type StyleRadius = "BALANCED" | "SHARP" | "SOFT";

/**
 * Stored as versioned JSON so platform theme upgrades never require a
 * destructive database migration. Components consume only the CSS variables
 * produced below, never a database value directly.
 */
export type PlatformStyleSettings = {
  schemaVersion: 2;
  brandPrimary: string;
  brandPrimaryStrong: string;
  action: string;
  actionStrong: string;
  tertiary: string;
  tertiaryContainer: string;
  canvas: string;
  canvasElevated: string;
  surface: string;
  surfaceMuted: string;
  surfaceStrong: string;
  text: string;
  textMuted: string;
  textOnDark: string;
  border: string;
  borderStrong: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  achievement: string;
  chartPrimary: string;
  chartSecondary: string;
  orgAccent: string;
  learnerDensity: StyleDensity;
  adminDensity: StyleDensity;
  radius: StyleRadius;
  elevation: "SUBTLE" | "STANDARD" | "EXPRESSIVE";
};

export const DEFAULT_PLATFORM_STYLE: PlatformStyleSettings = {
  schemaVersion: 2,
  brandPrimary: "var(--br-brand)",
  brandPrimaryStrong: "var(--br-brand-strong)",
  action: "var(--br-action)",
  actionStrong: "#d95335",
  tertiary: "#282848",
  tertiaryContainer: "#3e3e5f",
  canvas: "#fcf8ff",
  canvasElevated: "#f6f3fb",
  surface: "#ffffff",
  surfaceMuted: "#f5f2fe",
  surfaceStrong: "#ebe8f2",
  text: "#1b1b23",
  textMuted: "var(--br-text-muted)",
  textOnDark: "#ffffff",
  border: "var(--br-border)",
  borderStrong: "#cbc7d8",
  success: "var(--br-success)",
  warning: "#e89b10",
  danger: "#a7391e",
  info: "var(--br-info)",
  achievement: "var(--br-achievement)",
  chartPrimary: "#6c3bff",
  chartSecondary: "#00a77a",
  orgAccent: "var(--br-action)",
  learnerDensity: "COMFORTABLE",
  adminDensity: "COMPACT",
  radius: "BALANCED",
  elevation: "STANDARD",
};

const hex = /^#[0-9a-fA-F]{6}$/;
const density = new Set<StyleDensity>(["COMFORTABLE", "COMPACT"]);
const radius = new Set<StyleRadius>(["BALANCED", "SHARP", "SOFT"]);
const elevation = new Set<PlatformStyleSettings["elevation"]>(["SUBTLE", "STANDARD", "EXPRESSIVE"]);

type ColorKey =
  | "brandPrimary" | "brandPrimaryStrong" | "action" | "actionStrong" | "tertiary" | "tertiaryContainer"
  | "canvas" | "canvasElevated" | "surface" | "surfaceMuted" | "surfaceStrong" | "text" | "textMuted"
  | "textOnDark" | "border" | "borderStrong" | "success" | "warning" | "danger" | "info" | "achievement"
  | "chartPrimary" | "chartSecondary" | "orgAccent";
const colorKeys: ColorKey[] = [
  "brandPrimary", "brandPrimaryStrong", "action", "actionStrong", "tertiary", "tertiaryContainer",
  "canvas", "canvasElevated", "surface", "surfaceMuted", "surfaceStrong", "text", "textMuted",
  "textOnDark", "border", "borderStrong", "success", "warning", "danger", "info", "achievement",
  "chartPrimary", "chartSecondary", "orgAccent",
];

export function normalizePlatformStyle(input: unknown): PlatformStyleSettings {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const normalized = { ...DEFAULT_PLATFORM_STYLE };
  for (const key of colorKeys) {
    if (typeof value[key] === "string" && hex.test(value[key] as string)) normalized[key] = value[key] as never;
  }
  normalized.learnerDensity = density.has(value.learnerDensity as StyleDensity) ? value.learnerDensity as StyleDensity : DEFAULT_PLATFORM_STYLE.learnerDensity;
  normalized.adminDensity = density.has(value.adminDensity as StyleDensity) ? value.adminDensity as StyleDensity : DEFAULT_PLATFORM_STYLE.adminDensity;
  normalized.radius = radius.has(value.radius as StyleRadius) ? value.radius as StyleRadius : DEFAULT_PLATFORM_STYLE.radius;
  normalized.elevation = elevation.has(value.elevation as PlatformStyleSettings["elevation"]) ? value.elevation as PlatformStyleSettings["elevation"] : DEFAULT_PLATFORM_STYLE.elevation;
  return normalized;
}

export async function getPlatformStyle() {
  const admin = createAdminClient();
  const { data } = await admin.from("platform_style_settings").select("settings,revision").eq("id", true).maybeSingle();
  return { settings: normalizePlatformStyle(data?.settings), revision: data?.revision ?? 1 };
}

export async function getPlatformStyleRevisions() {
  const admin = createAdminClient();
  const { data } = await admin.from("platform_style_revisions").select("id,revision,settings,created_at").order("revision", { ascending: false }).limit(12);
  return (data ?? []).map((row) => {
    const raw = row.settings && typeof row.settings === "object" ? row.settings as Record<string, unknown> : {};
    const meta = raw._meta && typeof raw._meta === "object" ? raw._meta as Record<string, unknown> : {};
    return {
      id: row.id,
      revision: row.revision,
      settings: normalizePlatformStyle(raw),
      label: typeof meta.label === "string" ? meta.label : null,
      createdAt: row.created_at,
    };
  });
}

export function platformStyleVariables(settings: PlatformStyleSettings) {
  const radiusValue = settings.radius === "SHARP" ? "0.375rem" : settings.radius === "SOFT" ? "1rem" : "0.75rem";
  const shadow = settings.elevation === "SUBTLE" ? "0 8px 22px rgba(27,27,58,.06)" : settings.elevation === "EXPRESSIVE" ? "0 20px 50px rgba(27,27,58,.16)" : "0 12px 35px rgba(27,27,58,.10)";
  return {
    "--br-canvas": settings.canvas,
    "--br-canvas-elevated": settings.canvasElevated,
    "--br-surface": settings.surface,
    "--br-surface-muted": settings.surfaceMuted,
    "--br-surface-strong": settings.surfaceStrong,
    "--br-text": settings.text,
    "--br-text-muted": settings.textMuted,
    "--br-text-on-dark": settings.textOnDark,
    "--br-border": settings.border,
    "--br-border-strong": settings.borderStrong,
    "--br-brand": settings.brandPrimary,
    "--br-brand-strong": settings.brandPrimaryStrong,
    "--br-action": settings.action,
    "--br-action-strong": settings.actionStrong,
    "--br-dark-card": settings.tertiary,
    "--br-dark-card-raised": settings.tertiaryContainer,
    "--br-success": settings.success,
    "--br-warning": settings.warning,
    "--br-danger": settings.danger,
    "--br-info": settings.info,
    "--br-achievement": settings.achievement,
    "--br-chart-primary": settings.chartPrimary,
    "--br-chart-secondary": settings.chartSecondary,
    "--org-accent-color": settings.orgAccent,
    "--br-radius": radiusValue,
    "--br-shadow": shadow,
  } as Record<string, string>;
}
