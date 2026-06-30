/**
 * Single source of truth for the "level" tag used on lessons and courses.
 *
 * This is distinct from `profiles.cefr_level`, which is the learner's own
 * placement-test result and is a real Postgres enum locked to the six base
 * CEFR bands (A1-C2). That value must never be widened to include the
 * combined ranges below — it represents a single point on the CEFR scale,
 * not a content tag.
 *
 * Content (lessons/courses) can be tagged more loosely: a single CEFR band,
 * a combined range spanning two adjacent bands, or "All Levels" for content
 * that isn't level-specific.
 */

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export const CEFR_LEVEL_RANGES = ["A1-A2", "B1-B2", "C1-C2"] as const;
export type CefrLevelRange = (typeof CEFR_LEVEL_RANGES)[number];

export const ALL_LEVELS_LABEL = "All Levels" as const;

/** Every value a lesson/course "level" field may legitimately hold. */
export const CONTENT_LEVELS = [
  "A1",
  "A2",
  "A1-A2",
  "B1",
  "B2",
  "B1-B2",
  "C1",
  "C2",
  "C1-C2",
  ALL_LEVELS_LABEL,
] as const;
export type ContentLevel = (typeof CONTENT_LEVELS)[number];

/** Numeric sort position for content levels (combined ranges sit between their bands; "All Levels" sorts first). */
export const CONTENT_LEVEL_SORT_ORDER: Record<string, number> = {
  [ALL_LEVELS_LABEL]: 0,
  A1: 1,
  "A1-A2": 1.5,
  A2: 2,
  B1: 3,
  "B1-B2": 3.5,
  B2: 4,
  C1: 5,
  "C1-C2": 5.5,
  C2: 6,
};

/**
 * Maps any content level (including combined ranges and "All Levels") down
 * to its nearest single CEFR band. Used anywhere that needs a single-band
 * anchor — e.g. matching content against a learner's own `cefr_level`.
 */
export function anchorCefrLevel(level: string | null | undefined): CefrLevel {
  if (!level) return "B1";
  if ((CEFR_LEVELS as readonly string[]).includes(level)) return level as CefrLevel;
  if (level === "A1-A2") return "A1";
  if (level === "B1-B2") return "B1";
  if (level === "C1-C2") return "C1";
  return "B1";
}
