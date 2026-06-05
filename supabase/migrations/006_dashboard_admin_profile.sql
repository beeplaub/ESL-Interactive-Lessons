alter table public.profiles
add column if not exists first_name text,
add column if not exists last_name text,
add column if not exists avatar_url text;

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  score integer not null,
  total integer not null,
  answers jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null default now()
);

create index if not exists quiz_attempts_user_completed_idx
on public.quiz_attempts(user_id, completed_at desc);

create table if not exists public.level_test_result_cards (
  id uuid primary key default gen_random_uuid(),
  cefr_level text not null unique check (cefr_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  guidance_text text not null,
  updated_at timestamptz not null default now()
);

insert into public.level_test_result_cards (cefr_level, guidance_text)
values
('A1', 'You''re at the very start of your English journey. Focus on everyday vocabulary — greetings, numbers, colours, family. Short, simple sentences are your goal right now. Try A1 and A2 lessons on this site to build your foundation.'),
('A2', 'You can handle familiar topics and simple conversations. Your next step is expanding vocabulary around daily life — shopping, travel, routines — and practising short written sentences. A2 and B1 lessons here will stretch you just the right amount.'),
('B1', 'You''ve reached a confident intermediate level. You can follow the main points of clear speech and writing. Now focus on accuracy — verb tenses, connecting ideas, and richer vocabulary. B1 lessons are your core; dip into B2 when you''re ready for a challenge.'),
('B2', 'Strong upper-intermediate. You can read complex texts and express yourself with reasonable fluency. Work on precision: collocations, advanced grammar, and nuanced vocabulary. B2 and C1 lessons will push your English toward near-native quality.'),
('C1', 'You''re operating at an advanced level. Your English is flexible and effective in demanding situations. Focus on style, register, and idiomatic expression. C1 lessons will sharpen what you already do well; C2 materials will expose you to the highest level of the language.'),
('C2', 'Exceptional. You use English with the ease and precision of an educated native speaker. Your focus now is style, cultural nuance, and specialised vocabulary. Explore C1 and C2 lessons to keep your skills razor-sharp.')
on conflict (cefr_level) do nothing;

alter table public.quiz_attempts enable row level security;
alter table public.level_test_result_cards enable row level security;

drop policy if exists "quiz attempts own read" on public.quiz_attempts;
create policy "quiz attempts own read" on public.quiz_attempts
for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "quiz attempts own insert" on public.quiz_attempts;
create policy "quiz attempts own insert" on public.quiz_attempts
for insert with check (auth.uid() = user_id);

drop policy if exists "result cards readable" on public.level_test_result_cards;
create policy "result cards readable" on public.level_test_result_cards
for select using (true);

drop policy if exists "result cards admin write" on public.level_test_result_cards;
create policy "result cards admin write" on public.level_test_result_cards
for all using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars authenticated read" on storage.objects;
create policy "avatars authenticated read" on storage.objects
for select using (bucket_id = 'avatars' and auth.role() = 'authenticated');

drop policy if exists "avatars own write" on storage.objects;
create policy "avatars own write" on storage.objects
for all using (
  bucket_id = 'avatars' and auth.uid()::text = split_part(name, '/', 1)
) with check (
  bucket_id = 'avatars' and auth.uid()::text = split_part(name, '/', 1)
);
