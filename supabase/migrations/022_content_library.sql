create table if not exists public.content_library_items (
  id uuid primary key default gen_random_uuid(),
  item_type text not null check (item_type in (
    'QUESTION',
    'ACTIVITY',
    'LESSON_BLOCK',
    'SLIDE',
    'LESSON',
    'COURSE_TEMPLATE'
  )),
  title text not null,
  description text,
  level text,
  skill text,
  topic text,
  activity_type text,
  source_type text not null,
  source_id uuid,
  source_parent_id uuid,
  source_title text,
  source_metadata jsonb not null default '{}'::jsonb,
  content_snapshot jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_reuse_events (
  id uuid primary key default gen_random_uuid(),
  library_item_id uuid not null references public.content_library_items(id) on delete cascade,
  copied_by uuid references auth.users(id) on delete set null,
  destination_type text not null,
  destination_id uuid,
  destination_parent_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists content_library_filters_idx
  on public.content_library_items(item_type, level, skill, topic, activity_type);
create index if not exists content_library_creator_idx
  on public.content_library_items(created_by, created_at desc);
create index if not exists content_library_source_idx
  on public.content_library_items(source_type, source_id);
create index if not exists content_reuse_library_idx
  on public.content_reuse_events(library_item_id, created_at desc);

alter table public.content_library_items enable row level security;
alter table public.content_reuse_events enable row level security;

drop policy if exists "Creators read content library" on public.content_library_items;
create policy "Creators read content library"
on public.content_library_items for select
to authenticated
using (
  public.is_admin()
  or created_by = (select auth.uid())
  or exists (
    select 1
    from public.organization_members membership
    where membership.organization_id = content_library_items.organization_id
      and membership.user_id = (select auth.uid())
      and membership.role in ('OWNER', 'SCHOOL_ADMIN', 'TEACHER')
  )
);

drop policy if exists "Creators add content library items" on public.content_library_items;
create policy "Creators add content library items"
on public.content_library_items for insert
to authenticated
with check (public.is_admin() or created_by = (select auth.uid()));

drop policy if exists "Creators update own content library items" on public.content_library_items;
create policy "Creators update own content library items"
on public.content_library_items for update
to authenticated
using (public.is_admin() or created_by = (select auth.uid()))
with check (public.is_admin() or created_by = (select auth.uid()));

drop policy if exists "Creators delete own content library items" on public.content_library_items;
create policy "Creators delete own content library items"
on public.content_library_items for delete
to authenticated
using (public.is_admin() or created_by = (select auth.uid()));

drop policy if exists "Creators read reuse history" on public.content_reuse_events;
create policy "Creators read reuse history"
on public.content_reuse_events for select
to authenticated
using (
  public.is_admin()
  or copied_by = (select auth.uid())
  or exists (
    select 1
    from public.content_library_items item
    where item.id = content_reuse_events.library_item_id
      and item.created_by = (select auth.uid())
  )
);

drop policy if exists "Creators record reuse history" on public.content_reuse_events;
create policy "Creators record reuse history"
on public.content_reuse_events for insert
to authenticated
with check (public.is_admin() or copied_by = (select auth.uid()));

grant select, insert, update, delete on public.content_library_items to authenticated;
grant select, insert on public.content_reuse_events to authenticated;

