-- Strengthen the already-deployed NWSL snapshot RPC without changing its
-- public signature. The v1 implementation moves into a non-exposed schema;
-- the public wrapper validates fantasy and appearance reconciliation before
-- entering the original advisory-locked, all-or-nothing publisher.

create schema if not exists nwsl_internal;

revoke all on schema nwsl_internal from public, anon, authenticated;
grant usage on schema nwsl_internal to service_role;

alter function public.publish_nwsl_data_snapshot(jsonb)
  set schema nwsl_internal;
alter function nwsl_internal.publish_nwsl_data_snapshot(jsonb)
  rename to publish_nwsl_data_snapshot_v1;

revoke all on function nwsl_internal.publish_nwsl_data_snapshot_v1(jsonb)
  from public, anon, authenticated;
grant execute
  on function nwsl_internal.publish_nwsl_data_snapshot_v1(jsonb)
  to service_role;

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
    where (season_row ->> 'gamesPlayed')::integer
          <> coalesce(match_totals.match_count, 0)
  ) then
    raise exception 'player games played does not match player-match row count';
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

revoke all
  on function nwsl_internal.validate_nwsl_data_reconciliation(jsonb)
  from public, anon, authenticated;
grant execute
  on function nwsl_internal.validate_nwsl_data_reconciliation(jsonb)
  to service_role;

create or replace function public.publish_nwsl_data_snapshot(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user <> 'service_role' then
    raise exception 'service role required';
  end if;

  perform nwsl_internal.validate_nwsl_data_reconciliation(p_payload);
  return nwsl_internal.publish_nwsl_data_snapshot_v1(p_payload);
end;
$$;

revoke all on function public.publish_nwsl_data_snapshot(jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_nwsl_data_snapshot(jsonb)
  to service_role;

comment on function public.publish_nwsl_data_snapshot(jsonb) is
  'Service-role NWSL snapshot boundary with appearance and fantasy reconciliation.';
