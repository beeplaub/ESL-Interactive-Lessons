alter table public.speech_practice_categories
  add column if not exists archived_at timestamptz;

alter table public.speech_practice_categories
  drop constraint if exists speech_practice_categories_prompt_type_name_key;

create unique index if not exists speech_practice_categories_active_name_idx
  on public.speech_practice_categories (prompt_type, name)
  where archived_at is null;

create or replace function public.soft_delete_speech_practice_category(p_category_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.speech_practice_prompts
  set category_id = null
  where category_id = p_category_id;

  update public.speech_practice_categories
  set archived_at = now()
  where id = p_category_id and archived_at is null;

  if not found then
    raise exception 'Speech practice category not found or already archived.';
  end if;
end;
$$;

revoke all on function public.soft_delete_speech_practice_category(uuid) from public, anon, authenticated;
grant execute on function public.soft_delete_speech_practice_category(uuid) to service_role;
