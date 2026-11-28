-- The initial course_resources migration may already be applied in projects.
-- Add link support in a new migration so those databases receive the schema
-- changes instead of relying on edits to an already-applied migration file.
alter table public.course_resources
  add column if not exists resource_type text not null default 'UPLOAD',
  add column if not exists external_url text;

alter table public.course_resources
  alter column bucket drop not null,
  alter column path drop not null;

-- Replace the original positive-only file_size check with a constraint that
-- permits zero bytes for links while retaining the upload size limit.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.course_resources'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%file_size%'
  loop
    execute format('alter table public.course_resources drop constraint %I', constraint_name);
  end loop;
end;
$$;

alter table public.course_resources
  drop constraint if exists course_resources_resource_type_check,
  drop constraint if exists course_resources_external_url_check;

alter table public.course_resources
  add constraint course_resources_file_size_check
    check (file_size >= 0 and file_size <= 26214400),
  add constraint course_resources_resource_type_check
    check (resource_type in ('UPLOAD', 'FILE_LINK', 'WEB_LINK')),
  add constraint course_resources_external_url_check
    check (external_url is null or external_url ~ '^https://');

alter table public.course_resources
  drop constraint if exists course_resources_storage_target_check;

alter table public.course_resources
  add constraint course_resources_storage_target_check
  check (
    (resource_type = 'UPLOAD' and bucket is not null and path is not null and external_url is null and file_size > 0)
    or (resource_type in ('FILE_LINK', 'WEB_LINK') and bucket is null and path is null and external_url is not null and file_size = 0)
  );
