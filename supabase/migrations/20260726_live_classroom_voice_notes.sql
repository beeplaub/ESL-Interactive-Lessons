-- Private, session-scoped voice notes. Audio files live in a non-public bucket;
-- the application issues short-lived signed URLs only after verifying session access.
create table if not exists public.live_voice_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid references auth.users(id) on delete set null,
  group_id uuid references public.live_groups(id) on delete set null,
  channel text not null default 'EVERYONE' check (channel in ('EVERYONE', 'GROUP', 'TEACHER')),
  storage_path text not null,
  mime_type text,
  duration_seconds integer check (duration_seconds is null or duration_seconds between 0 and 600),
  transcript text,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists live_voice_messages_session_idx
  on public.live_voice_messages(session_id, created_at desc);
alter table public.live_voice_messages enable row level security;

drop policy if exists "Live participants read permitted voice notes" on public.live_voice_messages;
create policy "Live participants read permitted voice notes"
  on public.live_voice_messages for select using (public.can_access_live_session(session_id));

-- Uploads are deliberately server-mediated. The storage policy allows only
-- authenticated session participants to read files in their own live session.
insert into storage.buckets (id, name, public)
values ('live-voice', 'live-voice', false)
on conflict (id) do update set public = false;

drop policy if exists "Live participants read voice storage" on storage.objects;
create policy "Live participants read voice storage"
  on storage.objects for select to authenticated using (
    bucket_id = 'live-voice'
    and exists (
      select 1 from public.live_sessions s
      where s.id::text = (storage.foldername(name))[1]
        and public.can_access_live_session(s.id)
    )
  );
