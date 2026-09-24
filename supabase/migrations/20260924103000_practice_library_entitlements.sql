-- Practice Library access is an entitlement that can come from a subscription,
-- a course checkout add-on, or an explicit staff grant.
alter table public.practice_modules add column if not exists lesson_id uuid unique references public.lessons(id) on delete set null;
alter table public.lessons add column if not exists practice_module_id uuid unique references public.practice_modules(id) on delete cascade;

-- Give every existing module its own private, one-slide lesson substrate so
-- lesson blocks, activities, attempts, and profile evidence keep using the
-- existing lesson engine. The JSON content remains as a recovery copy.
do $$
declare
  module_row record;
  new_lesson_id uuid;
begin
  for module_row in select * from public.practice_modules where lesson_id is null loop
    new_lesson_id := gen_random_uuid();
    insert into public.lessons (id, title, topic, level, description, subtitle, category, pdf_path, status, created_by, practice_module_id)
    values (new_lesson_id, module_row.title, module_row.category, module_row.level, module_row.description, module_row.title, module_row.category, 'practice-modules/' || module_row.id::text || '/lesson.pdf', module_row.status::public.lesson_status, module_row.creator_id, module_row.id);
    insert into public.slides (lesson_id, slide_number, title, section_label, raw_text, type)
    values (new_lesson_id, 1, module_row.title, module_row.category, coalesce(module_row.description, module_row.title), 'INFO');
    update public.practice_modules set lesson_id = new_lesson_id where id = module_row.id;
  end loop;
end $$;

-- Carry any modules created by the original JSON-only builder into the lesson
-- tables. Keep their source JSON untouched for recovery and audit.
do $$
declare
  module_row record;
  target_slide_id uuid;
  item jsonb;
  item_position integer;
  item_type text;
  item_content jsonb;
begin
  for module_row in select id, lesson_id, content from public.practice_modules where lesson_id is not null loop
    select id into target_slide_id from public.slides where lesson_id = module_row.lesson_id and slide_number = 1 and deleted_at is null limit 1;
    if target_slide_id is null then continue; end if;
    item_position := 0;
    for item in select value from jsonb_array_elements(coalesce(module_row.content->'blocks', '[]'::jsonb)) loop
      item_type := upper(coalesce(item->>'type', 'TEXT'));
      item_content := coalesce(item->'content', '{}'::jsonb) || jsonb_build_object('title', coalesce(item->>'title', ''), 'body', coalesce(item->>'body', ''));
      if item_type = 'HEADING' then item_content := item_content || jsonb_build_object('text', coalesce(item->>'title', item->>'body', '')); end if;
      insert into public.lesson_blocks (lesson_id, slide_id, position, block_type, content)
      values (module_row.lesson_id, target_slide_id, item_position, item_type, item_content);
      item_position := item_position + 1;
    end loop;
    item_position := 0;
    for item in select value from jsonb_array_elements(coalesce(module_row.content->'activities', '[]'::jsonb)) loop
      item_type := upper(coalesce(item->>'type', 'SHORT_ANSWER'));
      item_content := coalesce(item->'data', '{}'::jsonb);
      insert into public.lesson_slide_activities (lesson_id, slide_id, slide_number, position, activity_type, activity_data, needs_review, raw_text)
      values (module_row.lesson_id, target_slide_id, 1, item_position, item_type, item_content, false, coalesce(item_content->>'prompt', ''));
      item_position := item_position + 1;
    end loop;
  end loop;
end $$;

alter table public.practice_modules
  drop constraint if exists practice_modules_access_type_check;
update public.practice_modules set access_type = 'FREE' where access_type = 'ENROLLED';
alter table public.practice_modules
  add constraint practice_modules_access_type_check check (access_type in ('FREE', 'PREMIUM'));

alter table public.courses
  add column if not exists offer_practice_addon boolean not null default false;
alter table public.course_orders
  add column if not exists practice_addon boolean not null default false,
  add column if not exists practice_addon_amount_bdt integer not null default 0 check (practice_addon_amount_bdt >= 0);

create table if not exists public.practice_billing_settings (
  id boolean primary key default true check (id),
  addon_price_bdt integer check (addon_price_bdt is null or addon_price_bdt >= 0),
  monthly_price_bdt integer check (monthly_price_bdt is null or monthly_price_bdt >= 0),
  six_month_price_bdt integer check (six_month_price_bdt is null or six_month_price_bdt >= 0),
  annual_price_bdt integer check (annual_price_bdt is null or annual_price_bdt >= 0),
  payment_instructions text,
  updated_at timestamptz not null default now()
);
insert into public.practice_billing_settings (id) values (true) on conflict (id) do nothing;
alter table public.practice_billing_settings enable row level security;
drop policy if exists "Staff manage practice billing settings" on public.practice_billing_settings;
create policy "Staff manage practice billing settings" on public.practice_billing_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.practice_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  duration_months integer not null check (duration_months in (1, 6, 12)),
  amount_bdt integer not null check (amount_bdt >= 0),
  status text not null default 'PENDING' check (status in ('PENDING', 'ACTIVE', 'REJECTED', 'CANCELLED', 'EXPIRED')),
  payment_method text check (payment_method in ('BKASH', 'NAGAD', 'BANK_TRANSFER', 'OTHER')),
  transaction_id text,
  sender_number text,
  receipt_path text,
  starts_at timestamptz,
  ends_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status <> 'ACTIVE') or (starts_at is not null and ends_at is not null))
);
create index if not exists practice_subscriptions_user_status_idx on public.practice_subscriptions(user_id, status, ends_at desc);
create unique index if not exists practice_subscriptions_one_pending_per_user_idx on public.practice_subscriptions(user_id) where status = 'PENDING';
alter table public.practice_subscriptions enable row level security;
drop policy if exists "Learners read own practice subscriptions" on public.practice_subscriptions;
create policy "Learners read own practice subscriptions" on public.practice_subscriptions
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
drop policy if exists "Staff manage practice subscriptions" on public.practice_subscriptions;
create policy "Staff manage practice subscriptions" on public.practice_subscriptions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.practice_access_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  granted_by uuid not null references auth.users(id) on delete restrict,
  reason text,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists practice_access_grants_user_active_idx on public.practice_access_grants(user_id, ends_at) where revoked_at is null;
alter table public.practice_access_grants enable row level security;
drop policy if exists "Learners read own practice access grants" on public.practice_access_grants;
create policy "Learners read own practice access grants" on public.practice_access_grants
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
drop policy if exists "Staff manage practice access grants" on public.practice_access_grants;
create policy "Staff manage practice access grants" on public.practice_access_grants
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.practice_billing_settings, public.practice_subscriptions, public.practice_access_grants to authenticated;
grant all on public.practice_billing_settings, public.practice_subscriptions, public.practice_access_grants to service_role;

drop policy if exists "Learners read published practice modules" on public.practice_modules;
create policy "Learners read free or entitled practice modules" on public.practice_modules
  for select to authenticated using (
    status = 'PUBLISHED' and (
      access_type = 'FREE'
      or exists (select 1 from public.practice_subscriptions s where s.user_id = (select auth.uid()) and s.status = 'ACTIVE' and s.starts_at <= now() and s.ends_at > now())
      or exists (select 1 from public.practice_access_grants g where g.user_id = (select auth.uid()) and g.revoked_at is null and g.starts_at <= now() and (g.ends_at is null or g.ends_at > now()))
      or exists (
        select 1 from public.course_orders o
        join public.course_enrollments e on e.course_id = o.course_id and e.user_id = o.user_id
        where o.user_id = (select auth.uid()) and o.practice_addon = true and o.status = 'CONFIRMED'
          and e.status in ('ACTIVE', 'COMPLETED')
      )
    )
  );

-- The lesson-backed content is also guarded so callers cannot bypass the
-- Practice Library page and read Premium blocks or activity prompts directly.
drop policy if exists "lessons read published or admin" on public.lessons;
create policy "lessons read published with practice access" on public.lessons
  for select to authenticated using (
    public.is_admin() or (status = 'PUBLISHED' and (
      practice_module_id is null or exists (
        select 1 from public.practice_modules pm
        where pm.id = lessons.practice_module_id and pm.status = 'PUBLISHED' and (
          pm.access_type = 'FREE'
          or exists (select 1 from public.practice_subscriptions s where s.user_id = (select auth.uid()) and s.status = 'ACTIVE' and s.starts_at <= now() and s.ends_at > now())
          or exists (select 1 from public.practice_access_grants g where g.user_id = (select auth.uid()) and g.revoked_at is null and g.starts_at <= now() and (g.ends_at is null or g.ends_at > now()))
          or exists (select 1 from public.course_orders o join public.course_enrollments e on e.course_id = o.course_id and e.user_id = o.user_id where o.user_id = (select auth.uid()) and o.practice_addon and o.status = 'CONFIRMED' and e.status in ('ACTIVE','COMPLETED'))
        )
      )
    ))
  );

drop policy if exists "slides read published or admin" on public.slides;
drop policy if exists "Anyone can view slides of published lessons" on public.slides;
create policy "slides read published with practice access" on public.slides
  for select to authenticated using (
    public.is_admin() or exists (select 1 from public.lessons l where l.id = slides.lesson_id and l.status = 'PUBLISHED')
  );
drop policy if exists "Learners read published lesson blocks" on public.lesson_blocks;
create policy "Learners read published lesson blocks" on public.lesson_blocks
  for select to authenticated using (exists (select 1 from public.lessons l where l.id = lesson_blocks.lesson_id and l.status = 'PUBLISHED'));
drop policy if exists "Learners read published lesson slide activities" on public.lesson_slide_activities;
create policy "Learners read published lesson slide activities" on public.lesson_slide_activities
  for select to authenticated using (exists (select 1 from public.lessons l where l.id = lesson_slide_activities.lesson_id and l.status = 'PUBLISHED'));
drop policy if exists "activities read published or admin" on public.slide_activities;
drop policy if exists "Anyone can view activities of published lessons" on public.slide_activities;
create policy "activities read published lesson activities" on public.slide_activities
  for select to authenticated using (exists (select 1 from public.lessons l join public.slides s on s.lesson_id = l.id where s.id = slide_activities.slide_id and l.status = 'PUBLISHED'));
drop policy if exists "audio read published or admin" on public.lesson_audio_files;
drop policy if exists "Anyone can view audio of published lessons" on public.lesson_audio_files;
create policy "audio read published lesson audio" on public.lesson_audio_files
  for select to authenticated using (exists (select 1 from public.lessons l where l.id = lesson_audio_files.lesson_id and l.status = 'PUBLISHED'));

-- Supabase Storage has a separate authenticated-read policy. Restrict saved
-- lesson audio objects by the owning lesson's module entitlement as well.
drop policy if exists "lesson audio authenticated read" on storage.objects;
create policy "lesson audio authenticated read with practice access" on storage.objects
  for select to authenticated using (
    bucket_id = 'lessons'
    or (bucket_id = 'lesson-audio' and exists (
      select 1 from public.lesson_audio_files af
      join public.lessons l on l.id = af.lesson_id
      where af.storage_path = storage.objects.name and l.status = 'PUBLISHED'
        and (l.practice_module_id is null or exists (
          select 1 from public.practice_modules pm
          where pm.id = l.practice_module_id and pm.status = 'PUBLISHED' and (
            pm.access_type = 'FREE'
            or exists (select 1 from public.practice_subscriptions s where s.user_id = (select auth.uid()) and s.status = 'ACTIVE' and s.starts_at <= now() and s.ends_at > now())
            or exists (select 1 from public.practice_access_grants g where g.user_id = (select auth.uid()) and g.revoked_at is null and g.starts_at <= now() and (g.ends_at is null or g.ends_at > now()))
            or exists (select 1 from public.course_orders o join public.course_enrollments e on e.course_id = o.course_id and e.user_id = o.user_id where o.user_id = (select auth.uid()) and o.practice_addon and o.status = 'CONFIRMED' and e.status in ('ACTIVE','COMPLETED'))
          )
        ))
    ))
  );
