alter table public.fantasy_league_memberships
  add column if not exists waiver_priority integer;

create or replace function public.set_fantasy_membership_waiver_priority()
returns trigger
language plpgsql
as $$
begin
  if new.waiver_priority is null then
    select coalesce(max(memberships.waiver_priority), 0) + 1
      into new.waiver_priority
    from public.fantasy_league_memberships memberships
    where memberships.league_id = new.league_id;
  end if;

  return new;
end;
$$;

drop trigger if exists fantasy_membership_set_waiver_priority on public.fantasy_league_memberships;
create trigger fantasy_membership_set_waiver_priority
  before insert on public.fantasy_league_memberships
  for each row
  execute function public.set_fantasy_membership_waiver_priority();

with ranked_memberships as (
  select
    id,
    row_number() over (
      partition by league_id
      order by joined_at asc, id asc
    ) as next_priority
  from public.fantasy_league_memberships
)
update public.fantasy_league_memberships memberships
set waiver_priority = ranked_memberships.next_priority
from ranked_memberships
where memberships.id = ranked_memberships.id
  and memberships.waiver_priority is distinct from ranked_memberships.next_priority;

create unique index if not exists fantasy_league_memberships_league_waiver_priority_key
  on public.fantasy_league_memberships (league_id, waiver_priority)
  where waiver_priority is not null;

create table if not exists public.fantasy_waiver_claims (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  requested_player_id text not null,
  requested_player_name text not null,
  requested_player_position text not null check (requested_player_position in ('GK', 'DEF', 'MID', 'FWD')),
  requested_club_name text not null,
  drop_roster_slot_id uuid references public.fantasy_roster_slots (id) on delete set null,
  dropped_player_id text,
  dropped_player_name text,
  dropped_player_position text check (dropped_player_position is null or dropped_player_position in ('GK', 'DEF', 'MID', 'FWD')),
  dropped_club_name text,
  priority_at_submission integer not null check (priority_at_submission >= 1),
  status text not null default 'pending' check (status in ('pending', 'won', 'lost', 'canceled')),
  resolution_note text,
  processed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists fantasy_waiver_claims_league_status_idx
  on public.fantasy_waiver_claims (league_id, status, priority_at_submission, created_at);

create index if not exists fantasy_waiver_claims_user_idx
  on public.fantasy_waiver_claims (user_id, created_at desc);

create table if not exists public.fantasy_transactions (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('waiver_add', 'free_agent_add', 'drop', 'commissioner')),
  status text not null default 'processed' check (status in ('pending', 'processed', 'rejected')),
  player_id text not null,
  player_name text not null,
  player_position text not null check (player_position in ('GK', 'DEF', 'MID', 'FWD')),
  club_name text not null,
  related_waiver_claim_id uuid references public.fantasy_waiver_claims (id) on delete set null,
  dropped_player_id text,
  dropped_player_name text,
  dropped_player_position text check (dropped_player_position is null or dropped_player_position in ('GK', 'DEF', 'MID', 'FWD')),
  dropped_club_name text,
  note text,
  processed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists fantasy_transactions_league_created_idx
  on public.fantasy_transactions (league_id, created_at desc);

create index if not exists fantasy_transactions_user_created_idx
  on public.fantasy_transactions (user_id, created_at desc);

alter table public.fantasy_waiver_claims enable row level security;
alter table public.fantasy_transactions enable row level security;

grant select, insert, update on public.fantasy_waiver_claims to authenticated;
grant select, insert on public.fantasy_transactions to authenticated;

drop policy if exists fantasy_waiver_claims_select_member on public.fantasy_waiver_claims;
create policy fantasy_waiver_claims_select_member
  on public.fantasy_waiver_claims
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.fantasy_league_memberships memberships
      where memberships.league_id = fantasy_waiver_claims.league_id
        and memberships.user_id = auth.uid()
    )
  );

drop policy if exists fantasy_waiver_claims_insert_self on public.fantasy_waiver_claims;
create policy fantasy_waiver_claims_insert_self
  on public.fantasy_waiver_claims
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.fantasy_league_memberships memberships
      where memberships.league_id = fantasy_waiver_claims.league_id
        and memberships.user_id = auth.uid()
    )
  );

drop policy if exists fantasy_waiver_claims_update_self_or_commissioner on public.fantasy_waiver_claims;
create policy fantasy_waiver_claims_update_self_or_commissioner
  on public.fantasy_waiver_claims
  for update
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.fantasy_leagues leagues
      where leagues.id = fantasy_waiver_claims.league_id
        and leagues.commissioner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.fantasy_league_memberships memberships
      where memberships.league_id = fantasy_waiver_claims.league_id
        and memberships.user_id = fantasy_waiver_claims.user_id
    )
    and (
      user_id = auth.uid()
      or exists (
        select 1
        from public.fantasy_leagues leagues
        where leagues.id = fantasy_waiver_claims.league_id
          and leagues.commissioner_user_id = auth.uid()
      )
    )
  );

drop policy if exists fantasy_transactions_select_member on public.fantasy_transactions;
create policy fantasy_transactions_select_member
  on public.fantasy_transactions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.fantasy_league_memberships memberships
      where memberships.league_id = fantasy_transactions.league_id
        and memberships.user_id = auth.uid()
    )
  );

drop policy if exists fantasy_transactions_insert_actor_or_commissioner on public.fantasy_transactions;
create policy fantasy_transactions_insert_actor_or_commissioner
  on public.fantasy_transactions
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.fantasy_league_memberships memberships
      where memberships.league_id = fantasy_transactions.league_id
        and memberships.user_id = auth.uid()
    )
    and (
      user_id = auth.uid()
      or exists (
        select 1
        from public.fantasy_leagues leagues
        where leagues.id = fantasy_transactions.league_id
          and leagues.commissioner_user_id = auth.uid()
      )
    )
  );
