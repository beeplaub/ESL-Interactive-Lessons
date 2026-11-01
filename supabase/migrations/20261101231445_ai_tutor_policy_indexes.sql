create index if not exists ai_tutor_grants_created_by_idx
  on public.ai_tutor_grants(created_by);
create index if not exists ai_tutor_sessions_grant_id_idx
  on public.ai_tutor_sessions(grant_id);

grant select on public.ai_tutor_grants, public.ai_tutor_sessions to authenticated;
drop policy if exists "Admins read AI Tutor grants" on public.ai_tutor_grants;
create policy "Admins read AI Tutor grants" on public.ai_tutor_grants
  for select to authenticated using (public.is_admin());
drop policy if exists "Admins read AI Tutor sessions" on public.ai_tutor_sessions;
create policy "Admins read AI Tutor sessions" on public.ai_tutor_sessions
  for select to authenticated using (public.is_admin());
