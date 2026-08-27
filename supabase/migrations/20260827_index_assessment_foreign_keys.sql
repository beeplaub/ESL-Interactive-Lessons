-- Add covering indexes for the high-traffic assessment, learner-progress,
-- lesson, and roleplay foreign keys identified by the Supabase advisor.

create index if not exists ai_roleplay_messages_session_fk_idx
  on public.ai_roleplay_messages(session_id);
create index if not exists ai_roleplay_sessions_lesson_activity_fk_idx
  on public.ai_roleplay_sessions(lesson_activity_id);
create index if not exists ai_roleplay_sessions_user_fk_idx
  on public.ai_roleplay_sessions(user_id);
create index if not exists ai_roleplay_voice_recordings_activity_fk_idx
  on public.ai_roleplay_voice_recordings(activity_id);
create index if not exists ai_roleplay_voice_recordings_session_fk_idx
  on public.ai_roleplay_voice_recordings(session_id);
create index if not exists ai_roleplay_voice_recordings_user_fk_idx
  on public.ai_roleplay_voice_recordings(user_id);

create index if not exists assessment_item_course_outcomes_course_item_fk_idx
  on public.assessment_item_course_outcomes(course_item_id);
create index if not exists assessment_items_lesson_outcome_fk_idx
  on public.assessment_items(lesson_outcome_id);

create index if not exists course_enrollments_course_fk_idx
  on public.course_enrollments(course_id);
create index if not exists course_item_progress_course_fk_idx
  on public.course_item_progress(course_id);
create index if not exists course_item_progress_course_item_fk_idx
  on public.course_item_progress(course_item_id);
create index if not exists course_items_lesson_fk_idx
  on public.course_items(lesson_id);
create index if not exists course_items_quiz_fk_idx
  on public.course_items(quiz_id);
create index if not exists course_items_section_fk_idx
  on public.course_items(section_id);
create index if not exists course_progress_course_fk_idx
  on public.course_progress(course_id);
create index if not exists course_progress_current_item_fk_idx
  on public.course_progress(current_item_id);

create index if not exists lesson_progress_lesson_fk_idx
  on public.lesson_progress(lesson_id);
create index if not exists lesson_slide_activities_slide_fk_idx
  on public.lesson_slide_activities(slide_id);
create index if not exists quiz_attempts_quiz_fk_idx
  on public.quiz_attempts(quiz_id);
create index if not exists writing_submissions_lesson_fk_idx
  on public.writing_submissions(lesson_id);
create index if not exists writing_submissions_quiz_fk_idx
  on public.writing_submissions(quiz_id);
