create table if not exists public.fantasy_week_settlements (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues(id) on delete cascade,
  week_key text not null,
  results jsonb not null default '[]'::jsonb,
  settled_at timestamptz not null default now(),
  unique (league_id, week_key)
);

create index if not exists fantasy_week_settlements_league_idx
  on public.fantasy_week_settlements (league_id, settled_at desc);

alter table public.fantasy_week_settlements enable row level security;

drop policy if exists "League members can read week settlements"
  on public.fantasy_week_settlements;
create policy "League members can read week settlements"
  on public.fantasy_week_settlements for select
  using (
    exists (
      select 1 from public.fantasy_league_memberships membership
      where membership.league_id = fantasy_week_settlements.league_id
        and membership.user_id = auth.uid()
    )
  );

drop policy if exists "League members can create week settlements"
  on public.fantasy_week_settlements;
create policy "League members can create week settlements"
  on public.fantasy_week_settlements for insert
  with check (
    exists (
      select 1 from public.fantasy_league_memberships membership
      where membership.league_id = fantasy_week_settlements.league_id
        and membership.user_id = auth.uid()
    )
  );
