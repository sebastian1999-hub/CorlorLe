-- Enable extension for UUID support if needed (usually already enabled in Supabase).
create extension if not exists pgcrypto;

-- Public profile table to display usernames in leaderboard.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (char_length(username) between 3 and 24),
  created_at timestamptz not null default now()
);

-- Attempts table for daily game results.
create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  target_color text not null,
  user_color text not null,
  error double precision not null check (error >= 0),
  time double precision not null check (time >= 0),
  score double precision not null check (score >= 0),
  created_at timestamptz not null default now(),
  constraint attempts_user_date_unique unique (user_id, date)
);

create index if not exists attempts_date_score_idx on public.attempts(date, score desc);

alter table public.profiles enable row level security;
alter table public.attempts enable row level security;

-- Profiles policies
create policy "Profiles are publicly readable"
on public.profiles for select
using (true);

create policy "Users can insert own profile"
on public.profiles for insert
with check (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

-- Attempts policies
create policy "Attempts are publicly readable"
on public.attempts for select
using (true);

create policy "Users can insert own attempt"
on public.attempts for insert
with check (auth.uid() = user_id);

-- Optional: users can read their own attempts regardless of future policy changes.
create policy "Users can read own attempts"
on public.attempts for select
using (auth.uid() = user_id);
