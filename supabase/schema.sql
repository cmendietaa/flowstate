create extension if not exists "pgcrypto";

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#5e8fbf',
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  title text not null,
  item_type text not null default 'assignment' check (item_type in ('task', 'assignment')),
  due_date timestamptz not null,
  estimated_total_hours double precision not null default 1 check (estimated_total_hours >= 0),
  estimated_hours double precision not null default 1 check (estimated_hours >= 0),
  progress_percent integer not null default 0 check (progress_percent >= 0 and progress_percent <= 100),
  remaining_hours_override double precision check (remaining_hours_override is null or remaining_hours_override >= 0),
  weight double precision not null default 0.05,
  is_completed boolean not null default false,
  google_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.courses enable row level security;
alter table public.tasks enable row level security;

drop policy if exists "Users can manage their courses" on public.courses;
create policy "Users can manage their courses"
on public.courses
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage their tasks" on public.tasks;
create policy "Users can manage their tasks"
on public.tasks
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.grade_categories (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  course_name text not null,
  name text not null,
  weight_percent double precision not null default 0,
  source text not null check (source in ('syllabus', 'canvas', 'gradescope')),
  confidence double precision not null default 0
);

create table if not exists public.grades (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  course_name text not null,
  title text not null,
  earned_points double precision not null default 0,
  points_possible double precision not null,
  grade_category text,
  source text not null check (source = 'canvas'),
  confidence double precision not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.grade_categories enable row level security;
alter table public.grades enable row level security;

drop policy if exists "Users can manage their grade categories" on public.grade_categories;
create policy "Users can manage their grade categories"
on public.grade_categories
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage their grades" on public.grades;
create policy "Users can manage their grades"
on public.grades
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
