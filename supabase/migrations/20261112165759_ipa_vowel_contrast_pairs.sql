-- Store reusable curated vowel contrasts separately from the canonical word catalog.
-- A contrast may differ in its consonants; the activity focuses on its target vowels.

alter table public.ipa_chart_word_pronunciations
  add column if not exists source_url text,
  add column if not exists part_of_speech text,
  add column if not exists target_syllable_index smallint;

alter table public.ipa_chart_word_pronunciations
  drop constraint if exists ipa_chart_word_pronunciations_target_syllable_index_check;
alter table public.ipa_chart_word_pronunciations
  add constraint ipa_chart_word_pronunciations_target_syllable_index_check
  check (target_syllable_index is null or target_syllable_index >= 0);

create unique index if not exists ipa_chart_word_pronunciations_id_accent_uidx
  on public.ipa_chart_word_pronunciations (id, accent);

create table if not exists public.ipa_chart_vowel_contrast_pairs (
  id uuid primary key default gen_random_uuid(),
  pair_key text not null unique check (length(btrim(pair_key)) between 1 and 80),
  source_pair_number smallint not null unique check (source_pair_number between 1 and 100),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ipa_chart_vowel_contrast_pair_pronunciations (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references public.ipa_chart_vowel_contrast_pairs(id) on delete cascade,
  accent text not null check (accent in ('uk', 'us')),
  left_pronunciation_id uuid not null,
  right_pronunciation_id uuid not null,
  created_at timestamptz not null default now(),
  unique (pair_id, accent),
  check (left_pronunciation_id <> right_pronunciation_id),
  foreign key (left_pronunciation_id, accent)
    references public.ipa_chart_word_pronunciations(id, accent) on delete cascade,
  foreign key (right_pronunciation_id, accent)
    references public.ipa_chart_word_pronunciations(id, accent) on delete cascade
);

create index if not exists ipa_chart_vowel_contrast_pairs_active_order_idx
  on public.ipa_chart_vowel_contrast_pairs (sort_order) where is_active;
create index if not exists ipa_chart_vowel_contrast_pair_pronunciations_left_idx
  on public.ipa_chart_vowel_contrast_pair_pronunciations (left_pronunciation_id);
create index if not exists ipa_chart_vowel_contrast_pair_pronunciations_right_idx
  on public.ipa_chart_vowel_contrast_pair_pronunciations (right_pronunciation_id);

alter table public.ipa_chart_vowel_contrast_pairs enable row level security;
alter table public.ipa_chart_vowel_contrast_pair_pronunciations enable row level security;
revoke all on public.ipa_chart_vowel_contrast_pairs from anon, authenticated;
revoke all on public.ipa_chart_vowel_contrast_pair_pronunciations from anon, authenticated;
grant select on public.ipa_chart_vowel_contrast_pairs to anon, authenticated;
grant select on public.ipa_chart_vowel_contrast_pair_pronunciations to anon, authenticated;
grant all on public.ipa_chart_vowel_contrast_pairs to service_role;
grant all on public.ipa_chart_vowel_contrast_pair_pronunciations to service_role;

drop policy if exists "Public can read active IPA vowel contrast pairs" on public.ipa_chart_vowel_contrast_pairs;
create policy "Public can read active IPA vowel contrast pairs"
  on public.ipa_chart_vowel_contrast_pairs for select to anon, authenticated
  using (is_active);
drop policy if exists "Platform admins manage IPA vowel contrast pairs" on public.ipa_chart_vowel_contrast_pairs;
create policy "Platform admins manage IPA vowel contrast pairs"
  on public.ipa_chart_vowel_contrast_pairs for all to authenticated
  using ((select role = 'ADMIN' from public.profiles where id = auth.uid()))
  with check ((select role = 'ADMIN' from public.profiles where id = auth.uid()));

drop policy if exists "Public can read active IPA vowel contrast pair pronunciations" on public.ipa_chart_vowel_contrast_pair_pronunciations;
create policy "Public can read active IPA vowel contrast pair pronunciations"
  on public.ipa_chart_vowel_contrast_pair_pronunciations for select to anon, authenticated
  using (exists (
    select 1 from public.ipa_chart_vowel_contrast_pairs p
    where p.id = pair_id and p.is_active
  ));
drop policy if exists "Platform admins manage IPA vowel contrast pair pronunciations" on public.ipa_chart_vowel_contrast_pair_pronunciations;
create policy "Platform admins manage IPA vowel contrast pair pronunciations"
  on public.ipa_chart_vowel_contrast_pair_pronunciations for all to authenticated
  using ((select role = 'ADMIN' from public.profiles where id = auth.uid()))
  with check ((select role = 'ADMIN' from public.profiles where id = auth.uid()));
