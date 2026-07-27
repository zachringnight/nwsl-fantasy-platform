-- Represent provider-limited player match-log history honestly. Official
-- season appearances remain `games_played`; the two new fields state how many
-- of those appearances have exact published match rows and whether that
-- per-player history is complete.

alter table public.nwsl_player_season_stats
  add column match_stats_appearances integer not null default 0
    check (match_stats_appearances between 0 and 100000),
  add column match_stats_complete boolean not null default false;

with player_coverage as (
  select
    season_stats.season,
    season_stats.player_id,
    season_stats.games_played,
    count(match_stats.player_id)::integer as tracked_appearances
  from public.nwsl_player_season_stats season_stats
  left join public.nwsl_player_match_stats match_stats
    on match_stats.season = season_stats.season
    and match_stats.player_id = season_stats.player_id
  group by
    season_stats.season,
    season_stats.player_id,
    season_stats.games_played
)
update public.nwsl_player_season_stats season_stats
set
  match_stats_appearances = player_coverage.tracked_appearances,
  match_stats_complete = (
    player_coverage.tracked_appearances = player_coverage.games_played
  )
from player_coverage
where season_stats.season = player_coverage.season
  and season_stats.player_id = player_coverage.player_id;

create or replace function nwsl_internal.validate_nwsl_data_reconciliation(
  p_payload jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user <> 'service_role' then
    raise exception 'service role required';
  end if;

  if pg_catalog.jsonb_typeof(
       coalesce(p_payload -> 'playerSeasonStats', 'null'::jsonb)
     ) <> 'array'
     or pg_catalog.jsonb_typeof(
       coalesce(p_payload -> 'playerMatchStats', 'null'::jsonb)
     ) <> 'array' then
    raise exception 'player stat collections have invalid types';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      p_payload -> 'playerMatchStats'
    ) match_row
    where pg_catalog.jsonb_typeof(
      coalesce(match_row -> 'fantasyBreakdown', 'null'::jsonb)
    ) <> 'object'
  ) then
    raise exception 'player-match fantasy breakdown must be an object';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      p_payload -> 'playerMatchStats'
    ) match_row
    cross join lateral pg_catalog.jsonb_each(
      match_row -> 'fantasyBreakdown'
    ) breakdown
    where pg_catalog.jsonb_typeof(breakdown.value) <> 'number'
  ) then
    raise exception 'player-match fantasy breakdown values must be numeric';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      p_payload -> 'playerMatchStats'
    ) match_row
    where pg_catalog.abs(
      (match_row ->> 'fantasyPoints')::numeric
      - coalesce(
        (
          select sum((breakdown.value::text)::numeric)
          from pg_catalog.jsonb_each(
            match_row -> 'fantasyBreakdown'
          ) breakdown
        ),
        0::numeric
      )
    ) > 0.000001::numeric
  ) then
    raise exception 'player-match fantasy breakdown total mismatch';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      p_payload -> 'playerMatchStats'
    ) match_row
    where not exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        p_payload -> 'playerSeasonStats'
      ) season_row
      where season_row ->> 'playerId' = match_row ->> 'playerId'
    )
  ) then
    raise exception 'player-match row has no player season row';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      p_payload -> 'playerSeasonStats'
    ) season_row
    where (season_row ->> 'matchStatsAppearances')::integer
          > (season_row ->> 'gamesPlayed')::integer
  ) then
    raise exception 'player tracked appearances exceed games played';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      p_payload -> 'playerSeasonStats'
    ) season_row
    where (season_row ->> 'matchStatsComplete')::boolean is distinct from (
      (season_row ->> 'matchStatsAppearances')::integer
      = (season_row ->> 'gamesPlayed')::integer
    )
  ) then
    raise exception 'player match-stat completeness flag mismatch';
  end if;

  if exists (
    with match_totals as (
      select
        match_row ->> 'playerId' as player_id,
        count(*) as match_count,
        coalesce(
          sum((match_row ->> 'fantasyPoints')::numeric),
          0::numeric
        ) as fantasy_points
      from pg_catalog.jsonb_array_elements(
        p_payload -> 'playerMatchStats'
      ) match_row
      group by match_row ->> 'playerId'
    )
    select 1
    from pg_catalog.jsonb_array_elements(
      p_payload -> 'playerSeasonStats'
    ) season_row
    left join match_totals
      on match_totals.player_id = season_row ->> 'playerId'
    where (season_row ->> 'matchStatsAppearances')::integer
          <> coalesce(match_totals.match_count, 0)
  ) then
    raise exception
      'player tracked appearances do not match player-match row count';
  end if;

  if exists (
    with match_totals as (
      select
        match_row ->> 'playerId' as player_id,
        coalesce(
          sum((match_row ->> 'fantasyPoints')::numeric),
          0::numeric
        ) as fantasy_points
      from pg_catalog.jsonb_array_elements(
        p_payload -> 'playerMatchStats'
      ) match_row
      group by match_row ->> 'playerId'
    )
    select 1
    from pg_catalog.jsonb_array_elements(
      p_payload -> 'playerSeasonStats'
    ) season_row
    left join match_totals
      on match_totals.player_id = season_row ->> 'playerId'
    where pg_catalog.abs(
      (season_row ->> 'fantasyPoints')::numeric
      - coalesce(match_totals.fantasy_points, 0::numeric)
    ) > 0.000001::numeric
  ) then
    raise exception
      'player season fantasy points do not match player-match total';
  end if;
end;
$$;

create or replace function public.publish_nwsl_data_snapshot(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_publication jsonb;
  v_run_id uuid;
  v_expected_rows integer;
  v_updated_rows integer;
begin
  if current_user <> 'service_role' then
    raise exception 'service role required';
  end if;

  perform nwsl_internal.validate_nwsl_data_reconciliation(p_payload);
  v_publication :=
    nwsl_internal.publish_nwsl_data_snapshot_v1(p_payload);
  v_run_id := (v_publication ->> 'runId')::uuid;
  v_expected_rows :=
    pg_catalog.jsonb_array_length(p_payload -> 'playerSeasonStats');

  update public.nwsl_player_season_stats season_stats
  set
    match_stats_appearances = payload_row."matchStatsAppearances",
    match_stats_complete = payload_row."matchStatsComplete",
    updated_at = now()
  from pg_catalog.jsonb_to_recordset(
    p_payload -> 'playerSeasonStats'
  ) as payload_row(
    "playerId" text,
    "matchStatsAppearances" integer,
    "matchStatsComplete" boolean
  )
  where season_stats.season = 2026
    and season_stats.player_id = payload_row."playerId"
    and season_stats.data_run_id = v_run_id;

  get diagnostics v_updated_rows = row_count;
  if v_updated_rows <> v_expected_rows then
    raise exception 'player match coverage persistence count mismatch';
  end if;

  return v_publication;
end;
$$;

revoke all on function public.publish_nwsl_data_snapshot(jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_nwsl_data_snapshot(jsonb)
  to service_role;

comment on column public.nwsl_player_season_stats.match_stats_appearances is
  'Exact player-match rows currently published for this season aggregate.';
comment on column public.nwsl_player_season_stats.match_stats_complete is
  'True exactly when match_stats_appearances equals official games_played.';
comment on function public.publish_nwsl_data_snapshot(jsonb) is
  'Service-role NWSL snapshot boundary with explicit partial match-stat coverage.';
