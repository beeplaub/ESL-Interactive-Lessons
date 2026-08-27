-- Restrict SECURITY DEFINER functions that are triggers or server-only RPCs.
-- RLS policy helper functions remain executable because PostgreSQL evaluates
-- them while enforcing learner, creator, and live-session policies.

revoke execute on function public.archive_assessment_items_for_deleted_source() from public, anon, authenticated;
revoke execute on function public.create_profile_for_new_user() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.get_quiz_question_counts() from public, anon, authenticated;
revoke execute on function public.record_blog_post_view(uuid, text, uuid) from public, anon, authenticated;

-- Keep trusted server-side clients able to call the explicit server RPCs.
grant execute on function public.get_quiz_question_counts() to service_role;
grant execute on function public.record_blog_post_view(uuid, text, uuid) to service_role;
