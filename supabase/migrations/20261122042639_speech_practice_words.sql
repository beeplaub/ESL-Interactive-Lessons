alter table public.speech_practice_prompts
  drop constraint if exists speech_practice_prompts_prompt_type_check;

alter table public.speech_practice_prompts
  add constraint speech_practice_prompts_prompt_type_check
  check (prompt_type in ('SHADOWING', 'TONGUE_TWISTER', 'WORD'));

alter table public.speech_practice_prompts
  add column if not exists word_metadata jsonb not null default '{}'::jsonb
  check (jsonb_typeof(word_metadata) = 'object');
