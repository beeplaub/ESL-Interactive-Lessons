-- Community voice recordings live as long as their conversation.
-- R2 objects are removed by the authenticated conversation deletion flow.
drop index if exists public.community_media_retention_idx;
alter table public.community_media
  drop column if exists retention_expires_at;
