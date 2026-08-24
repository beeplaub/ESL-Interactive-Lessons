-- Subjective submissions contain learner work and feedback. Application access
-- is intentionally server-side; service-role actions enforce learner/staff auth.
alter table public.writing_submissions enable row level security;
