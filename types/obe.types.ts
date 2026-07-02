export type OutcomeStatus = "ACTIVE" | "ARCHIVED";
export type EvidenceSelection = "LATEST" | "BEST" | "FIRST";
export type LearningTargetType =
  | "VOCABULARY"
  | "IDIOM"
  | "GRAMMAR"
  | "FUNCTIONAL_LANGUAGE"
  | "PRONUNCIATION"
  | "OTHER";

export type LessonOutcome = {
  id: string;
  lesson_id: string;
  code: string;
  outcome: string;
  position: number;
  status: OutcomeStatus;
};

export type LearningSkill = {
  id: string;
  parent_id: string | null;
  slug: string;
  name: string;
  description: string | null;
  position: number;
  status: OutcomeStatus;
};

export type AssessmentItemMetadata = {
  id: string;
  source_type: "QUIZ_QUESTION" | "LESSON_ACTIVITY_QUESTION";
  quiz_question_id: string | null;
  lesson_activity_id: string | null;
  source_item_key: string;
  lesson_outcome_id: string | null;
  prompt_snapshot: string | null;
  max_points: number;
  analytical_weight: number;
  status: OutcomeStatus;
  primary_skill_id?: string | null;
  target_ids?: string[];
};

