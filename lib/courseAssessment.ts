import { calculateAttainment, selectEvidence, type EvidencePoint, type EvidenceSelection } from "@/lib/obe";

type Course = {
  id: string;
  mastery_threshold: number;
  minimum_evidence_coverage: number;
  evidence_selection: EvidenceSelection;
  formative_weight?: number;
  summative_weight?: number;
};

type CourseItem = {
  id: string;
  title: string | null;
  assessment_weight: number;
  assessment_type?: "FORMATIVE" | "SUMMATIVE" | null;
  item_assessment_weight?: number | null;
  normalization_target?: number | null;
  is_required: boolean;
};

type Outcome = {
  id: string;
  mastery_threshold_override: number | null;
  weight: number;
};

type Attempt = {
  id: string;
  course_item_id: string | null;
  status: string;
  submitted_at: string;
  attempt_number: number;
};

type Response = {
  attempt_id: string;
  assessment_item_id: string;
  earned_points: number;
  maximum_points: number;
  grading_status: string;
  submitted_at: string;
};

type Item = {
  id: string;
  analytical_weight: number;
  lesson_outcome_id: string | null;
};

type Mapping = {
  assessment_item_id: string;
  course_item_id: string;
  course_outcome_id: string;
  contribution_weight: number;
};

export type CourseAssessmentSummary = {
  score: number;
  maximumScore: number;
  scorePercent: number;
  coveragePercent: number;
  completionPercent: number;
  status: "IN_PROGRESS" | "COMPLETED" | "PASSED" | "MASTERED" | "PENDING_REVIEW";
  itemResults: Array<{
    courseItemId: string;
    title: string | null;
    score: number;
    maximumScore: number;
    scorePercent: number;
    normalizedScore: number;
    normalizationTarget: number;
    evidenceCount: number;
    completed: boolean;
  }>;
  outcomeResults: Array<{
    courseOutcomeId: string;
    attainmentPercent: number;
    coveragePercent: number;
    mappedWeight: number;
    evidenceCount: number;
    attained: boolean;
  }>;
};

function percent(score: number, total: number) {
  return total > 0 ? Math.round((score / total) * 1000) / 10 : 0;
}

function selectAttemptEvidence(attempts: Attempt[], responsesByAttempt: Map<string, Response[]>, policy: EvidenceSelection) {
  return selectEvidence(
    attempts
      .filter((attempt) => attempt.status !== "VOID")
      .map((attempt) => {
        const responses = responsesByAttempt.get(attempt.id) ?? [];
        return {
        earnedPoints: responses.reduce((sum, response) => sum + Number(response.earned_points), 0),
        maximumPoints: responses.reduce((sum, response) => sum + Number(response.maximum_points), 0) || 1,
        analyticalWeight: 1,
        courseItemWeight: 1,
        completedAt: attempt.submitted_at,
        attempt,
        };
      }),
    policy,
  )?.attempt ?? null;
}

export function calculateCourseAssessment({
  course,
  items,
  outcomes,
  attempts,
  responses,
  assessmentItems,
  mappings,
  completedItemIds = new Set<string>(),
}: {
  course: Course;
  items: CourseItem[];
  outcomes: Outcome[];
  attempts: Attempt[];
  responses: Response[];
  assessmentItems: Item[];
  mappings: Mapping[];
  completedItemIds?: Set<string>;
}): CourseAssessmentSummary {
  const itemById = new Map(assessmentItems.map((item) => [item.id, item]));
  const selectedResponsesByCourseItem = new Map<string, Response[]>();
  const selectedAttemptsByCourseItem = new Map<string, Attempt>();
  const responsesByAttempt = new Map<string, Response[]>();
  for (const response of responses) {
    if (response.grading_status === "VOID") continue;
    const list = responsesByAttempt.get(response.attempt_id) ?? [];
    list.push(response);
    responsesByAttempt.set(response.attempt_id, list);
  }

  const attemptsByCourseItem = new Map<string, Attempt[]>();
  for (const attempt of attempts) {
    if (!attempt.course_item_id || attempt.status === "VOID") continue;
    const list = attemptsByCourseItem.get(attempt.course_item_id) ?? [];
    list.push(attempt);
    attemptsByCourseItem.set(attempt.course_item_id, list);
  }

  for (const courseItem of items) {
    const selectedAttempt = selectAttemptEvidence(
      attemptsByCourseItem.get(courseItem.id) ?? [],
      responsesByAttempt,
      course.evidence_selection,
    );
    if (!selectedAttempt) continue;
    selectedAttemptsByCourseItem.set(courseItem.id, selectedAttempt);
    selectedResponsesByCourseItem.set(courseItem.id, (responsesByAttempt.get(selectedAttempt.id) ?? []).filter((response) => itemById.has(response.assessment_item_id)));
  }

  const itemResults = items.map((courseItem) => {
    const selected = selectedResponsesByCourseItem.get(courseItem.id) ?? [];
    const score = selected.reduce((sum, response) => sum + Number(response.earned_points), 0);
    const maximumScore = selected.reduce((sum, response) => sum + Number(response.maximum_points), 0);
    return {
      courseItemId: courseItem.id,
      title: courseItem.title,
      score,
      maximumScore,
      scorePercent: percent(score, maximumScore),
      normalizedScore: maximumScore > 0
        ? Math.round((score / maximumScore) * Number(courseItem.normalization_target ?? 100) * 10) / 10
        : 0,
      normalizationTarget: Number(courseItem.normalization_target ?? 100),
      evidenceCount: selected.length,
      completed: completedItemIds.has(courseItem.id) || selected.length > 0,
    };
  });

  const outcomeResults = outcomes.map((outcome) => {
    const outcomeMappings = mappings.filter((mapping) => mapping.course_outcome_id === outcome.id);
    const evidence: EvidencePoint[] = [];
    for (const mapping of outcomeMappings) {
      const selectedAttempt = selectedAttemptsByCourseItem.get(mapping.course_item_id);
      const selected = (selectedResponsesByCourseItem.get(mapping.course_item_id) ?? []).find((response) => response.assessment_item_id === mapping.assessment_item_id);
      if (!selected || !selectedAttempt) continue;
      const courseItem = items.find((item) => item.id === mapping.course_item_id);
      evidence.push({
        earnedPoints: Number(selected.earned_points),
        maximumPoints: Number(selected.maximum_points),
        analyticalWeight: Number(itemById.get(mapping.assessment_item_id)?.analytical_weight || 1) * Number(mapping.contribution_weight || 1),
        courseItemWeight: Number(courseItem?.item_assessment_weight ?? courseItem?.assessment_weight ?? 1),
        completedAt: selected.submitted_at || selectedAttempt.submitted_at,
      });
    }
    const mappedWeights = outcomeMappings.map((mapping) => {
      const courseItem = items.find((item) => item.id === mapping.course_item_id);
      const item = itemById.get(mapping.assessment_item_id);
      return Number(mapping.contribution_weight || 1) * Number(item?.analytical_weight || 1) * Number(courseItem?.item_assessment_weight ?? courseItem?.assessment_weight ?? 1);
    });
    const result = calculateAttainment({
      selectedEvidence: evidence,
      allMappedWeights: mappedWeights,
      masteryThreshold: Number(outcome.mastery_threshold_override ?? course.mastery_threshold),
      minimumCoverage: course.minimum_evidence_coverage,
    });
    return {
      courseOutcomeId: outcome.id,
      attainmentPercent: result.attainmentPercent,
      coveragePercent: result.coveragePercent,
      mappedWeight: mappedWeights.reduce((sum, value) => sum + value, 0),
      evidenceCount: evidence.length,
      attained: result.attained,
    };
  });

  const gradedItems = itemResults.filter((item) => item.maximumScore > 0);
  const itemByResultId = new Map(gradedItems.map((result) => [result.courseItemId, result]));
  const categoryScores = new Map<"FORMATIVE" | "SUMMATIVE", number>();
  for (const category of ["FORMATIVE", "SUMMATIVE"] as const) {
    const categoryItems = items.filter((item) => (item.assessment_type ?? "FORMATIVE") === category)
      .map((item) => ({ item, result: itemByResultId.get(item.id) }))
      .filter((entry): entry is { item: CourseItem; result: (typeof gradedItems)[number] } => Boolean(entry.result));
    const totalWeight = categoryItems.reduce((sum, entry) => sum + Number(entry.item.item_assessment_weight ?? entry.item.assessment_weight ?? 1), 0);
    if (totalWeight > 0) {
      categoryScores.set(category, categoryItems.reduce((sum, entry) => {
        const weight = Number(entry.item.item_assessment_weight ?? entry.item.assessment_weight ?? 1);
        return sum + (entry.result.scorePercent * weight);
      }, 0) / totalWeight);
    }
  }
  // A category with no attempted evidence does not artificially depress the
  // score; coverage still records that the evidence is missing.
  const activeCategoryWeights = (["FORMATIVE", "SUMMATIVE"] as const)
    .filter((category) => categoryScores.has(category))
    .map((category) => ({ category, weight: Number(category === "FORMATIVE" ? (course.formative_weight ?? 40) : (course.summative_weight ?? 60)) }));
  const activeWeightTotal = activeCategoryWeights.reduce((sum, entry) => sum + entry.weight, 0);
  const weightedScore = activeWeightTotal
    ? activeCategoryWeights.reduce((sum, entry) => sum + (categoryScores.get(entry.category) ?? 0) * entry.weight, 0) / activeWeightTotal
    : 0;
  const weightedMaximum = activeWeightTotal ? 100 : 0;
  const requiredItems = items.filter((item) => item.is_required);
  const completedRequired = requiredItems.filter((item) => itemResults.find((result) => result.courseItemId === item.id)?.completed).length;
  const completionPercent = requiredItems.length ? Math.round((completedRequired / requiredItems.length) * 1000) / 10 : 0;
  const mappedWeightTotal = outcomeResults.reduce((sum, outcome) => sum + outcome.mappedWeight, 0);
  const attemptedOutcomeWeight = outcomeResults.reduce((sum, outcome) => sum + (outcome.mappedWeight * outcome.coveragePercent / 100), 0);
  const coveragePercent = mappedWeightTotal ? Math.round((attemptedOutcomeWeight / mappedWeightTotal) * 1000) / 10 : 0;
  const scorePercent = Math.round(weightedScore * 10) / 10;
  const pending = attempts.some((attempt) => attempt.status === "PENDING_REVIEW") || responses.some((response) => response.grading_status === "PENDING_REVIEW");
  const allOutcomesAttained = outcomeResults.length > 0 && outcomeResults.every((outcome) => outcome.attained);
  const passed = scorePercent >= course.mastery_threshold && coveragePercent >= course.minimum_evidence_coverage;
  const status = pending ? "PENDING_REVIEW" : allOutcomesAttained ? "MASTERED" : passed ? "PASSED" : completionPercent >= 100 ? "COMPLETED" : "IN_PROGRESS";

  return { score: weightedScore, maximumScore: weightedMaximum, scorePercent, coveragePercent, completionPercent, status, itemResults, outcomeResults };
}
