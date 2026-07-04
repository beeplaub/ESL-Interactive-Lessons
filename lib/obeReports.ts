import type { EvidencePoint } from "@/lib/obe";
import { calculateAttainment, calculateLanguageConfidence, confidenceBand } from "@/lib/obe";

export type ResponseEvidence = {
  id: string;
  attempt_id: string;
  assessment_item_id: string;
  earned_points: number;
  maximum_points: number;
  is_correct: boolean | null;
  submitted_at: string;
};

export type AttemptEvidence = {
  id: string;
  user_id: string;
  course_item_id: string | null;
  completed_at: string;
};

export type OutcomeMappingEvidence = {
  assessment_item_id: string;
  course_item_id: string;
  course_outcome_id: string;
  contribution_weight: number;
};

export function latestResponsesByItem(responses: ResponseEvidence[], attempts: AttemptEvidence[]) {
  const attemptById = new Map(attempts.map((attempt) => [attempt.id, attempt]));
  const latest = new Map<string, ResponseEvidence>();
  for (const response of responses) {
    const attempt = attemptById.get(response.attempt_id);
    const key = attempt?.course_item_id
      ? `${response.assessment_item_id}:${attempt.course_item_id}`
      : response.assessment_item_id;
    const current = latest.get(key);
    if (!current || new Date(response.submitted_at).getTime() > new Date(current.submitted_at).getTime()) {
      latest.set(key, response);
    }
  }
  return latest;
}

export function calculateCourseOutcomeRows({
  outcomes,
  mappings,
  responses,
  attempts,
  defaultThreshold = 70,
  defaultCoverage = 70,
}: {
  outcomes: Array<{
    id: string;
    code: string | null;
    outcome: string;
    mastery_threshold_override: number | null;
    evidence_coverage_override: number | null;
  }>;
  mappings: OutcomeMappingEvidence[];
  responses: ResponseEvidence[];
  attempts: AttemptEvidence[];
  defaultThreshold?: number;
  defaultCoverage?: number;
}) {
  const latest = latestResponsesByItem(responses, attempts);
  return outcomes.map((outcome) => {
    const outcomeMappings = mappings.filter((mapping) => mapping.course_outcome_id === outcome.id);
    const evidence: EvidencePoint[] = outcomeMappings.flatMap((mapping) => {
      const response = latest.get(`${mapping.assessment_item_id}:${mapping.course_item_id}`)
        ?? latest.get(mapping.assessment_item_id);
      if (!response) return [];
      return [{
        earnedPoints: response.earned_points,
        maximumPoints: response.maximum_points,
        analyticalWeight: mapping.contribution_weight,
        courseItemWeight: 1,
        completedAt: response.submitted_at,
      }];
    });
    const masteryThreshold = outcome.mastery_threshold_override ?? defaultThreshold;
    const minimumCoverage = outcome.evidence_coverage_override ?? defaultCoverage;
    return {
      outcome,
      mappedWeight: outcomeMappings.reduce((sum, mapping) => sum + Number(mapping.contribution_weight || 1), 0),
      evidenceCount: evidence.length,
      masteryThreshold,
      minimumCoverage,
      ...calculateAttainment({
        selectedEvidence: evidence,
        allMappedWeights: outcomeMappings.map((mapping) => Number(mapping.contribution_weight || 1)),
        masteryThreshold,
        minimumCoverage,
      }),
    };
  });
}

export function summarizeSkillEvidence({
  skills,
  responses,
  itemSkills,
}: {
  skills: Array<{ id: string; name: string; parent_id: string | null }>;
  responses: ResponseEvidence[];
  itemSkills: Array<{ assessment_item_id: string; skill_id: string; is_primary: boolean }>;
}) {
  return skills.map((skill) => {
    const skillItemIds = new Set(itemSkills.filter((item) => item.skill_id === skill.id).map((item) => item.assessment_item_id));
    const skillResponses = responses.filter((response) => skillItemIds.has(response.assessment_item_id));
    const recent = skillResponses
      .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
      .slice(0, 5)
      .map((response) => ({
        earnedPoints: response.earned_points,
        maximumPoints: response.maximum_points,
        completedAt: response.submitted_at,
      }));
    const confidence = calculateLanguageConfidence(recent);
    return {
      skill,
      evidenceCount: skillResponses.length,
      confidence: confidence.confidencePercent,
      learned: confidence.learned,
      band: confidenceBand(confidence.confidencePercent),
      latestScore: recent[0] ? Math.round((recent[0].earnedPoints / Math.max(1, recent[0].maximumPoints)) * 100) : null,
    };
  }).filter((row) => row.evidenceCount > 0);
}

export function summarizeTargetEvidence({
  targets,
  responses,
  itemTargets,
}: {
  targets: Array<{ id: string; label: string; target_type: string }>;
  responses: ResponseEvidence[];
  itemTargets: Array<{ assessment_item_id: string; learning_target_id: string }>;
}) {
  return targets.map((target) => {
    const targetItemIds = new Set(itemTargets.filter((item) => item.learning_target_id === target.id).map((item) => item.assessment_item_id));
    const targetResponses = responses.filter((response) => targetItemIds.has(response.assessment_item_id));
    const recent = targetResponses
      .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
      .slice(0, 5)
      .map((response) => ({
        earnedPoints: response.earned_points,
        maximumPoints: response.maximum_points,
        completedAt: response.submitted_at,
      }));
    const confidence = calculateLanguageConfidence(recent);
    return {
      target,
      evidenceCount: targetResponses.length,
      confidence: confidence.confidencePercent,
      learned: confidence.learned,
      band: confidenceBand(confidence.confidencePercent),
      latestScore: recent[0] ? Math.round((recent[0].earnedPoints / Math.max(1, recent[0].maximumPoints)) * 100) : null,
    };
  }).filter((row) => row.evidenceCount > 0);
}
