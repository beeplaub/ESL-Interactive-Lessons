-- Reply recordings inherit the private access of their parent conversation.
drop policy if exists "Owners or enrolled learners read media" on public.community_media;
create policy "Owners or enrolled learners read media" on public.community_media for select to authenticated
using (
  owner_id = (select auth.uid()) or public.is_admin() or
  exists (select 1 from public.community_posts p join public.community_circles c on c.id = p.circle_id join public.course_enrollments e on e.course_id = c.course_id where p.id = community_media.post_id and e.user_id = (select auth.uid()) and e.status in ('ACTIVE','COMPLETED')) or
  exists (select 1 from public.community_replies r join public.community_posts p on p.id = r.post_id join public.community_circles c on c.id = p.circle_id join public.course_enrollments e on e.course_id = c.course_id where r.id = community_media.reply_id and e.user_id = (select auth.uid()) and e.status in ('ACTIVE','COMPLETED'))
);
