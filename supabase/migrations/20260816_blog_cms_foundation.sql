-- BrenUp Blog CMS foundation
-- Global publishing is intentionally separate from school and course ownership.

create table if not exists public.blog_editor_members (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role text not null check (role in ('EDITOR', 'AUTHOR', 'CONTRIBUTOR', 'REVIEWER')),
  is_active boolean not null default true,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.blog_authors (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  display_name text,
  slug text unique,
  bio text,
  headline text,
  avatar_url text,
  website_url text,
  linkedin_url text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.blog_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  color text,
  position integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.blog_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Untitled post',
  slug text not null unique,
  excerpt text,
  content jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  content_text text not null default '',
  status text not null default 'DRAFT' check (status in ('DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED', 'TRASH')),
  visibility text not null default 'PUBLIC' check (visibility in ('PUBLIC', 'UNLISTED', 'PRIVATE')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  author_id uuid references public.profiles(id) on delete set null,
  reviewer_id uuid references public.profiles(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  cover_asset_id uuid references public.media_assets(id) on delete set null,
  og_asset_id uuid references public.media_assets(id) on delete set null,
  primary_category_id uuid references public.blog_categories(id) on delete set null,
  seo_title text,
  seo_description text,
  social_title text,
  social_description text,
  canonical_url text,
  primary_keyword text,
  allow_index boolean not null default true,
  is_featured boolean not null default false,
  is_commenting_enabled boolean not null default false,
  scheduled_at timestamptz,
  published_at timestamptz,
  archived_at timestamptz,
  deleted_at timestamptz,
  last_reviewed_at timestamptz,
  content_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint blog_posts_schedule_check check (scheduled_at is null or status = 'SCHEDULED'),
  constraint blog_posts_published_check check (published_at is null or status in ('PUBLISHED', 'ARCHIVED', 'TRASH'))
);

create table if not exists public.blog_post_categories (
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  category_id uuid not null references public.blog_categories(id) on delete cascade,
  primary key (post_id, category_id)
);

create table if not exists public.blog_post_tags (
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  tag_id uuid not null references public.blog_tags(id) on delete cascade,
  primary key (post_id, tag_id)
);

create table if not exists public.blog_post_media (
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  media_asset_id uuid not null references public.media_assets(id) on delete restrict,
  usage text not null default 'INLINE' check (usage in ('COVER', 'OG', 'INLINE', 'DOWNLOAD')),
  alt_text text,
  caption text,
  credit text,
  source_url text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (post_id, media_asset_id, usage)
);

create table if not exists public.blog_post_revisions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  version integer not null,
  event_type text not null check (event_type in ('CREATED', 'AUTOSAVED', 'SAVED', 'SUBMITTED_FOR_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED', 'RESTORED')),
  title text not null,
  slug text not null,
  excerpt text,
  content jsonb not null,
  content_text text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (post_id, version)
);

create table if not exists public.blog_editorial_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  revision_id uuid references public.blog_post_revisions(id) on delete set null,
  body text not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'RESOLVED')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.blog_slug_redirects (
  id uuid primary key default gen_random_uuid(),
  from_slug text not null unique,
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.blog_post_patterns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  content jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  scope text not null default 'PERSONAL' check (scope in ('PERSONAL', 'GLOBAL')),
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists blog_posts_status_schedule_idx on public.blog_posts(status, scheduled_at);
create index if not exists blog_posts_public_idx on public.blog_posts(status, visibility, published_at desc) where deleted_at is null;
create index if not exists blog_posts_author_idx on public.blog_posts(author_id, updated_at desc);
create index if not exists blog_posts_category_idx on public.blog_posts(primary_category_id, published_at desc);
create index if not exists blog_post_revisions_post_idx on public.blog_post_revisions(post_id, version desc);
create index if not exists blog_post_media_asset_idx on public.blog_post_media(media_asset_id);
create index if not exists blog_editorial_comments_post_idx on public.blog_editorial_comments(post_id, status, created_at desc);
create index if not exists blog_posts_search_idx on public.blog_posts using gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(excerpt, '') || ' ' || coalesce(content_text, '')));

create or replace function public.blog_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists blog_editor_members_updated_at on public.blog_editor_members;
create trigger blog_editor_members_updated_at before update on public.blog_editor_members
for each row execute function public.blog_set_updated_at();
drop trigger if exists blog_authors_updated_at on public.blog_authors;
create trigger blog_authors_updated_at before update on public.blog_authors
for each row execute function public.blog_set_updated_at();
drop trigger if exists blog_categories_updated_at on public.blog_categories;
create trigger blog_categories_updated_at before update on public.blog_categories
for each row execute function public.blog_set_updated_at();
drop trigger if exists blog_tags_updated_at on public.blog_tags;
create trigger blog_tags_updated_at before update on public.blog_tags
for each row execute function public.blog_set_updated_at();
drop trigger if exists blog_posts_updated_at on public.blog_posts;
create trigger blog_posts_updated_at before update on public.blog_posts
for each row execute function public.blog_set_updated_at();
drop trigger if exists blog_editorial_comments_updated_at on public.blog_editorial_comments;
create trigger blog_editorial_comments_updated_at before update on public.blog_editorial_comments
for each row execute function public.blog_set_updated_at();
drop trigger if exists blog_post_patterns_updated_at on public.blog_post_patterns;
create trigger blog_post_patterns_updated_at before update on public.blog_post_patterns
for each row execute function public.blog_set_updated_at();

create or replace function public.blog_editor_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.blog_editor_members
  where user_id = auth.uid() and is_active = true
  limit 1;
$$;

create or replace function public.can_manage_blog_post(target_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or public.blog_editor_role() in ('EDITOR', 'REVIEWER')
    or exists (
      select 1 from public.blog_posts post
      where post.id = target_post_id
        and post.created_by = auth.uid()
        and public.blog_editor_role() in ('AUTHOR', 'CONTRIBUTOR')
    );
$$;

alter table public.blog_editor_members enable row level security;
alter table public.blog_authors enable row level security;
alter table public.blog_categories enable row level security;
alter table public.blog_tags enable row level security;
alter table public.blog_posts enable row level security;
alter table public.blog_post_categories enable row level security;
alter table public.blog_post_tags enable row level security;
alter table public.blog_post_media enable row level security;
alter table public.blog_post_revisions enable row level security;
alter table public.blog_editorial_comments enable row level security;
alter table public.blog_slug_redirects enable row level security;
alter table public.blog_post_patterns enable row level security;

drop policy if exists "Public reads published blog posts" on public.blog_posts;
create policy "Public reads published blog posts" on public.blog_posts for select
using (status = 'PUBLISHED' and visibility in ('PUBLIC', 'UNLISTED') and deleted_at is null);
drop policy if exists "Blog staff reads editorial posts" on public.blog_posts;
create policy "Blog staff reads editorial posts" on public.blog_posts for select
using (public.is_admin() or public.blog_editor_role() in ('EDITOR', 'REVIEWER') or created_by = auth.uid());
drop policy if exists "Blog staff creates posts" on public.blog_posts;
create policy "Blog staff creates posts" on public.blog_posts for insert
with check (public.is_admin() or (public.blog_editor_role() in ('EDITOR', 'AUTHOR', 'CONTRIBUTOR') and created_by = auth.uid()));
drop policy if exists "Blog staff updates posts" on public.blog_posts;
create policy "Blog staff updates posts" on public.blog_posts for update
using (public.can_manage_blog_post(id))
with check (
  public.is_admin()
  or (public.blog_editor_role() = 'EDITOR')
  or (created_by = auth.uid() and public.blog_editor_role() = 'AUTHOR' and status not in ('PUBLISHED', 'SCHEDULED'))
  or (created_by = auth.uid() and public.blog_editor_role() = 'CONTRIBUTOR' and status in ('DRAFT', 'CHANGES_REQUESTED', 'IN_REVIEW'))
);

drop policy if exists "Public reads active blog taxonomy" on public.blog_categories;
create policy "Public reads active blog taxonomy" on public.blog_categories for select using (is_active or public.is_admin() or public.blog_editor_role() is not null);
drop policy if exists "Blog admins manage categories" on public.blog_categories;
create policy "Blog admins manage categories" on public.blog_categories for all using (public.is_admin() or public.blog_editor_role() = 'EDITOR') with check (public.is_admin() or public.blog_editor_role() = 'EDITOR');
drop policy if exists "Public reads active blog tags" on public.blog_tags;
create policy "Public reads active blog tags" on public.blog_tags for select using (is_active or public.is_admin() or public.blog_editor_role() is not null);
drop policy if exists "Blog admins manage tags" on public.blog_tags;
create policy "Blog admins manage tags" on public.blog_tags for all using (public.is_admin() or public.blog_editor_role() = 'EDITOR') with check (public.is_admin() or public.blog_editor_role() = 'EDITOR');

drop policy if exists "Public reads public author profiles" on public.blog_authors;
create policy "Public reads public author profiles" on public.blog_authors for select using (is_public or user_id = auth.uid() or public.is_admin() or public.blog_editor_role() in ('EDITOR', 'REVIEWER'));
drop policy if exists "Authors manage their own public profile" on public.blog_authors;
create policy "Authors manage their own public profile" on public.blog_authors for all using (user_id = auth.uid() or public.is_admin() or public.blog_editor_role() = 'EDITOR') with check (user_id = auth.uid() or public.is_admin() or public.blog_editor_role() = 'EDITOR');

drop policy if exists "Blog staff reads editor assignments" on public.blog_editor_members;
create policy "Blog staff reads editor assignments" on public.blog_editor_members for select using (user_id = auth.uid() or public.is_admin() or public.blog_editor_role() = 'EDITOR');
drop policy if exists "Platform admins manage editor assignments" on public.blog_editor_members;
create policy "Platform admins manage editor assignments" on public.blog_editor_members for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Blog staff reads post mappings" on public.blog_post_categories;
create policy "Blog staff reads post mappings" on public.blog_post_categories for select using (public.can_manage_blog_post(blog_post_categories.post_id) or exists (select 1 from public.blog_posts post where post.id = blog_post_categories.post_id and post.status = 'PUBLISHED' and post.visibility in ('PUBLIC', 'UNLISTED') and post.deleted_at is null));
drop policy if exists "Blog staff manages post category mappings" on public.blog_post_categories;
create policy "Blog staff manages post category mappings" on public.blog_post_categories for all using (public.can_manage_blog_post(blog_post_categories.post_id)) with check (public.can_manage_blog_post(blog_post_categories.post_id));
drop policy if exists "Blog staff reads tag mappings" on public.blog_post_tags;
create policy "Blog staff reads tag mappings" on public.blog_post_tags for select using (public.can_manage_blog_post(blog_post_tags.post_id) or exists (select 1 from public.blog_posts post where post.id = blog_post_tags.post_id and post.status = 'PUBLISHED' and post.visibility in ('PUBLIC', 'UNLISTED') and post.deleted_at is null));
drop policy if exists "Blog staff manages post tag mappings" on public.blog_post_tags;
create policy "Blog staff manages post tag mappings" on public.blog_post_tags for all using (public.can_manage_blog_post(blog_post_tags.post_id)) with check (public.can_manage_blog_post(blog_post_tags.post_id));
drop policy if exists "Blog staff reads post media" on public.blog_post_media;
create policy "Blog staff reads post media" on public.blog_post_media for select using (public.can_manage_blog_post(blog_post_media.post_id) or exists (select 1 from public.blog_posts post where post.id = blog_post_media.post_id and post.status = 'PUBLISHED' and post.visibility in ('PUBLIC', 'UNLISTED') and post.deleted_at is null));
drop policy if exists "Blog staff manages post media" on public.blog_post_media;
create policy "Blog staff manages post media" on public.blog_post_media for all using (public.can_manage_blog_post(blog_post_media.post_id)) with check (public.can_manage_blog_post(blog_post_media.post_id));

drop policy if exists "Blog staff reads revisions" on public.blog_post_revisions;
create policy "Blog staff reads revisions" on public.blog_post_revisions for select using (public.can_manage_blog_post(blog_post_revisions.post_id));
drop policy if exists "Blog staff creates revisions" on public.blog_post_revisions;
create policy "Blog staff creates revisions" on public.blog_post_revisions for insert with check (public.can_manage_blog_post(blog_post_revisions.post_id));
drop policy if exists "Blog staff reads editorial comments" on public.blog_editorial_comments;
create policy "Blog staff reads editorial comments" on public.blog_editorial_comments for select using (public.can_manage_blog_post(blog_editorial_comments.post_id));
drop policy if exists "Blog staff creates editorial comments" on public.blog_editorial_comments;
create policy "Blog staff creates editorial comments" on public.blog_editorial_comments for insert with check (public.can_manage_blog_post(blog_editorial_comments.post_id) and created_by = auth.uid());
drop policy if exists "Blog staff updates editorial comments" on public.blog_editorial_comments;
create policy "Blog staff updates editorial comments" on public.blog_editorial_comments for update using (public.is_admin() or public.blog_editor_role() in ('EDITOR', 'REVIEWER') or created_by = auth.uid()) with check (public.is_admin() or public.blog_editor_role() in ('EDITOR', 'REVIEWER') or created_by = auth.uid());

drop policy if exists "Public reads active blog redirects" on public.blog_slug_redirects;
create policy "Public reads active blog redirects" on public.blog_slug_redirects for select using (is_active);
drop policy if exists "Blog admins manage redirects" on public.blog_slug_redirects;
create policy "Blog admins manage redirects" on public.blog_slug_redirects for all using (public.is_admin() or public.blog_editor_role() = 'EDITOR') with check (public.is_admin() or public.blog_editor_role() = 'EDITOR');

drop policy if exists "Blog staff reads patterns" on public.blog_post_patterns;
create policy "Blog staff reads patterns" on public.blog_post_patterns for select using (is_active and (scope = 'GLOBAL' or created_by = auth.uid()) and (public.is_admin() or public.blog_editor_role() is not null));
drop policy if exists "Blog staff creates patterns" on public.blog_post_patterns;
create policy "Blog staff creates patterns" on public.blog_post_patterns for insert with check ((public.is_admin() or public.blog_editor_role() in ('EDITOR', 'AUTHOR')) and created_by = auth.uid());
drop policy if exists "Blog staff updates patterns" on public.blog_post_patterns;
create policy "Blog staff updates patterns" on public.blog_post_patterns for update using (public.is_admin() or public.blog_editor_role() = 'EDITOR' or (created_by = auth.uid() and scope = 'PERSONAL')) with check (public.is_admin() or public.blog_editor_role() = 'EDITOR' or (created_by = auth.uid() and scope = 'PERSONAL'));

grant select on public.blog_posts, public.blog_categories, public.blog_tags, public.blog_post_categories, public.blog_post_tags, public.blog_post_media, public.blog_authors, public.blog_slug_redirects to anon, authenticated;
grant select, insert, update, delete on public.blog_editor_members, public.blog_authors, public.blog_categories, public.blog_tags, public.blog_posts, public.blog_post_categories, public.blog_post_tags, public.blog_post_media, public.blog_post_revisions, public.blog_editorial_comments, public.blog_slug_redirects, public.blog_post_patterns to authenticated;

-- Seed first editorial categories. `on conflict` keeps this migration idempotent.
insert into public.blog_categories (name, slug, description, position, is_active)
values
  ('English Learning', 'english-learning', 'Practical ideas for English learners.', 1, true),
  ('Teaching Practice', 'teaching-practice', 'Teaching and lesson-design guidance.', 2, true),
  ('Course Creation', 'course-creation', 'Interactive course and assessment design.', 3, true),
  ('BrenUp Updates', 'brenup-updates', 'Product, community, and platform updates.', 4, true)
on conflict (slug) do nothing;
