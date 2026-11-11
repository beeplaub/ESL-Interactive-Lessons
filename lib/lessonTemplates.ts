export const LESSON_TEMPLATES = ["LAP", "LTP", "LO", "PO"] as const;
export type LessonTemplate = (typeof LESSON_TEMPLATES)[number];
export type LessonPhase = "LEARN" | "PRACTICE";
export type AutoplayMode = "FIXED_DURATION" | "NARRATION_DURATION";

export type LessonPhaseItem = {
  id: string;
  lesson_id: string;
  slide_id: string;
  phase: LessonPhase;
  position: number;
};

export type PracticeLearnLink = {
  lesson_id: string;
  practice_item_id: string;
  learn_item_id: string;
};

export type LessonPlayerStep =
  | { type: "START" }
  | { type: "LEARN"; item: LessonPhaseItem }
  | { type: "START_PRACTICING" }
  | { type: "PRACTICE"; item: LessonPhaseItem }
  | { type: "COMPLETE" };

export function resolveLessonPlayerSteps(input: {
  template: LessonTemplate;
  phaseItems: LessonPhaseItem[];
  links: PracticeLearnLink[];
}): LessonPlayerStep[] {
  const ordered = (phase: LessonPhase) => input.phaseItems
    .filter((item) => item.phase === phase)
    .sort((a, b) => a.position - b.position);
  const learn = ordered("LEARN");
  const practice = ordered("PRACTICE");

  if (input.template === "LAP") {
    // LAP continues to use its legacy per-slide renderer. These sequence
    // markers let the builder preview share the same template contract.
    return [{ type: "START" }, ...learn.map((item) => ({ type: "LEARN" as const, item })), { type: "COMPLETE" }];
  }
  if (input.template === "LO") {
    return [{ type: "START" }, ...learn.map((item) => ({ type: "LEARN" as const, item })), { type: "COMPLETE" }];
  }
  if (input.template === "PO") {
    return [{ type: "START" }, ...practice.map((item) => ({ type: "PRACTICE" as const, item })), { type: "COMPLETE" }];
  }

  return [
    { type: "START" },
    ...learn.map((item) => ({ type: "LEARN" as const, item })),
    ...(learn.length && practice.length ? [{ type: "START_PRACTICING" as const }] : []),
    ...practice.map((item) => ({ type: "PRACTICE" as const, item })),
    { type: "COMPLETE" },
  ];
}

export function supportsAutoplay(template: LessonTemplate) {
  return template === "LTP" || template === "LO";
}

export function getMissingPhase(template: LessonTemplate, counts: { learn: number; practice: number }): LessonTemplate | null {
  if ((template === "LTP" || template === "LAP") && counts.learn > 0 && counts.practice === 0) return "LO";
  if ((template === "LTP" || template === "LAP") && counts.practice > 0 && counts.learn === 0) return "PO";
  return null;
}
