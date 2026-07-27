-- Defense-in-depth guards for the frozen DraftKings Over 2.5 policy.
--
-- The application validates the same contract before invoking the RPC. These
-- database checks ensure a direct service-role call cannot publish a different
-- market, an old/future run, or a falsified quote age. Constraints are marked
-- NOT VALID so historical research rows remain readable while all new writes
-- are enforced.

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'nwsl_model_slate_rows_frozen_market_check'
      and conrelid = 'public.nwsl_model_slate_rows'::regclass
  ) then
    alter table public.nwsl_model_slate_rows
      add constraint nwsl_model_slate_rows_frozen_market_check
      check (
        line is null
        or (
          line = 2.5
          and sportsbook = 'DraftKings'
          and quote_timestamp is not null
          and over_odds > 1
          and under_odds > 1
          and quote_age_minutes is not null
          and quote_is_fresh
        )
      )
      not valid;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'nwsl_model_picks_frozen_market_check'
      and conrelid = 'public.nwsl_model_picks'::regclass
  ) then
    alter table public.nwsl_model_picks
      add constraint nwsl_model_picks_frozen_market_check
      check (
        line = 2.5
        and sportsbook = 'DraftKings'
      )
      not valid;
  end if;
end;
$$;

create or replace function public.guard_nwsl_model_run_freshness()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.generated_at > pg_catalog.statement_timestamp() + interval '10 minutes'
     or new.generated_at < pg_catalog.statement_timestamp() - interval '48 hours' then
    raise exception 'model run generated_at is outside the publish window';
  end if;
  return new;
end;
$$;

create or replace function public.guard_nwsl_model_quote_freshness()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_generated_at timestamptz;
  v_computed_age_minutes numeric;
begin
  if tg_table_name = 'nwsl_model_slate_rows'
     and new.quote_timestamp is null then
    return new;
  end if;

  select generated_at
  into v_generated_at
  from public.nwsl_model_runs
  where id = new.run_id;

  if v_generated_at is null then
    raise exception 'quote row is missing its model run';
  end if;

  if new.quote_timestamp is null
     or new.quote_age_minutes is null then
    raise exception 'quoted row requires timestamp and computed age';
  end if;

  v_computed_age_minutes := greatest(
    extract(epoch from (v_generated_at - new.quote_timestamp)) / 60.0,
    0
  );

  if new.quote_timestamp < v_generated_at - interval '180 minutes'
     or new.quote_timestamp > v_generated_at + interval '15 minutes' then
    raise exception 'quote timestamp is outside the model run freshness window';
  end if;

  if pg_catalog.abs(new.quote_age_minutes - v_computed_age_minutes) > 0.05 then
    raise exception 'supplied quote age does not match the quote timestamp';
  end if;

  return new;
end;
$$;

drop trigger if exists nwsl_model_runs_freshness_guard
  on public.nwsl_model_runs;
create trigger nwsl_model_runs_freshness_guard
before insert or update of generated_at
on public.nwsl_model_runs
for each row execute function public.guard_nwsl_model_run_freshness();

drop trigger if exists nwsl_model_slate_rows_quote_freshness_guard
  on public.nwsl_model_slate_rows;
create trigger nwsl_model_slate_rows_quote_freshness_guard
before insert or update of run_id, quote_timestamp, quote_age_minutes
on public.nwsl_model_slate_rows
for each row execute function public.guard_nwsl_model_quote_freshness();

drop trigger if exists nwsl_model_odds_snapshots_quote_freshness_guard
  on public.nwsl_model_odds_snapshots;
create trigger nwsl_model_odds_snapshots_quote_freshness_guard
before insert or update of run_id, quote_timestamp, quote_age_minutes
on public.nwsl_model_odds_snapshots
for each row execute function public.guard_nwsl_model_quote_freshness();

revoke all on function public.guard_nwsl_model_run_freshness()
  from public, anon, authenticated;
revoke all on function public.guard_nwsl_model_quote_freshness()
  from public, anon, authenticated;

comment on function public.guard_nwsl_model_run_freshness() is
  'Rejects model publications generated more than 48 hours ago or 10 minutes in the future.';
comment on function public.guard_nwsl_model_quote_freshness() is
  'Recomputes odds age from the owning run and rejects stale, future, or falsified quotes.';
