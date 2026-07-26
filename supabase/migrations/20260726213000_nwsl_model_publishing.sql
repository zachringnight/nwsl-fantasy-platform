-- Durable publishing for the automated NWSL model board.
--
-- Daily model runs are written through one service-role-only RPC so the run
-- summary, evaluated slate, locked picks, and settlement updates commit
-- atomically. The public site reads these tables server-side with the service
-- role; browser roles receive no direct table or function access.

create table if not exists public.nwsl_model_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  schema_version integer not null default 1 check (schema_version = 1),
  policy_id text not null,
  policy_status text not null,
  model_family text not null,
  artifact_version text not null,
  run_status text not null check (run_status in ('success', 'no_bet')),
  generated_at timestamptz not null,
  window_start date,
  window_end date,
  matches_in_window integer not null default 0 check (matches_in_window >= 0),
  priced_matches integer not null default 0 check (priced_matches >= 0),
  actionable_picks integer not null default 0 check (actionable_picks >= 0),
  stake_cap_bankroll_pct numeric not null default 0.25
    check (stake_cap_bankroll_pct >= 0 and stake_cap_bankroll_pct <= 0.25),
  summary jsonb not null default '{}'::jsonb,
  source_health jsonb not null default '{}'::jsonb,
  forward_results jsonb not null default '{}'::jsonb,
  evidence_summary jsonb not null default '{}'::jsonb,
  payload_checksum text not null,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nwsl_model_runs_policy_generated_idx
  on public.nwsl_model_runs (policy_id, generated_at desc);

create table if not exists public.nwsl_model_slate_rows (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.nwsl_model_runs (id) on delete cascade,
  policy_id text not null,
  match_id text not null,
  match_date date not null,
  home_team text not null,
  away_team text not null,
  market text not null check (market = 'total_over'),
  side text not null check (side = 'over'),
  sportsbook text,
  quote_timestamp timestamptz,
  first_seen_timestamp timestamptz,
  line numeric,
  over_odds numeric,
  under_odds numeric,
  model_probability numeric,
  market_no_vig_probability numeric,
  probability_edge numeric,
  expected_value numeric,
  confidence numeric,
  quote_age_minutes numeric,
  quote_is_fresh boolean,
  first_seen_contract_ok boolean,
  pick_tier text not null,
  actionable boolean not null default false,
  reason text not null,
  stake_pct numeric not null default 0
    check (stake_pct >= 0 and stake_pct <= 0.0025),
  raw_row jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint nwsl_model_slate_rows_run_match_market_key
    unique (run_id, match_id, market, side)
);

create index if not exists nwsl_model_slate_rows_run_actionable_idx
  on public.nwsl_model_slate_rows (run_id, actionable, match_date);

create table if not exists public.nwsl_model_picks (
  id uuid primary key default gen_random_uuid(),
  pick_key text not null unique,
  policy_id text not null,
  locked_run_id uuid not null references public.nwsl_model_runs (id),
  last_seen_run_id uuid not null references public.nwsl_model_runs (id),
  match_id text not null,
  match_date date not null,
  home_team text not null,
  away_team text not null,
  market text not null check (market = 'total_over'),
  side text not null check (side = 'over'),
  sportsbook text not null,
  quote_timestamp timestamptz not null,
  first_seen_timestamp timestamptz,
  line numeric not null,
  over_odds numeric not null check (over_odds > 1),
  under_odds numeric,
  model_probability numeric not null check (
    model_probability >= 0 and model_probability <= 1
  ),
  probability_edge numeric,
  expected_value numeric not null,
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  stake_pct numeric not null check (stake_pct > 0 and stake_pct <= 0.0025),
  locked_at timestamptz not null,
  settlement_status text not null default 'pending'
    check (settlement_status in ('pending', 'settled')),
  result text not null default 'pending'
    check (result in ('pending', 'win', 'loss', 'push')),
  pnl_units numeric,
  home_goals_90 numeric,
  away_goals_90 numeric,
  settled_at timestamptz,
  raw_row jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nwsl_model_picks_policy_match_key unique (policy_id, match_id)
);

create index if not exists nwsl_model_picks_policy_match_date_idx
  on public.nwsl_model_picks (policy_id, match_date desc);

create index if not exists nwsl_model_picks_policy_settlement_idx
  on public.nwsl_model_picks (policy_id, settlement_status, match_date desc);

alter table public.nwsl_model_runs enable row level security;
alter table public.nwsl_model_slate_rows enable row level security;
alter table public.nwsl_model_picks enable row level security;

revoke all on table public.nwsl_model_runs from anon, authenticated;
revoke all on table public.nwsl_model_slate_rows from anon, authenticated;
revoke all on table public.nwsl_model_picks from anon, authenticated;

grant select, insert, update on table public.nwsl_model_runs to service_role;
grant select, insert, update, delete on table public.nwsl_model_slate_rows to service_role;
grant select, insert, update on table public.nwsl_model_picks to service_role;

create or replace function public.publish_nwsl_model_snapshot(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run_id uuid;
  v_run_key text := p_payload #>> '{run,runKey}';
  v_policy_id text := p_payload #>> '{run,policyId}';
  v_actionable_expected integer :=
    coalesce((p_payload #>> '{run,actionablePicks}')::integer, 0);
  v_actionable_actual integer;
  v_slate_count integer;
  v_pick_count integer;
begin
  if coalesce((p_payload ->> 'schemaVersion')::integer, 0) <> 1 then
    raise exception 'unsupported schema version';
  end if;

  if v_policy_id <> 'nwsl-totals-open-over-v1' then
    raise exception 'unsupported policy id';
  end if;

  if coalesce(p_payload #>> '{run,modelFamily}', '') <> 'team_ratings_poisson' then
    raise exception 'unsupported model family';
  end if;

  if jsonb_typeof(coalesce(p_payload -> 'slate', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_payload -> 'picks', '[]'::jsonb)) <> 'array' then
    raise exception 'slate and picks must be arrays';
  end if;

  select count(*)
  into v_actionable_actual
  from jsonb_array_elements(coalesce(p_payload -> 'slate', '[]'::jsonb)) row_data
  where coalesce((row_data ->> 'actionable')::boolean, false);

  if v_actionable_actual <> v_actionable_expected then
    raise exception 'actionable pick count mismatch';
  end if;

  insert into public.nwsl_model_runs (
    run_key,
    schema_version,
    policy_id,
    policy_status,
    model_family,
    artifact_version,
    run_status,
    generated_at,
    window_start,
    window_end,
    matches_in_window,
    priced_matches,
    actionable_picks,
    stake_cap_bankroll_pct,
    summary,
    source_health,
    forward_results,
    evidence_summary,
    payload_checksum,
    published_at,
    updated_at
  )
  values (
    v_run_key,
    1,
    v_policy_id,
    p_payload #>> '{run,policyStatus}',
    p_payload #>> '{run,modelFamily}',
    p_payload #>> '{run,artifactVersion}',
    p_payload #>> '{run,status}',
    (p_payload #>> '{run,generatedAt}')::timestamptz,
    nullif(p_payload #>> '{run,windowStart}', '')::date,
    nullif(p_payload #>> '{run,windowEnd}', '')::date,
    coalesce((p_payload #>> '{run,matchesInWindow}')::integer, 0),
    coalesce((p_payload #>> '{run,pricedMatches}')::integer, 0),
    v_actionable_expected,
    coalesce((p_payload #>> '{run,stakeCapBankrollPct}')::numeric, 0.25),
    coalesce(p_payload #> '{run,summary}', '{}'::jsonb),
    coalesce(p_payload #> '{run,sourceHealth}', '{}'::jsonb),
    coalesce(p_payload #> '{run,forwardResults}', '{}'::jsonb),
    coalesce(p_payload #> '{run,evidenceSummary}', '{}'::jsonb),
    p_payload #>> '{run,payloadChecksum}',
    now(),
    now()
  )
  on conflict (run_key) do update
  set
    policy_status = excluded.policy_status,
    model_family = excluded.model_family,
    artifact_version = excluded.artifact_version,
    run_status = excluded.run_status,
    generated_at = excluded.generated_at,
    window_start = excluded.window_start,
    window_end = excluded.window_end,
    matches_in_window = excluded.matches_in_window,
    priced_matches = excluded.priced_matches,
    actionable_picks = excluded.actionable_picks,
    stake_cap_bankroll_pct = excluded.stake_cap_bankroll_pct,
    summary = excluded.summary,
    source_health = excluded.source_health,
    forward_results = excluded.forward_results,
    evidence_summary = excluded.evidence_summary,
    payload_checksum = excluded.payload_checksum,
    published_at = now(),
    updated_at = now()
  returning id into v_run_id;

  delete from public.nwsl_model_slate_rows where run_id = v_run_id;

  insert into public.nwsl_model_slate_rows (
    run_id,
    policy_id,
    match_id,
    match_date,
    home_team,
    away_team,
    market,
    side,
    sportsbook,
    quote_timestamp,
    first_seen_timestamp,
    line,
    over_odds,
    under_odds,
    model_probability,
    market_no_vig_probability,
    probability_edge,
    expected_value,
    confidence,
    quote_age_minutes,
    quote_is_fresh,
    first_seen_contract_ok,
    pick_tier,
    actionable,
    reason,
    stake_pct,
    raw_row
  )
  select
    v_run_id,
    v_policy_id,
    row_data ->> 'matchId',
    (row_data ->> 'matchDate')::date,
    row_data ->> 'homeTeam',
    row_data ->> 'awayTeam',
    row_data ->> 'market',
    row_data ->> 'side',
    nullif(row_data ->> 'sportsbook', ''),
    nullif(row_data ->> 'quoteTimestamp', '')::timestamptz,
    nullif(row_data ->> 'firstSeenTimestamp', '')::timestamptz,
    nullif(row_data ->> 'line', '')::numeric,
    nullif(row_data ->> 'overOdds', '')::numeric,
    nullif(row_data ->> 'underOdds', '')::numeric,
    nullif(row_data ->> 'modelProbability', '')::numeric,
    nullif(row_data ->> 'marketNoVigProbability', '')::numeric,
    nullif(row_data ->> 'probabilityEdge', '')::numeric,
    nullif(row_data ->> 'expectedValue', '')::numeric,
    nullif(row_data ->> 'confidence', '')::numeric,
    nullif(row_data ->> 'quoteAgeMinutes', '')::numeric,
    nullif(row_data ->> 'quoteIsFresh', '')::boolean,
    nullif(row_data ->> 'firstSeenContractOk', '')::boolean,
    row_data ->> 'pickTier',
    coalesce((row_data ->> 'actionable')::boolean, false),
    row_data ->> 'reason',
    coalesce(nullif(row_data ->> 'stakePct', '')::numeric, 0),
    row_data
  from jsonb_array_elements(coalesce(p_payload -> 'slate', '[]'::jsonb)) row_data;

  get diagnostics v_slate_count = row_count;

  insert into public.nwsl_model_picks (
    pick_key,
    policy_id,
    locked_run_id,
    last_seen_run_id,
    match_id,
    match_date,
    home_team,
    away_team,
    market,
    side,
    sportsbook,
    quote_timestamp,
    first_seen_timestamp,
    line,
    over_odds,
    under_odds,
    model_probability,
    probability_edge,
    expected_value,
    confidence,
    stake_pct,
    locked_at,
    settlement_status,
    result,
    pnl_units,
    home_goals_90,
    away_goals_90,
    settled_at,
    raw_row,
    updated_at
  )
  select
    row_data ->> 'pickKey',
    v_policy_id,
    v_run_id,
    v_run_id,
    row_data ->> 'matchId',
    (row_data ->> 'matchDate')::date,
    row_data ->> 'homeTeam',
    row_data ->> 'awayTeam',
    row_data ->> 'market',
    row_data ->> 'side',
    row_data ->> 'sportsbook',
    (row_data ->> 'quoteTimestamp')::timestamptz,
    nullif(row_data ->> 'firstSeenTimestamp', '')::timestamptz,
    (row_data ->> 'line')::numeric,
    (row_data ->> 'overOdds')::numeric,
    nullif(row_data ->> 'underOdds', '')::numeric,
    (row_data ->> 'modelProbability')::numeric,
    nullif(row_data ->> 'probabilityEdge', '')::numeric,
    (row_data ->> 'expectedValue')::numeric,
    (row_data ->> 'confidence')::numeric,
    (row_data ->> 'stakePct')::numeric,
    (row_data ->> 'lockedAt')::timestamptz,
    row_data ->> 'settlementStatus',
    row_data ->> 'result',
    nullif(row_data ->> 'pnlUnits', '')::numeric,
    nullif(row_data ->> 'homeGoals90', '')::numeric,
    nullif(row_data ->> 'awayGoals90', '')::numeric,
    nullif(row_data ->> 'settledAt', '')::timestamptz,
    row_data,
    now()
  from jsonb_array_elements(coalesce(p_payload -> 'picks', '[]'::jsonb)) row_data
  on conflict (policy_id, match_id) do update
  set
    last_seen_run_id = excluded.last_seen_run_id,
    settlement_status = case
      when excluded.settlement_status = 'settled' then excluded.settlement_status
      else public.nwsl_model_picks.settlement_status
    end,
    result = case
      when excluded.settlement_status = 'settled' then excluded.result
      else public.nwsl_model_picks.result
    end,
    pnl_units = case
      when excluded.settlement_status = 'settled' then excluded.pnl_units
      else public.nwsl_model_picks.pnl_units
    end,
    home_goals_90 = case
      when excluded.settlement_status = 'settled' then excluded.home_goals_90
      else public.nwsl_model_picks.home_goals_90
    end,
    away_goals_90 = case
      when excluded.settlement_status = 'settled' then excluded.away_goals_90
      else public.nwsl_model_picks.away_goals_90
    end,
    settled_at = case
      when excluded.settlement_status = 'settled' then excluded.settled_at
      else public.nwsl_model_picks.settled_at
    end,
    raw_row = excluded.raw_row,
    updated_at = now();

  get diagnostics v_pick_count = row_count;

  return jsonb_build_object(
    'runId', v_run_id,
    'runKey', v_run_key,
    'slateRows', v_slate_count,
    'lockedPicksProcessed', v_pick_count
  );
end;
$$;

revoke all on function public.publish_nwsl_model_snapshot(jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_nwsl_model_snapshot(jsonb)
  to service_role;

comment on table public.nwsl_model_runs is
  'Successful automated NWSL model publications. Failed pipelines do not write a run.';
comment on table public.nwsl_model_slate_rows is
  'Complete evaluated slate for each published run, including explicit no-bet reasons.';
comment on table public.nwsl_model_picks is
  'Immutable first-seen locked policy picks with settlement-only updates.';
