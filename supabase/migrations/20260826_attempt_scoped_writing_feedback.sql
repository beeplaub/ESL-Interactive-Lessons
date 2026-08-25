-- Keep subjective feedback immutable per assessment response. The previous
-- learner/activity/question uniqueness caused every retake to overwrite the
-- learner's earlier AI, self-check, or teacher-review record.

drop index if exists public.writing_submissions_learner_activity_question_idx;

create unique index if not exists writing_submissions_assessment_response_unique_idx
  on public.writing_submissions(assessment_response_id)
  where assessment_response_id is not null;

create index if not exists writing_submissions_attempt_history_idx
  on public.writing_submissions(learner_id, activity_id, question_key, created_at desc);
