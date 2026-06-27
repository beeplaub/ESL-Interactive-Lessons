create table if not exists public.course_certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  certificate_code text not null unique,
  issued_at timestamptz not null default now(),
  unique(user_id, course_id)
);

alter table public.course_certificates enable row level security;

create index if not exists course_certificates_user_idx on public.course_certificates(user_id);
create index if not exists course_certificates_course_idx on public.course_certificates(course_id);

drop policy if exists "Users read own certificates" on public.course_certificates;
create policy "Users read own certificates"
on public.course_certificates for select
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Admins manage certificates" on public.course_certificates;
create policy "Admins manage certificates"
on public.course_certificates for all
using (public.is_admin())
with check (public.is_admin());
