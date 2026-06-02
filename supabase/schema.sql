-- Enable extension for UUID support if needed (usually already enabled in Supabase).
create extension if not exists pgcrypto;

-- Public profile table to display usernames in leaderboard.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (char_length(username) between 3 and 24),
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles
add column if not exists avatar_url text;

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

-- Shared profile avatars
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Avatar images are publicly readable" on storage.objects;
create policy "Avatar images are publicly readable"
on storage.objects for select
using (bucket_id = 'avatars');

drop policy if exists "Users can upload own avatar" on storage.objects;
create policy "Users can upload own avatar"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Users can update own avatar" on storage.objects;
create policy "Users can update own avatar"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "Users can delete own avatar" on storage.objects;
create policy "Users can delete own avatar"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

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

-- Daily crossword attempts (time-based ranking: lower is better).
create table if not exists public.crossword_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  seconds double precision not null check (seconds >= 0),
  created_at timestamptz not null default now(),
  constraint crossword_attempts_user_date_unique unique (user_id, date)
);

create index if not exists crossword_attempts_date_seconds_idx
  on public.crossword_attempts(date, seconds asc);

alter table public.crossword_attempts enable row level security;

create policy "Crossword attempts are publicly readable"
on public.crossword_attempts for select
using (true);

create policy "Users can insert own crossword attempt"
on public.crossword_attempts for insert
with check (auth.uid() = user_id);

-- Daily CruciGama attempts (time-based ranking: lower is better), split by mode.
create table if not exists public.crucigama_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  mode text not null check (mode in ('normal', 'extreme')),
  seconds double precision not null check (seconds >= 0),
  created_at timestamptz not null default now(),
  constraint crucigama_attempts_user_date_mode_unique unique (user_id, date, mode)
);

create index if not exists crucigama_attempts_date_mode_seconds_idx
  on public.crucigama_attempts(date, mode, seconds asc);

alter table public.crucigama_attempts enable row level security;

drop policy if exists "CruciGama attempts are publicly readable" on public.crucigama_attempts;
create policy "CruciGama attempts are publicly readable"
on public.crucigama_attempts for select
using (true);

drop policy if exists "Users can insert own CruciGama attempt" on public.crucigama_attempts;
create policy "Users can insert own CruciGama attempt"
on public.crucigama_attempts for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own CruciGama attempt" on public.crucigama_attempts;
create policy "Users can update own CruciGama attempt"
on public.crucigama_attempts for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Tournament run metadata (one bracket per configured start date).
create table if not exists public.tournament_runs (
  id uuid primary key default gen_random_uuid(),
  start_date date not null unique,
  status text not null default 'active' check (status in ('active', 'finished')),
  champion_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Seeded players for the run, based on final general leaderboard before tournament.
create table if not exists public.tournament_participants (
  run_id uuid not null references public.tournament_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seed int not null check (seed >= 1),
  created_at timestamptz not null default now(),
  primary key (run_id, user_id),
  constraint tournament_participants_seed_unique unique (run_id, seed)
);

-- Duel attempts: each player has up to 3 attempts per pairing (round + match).
create table if not exists public.tournament_attempts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.tournament_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  round_number int not null check (round_number >= 1),
  match_number int not null check (match_number >= 1),
  duel_index int not null check (duel_index between 1 and 3),
  target_color text not null,
  user_color text not null,
  error double precision not null check (error >= 0),
  time double precision not null check (time >= 0),
  score double precision not null check (score >= 0),
  created_at timestamptz not null default now(),
  constraint tournament_attempts_unique_duel unique (run_id, user_id, round_number, match_number, duel_index)
);

create index if not exists tournament_attempts_run_round_match_idx
  on public.tournament_attempts(run_id, round_number, match_number);

alter table public.tournament_runs enable row level security;
alter table public.tournament_participants enable row level security;
alter table public.tournament_attempts enable row level security;

create policy "Tournament runs are publicly readable"
on public.tournament_runs for select
using (true);

create policy "Authenticated users can create tournament runs"
on public.tournament_runs for insert
to authenticated
with check (true);

create policy "Tournament participants are publicly readable"
on public.tournament_participants for select
using (true);

create policy "Authenticated users can insert tournament participants"
on public.tournament_participants for insert
to authenticated
with check (true);

create policy "Tournament attempts are publicly readable"
on public.tournament_attempts for select
using (true);

create policy "Users can insert own tournament attempts"
on public.tournament_attempts for insert
to authenticated
with check (auth.uid() = user_id);

-- Podium predictions for the tournament final standings.
create table if not exists public.tournament_podium_predictions (
  run_id uuid not null references public.tournament_runs(id) on delete cascade,
  voter_user_id uuid not null references auth.users(id) on delete cascade,
  first_user_id uuid not null references auth.users(id) on delete cascade,
  second_user_id uuid not null references auth.users(id) on delete cascade,
  third_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (run_id, voter_user_id),
  constraint tournament_podium_predictions_distinct_picks check (
    first_user_id <> second_user_id
    and first_user_id <> third_user_id
    and second_user_id <> third_user_id
  ),
  constraint tournament_podium_predictions_no_self_vote check (
    voter_user_id <> first_user_id
    and voter_user_id <> second_user_id
    and voter_user_id <> third_user_id
  )
);

create index if not exists tournament_podium_predictions_run_idx
  on public.tournament_podium_predictions(run_id);

alter table public.tournament_podium_predictions enable row level security;

create policy "Tournament podium predictions are publicly readable"
on public.tournament_podium_predictions for select
using (true);

create policy "Users can insert own tournament podium prediction"
on public.tournament_podium_predictions for insert
to authenticated
with check (auth.uid() = voter_user_id);

drop policy if exists "Users can update own tournament podium prediction"
on public.tournament_podium_predictions;

-- Favorite vote per match and round in the tournament bracket.
create table if not exists public.tournament_match_predictions (
  run_id uuid not null references public.tournament_runs(id) on delete cascade,
  voter_user_id uuid not null references auth.users(id) on delete cascade,
  round_number int not null check (round_number >= 1),
  match_number int not null check (match_number >= 1),
  predicted_winner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (run_id, voter_user_id, round_number, match_number)
);

create index if not exists tournament_match_predictions_run_round_match_idx
  on public.tournament_match_predictions(run_id, round_number, match_number);

alter table public.tournament_match_predictions enable row level security;

create policy "Tournament match predictions are publicly readable"
on public.tournament_match_predictions for select
using (true);

create policy "Users can insert own tournament match prediction"
on public.tournament_match_predictions for insert
to authenticated
with check (auth.uid() = voter_user_id);

-- Dictionary entries for crossword generation.
create table if not exists public.crossword_dictionary (
  word text primary key check (word ~ '^[A-Z]{3,11}$'),
  clue text not null check (char_length(clue) between 5 and 180),
  category text,
  source text not null default 'manual',
  source_word text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crossword_dictionary_is_active_idx
  on public.crossword_dictionary(is_active);

create index if not exists crossword_dictionary_word_length_idx
  on public.crossword_dictionary((char_length(word)));

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists crossword_dictionary_touch_updated_at on public.crossword_dictionary;
create trigger crossword_dictionary_touch_updated_at
before update on public.crossword_dictionary
for each row execute function public.touch_updated_at();

alter table public.crossword_dictionary enable row level security;

drop policy if exists "Crossword dictionary is publicly readable" on public.crossword_dictionary;
create policy "Crossword dictionary is publicly readable"
on public.crossword_dictionary for select
using (true);

-- -----------------------------------------------------------------------------
-- Hardened anti-scraping policy overrides (apply last)
-- Restrict broad read access to authenticated users only.
-- -----------------------------------------------------------------------------

drop policy if exists "Profiles are publicly readable" on public.profiles;
create policy "Profiles are authenticated-readable"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "Attempts are publicly readable" on public.attempts;
create policy "Attempts are authenticated-readable"
on public.attempts for select
to authenticated
using (true);

drop policy if exists "Crossword attempts are publicly readable" on public.crossword_attempts;
create policy "Crossword attempts are authenticated-readable"
on public.crossword_attempts for select
to authenticated
using (true);

drop policy if exists "CruciGama attempts are publicly readable" on public.crucigama_attempts;
create policy "CruciGama attempts are authenticated-readable"
on public.crucigama_attempts for select
to authenticated
using (true);

drop policy if exists "Crossword dictionary is publicly readable" on public.crossword_dictionary;
create policy "Crossword dictionary is authenticated-readable"
on public.crossword_dictionary for select
to authenticated
using (true);
