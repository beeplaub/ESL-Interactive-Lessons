-- Remove redundant non-constraint indexes reported by the Supabase advisor.
-- Keep the unique constraint index on lesson_progress and one covering index
-- for each of the other access patterns.

drop index if exists public.assessment_responses_item_submitted_idx;
drop index if exists public.lesson_progress_user_lesson_unique;
drop index if exists public.lesson_slide_activities_lesson_slide_number_idx;
