-- The legacy generic responses table is empty and no longer referenced by
-- the application. Quarantine it instead of dropping it so this cleanup is
-- fully reversible if an undocumented integration is discovered later.
alter table if exists public.responses
  rename to responses_legacy_archive_20260828;
