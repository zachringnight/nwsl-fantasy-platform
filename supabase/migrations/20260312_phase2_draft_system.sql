alter table public.fantasy_league_memberships
  add column if not exists draft_slot integer;

create unique index if not exists fantasy_league_memberships_league_draft_slot_key
  on public.fantasy_league_memberships (league_id, draft_slot)
  where draft_slot is not null;

create table if not exists public.fantasy_drafts (
  league_id uuid primary key references public.fantasy_leagues (id) on delete cascade,
  status text not null default 'scheduled' check (status in ('scheduled', 'lobby', 'live', 'paused', 'complete')),
  total_rounds integer not null default 12 check (total_rounds between 1 and 20),
  order_revealed_at timestamptz,
  current_pick_started_at timestamptz,
  started_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.fantasy_draft_picks (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues (id) on delete cascade,
  round_number integer not null check (round_number >= 1),
  pick_number integer not null check (pick_number >= 1),
  overall_pick integer not null check (overall_pick >= 1),
  membership_id uuid not null references public.fantasy_league_memberships (id) on delete cascade,
  manager_user_id uuid not null references auth.users (id) on delete cascade,
  player_id text not null,
  player_name text not null,
  player_position text not null check (player_position in ('GK', 'DEF', 'MID', 'FWD')),
  club_name text not null,
  source text not null check (source in ('manual', 'queue', 'autopick', 'commissioner')),
  picked_at timestamptz not null default timezone('utc', now()),
  unique (league_id, overall_pick),
  unique (league_id, player_id)
);

create index if not exists fantasy_draft_picks_league_id_idx
  on public.fantasy_draft_picks (league_id, overall_pick);

create index if not exists fantasy_draft_picks_league_manager_idx
  on public.fantasy_draft_picks (league_id, manager_user_id);

create table if not exists public.fantasy_draft_queue_items (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  player_id text not null,
  player_name text not null,
  player_position text not null check (player_position in ('GK', 'DEF', 'MID', 'FWD')),
  club_name text not null,
  priority integer not null default 1 check (priority >= 1),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (league_id, user_id, player_id)
);

create index if not exists fantasy_draft_queue_items_lookup_idx
  on public.fantasy_draft_queue_items (league_id, user_id, priority, created_at);

create table if not exists public.fantasy_roster_slots (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  player_id text not null,
  player_name text not null,
  player_position text not null check (player_position in ('GK', 'DEF', 'MID', 'FWD')),
  club_name text not null,
  acquisition_source text not null default 'draft' check (acquisition_source in ('draft', 'waiver', 'free_agent', 'commissioner')),
  lineup_slot text check (lineup_slot in ('GK', 'DEF_1', 'DEF_2', 'MID_1', 'MID_2', 'MID_3', 'FWD_1', 'FWD_2', 'FLEX', 'BENCH_1', 'BENCH_2', 'BENCH_3')),
  acquired_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (league_id, player_id),
  unique (league_id, user_id, lineup_slot)
);

create index if not exists fantasy_roster_slots_league_user_idx
  on public.fantasy_roster_slots (league_id, user_id);

alter table public.fantasy_drafts enable row level security;
alter table public.fantasy_draft_picks enable row level security;
alter table public.fantasy_draft_queue_items enable row level security;
alter table public.fantasy_roster_slots enable row level security;

grant select, insert, update, delete on public.fantasy_drafts to authenticated;
grant select, insert, update, delete on public.fantasy_draft_picks to authenticated;
grant select, insert, update, delete on public.fantasy_draft_queue_items to authenticated;
grant select, insert, update, delete on public.fantasy_roster_slots to authenticated;
grant update on public.fantasy_league_memberships to authenticated;

drop policy if exists fantasy_memberships_update_commissioner on public.fantasy_league_memberships;
create policy fantasy_memberships_update_commissioner
  on public.fantasy_league_memberships
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.fantasy_leagues leagues
      where leagues.id = fantasy_league_memberships.league_id
        and leagues.commissioner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.fantasy_leagues leagues
      where leagues.id = fantasy_league_memberships.league_id
        and leagues.commissioner_user_id = auth.uid()
    )
  );

drop policy if exists fantasy_drafts_select_member on public.fantasy_drafts;
create policy fantasy_drafts_select_member
  on public.fantasy_drafts
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.fantasy_league_memberships memberships
      where memberships.league_id = fantasy_drafts.league_id
        and memberships.user_id = auth.uid()
    )
  );

drop policy if exists fantasy_drafts_insert_commissioner on public.fantasy_drafts;
create policy fantasy_drafts_insert_commissioner
  on public.fantasy_drafts
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.fantasy_leagues leagues
      where leagues.id = fantasy_drafts.league_id
        and leagues.commissioner_user_id = auth.uid()
    )
  );

drop policy if exists fantasy_drafts_update_commissioner on public.fantasy_drafts;
create policy fantasy_drafts_update_commissioner
  on public.fantasy_drafts
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.fantasy_leagues leagues
      where leagues.id = fantasy_drafts.league_id
        and leagues.commissioner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.fantasy_leagues leagues
      where leagues.id = fantasy_drafts.league_id
        and leagues.commissioner_user_id = auth.uid()
    )
  );

drop policy if exists fantasy_draft_picks_select_member on public.fantasy_draft_picks;
create policy fantasy_draft_picks_select_member
  on public.fantasy_draft_picks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.fantasy_league_memberships memberships
      where memberships.league_id = fantasy_draft_picks.league_id
        and memberships.user_id = auth.uid()
    )
  );

drop policy if exists fantasy_draft_picks_insert_actor on public.fantasy_draft_picks;
create policy fantasy_draft_picks_insert_actor
  on public.fantasy_draft_picks
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.fantasy_league_memberships memberships
      where memberships.id = fantasy_draft_picks.membership_id
        and memberships.league_id = fantasy_draft_picks.league_id
        and memberships.user_id = fantasy_draft_picks.manager_user_id
    )
    and (
      fantasy_draft_picks.manager_user_id = auth.uid()
      or exists (
        select 1
        from public.fantasy_leagues leagues
        where leagues.id = fantasy_draft_picks.league_id
          and leagues.commissioner_user_id = auth.uid()
      )
    )
  );

drop policy if exists fantasy_draft_queue_items_select_self on public.fantasy_draft_queue_items;
create policy fantasy_draft_queue_items_select_self
  on public.fantasy_draft_queue_items
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists fantasy_draft_queue_items_insert_self on public.fantasy_draft_queue_items;
create policy fantasy_draft_queue_items_insert_self
  on public.fantasy_draft_queue_items
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.fantasy_league_memberships memberships
      where memberships.league_id = fantasy_draft_queue_items.league_id
        and memberships.user_id = auth.uid()
    )
  );

drop policy if exists fantasy_draft_queue_items_update_self on public.fantasy_draft_queue_items;
create policy fantasy_draft_queue_items_update_self
  on public.fantasy_draft_queue_items
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.fantasy_league_memberships memberships
      where memberships.league_id = fantasy_draft_queue_items.league_id
        and memberships.user_id = auth.uid()
    )
  );

drop policy if exists fantasy_draft_queue_items_delete_self on public.fantasy_draft_queue_items;
create policy fantasy_draft_queue_items_delete_self
  on public.fantasy_draft_queue_items
  for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists fantasy_roster_slots_select_member on public.fantasy_roster_slots;
create policy fantasy_roster_slots_select_member
  on public.fantasy_roster_slots
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.fantasy_league_memberships memberships
      where memberships.league_id = fantasy_roster_slots.league_id
        and memberships.user_id = auth.uid()
    )
  );

drop policy if exists fantasy_roster_slots_insert_actor on public.fantasy_roster_slots;
create policy fantasy_roster_slots_insert_actor
  on public.fantasy_roster_slots
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.fantasy_league_memberships memberships
      where memberships.league_id = fantasy_roster_slots.league_id
        and memberships.user_id = fantasy_roster_slots.user_id
    )
    and (
      fantasy_roster_slots.user_id = auth.uid()
      or exists (
        select 1
        from public.fantasy_leagues leagues
        where leagues.id = fantasy_roster_slots.league_id
          and leagues.commissioner_user_id = auth.uid()
      )
    )
  );

drop policy if exists fantasy_roster_slots_update_self on public.fantasy_roster_slots;
create policy fantasy_roster_slots_update_self
  on public.fantasy_roster_slots
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.fantasy_league_memberships memberships
      where memberships.league_id = fantasy_roster_slots.league_id
        and memberships.user_id = auth.uid()
    )
  );
