alter table public.creator_tasks
  add column if not exists recurrence text not null default 'NONE';

alter table public.creator_tasks
  drop constraint if exists creator_tasks_recurrence_check;

alter table public.creator_tasks
  add constraint creator_tasks_recurrence_check
  check (recurrence in ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY'));

create index if not exists creator_tasks_recurrence_idx
  on public.creator_tasks(creator_id, recurrence, due_at)
  where recurrence <> 'NONE';
