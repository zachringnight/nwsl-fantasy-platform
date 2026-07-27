-- Transactional, service-role-only publishing for the official NWSL public
-- data snapshot. Current-state rows are replaced as one database transaction;
-- immutable run rows preserve provenance and publication counts.

create table if not exists public.nwsl_data_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique
    check (char_length(run_key) between 1 and 320),
  schema_version integer not null check (schema_version = 1),
  season integer not null check (season = 2026),
  season_id text not null
    check (
      season_id ~ '^nwsl::Football_Season::[0-9a-f]{32}$'
    ),
  source_provider text not null check (source_provider = 'nwsl_official'),
  source_url text not null check (char_length(source_url) between 1 and 2048),
  generated_at timestamptz not null,
  fetched_at timestamptz not null,
  payload_checksum text not null unique
    check (payload_checksum ~ '^[0-9a-f]{64}$'),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  teams_count integer not null check (teams_count = 16),
  players_count integer not null check (
    players_count between 440 and 700
  ),
  matches_count integer not null check (
    matches_count between 240 and 350
  ),
  player_season_stats_count integer not null check (
    player_season_stats_count between 430 and 700
  ),
  team_season_stats_count integer not null check (
    team_season_stats_count = 16
  ),
  player_match_stats_count integer not null check (
    player_match_stats_count between 0 and 12000
  ),
  finished_matches_count integer not null check (
    finished_matches_count between 0 and 350
  ),
  published_at timestamptz not null default now()
);

create index if not exists nwsl_data_runs_season_generated_idx
  on public.nwsl_data_runs (season, generated_at desc);

create table if not exists public.nwsl_teams (
  id text primary key
    check (id ~ '^nwsl::Football_Team::[0-9a-f]{32}$'),
  provider_id text not null check (char_length(provider_id) between 1 and 160),
  slug text not null unique
    check (
      char_length(slug) between 1 and 160
      and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    ),
  name text not null check (char_length(name) between 1 and 240),
  abbreviation text not null
    check (
      char_length(abbreviation) between 2 and 8
      and abbreviation ~ '^[A-Z0-9]+$'
    ),
  media_name text check (char_length(media_name) <= 240),
  website_url text check (char_length(website_url) <= 2048),
  is_active boolean not null,
  season integer not null check (season = 2026),
  data_run_id uuid not null references public.nwsl_data_runs (id),
  source_fetched_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists nwsl_teams_data_run_idx
  on public.nwsl_teams (data_run_id);

create table if not exists public.nwsl_players (
  -- The website's existing player routes use the 32-character suffix.
  id text primary key check (id ~ '^[0-9a-f]{32}$'),
  official_id text not null unique
    check (
      official_id ~ '^nwsl::Football_Player::[0-9a-f]{32}$'
      and official_id = 'nwsl::Football_Player::' || id
    ),
  provider_id text not null check (char_length(provider_id) between 1 and 160),
  slug text not null unique
    check (
      char_length(slug) between 1 and 160
      and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    ),
  display_name text not null
    check (char_length(display_name) between 1 and 240),
  first_name text check (char_length(first_name) <= 120),
  last_name text check (char_length(last_name) <= 120),
  current_team_id text not null references public.nwsl_teams (id),
  position text not null check (position in ('GK', 'DEF', 'MID', 'FWD')),
  player_status text not null check (
    player_status in ('active', 'left_team')
  ),
  jersey_number integer check (
    jersey_number is null or jersey_number between 0 and 999
  ),
  date_of_birth date,
  nationality text check (char_length(nationality) <= 120),
  nationality_code text check (char_length(nationality_code) <= 8),
  season integer not null check (season = 2026),
  data_run_id uuid not null references public.nwsl_data_runs (id),
  source_fetched_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists nwsl_players_current_team_idx
  on public.nwsl_players (current_team_id);
create index if not exists nwsl_players_data_run_idx
  on public.nwsl_players (data_run_id);

create table if not exists public.nwsl_matches (
  id text primary key
    check (id ~ '^nwsl::Football_Match::[0-9a-f]{32}$'),
  provider_id text not null check (char_length(provider_id) between 1 and 160),
  season integer not null check (season = 2026),
  status text not null check (
    status in ('UPCOMING', 'LIVE', 'FINISHED', 'POSTPONED', 'CANCELED')
  ),
  phase text check (char_length(phase) <= 80),
  kickoff_at timestamptz not null,
  local_date date,
  home_team_id text not null references public.nwsl_teams (id),
  away_team_id text not null references public.nwsl_teams (id),
  home_score integer check (home_score is null or home_score between 0 and 99),
  away_score integer check (away_score is null or away_score between 0 and 99),
  venue text check (char_length(venue) <= 240),
  city text check (char_length(city) <= 240),
  round_name text check (char_length(round_name) <= 160),
  match_week integer check (match_week is null or match_week between 0 and 99),
  data_run_id uuid not null references public.nwsl_data_runs (id),
  source_fetched_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint nwsl_matches_distinct_teams check (home_team_id <> away_team_id),
  constraint nwsl_matches_finished_score check (
    status <> 'FINISHED'
    or (home_score is not null and away_score is not null)
  )
);

create index if not exists nwsl_matches_season_kickoff_idx
  on public.nwsl_matches (season, kickoff_at);
create index if not exists nwsl_matches_status_kickoff_idx
  on public.nwsl_matches (status, kickoff_at);
create index if not exists nwsl_matches_home_team_idx
  on public.nwsl_matches (home_team_id, kickoff_at desc);
create index if not exists nwsl_matches_away_team_idx
  on public.nwsl_matches (away_team_id, kickoff_at desc);
create index if not exists nwsl_matches_data_run_idx
  on public.nwsl_matches (data_run_id);

create table if not exists public.nwsl_player_season_stats (
  season integer not null check (season = 2026),
  player_id text not null references public.nwsl_players (id),
  team_id text not null references public.nwsl_teams (id),
  games_played integer not null check (games_played between 0 and 100000),
  starts integer not null check (starts between 0 and 100000),
  minutes_played numeric not null check (
    minutes_played between 0 and 100000
  ),
  goals integer not null check (goals between 0 and 100000),
  assists integer not null check (assists between 0 and 100000),
  shots integer not null check (shots between 0 and 100000),
  shots_on_target integer not null check (
    shots_on_target between 0 and 100000
  ),
  xg numeric check (xg is null or xg between 0 and 1000),
  xa numeric check (xa is null or xa between 0 and 1000),
  passes_attempted integer not null check (
    passes_attempted between 0 and 100000
  ),
  passes_completed integer not null check (
    passes_completed between 0 and passes_attempted
  ),
  pass_accuracy_pct numeric check (
    pass_accuracy_pct is null or pass_accuracy_pct between 0 and 100
  ),
  chances_created integer not null check (
    chances_created between 0 and 100000
  ),
  tackles integer not null check (tackles between 0 and 100000),
  tackles_won integer not null check (tackles_won between 0 and 100000),
  interceptions integer not null check (
    interceptions between 0 and 100000
  ),
  clearances integer not null check (clearances between 0 and 100000),
  clean_sheets integer not null check (clean_sheets between 0 and 100000),
  saves integer not null check (saves between 0 and 100000),
  goals_conceded integer not null check (
    goals_conceded between 0 and 100000
  ),
  yellow_cards integer not null check (yellow_cards between 0 and 100000),
  red_cards integer not null check (red_cards between 0 and 100000),
  fantasy_points numeric not null check (
    fantasy_points between -100000 and 100000
  ),
  points_per_90 numeric not null check (
    points_per_90 between -100000 and 100000
  ),
  raw_stats jsonb not null default '{}'::jsonb
    check (jsonb_typeof(raw_stats) = 'object'),
  data_run_id uuid not null references public.nwsl_data_runs (id),
  source_fetched_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (season, player_id)
);

create index if not exists nwsl_player_season_stats_team_idx
  on public.nwsl_player_season_stats (season, team_id);
create index if not exists nwsl_player_season_stats_data_run_idx
  on public.nwsl_player_season_stats (data_run_id);

create table if not exists public.nwsl_team_season_stats (
  season integer not null check (season = 2026),
  team_id text not null references public.nwsl_teams (id),
  games_played integer not null check (games_played between 0 and 100000),
  wins integer not null check (wins between 0 and 100000),
  draws integer not null check (draws between 0 and 100000),
  losses integer not null check (losses between 0 and 100000),
  points integer not null check (points between 0 and 100000),
  goals_for integer not null check (goals_for between 0 and 100000),
  goals_against integer not null check (
    goals_against between 0 and 100000
  ),
  goal_difference integer not null check (
    goal_difference between -999 and 999
  ),
  clean_sheets integer not null check (clean_sheets between 0 and 100000),
  shots integer not null check (shots between 0 and 100000),
  shots_on_target integer not null check (
    shots_on_target between 0 and 100000
  ),
  xg numeric check (xg is null or xg between 0 and 1000),
  xga numeric check (xga is null or xga between 0 and 1000),
  possession_pct numeric check (
    possession_pct is null or possession_pct between 0 and 100
  ),
  passes_attempted integer not null check (
    passes_attempted between 0 and 100000
  ),
  passes_completed integer not null check (
    passes_completed between 0 and passes_attempted
  ),
  pass_accuracy_pct numeric check (
    pass_accuracy_pct is null or pass_accuracy_pct between 0 and 100
  ),
  chances_created integer not null check (
    chances_created between 0 and 100000
  ),
  tackles integer not null check (tackles between 0 and 100000),
  tackles_won integer not null check (tackles_won between 0 and 100000),
  interceptions integer not null check (
    interceptions between 0 and 100000
  ),
  yellow_cards integer not null check (yellow_cards between 0 and 100000),
  red_cards integer not null check (red_cards between 0 and 100000),
  corners integer not null check (corners between 0 and 100000),
  raw_stats jsonb not null default '{}'::jsonb
    check (jsonb_typeof(raw_stats) = 'object'),
  data_run_id uuid not null references public.nwsl_data_runs (id),
  source_fetched_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (season, team_id),
  constraint nwsl_team_season_stats_record_check check (
    wins + draws + losses = games_played
  )
);

create index if not exists nwsl_team_season_stats_data_run_idx
  on public.nwsl_team_season_stats (data_run_id);

create table if not exists public.nwsl_player_match_stats (
  season integer not null check (season = 2026),
  player_id text not null references public.nwsl_players (id),
  match_id text not null references public.nwsl_matches (id) on delete cascade,
  team_id text not null references public.nwsl_teams (id),
  opponent_team_id text not null references public.nwsl_teams (id),
  is_home boolean not null,
  minutes numeric not null check (minutes between 0 and 100000),
  goals integer not null check (goals between 0 and 100000),
  assists integer not null check (assists between 0 and 100000),
  shots integer not null check (shots between 0 and 100000),
  shots_on_target integer not null check (
    shots_on_target between 0 and 100000
  ),
  xg numeric check (xg is null or xg between 0 and 1000),
  passes_attempted integer not null check (
    passes_attempted between 0 and 100000
  ),
  passes_completed integer not null check (
    passes_completed between 0 and passes_attempted
  ),
  pass_accuracy_pct numeric check (
    pass_accuracy_pct is null or pass_accuracy_pct between 0 and 100
  ),
  chances_created integer not null check (
    chances_created between 0 and 100000
  ),
  tackles integer not null check (tackles between 0 and 100000),
  tackles_won integer not null check (tackles_won between 0 and 100000),
  interceptions integer not null check (
    interceptions between 0 and 100000
  ),
  clearances integer not null check (clearances between 0 and 100000),
  saves integer not null check (saves between 0 and 100000),
  goals_conceded integer not null check (
    goals_conceded between 0 and 100000
  ),
  yellow_cards integer not null check (yellow_cards between 0 and 100000),
  red_cards integer not null check (red_cards between 0 and 100000),
  fantasy_points numeric not null check (
    fantasy_points between -100000 and 100000
  ),
  fantasy_breakdown jsonb not null default '{}'::jsonb
    check (jsonb_typeof(fantasy_breakdown) = 'object'),
  raw_stats jsonb not null default '{}'::jsonb
    check (jsonb_typeof(raw_stats) = 'object'),
  data_run_id uuid not null references public.nwsl_data_runs (id),
  source_fetched_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (season, player_id, match_id),
  constraint nwsl_player_match_stats_distinct_teams check (
    team_id <> opponent_team_id
  )
);

create index if not exists nwsl_player_match_stats_match_idx
  on public.nwsl_player_match_stats (season, match_id);
create index if not exists nwsl_player_match_stats_team_idx
  on public.nwsl_player_match_stats (season, team_id);
create index if not exists nwsl_player_match_stats_opponent_idx
  on public.nwsl_player_match_stats (season, opponent_team_id);
create index if not exists nwsl_player_match_stats_data_run_idx
  on public.nwsl_player_match_stats (data_run_id);

alter table public.nwsl_data_runs enable row level security;
alter table public.nwsl_teams enable row level security;
alter table public.nwsl_players enable row level security;
alter table public.nwsl_matches enable row level security;
alter table public.nwsl_player_season_stats enable row level security;
alter table public.nwsl_team_season_stats enable row level security;
alter table public.nwsl_player_match_stats enable row level security;

revoke all on table public.nwsl_data_runs
  from public, anon, authenticated;
revoke all on table public.nwsl_teams
  from public, anon, authenticated;
revoke all on table public.nwsl_players
  from public, anon, authenticated;
revoke all on table public.nwsl_matches
  from public, anon, authenticated;
revoke all on table public.nwsl_player_season_stats
  from public, anon, authenticated;
revoke all on table public.nwsl_team_season_stats
  from public, anon, authenticated;
revoke all on table public.nwsl_player_match_stats
  from public, anon, authenticated;

grant select, insert on table public.nwsl_data_runs to service_role;
grant select, insert, update, delete on table public.nwsl_teams
  to service_role;
grant select, insert, update, delete on table public.nwsl_players
  to service_role;
grant select, insert, update, delete on table public.nwsl_matches
  to service_role;
grant select, insert, update, delete
  on table public.nwsl_player_season_stats to service_role;
grant select, insert, update, delete
  on table public.nwsl_team_season_stats to service_role;
grant select, insert, update, delete
  on table public.nwsl_player_match_stats to service_role;

create or replace function public.publish_nwsl_data_snapshot(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_season integer;
  v_run_id uuid;
  v_run_key text;
  v_season_id text;
  v_source_provider text;
  v_source_url text;
  v_generated_at timestamptz;
  v_fetched_at timestamptz;
  v_payload_checksum text;
  v_existing_run_id uuid;
  v_existing_run_key text;
  v_existing_checksum text;
  v_existing_teams integer;
  v_existing_players integer;
  v_existing_matches integer;
  v_existing_player_season integer;
  v_existing_team_season integer;
  v_existing_player_match integer;
  v_existing_finished integer;
  v_latest_generated_at timestamptz;
  v_team_count integer;
  v_player_count integer;
  v_match_count integer;
  v_player_season_count integer;
  v_team_season_count integer;
  v_player_match_count integer;
  v_finished_count integer;
  v_finished_covered_count integer;
  v_distinct_count integer;
begin
  if current_user <> 'service_role' then
    raise exception 'service role required';
  end if;

  if p_payload is null
     or pg_catalog.jsonb_typeof(p_payload) <> 'object'
     or pg_catalog.pg_column_size(p_payload) > 10000000 then
    raise exception 'invalid or oversized payload';
  end if;

  if coalesce(p_payload ->> 'schemaVersion', '') <> '1' then
    raise exception 'unsupported schema version';
  end if;

  if coalesce(p_payload ->> 'season', '') <> '2026' then
    raise exception 'unsupported season';
  end if;
  v_season := 2026;

  if pg_catalog.jsonb_typeof(coalesce(p_payload -> 'run', 'null'::jsonb))
       <> 'object'
     or pg_catalog.jsonb_typeof(coalesce(p_payload -> 'teams', 'null'::jsonb))
       <> 'array'
     or pg_catalog.jsonb_typeof(coalesce(p_payload -> 'players', 'null'::jsonb))
       <> 'array'
     or pg_catalog.jsonb_typeof(coalesce(p_payload -> 'matches', 'null'::jsonb))
       <> 'array'
     or pg_catalog.jsonb_typeof(
       coalesce(p_payload -> 'playerSeasonStats', 'null'::jsonb)
     ) <> 'array'
     or pg_catalog.jsonb_typeof(
       coalesce(p_payload -> 'teamSeasonStats', 'null'::jsonb)
     ) <> 'array'
     or pg_catalog.jsonb_typeof(
       coalesce(p_payload -> 'playerMatchStats', 'null'::jsonb)
     ) <> 'array' then
    raise exception 'snapshot collections have invalid types';
  end if;

  v_run_key := p_payload #>> '{run,runKey}';
  v_season_id := p_payload #>> '{run,seasonId}';
  v_source_provider := p_payload #>> '{run,sourceProvider}';
  v_source_url := p_payload #>> '{run,sourceUrl}';
  v_payload_checksum := p_payload #>> '{run,payloadChecksum}';

  if coalesce(v_run_key, '') !~
       '^nwsl-data:2026:[A-Za-z0-9._:+-]+$'
     or char_length(v_run_key) > 320
     or coalesce(v_season_id, '') !~
       '^nwsl::Football_Season::[0-9a-f]{32}$'
     or v_source_provider <> 'nwsl_official'
     or coalesce(v_source_url, '') = ''
     or char_length(v_source_url) > 2048
     or coalesce(v_payload_checksum, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid run metadata';
  end if;

  begin
    v_generated_at := (p_payload #>> '{run,generatedAt}')::timestamptz;
    v_fetched_at := (p_payload #>> '{run,fetchedAt}')::timestamptz;
  exception
    when others then
      raise exception 'invalid run timestamps';
  end;

  if v_generated_at > now() + interval '10 minutes'
     or v_fetched_at > now() + interval '10 minutes' then
    raise exception 'future snapshot rejected';
  end if;
  if v_generated_at < now() - interval '48 hours'
     or v_fetched_at < now() - interval '48 hours' then
    raise exception 'stale snapshot rejected';
  end if;
  if v_fetched_at > v_generated_at + interval '10 minutes' then
    raise exception 'source fetch time is later than the generated run';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('public.publish_nwsl_data_snapshot:2026')
  );

  v_team_count := pg_catalog.jsonb_array_length(p_payload -> 'teams');
  v_player_count := pg_catalog.jsonb_array_length(p_payload -> 'players');
  v_match_count := pg_catalog.jsonb_array_length(p_payload -> 'matches');
  v_player_season_count :=
    pg_catalog.jsonb_array_length(p_payload -> 'playerSeasonStats');
  v_team_season_count :=
    pg_catalog.jsonb_array_length(p_payload -> 'teamSeasonStats');
  v_player_match_count :=
    pg_catalog.jsonb_array_length(p_payload -> 'playerMatchStats');

  if v_team_count <> 16
     or v_player_count < 440 or v_player_count > 700
     or v_match_count < 240 or v_match_count > 350
     or v_player_season_count < 430 or v_player_season_count > 700
     or v_team_season_count <> 16
     or v_player_match_count < 0 or v_player_match_count > 12000 then
    raise exception 'snapshot row counts failed';
  end if;

  select count(distinct row_data ->> 'id')
  into v_distinct_count
  from pg_catalog.jsonb_array_elements(p_payload -> 'teams') row_data;
  if v_distinct_count <> v_team_count then
    raise exception 'duplicate team IDs';
  end if;

  select count(distinct row_data ->> 'slug')
  into v_distinct_count
  from pg_catalog.jsonb_array_elements(p_payload -> 'teams') row_data;
  if v_distinct_count <> v_team_count then
    raise exception 'duplicate team slugs';
  end if;

  select count(distinct row_data ->> 'id')
  into v_distinct_count
  from pg_catalog.jsonb_array_elements(p_payload -> 'players') row_data;
  if v_distinct_count <> v_player_count then
    raise exception 'duplicate player IDs';
  end if;

  select count(distinct row_data ->> 'officialId')
  into v_distinct_count
  from pg_catalog.jsonb_array_elements(p_payload -> 'players') row_data;
  if v_distinct_count <> v_player_count then
    raise exception 'duplicate official player IDs';
  end if;

  select count(distinct row_data ->> 'slug')
  into v_distinct_count
  from pg_catalog.jsonb_array_elements(p_payload -> 'players') row_data;
  if v_distinct_count <> v_player_count then
    raise exception 'duplicate player slugs';
  end if;

  select count(distinct row_data ->> 'id')
  into v_distinct_count
  from pg_catalog.jsonb_array_elements(p_payload -> 'matches') row_data;
  if v_distinct_count <> v_match_count then
    raise exception 'duplicate match IDs';
  end if;

  select count(distinct row_data ->> 'playerId')
  into v_distinct_count
  from pg_catalog.jsonb_array_elements(
    p_payload -> 'playerSeasonStats'
  ) row_data;
  if v_distinct_count <> v_player_season_count then
    raise exception 'duplicate player season rows';
  end if;

  select count(distinct row_data ->> 'teamId')
  into v_distinct_count
  from pg_catalog.jsonb_array_elements(
    p_payload -> 'teamSeasonStats'
  ) row_data;
  if v_distinct_count <> v_team_season_count then
    raise exception 'duplicate team season rows';
  end if;

  select count(distinct (
    row_data ->> 'playerId',
    row_data ->> 'matchId'
  ))
  into v_distinct_count
  from pg_catalog.jsonb_array_elements(
    p_payload -> 'playerMatchStats'
  ) row_data;
  if v_distinct_count <> v_player_match_count then
    raise exception 'duplicate player-match rows';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_payload -> 'players') player_data
    where player_data ->> 'id' !~ '^[0-9a-f]{32}$'
       or player_data ->> 'officialId'
          <> 'nwsl::Football_Player::' || (player_data ->> 'id')
       or not exists (
         select 1
         from pg_catalog.jsonb_array_elements(p_payload -> 'teams') team_data
         where team_data ->> 'id' = player_data ->> 'currentTeamId'
       )
  ) then
    raise exception 'players contain malformed or unresolved IDs';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_payload -> 'matches') match_data
    where match_data ->> 'id'
            !~ '^nwsl::Football_Match::[0-9a-f]{32}$'
       or match_data ->> 'homeTeamId' = match_data ->> 'awayTeamId'
       or not exists (
         select 1
         from pg_catalog.jsonb_array_elements(p_payload -> 'teams') team_data
         where team_data ->> 'id' = match_data ->> 'homeTeamId'
       )
       or not exists (
         select 1
         from pg_catalog.jsonb_array_elements(p_payload -> 'teams') team_data
         where team_data ->> 'id' = match_data ->> 'awayTeamId'
       )
       or (
         match_data ->> 'status' = 'FINISHED'
         and (
           match_data -> 'homeScore' = 'null'::jsonb
           or match_data -> 'awayScore' = 'null'::jsonb
         )
       )
  ) then
    raise exception 'matches contain malformed or unresolved data';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      p_payload -> 'playerSeasonStats'
    ) stat_data
    where not exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_payload -> 'players') player_data
      where player_data ->> 'id' = stat_data ->> 'playerId'
    )
    or not exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_payload -> 'teams') team_data
      where team_data ->> 'id' = stat_data ->> 'teamId'
    )
    or pg_catalog.jsonb_typeof(
      coalesce(stat_data -> 'rawStats', 'null'::jsonb)
    ) <> 'object'
  ) then
    raise exception 'player season rows contain unresolved references';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      p_payload -> 'teamSeasonStats'
    ) stat_data
    where not exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_payload -> 'teams') team_data
      where team_data ->> 'id' = stat_data ->> 'teamId'
    )
    or pg_catalog.jsonb_typeof(
      coalesce(stat_data -> 'rawStats', 'null'::jsonb)
    ) <> 'object'
  ) then
    raise exception 'team season rows contain unresolved references';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      p_payload -> 'playerMatchStats'
    ) stat_data
    where not exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_payload -> 'players') player_data
      where player_data ->> 'id' = stat_data ->> 'playerId'
    )
    or not exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_payload -> 'matches') match_data
      where match_data ->> 'id' = stat_data ->> 'matchId'
        and match_data ->> 'status' = 'FINISHED'
        and (
          (
            (stat_data ->> 'isHome')::boolean
            and stat_data ->> 'teamId' = match_data ->> 'homeTeamId'
            and stat_data ->> 'opponentTeamId' = match_data ->> 'awayTeamId'
          )
          or
          (
            not (stat_data ->> 'isHome')::boolean
            and stat_data ->> 'teamId' = match_data ->> 'awayTeamId'
            and stat_data ->> 'opponentTeamId' = match_data ->> 'homeTeamId'
          )
        )
    )
    or pg_catalog.jsonb_typeof(
      coalesce(stat_data -> 'fantasyBreakdown', 'null'::jsonb)
    ) <> 'object'
    or pg_catalog.jsonb_typeof(
      coalesce(stat_data -> 'rawStats', 'null'::jsonb)
    ) <> 'object'
  ) then
    raise exception 'player-match rows contain unresolved or invalid data';
  end if;

  select count(*)
  into v_finished_count
  from pg_catalog.jsonb_array_elements(p_payload -> 'matches') match_data
  where match_data ->> 'status' = 'FINISHED';

  select count(*)
  into v_finished_covered_count
  from pg_catalog.jsonb_array_elements(p_payload -> 'matches') match_data
  where match_data ->> 'status' = 'FINISHED'
    and exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        p_payload -> 'playerMatchStats'
      ) stat_data
      where stat_data ->> 'matchId' = match_data ->> 'id'
    );

  if v_finished_covered_count <> v_finished_count then
    raise exception 'incomplete finished-match player stat coverage';
  end if;

  select
    id,
    run_key,
    payload_checksum,
    teams_count,
    players_count,
    matches_count,
    player_season_stats_count,
    team_season_stats_count,
    player_match_stats_count,
    finished_matches_count
  into
    v_existing_run_id,
    v_existing_run_key,
    v_existing_checksum,
    v_existing_teams,
    v_existing_players,
    v_existing_matches,
    v_existing_player_season,
    v_existing_team_season,
    v_existing_player_match,
    v_existing_finished
  from public.nwsl_data_runs
  where run_key = v_run_key;

  if v_existing_run_id is not null then
    if v_existing_checksum <> v_payload_checksum then
      raise exception 'run key already published with a different checksum';
    end if;
    return pg_catalog.jsonb_build_object(
      'runId', v_existing_run_id,
      'runKey', v_existing_run_key,
      'season', v_season,
      'payloadChecksum', v_existing_checksum,
      'idempotent', true,
      'counts', pg_catalog.jsonb_build_object(
        'teams', v_existing_teams,
        'players', v_existing_players,
        'matches', v_existing_matches,
        'playerSeasonStats', v_existing_player_season,
        'teamSeasonStats', v_existing_team_season,
        'playerMatchStats', v_existing_player_match,
        'finishedMatches', v_existing_finished
      )
    );
  end if;

  select id, run_key
  into v_existing_run_id, v_existing_run_key
  from public.nwsl_data_runs
  where payload_checksum = v_payload_checksum;
  if v_existing_run_id is not null then
    raise exception 'payload checksum already published under a different run key';
  end if;

  select max(generated_at)
  into v_latest_generated_at
  from public.nwsl_data_runs
  where season = v_season;
  if v_latest_generated_at is not null
     and v_generated_at <= v_latest_generated_at then
    raise exception 'stale snapshot replay rejected';
  end if;

  insert into public.nwsl_data_runs (
    run_key,
    schema_version,
    season,
    season_id,
    source_provider,
    source_url,
    generated_at,
    fetched_at,
    payload_checksum,
    metadata,
    teams_count,
    players_count,
    matches_count,
    player_season_stats_count,
    team_season_stats_count,
    player_match_stats_count,
    finished_matches_count
  )
  values (
    v_run_key,
    1,
    v_season,
    v_season_id,
    v_source_provider,
    v_source_url,
    v_generated_at,
    v_fetched_at,
    v_payload_checksum,
    coalesce(p_payload #> '{run,metadata}', '{}'::jsonb),
    v_team_count,
    v_player_count,
    v_match_count,
    v_player_season_count,
    v_team_season_count,
    v_player_match_count,
    v_finished_count
  )
  returning id into v_run_id;

  insert into public.nwsl_teams (
    id,
    provider_id,
    slug,
    name,
    abbreviation,
    media_name,
    website_url,
    is_active,
    season,
    data_run_id,
    source_fetched_at,
    updated_at
  )
  select
    row_data."id",
    row_data."providerId",
    row_data."slug",
    row_data."name",
    row_data."abbreviation",
    row_data."mediaName",
    row_data."websiteUrl",
    row_data."isActive",
    v_season,
    v_run_id,
    v_fetched_at,
    now()
  from pg_catalog.jsonb_to_recordset(p_payload -> 'teams') as row_data(
    "id" text,
    "providerId" text,
    "slug" text,
    "name" text,
    "abbreviation" text,
    "mediaName" text,
    "websiteUrl" text,
    "isActive" boolean
  )
  on conflict (id) do update
  set
    provider_id = excluded.provider_id,
    slug = excluded.slug,
    name = excluded.name,
    abbreviation = excluded.abbreviation,
    media_name = excluded.media_name,
    website_url = excluded.website_url,
    is_active = excluded.is_active,
    season = excluded.season,
    data_run_id = excluded.data_run_id,
    source_fetched_at = excluded.source_fetched_at,
    updated_at = excluded.updated_at;

  insert into public.nwsl_players (
    id,
    official_id,
    provider_id,
    slug,
    display_name,
    first_name,
    last_name,
    current_team_id,
    position,
    player_status,
    jersey_number,
    date_of_birth,
    nationality,
    nationality_code,
    season,
    data_run_id,
    source_fetched_at,
    updated_at
  )
  select
    row_data."id",
    row_data."officialId",
    row_data."providerId",
    row_data."slug",
    row_data."displayName",
    row_data."firstName",
    row_data."lastName",
    row_data."currentTeamId",
    row_data."position",
    row_data."playerStatus",
    row_data."jerseyNumber",
    row_data."dateOfBirth",
    row_data."nationality",
    row_data."nationalityCode",
    v_season,
    v_run_id,
    v_fetched_at,
    now()
  from pg_catalog.jsonb_to_recordset(p_payload -> 'players') as row_data(
    "id" text,
    "officialId" text,
    "providerId" text,
    "slug" text,
    "displayName" text,
    "firstName" text,
    "lastName" text,
    "currentTeamId" text,
    "position" text,
    "playerStatus" text,
    "jerseyNumber" integer,
    "dateOfBirth" date,
    "nationality" text,
    "nationalityCode" text
  )
  on conflict (id) do update
  set
    official_id = excluded.official_id,
    provider_id = excluded.provider_id,
    slug = excluded.slug,
    display_name = excluded.display_name,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    current_team_id = excluded.current_team_id,
    position = excluded.position,
    player_status = excluded.player_status,
    jersey_number = excluded.jersey_number,
    date_of_birth = excluded.date_of_birth,
    nationality = excluded.nationality,
    nationality_code = excluded.nationality_code,
    season = excluded.season,
    data_run_id = excluded.data_run_id,
    source_fetched_at = excluded.source_fetched_at,
    updated_at = excluded.updated_at;

  insert into public.nwsl_matches (
    id,
    provider_id,
    season,
    status,
    phase,
    kickoff_at,
    local_date,
    home_team_id,
    away_team_id,
    home_score,
    away_score,
    venue,
    city,
    round_name,
    match_week,
    data_run_id,
    source_fetched_at,
    updated_at
  )
  select
    row_data."id",
    row_data."providerId",
    v_season,
    row_data."status",
    row_data."phase",
    row_data."kickoffAt",
    row_data."localDate",
    row_data."homeTeamId",
    row_data."awayTeamId",
    row_data."homeScore",
    row_data."awayScore",
    row_data."venue",
    row_data."city",
    row_data."roundName",
    row_data."matchWeek",
    v_run_id,
    v_fetched_at,
    now()
  from pg_catalog.jsonb_to_recordset(p_payload -> 'matches') as row_data(
    "id" text,
    "providerId" text,
    "status" text,
    "phase" text,
    "kickoffAt" timestamptz,
    "localDate" date,
    "homeTeamId" text,
    "awayTeamId" text,
    "homeScore" integer,
    "awayScore" integer,
    "venue" text,
    "city" text,
    "roundName" text,
    "matchWeek" integer
  )
  on conflict (id) do update
  set
    provider_id = excluded.provider_id,
    season = excluded.season,
    status = excluded.status,
    phase = excluded.phase,
    kickoff_at = excluded.kickoff_at,
    local_date = excluded.local_date,
    home_team_id = excluded.home_team_id,
    away_team_id = excluded.away_team_id,
    home_score = excluded.home_score,
    away_score = excluded.away_score,
    venue = excluded.venue,
    city = excluded.city,
    round_name = excluded.round_name,
    match_week = excluded.match_week,
    data_run_id = excluded.data_run_id,
    source_fetched_at = excluded.source_fetched_at,
    updated_at = excluded.updated_at;

  insert into public.nwsl_player_season_stats (
    season,
    player_id,
    team_id,
    games_played,
    starts,
    minutes_played,
    goals,
    assists,
    shots,
    shots_on_target,
    xg,
    xa,
    passes_attempted,
    passes_completed,
    pass_accuracy_pct,
    chances_created,
    tackles,
    tackles_won,
    interceptions,
    clearances,
    clean_sheets,
    saves,
    goals_conceded,
    yellow_cards,
    red_cards,
    fantasy_points,
    points_per_90,
    raw_stats,
    data_run_id,
    source_fetched_at,
    updated_at
  )
  select
    v_season,
    row_data."playerId",
    row_data."teamId",
    row_data."gamesPlayed",
    row_data."starts",
    row_data."minutesPlayed",
    row_data."goals",
    row_data."assists",
    row_data."shots",
    row_data."shotsOnTarget",
    row_data."xg",
    row_data."xa",
    row_data."passesAttempted",
    row_data."passesCompleted",
    row_data."passAccuracyPct",
    row_data."chancesCreated",
    row_data."tackles",
    row_data."tacklesWon",
    row_data."interceptions",
    row_data."clearances",
    row_data."cleanSheets",
    row_data."saves",
    row_data."goalsConceded",
    row_data."yellowCards",
    row_data."redCards",
    row_data."fantasyPoints",
    row_data."pointsPer90",
    row_data."rawStats",
    v_run_id,
    v_fetched_at,
    now()
  from pg_catalog.jsonb_to_recordset(
    p_payload -> 'playerSeasonStats'
  ) as row_data(
    "playerId" text,
    "teamId" text,
    "gamesPlayed" integer,
    "starts" integer,
    "minutesPlayed" numeric,
    "goals" integer,
    "assists" integer,
    "shots" integer,
    "shotsOnTarget" integer,
    "xg" numeric,
    "xa" numeric,
    "passesAttempted" integer,
    "passesCompleted" integer,
    "passAccuracyPct" numeric,
    "chancesCreated" integer,
    "tackles" integer,
    "tacklesWon" integer,
    "interceptions" integer,
    "clearances" integer,
    "cleanSheets" integer,
    "saves" integer,
    "goalsConceded" integer,
    "yellowCards" integer,
    "redCards" integer,
    "fantasyPoints" numeric,
    "pointsPer90" numeric,
    "rawStats" jsonb
  )
  on conflict (season, player_id) do update
  set
    team_id = excluded.team_id,
    games_played = excluded.games_played,
    starts = excluded.starts,
    minutes_played = excluded.minutes_played,
    goals = excluded.goals,
    assists = excluded.assists,
    shots = excluded.shots,
    shots_on_target = excluded.shots_on_target,
    xg = excluded.xg,
    xa = excluded.xa,
    passes_attempted = excluded.passes_attempted,
    passes_completed = excluded.passes_completed,
    pass_accuracy_pct = excluded.pass_accuracy_pct,
    chances_created = excluded.chances_created,
    tackles = excluded.tackles,
    tackles_won = excluded.tackles_won,
    interceptions = excluded.interceptions,
    clearances = excluded.clearances,
    clean_sheets = excluded.clean_sheets,
    saves = excluded.saves,
    goals_conceded = excluded.goals_conceded,
    yellow_cards = excluded.yellow_cards,
    red_cards = excluded.red_cards,
    fantasy_points = excluded.fantasy_points,
    points_per_90 = excluded.points_per_90,
    raw_stats = excluded.raw_stats,
    data_run_id = excluded.data_run_id,
    source_fetched_at = excluded.source_fetched_at,
    updated_at = excluded.updated_at;

  insert into public.nwsl_team_season_stats (
    season,
    team_id,
    games_played,
    wins,
    draws,
    losses,
    points,
    goals_for,
    goals_against,
    goal_difference,
    clean_sheets,
    shots,
    shots_on_target,
    xg,
    xga,
    possession_pct,
    passes_attempted,
    passes_completed,
    pass_accuracy_pct,
    chances_created,
    tackles,
    tackles_won,
    interceptions,
    yellow_cards,
    red_cards,
    corners,
    raw_stats,
    data_run_id,
    source_fetched_at,
    updated_at
  )
  select
    v_season,
    row_data."teamId",
    row_data."gamesPlayed",
    row_data."wins",
    row_data."draws",
    row_data."losses",
    row_data."points",
    row_data."goalsFor",
    row_data."goalsAgainst",
    row_data."goalDifference",
    row_data."cleanSheets",
    row_data."shots",
    row_data."shotsOnTarget",
    row_data."xg",
    row_data."xga",
    row_data."possessionPct",
    row_data."passesAttempted",
    row_data."passesCompleted",
    row_data."passAccuracyPct",
    row_data."chancesCreated",
    row_data."tackles",
    row_data."tacklesWon",
    row_data."interceptions",
    row_data."yellowCards",
    row_data."redCards",
    row_data."corners",
    row_data."rawStats",
    v_run_id,
    v_fetched_at,
    now()
  from pg_catalog.jsonb_to_recordset(
    p_payload -> 'teamSeasonStats'
  ) as row_data(
    "teamId" text,
    "gamesPlayed" integer,
    "wins" integer,
    "draws" integer,
    "losses" integer,
    "points" integer,
    "goalsFor" integer,
    "goalsAgainst" integer,
    "goalDifference" integer,
    "cleanSheets" integer,
    "shots" integer,
    "shotsOnTarget" integer,
    "xg" numeric,
    "xga" numeric,
    "possessionPct" numeric,
    "passesAttempted" integer,
    "passesCompleted" integer,
    "passAccuracyPct" numeric,
    "chancesCreated" integer,
    "tackles" integer,
    "tacklesWon" integer,
    "interceptions" integer,
    "yellowCards" integer,
    "redCards" integer,
    "corners" integer,
    "rawStats" jsonb
  )
  on conflict (season, team_id) do update
  set
    games_played = excluded.games_played,
    wins = excluded.wins,
    draws = excluded.draws,
    losses = excluded.losses,
    points = excluded.points,
    goals_for = excluded.goals_for,
    goals_against = excluded.goals_against,
    goal_difference = excluded.goal_difference,
    clean_sheets = excluded.clean_sheets,
    shots = excluded.shots,
    shots_on_target = excluded.shots_on_target,
    xg = excluded.xg,
    xga = excluded.xga,
    possession_pct = excluded.possession_pct,
    passes_attempted = excluded.passes_attempted,
    passes_completed = excluded.passes_completed,
    pass_accuracy_pct = excluded.pass_accuracy_pct,
    chances_created = excluded.chances_created,
    tackles = excluded.tackles,
    tackles_won = excluded.tackles_won,
    interceptions = excluded.interceptions,
    yellow_cards = excluded.yellow_cards,
    red_cards = excluded.red_cards,
    corners = excluded.corners,
    raw_stats = excluded.raw_stats,
    data_run_id = excluded.data_run_id,
    source_fetched_at = excluded.source_fetched_at,
    updated_at = excluded.updated_at;

  insert into public.nwsl_player_match_stats (
    season,
    player_id,
    match_id,
    team_id,
    opponent_team_id,
    is_home,
    minutes,
    goals,
    assists,
    shots,
    shots_on_target,
    xg,
    passes_attempted,
    passes_completed,
    pass_accuracy_pct,
    chances_created,
    tackles,
    tackles_won,
    interceptions,
    clearances,
    saves,
    goals_conceded,
    yellow_cards,
    red_cards,
    fantasy_points,
    fantasy_breakdown,
    raw_stats,
    data_run_id,
    source_fetched_at,
    updated_at
  )
  select
    v_season,
    row_data."playerId",
    row_data."matchId",
    row_data."teamId",
    row_data."opponentTeamId",
    row_data."isHome",
    row_data."minutes",
    row_data."goals",
    row_data."assists",
    row_data."shots",
    row_data."shotsOnTarget",
    row_data."xg",
    row_data."passesAttempted",
    row_data."passesCompleted",
    row_data."passAccuracyPct",
    row_data."chancesCreated",
    row_data."tackles",
    row_data."tacklesWon",
    row_data."interceptions",
    row_data."clearances",
    row_data."saves",
    row_data."goalsConceded",
    row_data."yellowCards",
    row_data."redCards",
    row_data."fantasyPoints",
    row_data."fantasyBreakdown",
    row_data."rawStats",
    v_run_id,
    v_fetched_at,
    now()
  from pg_catalog.jsonb_to_recordset(
    p_payload -> 'playerMatchStats'
  ) as row_data(
    "playerId" text,
    "matchId" text,
    "teamId" text,
    "opponentTeamId" text,
    "isHome" boolean,
    "minutes" numeric,
    "goals" integer,
    "assists" integer,
    "shots" integer,
    "shotsOnTarget" integer,
    "xg" numeric,
    "passesAttempted" integer,
    "passesCompleted" integer,
    "passAccuracyPct" numeric,
    "chancesCreated" integer,
    "tackles" integer,
    "tacklesWon" integer,
    "interceptions" integer,
    "clearances" integer,
    "saves" integer,
    "goalsConceded" integer,
    "yellowCards" integer,
    "redCards" integer,
    "fantasyPoints" numeric,
    "fantasyBreakdown" jsonb,
    "rawStats" jsonb
  )
  on conflict (season, player_id, match_id) do update
  set
    team_id = excluded.team_id,
    opponent_team_id = excluded.opponent_team_id,
    is_home = excluded.is_home,
    minutes = excluded.minutes,
    goals = excluded.goals,
    assists = excluded.assists,
    shots = excluded.shots,
    shots_on_target = excluded.shots_on_target,
    xg = excluded.xg,
    passes_attempted = excluded.passes_attempted,
    passes_completed = excluded.passes_completed,
    pass_accuracy_pct = excluded.pass_accuracy_pct,
    chances_created = excluded.chances_created,
    tackles = excluded.tackles,
    tackles_won = excluded.tackles_won,
    interceptions = excluded.interceptions,
    clearances = excluded.clearances,
    saves = excluded.saves,
    goals_conceded = excluded.goals_conceded,
    yellow_cards = excluded.yellow_cards,
    red_cards = excluded.red_cards,
    fantasy_points = excluded.fantasy_points,
    fantasy_breakdown = excluded.fantasy_breakdown,
    raw_stats = excluded.raw_stats,
    data_run_id = excluded.data_run_id,
    source_fetched_at = excluded.source_fetched_at,
    updated_at = excluded.updated_at;

  -- Remove rows absent from the just-published season snapshot. Child rows are
  -- deleted before parents to preserve referential integrity.
  delete from public.nwsl_player_match_stats current_row
  where current_row.season = v_season
    and not exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        p_payload -> 'playerMatchStats'
      ) payload_row
      where payload_row ->> 'playerId' = current_row.player_id
        and payload_row ->> 'matchId' = current_row.match_id
    );

  delete from public.nwsl_player_season_stats current_row
  where current_row.season = v_season
    and not exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        p_payload -> 'playerSeasonStats'
      ) payload_row
      where payload_row ->> 'playerId' = current_row.player_id
    );

  delete from public.nwsl_team_season_stats current_row
  where current_row.season = v_season
    and not exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        p_payload -> 'teamSeasonStats'
      ) payload_row
      where payload_row ->> 'teamId' = current_row.team_id
    );

  delete from public.nwsl_matches current_row
  where current_row.season = v_season
    and not exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        p_payload -> 'matches'
      ) payload_row
      where payload_row ->> 'id' = current_row.id
    );

  delete from public.nwsl_players current_row
  where current_row.season = v_season
    and not exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        p_payload -> 'players'
      ) payload_row
      where payload_row ->> 'id' = current_row.id
    );

  delete from public.nwsl_teams current_row
  where current_row.season = v_season
    and not exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        p_payload -> 'teams'
      ) payload_row
      where payload_row ->> 'id' = current_row.id
    );

  return pg_catalog.jsonb_build_object(
    'runId', v_run_id,
    'runKey', v_run_key,
    'season', v_season,
    'payloadChecksum', v_payload_checksum,
    'idempotent', false,
    'counts', pg_catalog.jsonb_build_object(
      'teams', v_team_count,
      'players', v_player_count,
      'matches', v_match_count,
      'playerSeasonStats', v_player_season_count,
      'teamSeasonStats', v_team_season_count,
      'playerMatchStats', v_player_match_count,
      'finishedMatches', v_finished_count
    )
  );
end;
$$;

revoke all on function public.publish_nwsl_data_snapshot(jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_nwsl_data_snapshot(jsonb)
  to service_role;

comment on table public.nwsl_data_runs is
  'Immutable provenance for complete official NWSL public-data snapshots.';
comment on table public.nwsl_teams is
  'Current official NWSL team directory for the published 2026 snapshot.';
comment on table public.nwsl_players is
  'Current official NWSL player directory; IDs match existing player routes.';
comment on table public.nwsl_matches is
  'Current official 2026 NWSL schedule and results.';
comment on table public.nwsl_player_season_stats is
  'Official typed player season metrics plus the bounded raw source fields.';
comment on table public.nwsl_team_season_stats is
  'Official typed team season metrics plus the bounded raw source fields.';
comment on table public.nwsl_player_match_stats is
  'Exact official player-match metrics and auditable fantasy scoring details.';
