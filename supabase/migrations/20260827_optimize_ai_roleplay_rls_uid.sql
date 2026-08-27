-- Cache auth.uid() once per statement for AI, roleplay, and creator-media
-- policies. Ownership and administrator checks remain unchanged.

alter policy "All authenticated users read AI feature flags"
  on public.ai_feature_flags
  using ((select auth.uid()) is not null);

alter policy "Users create own AI generations"
  on public.ai_generations
  with check (((select auth.uid()) = user_id) or is_admin());

alter policy "Users read own AI generations"
  on public.ai_generations
  using (((select auth.uid()) = user_id) or is_admin());

alter policy "All authenticated users read prompt templates"
  on public.ai_prompt_templates
  using ((select auth.uid()) is not null);

alter policy "Users insert own roleplay messages"
  on public.ai_roleplay_messages
  with check (exists (
    select 1 from public.ai_roleplay_sessions s
    where s.id = ai_roleplay_messages.session_id
      and ((s.user_id = (select auth.uid())) or is_admin())
  ));

alter policy "Users read own roleplay messages"
  on public.ai_roleplay_messages
  using (exists (
    select 1 from public.ai_roleplay_sessions s
    where s.id = ai_roleplay_messages.session_id
      and ((s.user_id = (select auth.uid())) or is_admin())
  ));

alter policy "Users manage own roleplay sessions"
  on public.ai_roleplay_sessions
  using (((select auth.uid()) = user_id) or is_admin())
  with check (((select auth.uid()) = user_id) or is_admin());

alter policy "Users read own roleplay sessions"
  on public.ai_roleplay_sessions
  using (((select auth.uid()) = user_id) or is_admin());

alter policy "Users delete own roleplay voice recordings"
  on public.ai_roleplay_voice_recordings
  using (((select auth.uid()) = user_id) or is_admin());

alter policy "Users read own roleplay voice recordings"
  on public.ai_roleplay_voice_recordings
  using (((select auth.uid()) = user_id) or is_admin());

alter policy "Admins and creators manage saved drafts"
  on public.ai_saved_drafts
  using (((select auth.uid()) = creator_id) or is_admin())
  with check (((select auth.uid()) = creator_id) or is_admin());

alter policy "Users manage own AI usage"
  on public.ai_usage_events
  using (((select auth.uid()) = user_id) or is_admin())
  with check (((select auth.uid()) = user_id) or is_admin());

alter policy "Creators create own voiceovers"
  on public.ai_voiceover_generations
  with check (((select auth.uid()) = creator_id) or is_admin());

alter policy "Creators read own voiceovers"
  on public.ai_voiceover_generations
  using (((select auth.uid()) = creator_id) or is_admin());

alter policy "Creators update own voiceovers"
  on public.ai_voiceover_generations
  using (((select auth.uid()) = creator_id) or is_admin())
  with check (((select auth.uid()) = creator_id) or is_admin());
