import { calculateAttainment, selectEvidence, type EvidencePoint, type EvidenceSelection } from "@/lib/obe";

type Course = {
  id: string;
  mastery_threshold: number;
  minimum_evidence_coverage: number;
  evidence_selection: EvidenceSelection;
};

type CourseItem = {
  id: string;
  title: string | null;
  assessment_weight: number;
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
  const itemByCourseItem = new Map<string, Array<{ item: Item; mapping: Mapping; response: Response; attempt: Attempt }>>();
  const responsesByAttempt = new Map<string, Response[]>();
  for (const response of responses) {
    if (response.grading_status === "VOID") continue;
    const list = responsesByAttempt.get(response.attempt_id) ?? [];
    list.push(response);
    responsesByAttempt.set(response.attempt_id, list);
  }

  for (const mapping of mappings) {
    const item = itemById.get(mapping.assessment_item_id);
    if (!item) continue;
    const itemAttempts = attempts.filter((attempt) => attempt.course_item_id === mapping.course_item_id && attempt.status !== "VOID");
    const policy = course.evidence_selection;
    const selectedAttempt = selectAttemptEvidence(itemAttempts, responsesByAttempt, policy);
    if (!selectedAttempt) continue;
    const response = (responsesByAttempt.get(selectedAttempt.id) ?? []).find((candidate) => candidate.assessment_item_id === mapping.assessment_item_id);
    if (!response) continue;
    const list = itemByCourseItem.get(mapping.course_item_id) ?? [];
    list.push({ item, mapping, response, attempt: selectedAttempt });
    itemByCourseItem.set(mapping.course_item_id, list);
  }

  const itemResults = items.map((courseItem) => {
    const selected = itemByCourseItem.get(courseItem.id) ?? [];
    const score = selected.reduce((sum, row) => sum + Number(row.response.earned_points), 0);
    const maximumScore = selected.reduce((sum, row) => sum + Number(row.response.maximum_points), 0);
    return {
      courseItemId: courseItem.id,
      title: courseItem.title,
      score,
      maximumScore,
      scorePercent: percent(score, maximumScore),
      evidenceCount: selected.length,
      completed: completedItemIds.has(courseItem.id) || selected.length > 0,
    };
  });

  const outcomeResults = outcomes.map((outcome) => {
    const outcomeMappings = mappings.filter((mapping) => mapping.course_outcome_id === outcome.id);
    const evidence: EvidencePoint[] = [];
    for (const mapping of outcomeMappings) {
      const selected = itemByCourseItem.get(mapping.course_item_id)?.find((row) => row.mapping.assessment_item_id === mapping.assessment_item_id);
      if (!selected) continue;
      const courseItem = items.find((item) => item.id === mapping.course_item_id);
      evidence.push({
        earnedPoints: Number(selected.response.earned_points),
        maximumPoints: Number(selected.response.maximum_points),
        analyticalWeight: Number(selected.item.analytical_weight || 1) * Number(mapping.contribution_weight || 1),
        courseItemWeight: Number(courseItem?.assessment_weight || 1),
        completedAt: selected.response.submitted_at,
      });
    }
    const mappedWeights = outcomeMappings.map((mapping) => {
      const courseItem = items.find((item) => item.id === mapping.course_item_id);
      const item = itemById.get(mapping.assessment_item_id);
      return Number(mapping.contribution_weight || 1) * Number(item?.analytical_weight || 1) * Number(courseItem?.assessment_weight || 1);
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
  const weightedMaximum = gradedItems.reduce((sum, item) => {
    const courseItem = items.find((candidate) => candidate.id === item.courseItemId);
    return sum + Number(courseItem?.assessment_weight || 1);
  }, 0);
  const weightedScore = gradedItems.reduce((sum, item) => {
    const courseItem = items.find((candidate) => candidate.id === item.courseItemId);
    return sum + (item.scorePercent / 100) * Number(courseItem?.assessment_weight || 1);
  }, 0);
  const requiredItems = items.filter((item) => item.is_required);
  const completedRequired = requiredItems.filter((item) => itemResults.find((result) => result.courseItemId === item.id)?.completed).length;
  const completionPercent = requiredItems.length ? Math.round((completedRequired / requiredItems.length) * 1000) / 10 : 0;
  const mappedWeightTotal = outcomeResults.reduce((sum, outcome) => sum + outcome.mappedWeight, 0);
  const attemptedOutcomeWeight = outcomeResults.reduce((sum, outcome) => sum + (outcome.mappedWeight * outcome.coveragePercent / 100), 0);
  const coveragePercent = mappedWeightTotal ? Math.round((attemptedOutcomeWeight / mappedWeightTotal) * 1000) / 10 : 0;
  const scorePercent = weightedMaximum ? Math.round((weightedScore / weightedMaximum) * 1000) / 10 : 0;
  const pending = attempts.some((attempt) => attempt.status === "PENDING_REVIEW") || responses.some((response) => response.grading_status === "PENDING_REVIEW");
  const allOutcomesAttained = outcomeResults.length > 0 && outcomeResults.every((outcome) => outcome.attained);
  const passed = scorePercent >= course.mastery_threshold && coveragePercent >= course.minimum_evidence_coverage;
  const status = pending ? "PENDING_REVIEW" : allOutcomesAttained ? "MASTERED" : passed ? "PASSED" : completionPercent >= 100 ? "COMPLETED" : "IN_PROGRESS";

  return { score: weightedScore, maximumScore: weightedMaximum, scorePercent, coveragePercent, completionPercent, status, itemResults, outcomeResults };
}
