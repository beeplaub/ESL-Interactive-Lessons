-- Independent practice tasks. Course assignments remain separate because they
-- carry course/OBE evidence; these are intentionally lightweight practice.
create table if not exists public.practice_tasks (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  class_id uuid references public.classes(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 180),
  description text,
  task_type text not null default 'PRACTICE' check (task_type in ('PRACTICE','SELF_STUDY','REMINDER','HOMEWORK')),
  priority text not null default 'NORMAL' check (priority in ('LOW','NORMAL','HIGH')),
  status text not null default 'TODO' check (status in ('TODO','IN_PROGRESS','COMPLETED','CANCELLED')),
  due_at timestamptz,
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes between 1 and 1440),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists practice_tasks_learner_status_idx on public.practice_tasks(learner_id, status, due_at);
create index if not exists practice_tasks_class_idx on public.practice_tasks(class_id, due_at);

alter table public.practice_tasks enable row level security;

drop policy if exists "Learners read own practice tasks" on public.practice_tasks;
create policy "Learners read own practice tasks" on public.practice_tasks for select to authenticated
using ((select auth.uid()) = learner_id);

drop policy if exists "Learners create own planner tasks" on public.practice_tasks;
create policy "Learners create own planner tasks" on public.practice_tasks for insert to authenticated
with check ((select auth.uid()) = learner_id and ((created_by is null) or created_by = (select auth.uid())) and class_id is null);

drop policy if exists "Learners update own practice progress" on public.practice_tasks;
create policy "Learners update own practice progress" on public.practice_tasks for update to authenticated
using ((select auth.uid()) = learner_id)
with check ((select auth.uid()) = learner_id);

drop policy if exists "Learners delete own planner tasks" on public.practice_tasks;
create policy "Learners delete own planner tasks" on public.practice_tasks for delete to authenticated
using ((select auth.uid()) = learner_id and (created_by is null or created_by = (select auth.uid())) and class_id is null);

drop policy if exists "Staff manage class practice tasks" on public.practice_tasks;
create policy "Staff manage class practice tasks" on public.practice_tasks for all to authenticated
using (
  public.is_admin()
  or exists (select 1 from public.classes c where c.id = practice_tasks.class_id and c.teacher_id = (select auth.uid()))
)
with check (
  public.is_admin()
  or exists (select 1 from public.classes c where c.id = practice_tasks.class_id and c.teacher_id = (select auth.uid()))
);

grant select, insert, update, delete on public.practice_tasks to authenticated;
