-- Per-article table-of-contents preferences.
-- Existing posts remain readable and receive the same sensible defaults.
alter table public.blog_posts
  add column if not exists toc_enabled boolean not null default true,
  add column if not exists toc_title text not null default 'On this page',
  add column if not exists toc_include_h3 boolean not null default true,
  add column if not exists toc_include_h4 boolean not null default true,
  add column if not exists toc_include_h5 boolean not null default false,
  add column if not exists toc_include_h6 boolean not null default false;
