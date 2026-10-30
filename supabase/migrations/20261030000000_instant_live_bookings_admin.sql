-- Durable scheduled bookings for the Instant Live engine. These remain
-- separate from legacy live_sessions until the planned pilot and parity gate.
create table if not exists public.instant_live_bookings (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text,
  scheduled_start_at timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes between 5 and 480),
  timezone text not null,
  access_mode text not null default 'INVITED' check (access_mode in ('INVITED', 'LINK')),
  room_locked boolean not null default false,
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED', 'LIVE', 'CANCELLED', 'COMPLETED')),
  started_room_id uuid unique references public.instant_live_rooms(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.instant_live_booking_scopes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.instant_live_bookings(id) on delete cascade,
  scope_type text not null check (scope_type in ('CLASS', 'COURSE')),
  class_id uuid references public.classes(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint instant_live_booking_scope_target_check check (
    (scope_type = 'CLASS' and class_id is not null and course_id is null) or
    (scope_type = 'COURSE' and course_id is not null and class_id is null)
  )
);

create unique index if not exists instant_live_booking_scope_class_unique
  on public.instant_live_booking_scopes(booking_id, class_id) where class_id is not null;
create unique index if not exists instant_live_booking_scope_course_unique
  on public.instant_live_booking_scopes(booking_id, course_id) where course_id is not null;
create index if not exists instant_live_bookings_creator_date_idx
  on public.instant_live_bookings(creator_id, scheduled_start_at desc);
create index if not exists instant_live_bookings_status_date_idx
  on public.instant_live_bookings(status, scheduled_start_at);
create index if not exists instant_live_booking_scopes_class_idx
  on public.instant_live_booking_scopes(class_id) where class_id is not null;
create index if not exists instant_live_booking_scopes_course_idx
  on public.instant_live_booking_scopes(course_id) where course_id is not null;

create table if not exists public.instant_live_booking_invitees (
  booking_id uuid not null references public.instant_live_bookings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'INVITED' check (status in ('INVITED', 'ACCEPTED', 'DECLINED')),
  invited_at timestamptz not null default now(),
  primary key (booking_id, user_id)
);
create index if not exists instant_live_booking_invitees_user_idx
  on public.instant_live_booking_invitees(user_id, invited_at desc);

create table if not exists public.instant_live_admin_audit (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id) on delete restrict,
  room_id uuid references public.instant_live_rooms(id) on delete set null,
  booking_id uuid references public.instant_live_bookings(id) on delete set null,
  action text not null check (action in ('ENTER_SUPPORT', 'PAUSE_ROOM', 'RESUME_ROOM', 'END_ROOM', 'CANCEL_BOOKING')),
  reason text,
  created_at timestamptz not null default now(),
  constraint instant_live_admin_audit_target_check check (room_id is not null or booking_id is not null)
);
create index if not exists instant_live_admin_audit_room_created_idx
  on public.instant_live_admin_audit(room_id, created_at desc);

-- Account-scoped lookup throttling. Raw codes and client IP addresses are not stored.
create table if not exists public.instant_live_code_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists instant_live_code_attempts_user_time_idx
  on public.instant_live_code_attempts(user_id, attempted_at desc);

alter table public.instant_live_bookings enable row level security;
alter table public.instant_live_booking_scopes enable row level security;
alter table public.instant_live_booking_invitees enable row level security;
alter table public.instant_live_admin_audit enable row level security;
alter table public.instant_live_code_attempts enable row level security;

revoke all on public.instant_live_bookings, public.instant_live_booking_scopes,
  public.instant_live_booking_invitees, public.instant_live_admin_audit,
  public.instant_live_code_attempts from anon, authenticated;
grant all on public.instant_live_bookings, public.instant_live_booking_scopes,
  public.instant_live_booking_invitees, public.instant_live_admin_audit,
  public.instant_live_code_attempts to service_role;
grant usage, select on sequence public.instant_live_code_attempts_id_seq to service_role;
