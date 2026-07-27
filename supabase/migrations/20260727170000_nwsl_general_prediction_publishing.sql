-- Traceable, deployment-independent general NWSL match projections.
--
-- This lane is deliberately separate from the frozen DraftKings Over 2.5
-- policy tables. A stable model version is published atomically with every
-- eligible future fixture and can be safely retried after a lost response.

create table if not exists public.nwsl_prediction_runs (
  id bigint generated always as identity primary key,
  run_key text not null unique,
  schema_version integer not null default 1 check (schema_version = 1),
  model_version text not null,
  model_family text not null check (model_family = 'spi_lite_baseline'),
  training_cutoff date not null,
  source_manifest_generated_at timestamptz not null,
  generated_at timestamptz not null,
  gating_status text not null
    check (gating_status in ('current', 'degraded_context')),
  feature_status text not null
    check (feature_status in ('complete', 'partial')),
  row_count integer not null check (row_count between 1 and 500),
  first_prediction_date date not null,
  last_prediction_date date not null,
  quality jsonb not null default '{}'::jsonb,
  payload_checksum text not null check (payload_checksum ~ '^[0-9a-f]{64}$'),
  published_at timestamptz not null default now(),
  constraint nwsl_prediction_runs_status_consistency check (
    (
      gating_status = 'current'
      and feature_status = 'complete'
    )
    or (
      gating_status = 'degraded_context'
      and feature_status = 'partial'
    )
  ),
  constraint nwsl_prediction_runs_date_order check (
    training_cutoff <= generated_at::date
    and first_prediction_date <= last_prediction_date
    and first_prediction_date >= generated_at::date
  )
);

create index if not exists nwsl_prediction_runs_generated_idx
  on public.nwsl_prediction_runs (generated_at desc);

create table if not exists public.nwsl_match_predictions (
  id bigint generated always as identity primary key,
  run_id bigint not null
    references public.nwsl_prediction_runs (id) on delete cascade,
  match_id text not null,
  match_date date not null,
  match_status text not null check (match_status = 'upcoming'),
  home_team text not null,
  away_team text not null,
  home_probability numeric not null
    check (home_probability between 0 and 1),
  draw_probability numeric not null
    check (draw_probability between 0 and 1),
  away_probability numeric not null
    check (away_probability between 0 and 1),
  lambda_home numeric not null check (lambda_home > 0 and lambda_home <= 10),
  lambda_away numeric not null check (lambda_away > 0 and lambda_away <= 10),
  btts_yes_probability numeric not null
    check (btts_yes_probability between 0 and 1),
  over_under jsonb not null default '{}'::jsonb,
  asian_handicap jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint nwsl_match_predictions_distinct_teams
    check (home_team <> away_team),
  constraint nwsl_match_predictions_probability_sum check (
    pg_catalog.abs(
      home_probability + draw_probability + away_probability - 1
    ) <= 0.001
  ),
  constraint nwsl_match_predictions_run_match_key unique (run_id, match_id)
);

create index if not exists nwsl_match_predictions_run_date_idx
  on public.nwsl_match_predictions (run_id, match_date, match_id);

alter table public.nwsl_prediction_runs enable row level security;
alter table public.nwsl_match_predictions enable row level security;

revoke all on table public.nwsl_prediction_runs
  from public, anon, authenticated;
revoke all on table public.nwsl_match_predictions
  from public, anon, authenticated;
revoke all on sequence public.nwsl_prediction_runs_id_seq
  from public, anon, authenticated;
revoke all on sequence public.nwsl_match_predictions_id_seq
  from public, anon, authenticated;

grant select, insert on table public.nwsl_prediction_runs to service_role;
grant select, insert on table public.nwsl_match_predictions to service_role;
grant usage, select on sequence public.nwsl_prediction_runs_id_seq
  to service_role;
grant usage, select on sequence public.nwsl_match_predictions_id_seq
  to service_role;

create or replace function public.publish_nwsl_prediction_snapshot(
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run_id bigint;
  v_run_key text := p_payload #>> '{run,runKey}';
  v_model_version text := p_payload #>> '{run,modelVersion}';
  v_generated_at timestamptz;
  v_source_manifest_generated_at timestamptz;
  v_row_count integer;
  v_first_date date;
  v_last_date date;
  v_payload_checksum text := p_payload #>> '{run,payloadChecksum}';
  v_existing_checksum text;
  v_existing_count integer;
begin
  if current_user <> 'service_role' then
    raise exception 'service role required';
  end if;
  if p_payload is null
     or pg_catalog.jsonb_typeof(p_payload) <> 'object'
     or pg_catalog.pg_column_size(p_payload) > 2000000 then
    raise exception 'invalid or oversized payload';
  end if;
  if coalesce((p_payload ->> 'schemaVersion')::integer, 0) <> 1 then
    raise exception 'unsupported schema version';
  end if;
  if pg_catalog.jsonb_typeof(
       coalesce(p_payload -> 'predictions', 'null'::jsonb)
     ) <> 'array' then
    raise exception 'predictions must be an array';
  end if;
  if coalesce(v_run_key, '') <> ('nwsl-general:' || v_model_version) then
    raise exception 'run key does not match model version';
  end if;
  if coalesce(p_payload #>> '{run,modelFamily}', '')
       <> 'spi_lite_baseline' then
    raise exception 'unsupported model family';
  end if;
  if coalesce(p_payload #>> '{run,gatingStatus}', '') not in (
       'current',
       'degraded_context'
     )
     or coalesce(p_payload #>> '{run,featureStatus}', '') not in (
       'complete',
       'partial'
     ) then
    raise exception 'invalid model quality status';
  end if;
  if (
       p_payload #>> '{run,gatingStatus}' = 'current'
       and p_payload #>> '{run,featureStatus}' <> 'complete'
     )
     or (
       p_payload #>> '{run,gatingStatus}' = 'degraded_context'
       and p_payload #>> '{run,featureStatus}' <> 'partial'
     ) then
    raise exception 'model quality statuses disagree';
  end if;
  if coalesce(v_payload_checksum, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid payload checksum';
  end if;

  begin
    v_generated_at := (p_payload #>> '{run,generatedAt}')::timestamptz;
    v_source_manifest_generated_at :=
      (p_payload #>> '{run,sourceManifestGeneratedAt}')::timestamptz;
  exception
    when others then
      raise exception 'invalid lineage timestamps';
  end;
  if v_generated_at > pg_catalog.statement_timestamp() + interval '10 minutes'
     or v_generated_at < pg_catalog.statement_timestamp() - interval '48 hours'
     or v_source_manifest_generated_at > v_generated_at + interval '10 minutes'
     or (p_payload #>> '{run,trainingCutoff}')::date > v_generated_at::date then
    raise exception 'lineage timestamp is outside the publication window';
  end if;

  v_row_count :=
    pg_catalog.jsonb_array_length(p_payload -> 'predictions');
  if v_row_count <> (p_payload #>> '{run,rowCount}')::integer
     or v_row_count < 1
     or v_row_count > 500 then
    raise exception 'prediction row count mismatch';
  end if;
  select
    min((row_data ->> 'matchDate')::date),
    max((row_data ->> 'matchDate')::date)
  into v_first_date, v_last_date
  from pg_catalog.jsonb_array_elements(
    p_payload -> 'predictions'
  ) row_data;
  if v_first_date <> (p_payload #>> '{run,firstPredictionDate}')::date
     or v_last_date <> (p_payload #>> '{run,lastPredictionDate}')::date
     or v_first_date < v_generated_at::date then
    raise exception 'prediction date range mismatch';
  end if;
  if (
    select count(distinct row_data ->> 'matchId')
    from pg_catalog.jsonb_array_elements(
      p_payload -> 'predictions'
    ) row_data
  ) <> v_row_count then
    raise exception 'duplicate prediction match IDs';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      p_payload -> 'predictions'
    ) row_data
    where row_data ->> 'matchStatus' <> 'upcoming'
      or (row_data ->> 'matchDate')::date < v_generated_at::date
      or coalesce(row_data ->> 'homeTeam', '')
         = coalesce(row_data ->> 'awayTeam', '')
      or pg_catalog.abs(
        (row_data ->> 'homeProbability')::numeric
        + (row_data ->> 'drawProbability')::numeric
        + (row_data ->> 'awayProbability')::numeric
        - 1
      ) > 0.001
  ) then
    raise exception 'prediction row failed eligibility or probability checks';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('public.publish_nwsl_prediction_snapshot')
  );

  select id, payload_checksum, row_count
  into v_run_id, v_existing_checksum, v_existing_count
  from public.nwsl_prediction_runs
  where run_key = v_run_key;

  if v_run_id is not null then
    if v_existing_checksum <> v_payload_checksum
       or v_existing_count <> v_row_count then
      raise exception 'stable run key already exists with different content';
    end if;
    return pg_catalog.jsonb_build_object(
      'runId', v_run_id,
      'runKey', v_run_key,
      'modelVersion', v_model_version,
      'rowCount', v_existing_count,
      'payloadChecksum', v_existing_checksum,
      'idempotent', true
    );
  end if;

  insert into public.nwsl_prediction_runs (
    run_key,
    schema_version,
    model_version,
    model_family,
    training_cutoff,
    source_manifest_generated_at,
    generated_at,
    gating_status,
    feature_status,
    row_count,
    first_prediction_date,
    last_prediction_date,
    quality,
    payload_checksum
  )
  values (
    v_run_key,
    1,
    v_model_version,
    p_payload #>> '{run,modelFamily}',
    (p_payload #>> '{run,trainingCutoff}')::date,
    v_source_manifest_generated_at,
    v_generated_at,
    p_payload #>> '{run,gatingStatus}',
    p_payload #>> '{run,featureStatus}',
    v_row_count,
    v_first_date,
    v_last_date,
    coalesce(p_payload #> '{run,quality}', '{}'::jsonb),
    v_payload_checksum
  )
  returning id into v_run_id;

  insert into public.nwsl_match_predictions (
    run_id,
    match_id,
    match_date,
    match_status,
    home_team,
    away_team,
    home_probability,
    draw_probability,
    away_probability,
    lambda_home,
    lambda_away,
    btts_yes_probability,
    over_under,
    asian_handicap
  )
  select
    v_run_id,
    row_data ->> 'matchId',
    (row_data ->> 'matchDate')::date,
    row_data ->> 'matchStatus',
    row_data ->> 'homeTeam',
    row_data ->> 'awayTeam',
    (row_data ->> 'homeProbability')::numeric,
    (row_data ->> 'drawProbability')::numeric,
    (row_data ->> 'awayProbability')::numeric,
    (row_data ->> 'lambdaHome')::numeric,
    (row_data ->> 'lambdaAway')::numeric,
    (row_data ->> 'bttsYesProbability')::numeric,
    coalesce(row_data -> 'overUnder', '{}'::jsonb),
    coalesce(row_data -> 'asianHandicap', '{}'::jsonb)
  from pg_catalog.jsonb_array_elements(
    p_payload -> 'predictions'
  ) row_data;

  get diagnostics v_existing_count = row_count;
  if v_existing_count <> v_row_count then
    raise exception 'prediction persistence count mismatch';
  end if;

  return pg_catalog.jsonb_build_object(
    'runId', v_run_id,
    'runKey', v_run_key,
    'modelVersion', v_model_version,
    'rowCount', v_row_count,
    'payloadChecksum', v_payload_checksum,
    'idempotent', false
  );
end;
$$;

revoke all on function public.publish_nwsl_prediction_snapshot(jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_nwsl_prediction_snapshot(jsonb)
  to service_role;

comment on table public.nwsl_prediction_runs is
  'Atomic general-projection runs with model lineage and feature quality.';
comment on table public.nwsl_match_predictions is
  'Eligible upcoming NWSL match probabilities for one traceable model run.';
comment on function public.publish_nwsl_prediction_snapshot(jsonb) is
  'Idempotently publishes one complete general-projection snapshot.';
