create table if not exists public.fantasy_player_match_stats (
  id uuid primary key default gen_random_uuid(),
  player_id text not null,
  match_id text not null,
  season text not null,
  team_id text not null,
  match_date_utc timestamptz not null,
  position text not null check (position in ('GK', 'DEF', 'MID', 'FWD')),
  minutes numeric not null default 0,
  goals numeric not null default 0,
  assists numeric not null default 0,
  clean_sheet boolean not null default false,
  saves numeric not null default 0,
  goals_conceded numeric not null default 0,
  yellow_cards numeric not null default 0,
  red_cards numeric not null default 0,
  penalty_saves numeric not null default 0,
  penalty_misses numeric not null default 0,
  shots numeric not null default 0,
  shots_on_target numeric not null default 0,
  chances_created numeric not null default 0,
  successful_passes numeric not null default 0,
  successful_crosses numeric not null default 0,
  fouls_won numeric not null default 0,
  fouls_committed numeric not null default 0,
  tackles_won numeric not null default 0,
  interceptions numeric not null default 0,
  blocks numeric not null default 0,
  penalty_conceded numeric not null default 0,
  own_goals numeric not null default 0,
  goalkeeper_win boolean not null default false,
  goalkeeper_draw boolean not null default false,
  stats_partially_estimated boolean not null default false,
  estimated_fields text[] not null default '{}',
  fetched_at timestamptz not null default now(),
  unique (player_id, match_id)
);

create table if not exists public.fantasy_point_snapshots (
  id uuid primary key default gen_random_uuid(),
  player_id text not null,
  match_id text not null,
  season text not null,
  match_date_utc timestamptz not null,
  points numeric not null,
  breakdown jsonb not null default '{}'::jsonb,
  is_approximated boolean not null default false,
  estimated_fields text[] not null default '{}',
  computed_at timestamptz not null default now(),
  unique (player_id, match_id)
);

create index if not exists fantasy_player_match_stats_match_date_idx
  on public.fantasy_player_match_stats (match_date_utc);
create index if not exists fantasy_player_match_stats_match_id_idx
  on public.fantasy_player_match_stats (match_id);
create index if not exists fantasy_point_snapshots_match_date_idx
  on public.fantasy_point_snapshots (match_date_utc);
create index if not exists fantasy_point_snapshots_match_id_idx
  on public.fantasy_point_snapshots (match_id);

alter table public.fantasy_player_match_stats enable row level security;
alter table public.fantasy_point_snapshots enable row level security;

drop policy if exists "Fantasy match stats are publicly readable"
  on public.fantasy_player_match_stats;
create policy "Fantasy match stats are publicly readable"
  on public.fantasy_player_match_stats for select
  using (true);

drop policy if exists "Fantasy point snapshots are publicly readable"
  on public.fantasy_point_snapshots;
create policy "Fantasy point snapshots are publicly readable"
  on public.fantasy_point_snapshots for select
  using (true);
