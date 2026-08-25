-- PostgREST upserts use ON CONFLICT (assessment_response_id), which requires
-- a non-partial unique index that PostgreSQL can infer. PostgreSQL unique
-- indexes already allow multiple NULL values, so legacy unlinked rows remain valid.

drop index if exists public.writing_submissions_assessment_response_unique_idx;

create unique index writing_submissions_assessment_response_unique_idx
  on public.writing_submissions(assessment_response_id);
