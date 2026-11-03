export const CALLOUT_BACKGROUNDS = {
  ivory: { label: "Warm ivory", color: "#FFF8EE" },
  peach: { label: "Soft peach", color: "#FFF0E8" },
  sky: { label: "Soft sky", color: "#F1F7FF" },
  warmWhite: { label: "Warm white", color: "#FFFCF8" },
} as const;

export type CalloutBackgroundKey = keyof typeof CALLOUT_BACKGROUNDS;

export function calloutBackgroundKey(value: unknown): CalloutBackgroundKey {
  return typeof value === "string" && value in CALLOUT_BACKGROUNDS
    ? value as CalloutBackgroundKey
    : "ivory";
}
