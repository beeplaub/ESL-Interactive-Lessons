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

/**
 * Expands a content level into every single CEFR band it covers.
 *
 * - A single band ("B1") expands to just itself.
 * - "All Levels" expands to all six bands.
 * - A range "X-Y" (e.g. "A1-A2", "A2-B2", "B1-C1") expands to every band from
 *   X through Y inclusive, using CEFR_LEVELS order. This intentionally
 *   supports ranges beyond the three predefined CEFR_LEVEL_RANGES combos —
 *   the `level` column itself is free text, so a course can be tagged with a
 *   wider range (e.g. directly via Supabase) and still filter correctly.
 * - Anything unparseable (including null/empty) expands to no bands.
 *
 * Used to decide whether a course should appear under a given level pill:
 * a course tagged "A2-B2" should show up for A2, B1, and B2, even though
 * "B1" never appears explicitly in its level string.
 */
export function expandLevelToBands(level: string | null | undefined): CefrLevel[] {
  if (!level) return [];
  const trimmed = level.trim();
  if (trimmed === ALL_LEVELS_LABEL) return [...CEFR_LEVELS];
  if ((CEFR_LEVELS as readonly string[]).includes(trimmed)) return [trimmed as CefrLevel];

  const match = /^([ABC][12])\s*-\s*([ABC][12])$/i.exec(trimmed);
  if (match) {
    const start = match[1].toUpperCase();
    const end = match[2].toUpperCase();
    const startIndex = (CEFR_LEVELS as readonly string[]).indexOf(start);
    const endIndex = (CEFR_LEVELS as readonly string[]).indexOf(end);
    if (startIndex !== -1 && endIndex !== -1 && startIndex <= endIndex) {
      return CEFR_LEVELS.slice(startIndex, endIndex + 1);
    }
  }
  return [];
}

