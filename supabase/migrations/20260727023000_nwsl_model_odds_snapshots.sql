-- Price-aware NWSL model publishing.
--
-- The original model publisher remains available for rollback compatibility.
-- The v2 wrapper calls it inside the same transaction, attaches canonical
-- official match identities, and stores every fresh quote represented on the
-- published slate. Browser roles retain no direct table or RPC access.

alter table public.nwsl_model_slate_rows
  add column if not exists official_match_id text;

alter table public.nwsl_model_picks
  add column if not exists official_match_id text;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'nwsl_model_slate_rows_official_match_fkey'
      and conrelid = 'public.nwsl_model_slate_rows'::regclass
  ) then
    alter table public.nwsl_model_slate_rows
      add constraint nwsl_model_slate_rows_official_match_fkey
      foreign key (official_match_id)
      references public.nwsl_matches (id);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'nwsl_model_picks_official_match_fkey'
      and conrelid = 'public.nwsl_model_picks'::regclass
  ) then
    alter table public.nwsl_model_picks
      add constraint nwsl_model_picks_official_match_fkey
      foreign key (official_match_id)
      references public.nwsl_matches (id);
  end if;
end;
$$;

create index if not exists nwsl_model_slate_rows_official_match_idx
  on public.nwsl_model_slate_rows (official_match_id, match_date);

create index if not exists nwsl_model_picks_official_match_idx
  on public.nwsl_model_picks (official_match_id, match_date desc);

create table if not exists public.nwsl_model_odds_snapshots (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null
    references public.nwsl_model_runs (id) on delete cascade,
  policy_id text not null
    check (policy_id = 'nwsl-totals-open-over-v1'),
  official_match_id text not null
    references public.nwsl_matches (id),
  match_id text not null,
  match_date date not null,
  home_team text not null,
  away_team text not null,
  sportsbook text not null,
  quote_timestamp timestamptz not null,
  market_type text not null check (market_type in ('1x2', 'total')),
  line numeric,
  home_odds numeric,
  draw_odds numeric,
  away_odds numeric,
  over_odds numeric,
  under_odds numeric,
  source_type text not null check (source_type in ('current', 'live')),
  quote_age_minutes numeric not null
    check (quote_age_minutes >= 0 and quote_age_minutes <= 180),
  is_fresh boolean not null check (is_fresh),
  raw_row jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint nwsl_model_odds_snapshots_distinct_teams
    check (home_team <> away_team),
  constraint nwsl_model_odds_snapshots_market_shape
    check (
      (
        market_type = 'total'
        and line is not null
        and over_odds > 1
        and under_odds > 1
        and home_odds is null
        and draw_odds is null
        and away_odds is null
      )
      or
      (
        market_type = '1x2'
        and line is null
        and home_odds > 1
        and draw_odds > 1
        and away_odds > 1
        and over_odds is null
        and under_odds is null
      )
    )
);

create unique index if not exists nwsl_model_odds_snapshots_quote_key
  on public.nwsl_model_odds_snapshots (
    run_id,
    match_id,
    sportsbook,
    market_type,
    coalesce(line, '-999999'::numeric),
    quote_timestamp
  );

create index if not exists nwsl_model_odds_snapshots_run_match_idx
  on public.nwsl_model_odds_snapshots (
    run_id,
    match_id,
    market_type
  );

create index if not exists nwsl_model_odds_snapshots_official_match_idx
  on public.nwsl_model_odds_snapshots (
    official_match_id,
    quote_timestamp desc
  );

alter table public.nwsl_model_odds_snapshots enable row level security;

revoke all on table public.nwsl_model_odds_snapshots
  from public, anon, authenticated;
grant select, insert, delete on table public.nwsl_model_odds_snapshots
  to service_role;

create or replace function public.publish_nwsl_model_snapshot_v2(
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_publication jsonb;
  v_run_id uuid;
  v_odds_count integer;
begin
  if pg_catalog.jsonb_typeof(
    coalesce(p_payload -> 'odds', '[]'::jsonb)
  ) <> 'array' then
    raise exception 'odds must be an array';
  end if;

  v_publication := public.publish_nwsl_model_snapshot(p_payload);
  v_run_id := (v_publication ->> 'runId')::uuid;

  update public.nwsl_model_slate_rows slate_row
  set official_match_id = row_data ->> 'officialMatchId'
  from pg_catalog.jsonb_array_elements(
    coalesce(p_payload -> 'slate', '[]'::jsonb)
  ) row_data
  where slate_row.run_id = v_run_id
    and slate_row.match_id = row_data ->> 'matchId';

  if exists (
    select 1
    from public.nwsl_model_slate_rows
    where run_id = v_run_id
      and official_match_id is null
  ) then
    raise exception 'every slate row requires an official match id';
  end if;

  update public.nwsl_model_picks pick_row
  set official_match_id = row_data ->> 'officialMatchId'
  from pg_catalog.jsonb_array_elements(
    coalesce(p_payload -> 'picks', '[]'::jsonb)
  ) row_data
  where pick_row.policy_id = p_payload #>> '{run,policyId}'
    and pick_row.match_id = row_data ->> 'matchId';

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      coalesce(p_payload -> 'picks', '[]'::jsonb)
    ) row_data
    join public.nwsl_model_picks pick_row
      on pick_row.policy_id = p_payload #>> '{run,policyId}'
      and pick_row.match_id = row_data ->> 'matchId'
    where pick_row.official_match_id is null
  ) then
    raise exception 'every locked pick requires an official match id';
  end if;

  delete from public.nwsl_model_odds_snapshots
  where run_id = v_run_id;

  insert into public.nwsl_model_odds_snapshots (
    run_id,
    policy_id,
    official_match_id,
    match_id,
    match_date,
    home_team,
    away_team,
    sportsbook,
    quote_timestamp,
    market_type,
    line,
    home_odds,
    draw_odds,
    away_odds,
    over_odds,
    under_odds,
    source_type,
    quote_age_minutes,
    is_fresh,
    raw_row
  )
  select
    v_run_id,
    p_payload #>> '{run,policyId}',
    row_data ->> 'officialMatchId',
    row_data ->> 'matchId',
    (row_data ->> 'matchDate')::date,
    row_data ->> 'homeTeam',
    row_data ->> 'awayTeam',
    row_data ->> 'sportsbook',
    (row_data ->> 'quoteTimestamp')::timestamptz,
    row_data ->> 'marketType',
    nullif(row_data ->> 'line', '')::numeric,
    nullif(row_data ->> 'homeOdds', '')::numeric,
    nullif(row_data ->> 'drawOdds', '')::numeric,
    nullif(row_data ->> 'awayOdds', '')::numeric,
    nullif(row_data ->> 'overOdds', '')::numeric,
    nullif(row_data ->> 'underOdds', '')::numeric,
    row_data ->> 'sourceType',
    (row_data ->> 'quoteAgeMinutes')::numeric,
    (row_data ->> 'isFresh')::boolean,
    coalesce(row_data -> 'rawRow', '{}'::jsonb)
  from pg_catalog.jsonb_array_elements(
    coalesce(p_payload -> 'odds', '[]'::jsonb)
  ) row_data;

  get diagnostics v_odds_count = row_count;

  if exists (
    select 1
    from public.nwsl_model_slate_rows slate_row
    where slate_row.run_id = v_run_id
      and slate_row.line is not null
      and slate_row.over_odds is not null
      and slate_row.under_odds is not null
      and slate_row.sportsbook is not null
      and slate_row.quote_timestamp is not null
      and not exists (
        select 1
        from public.nwsl_model_odds_snapshots odds_row
        where odds_row.run_id = slate_row.run_id
          and odds_row.match_id = slate_row.match_id
          and odds_row.official_match_id = slate_row.official_match_id
          and odds_row.market_type = 'total'
          and odds_row.sportsbook = slate_row.sportsbook
          and odds_row.quote_timestamp = slate_row.quote_timestamp
          and odds_row.line = slate_row.line
          and odds_row.over_odds = slate_row.over_odds
          and odds_row.under_odds = slate_row.under_odds
      )
  ) then
    raise exception 'priced slate row is missing its exact odds snapshot';
  end if;

  return v_publication || pg_catalog.jsonb_build_object(
    'oddsRows',
    v_odds_count
  );
end;
$$;

revoke all on function public.publish_nwsl_model_snapshot_v2(jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_nwsl_model_snapshot_v2(jsonb)
  to service_role;

comment on table public.nwsl_model_odds_snapshots is
  'Fresh current odds stored with each published model run. Priced slate rows must match an exact stored quote.';

comment on function public.publish_nwsl_model_snapshot_v2(jsonb) is
  'Atomically publishes a model snapshot, canonical match identities, and exact fresh odds provenance.';
