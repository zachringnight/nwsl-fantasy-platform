-- Canonical NWSL public data schema.
--
-- Normalized source of truth for public NWSL teams, players, matches, match
-- events, match statistics, and standings. This is additive: it creates new
-- `nwsl_*` tables only and does not alter or rewrite any existing table.
--
-- Populated by provider adapters (nwsl_official primary, espn fallback)
-- added in a later packet. Every row carries its own provenance
-- (source_provider, source_fetched_at, source_season, is_fallback) and an
-- is_approximated flag so callers can render an honest unavailable or
-- estimated state instead of fabricating a value. Stable provider IDs are
-- scoped to their provider (`unique (source_provider, provider_id)`) rather
-- than assumed globally unique on their own, since nwsl_official and espn
-- IDs are independent namespaces that may collide numerically.

-- Teams -----------------------------------------------------------------
create table if not exists public.nwsl_teams (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null,
  slug text not null,
  name text not null,
  abbreviation text not null,
  crest_url text,
  primary_color text,
  secondary_color text,
  is_active boolean not null default true,
  source_provider text not null check (source_provider in ('nwsl_official', 'espn')),
  source_fetched_at timestamptz not null default now(),
  source_season text not null,
  source_url text,
  is_fallback boolean not null default false,
  is_approximated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nwsl_teams_provider_id_key unique (source_provider, provider_id),
  constraint nwsl_teams_slug_key unique (slug),
  constraint nwsl_teams_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
-- "Team slug" lookups are already indexed by the nwsl_teams_slug_key unique
-- constraint above (Postgres backs every unique constraint with a btree
-- index), so no separate duplicate index is added for it here.

-- Players -----------------------------------------------------------------
create table if not exists public.nwsl_players (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null,
  slug text not null,
  display_name text not null,
  team_id uuid references public.nwsl_teams (id) on delete set null,
  position text not null check (position in ('GK', 'DEF', 'MID', 'FWD')),
  jersey_number integer check (jersey_number is null or jersey_number > 0),
  headshot_url text,
  availability text not null default 'available'
    check (availability in ('available', 'questionable', 'out')),
  source_provider text not null check (source_provider in ('nwsl_official', 'espn')),
  source_fetched_at timestamptz not null default now(),
  source_season text not null,
  source_url text,
  is_fallback boolean not null default false,
  is_approximated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nwsl_players_provider_id_key unique (source_provider, provider_id),
  constraint nwsl_players_slug_key unique (slug),
  constraint nwsl_players_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
-- "Player slug" lookups are already indexed by the nwsl_players_slug_key
-- unique constraint above; see the note on nwsl_teams_slug_key.

-- Team roster lookup (all players currently on a team).
create index if not exists nwsl_players_team_idx
  on public.nwsl_players (team_id);

-- Matches -----------------------------------------------------------------
create table if not exists public.nwsl_matches (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null,
  season text not null,
  kickoff_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'live', 'final', 'postponed', 'canceled')),
  home_team_id uuid not null references public.nwsl_teams (id),
  away_team_id uuid not null references public.nwsl_teams (id),
  home_score integer check (home_score is null or home_score >= 0),
  away_score integer check (away_score is null or away_score >= 0),
  venue text,
  broadcast jsonb not null default '{}'::jsonb,
  source_provider text not null check (source_provider in ('nwsl_official', 'espn')),
  source_fetched_at timestamptz not null default now(),
  source_season text not null,
  source_url text,
  is_fallback boolean not null default false,
  is_approximated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nwsl_matches_provider_id_key unique (source_provider, provider_id),
  constraint nwsl_matches_teams_distinct check (home_team_id <> away_team_id)
);

-- Season schedule browsing.
create index if not exists nwsl_matches_season_kickoff_idx
  on public.nwsl_matches (season, kickoff_at);
-- Live/upcoming match center queries (e.g. "live matches ordered by kickoff").
create index if not exists nwsl_matches_status_kickoff_idx
  on public.nwsl_matches (status, kickoff_at);

-- Match events --------------------------------------------------------------
create table if not exists public.nwsl_match_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  match_id uuid not null references public.nwsl_matches (id) on delete cascade,
  provider_event_id text,
  event_sequence integer not null check (event_sequence >= 0),
  minute integer not null check (minute >= 0),
  stoppage_minute integer check (stoppage_minute is null or stoppage_minute >= 0),
  event_type text not null,
  team_id uuid references public.nwsl_teams (id),
  player_id uuid references public.nwsl_players (id),
  related_player_id uuid references public.nwsl_players (id),
  payload jsonb not null default '{}'::jsonb,
  source_provider text not null check (source_provider in ('nwsl_official', 'espn')),
  source_fetched_at timestamptz not null default now(),
  source_season text not null,
  source_url text,
  is_fallback boolean not null default false,
  is_approximated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Stable, provider-agnostic idempotency key computed by the ingest layer
  -- (e.g. derived from match_id + provider_event_id, or match_id +
  -- event_sequence when a provider does not issue a per-event id) so
  -- re-fetching the same event never creates a duplicate row.
  constraint nwsl_match_events_event_key_key unique (event_key)
);

-- Event ordering within a match.
create index if not exists nwsl_match_events_match_sequence_idx
  on public.nwsl_match_events (match_id, event_sequence);

-- Player match statistics ----------------------------------------------------
create table if not exists public.nwsl_player_match_stats (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.nwsl_players (id),
  match_id uuid not null references public.nwsl_matches (id) on delete cascade,
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
  is_approximated boolean not null default false,
  estimated_fields text[] not null default '{}',
  source_provider text not null check (source_provider in ('nwsl_official', 'espn')),
  source_fetched_at timestamptz not null default now(),
  source_season text not null,
  source_url text,
  is_fallback boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nwsl_player_match_stats_player_match_key unique (player_id, match_id)
);

-- Team match statistics -------------------------------------------------------
create table if not exists public.nwsl_team_match_stats (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.nwsl_teams (id),
  match_id uuid not null references public.nwsl_matches (id) on delete cascade,
  possession_pct numeric,
  shots numeric not null default 0,
  shots_on_target numeric not null default 0,
  corners numeric not null default 0,
  fouls numeric not null default 0,
  offsides numeric not null default 0,
  yellow_cards numeric not null default 0,
  red_cards numeric not null default 0,
  passes_completed numeric not null default 0,
  passes_attempted numeric not null default 0,
  is_approximated boolean not null default false,
  source_provider text not null check (source_provider in ('nwsl_official', 'espn')),
  source_fetched_at timestamptz not null default now(),
  source_season text not null,
  source_url text,
  is_fallback boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nwsl_team_match_stats_team_match_key unique (team_id, match_id)
);

-- Standings snapshots ---------------------------------------------------------
create table if not exists public.nwsl_standings_snapshots (
  id uuid primary key default gen_random_uuid(),
  season text not null,
  captured_at timestamptz not null default now(),
  team_id uuid not null references public.nwsl_teams (id),
  standing_rank integer not null check (standing_rank > 0),
  matches_played integer not null default 0,
  wins integer not null default 0,
  draws integer not null default 0,
  losses integer not null default 0,
  goals_for integer not null default 0,
  goals_against integer not null default 0,
  goal_difference integer not null default 0,
  points integer not null default 0,
  is_approximated boolean not null default false,
  source_provider text not null check (source_provider in ('nwsl_official', 'espn')),
  source_fetched_at timestamptz not null default now(),
  source_season text not null,
  source_url text,
  is_fallback boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nwsl_standings_snapshots_season_team_captured_key
    unique (season, team_id, captured_at)
);

-- Season standings table browsing, latest-snapshot-first.
create index if not exists nwsl_standings_snapshots_season_captured_idx
  on public.nwsl_standings_snapshots (season, captured_at desc);

-- Row level security ----------------------------------------------------------
-- All canonical NWSL data is public reference data: every table is
-- public-readable with no authentication required, matching the existing
-- "publicly readable" pattern used for fantasy_player_match_stats and
-- fantasy_point_snapshots (see 20260723_fantasy_scoring_tables.sql). Writes
-- are performed by service-role provider-ingest jobs (added in a later
-- packet); the service role bypasses RLS, so no insert/update/delete
-- policies are added here.
alter table public.nwsl_teams enable row level security;
alter table public.nwsl_players enable row level security;
alter table public.nwsl_matches enable row level security;
alter table public.nwsl_match_events enable row level security;
alter table public.nwsl_player_match_stats enable row level security;
alter table public.nwsl_team_match_stats enable row level security;
alter table public.nwsl_standings_snapshots enable row level security;

drop policy if exists "NWSL teams are publicly readable" on public.nwsl_teams;
create policy "NWSL teams are publicly readable"
  on public.nwsl_teams for select
  using (true);

drop policy if exists "NWSL players are publicly readable" on public.nwsl_players;
create policy "NWSL players are publicly readable"
  on public.nwsl_players for select
  using (true);

drop policy if exists "NWSL matches are publicly readable" on public.nwsl_matches;
create policy "NWSL matches are publicly readable"
  on public.nwsl_matches for select
  using (true);

drop policy if exists "NWSL match events are publicly readable" on public.nwsl_match_events;
create policy "NWSL match events are publicly readable"
  on public.nwsl_match_events for select
  using (true);

drop policy if exists "NWSL player match stats are publicly readable" on public.nwsl_player_match_stats;
create policy "NWSL player match stats are publicly readable"
  on public.nwsl_player_match_stats for select
  using (true);

drop policy if exists "NWSL team match stats are publicly readable" on public.nwsl_team_match_stats;
create policy "NWSL team match stats are publicly readable"
  on public.nwsl_team_match_stats for select
  using (true);

drop policy if exists "NWSL standings snapshots are publicly readable" on public.nwsl_standings_snapshots;
create policy "NWSL standings snapshots are publicly readable"
  on public.nwsl_standings_snapshots for select
  using (true);
