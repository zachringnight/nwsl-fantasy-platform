create table if not exists public.fantasy_salary_cap_entries (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_name text not null,
  status text not null default 'draft' check (status in ('draft', 'saved', 'submitted')),
  salary_spent integer not null default 0 check (salary_spent >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (league_id, user_id)
);

create index if not exists fantasy_salary_cap_entries_league_user_idx
  on public.fantasy_salary_cap_entries (league_id, user_id);

create table if not exists public.fantasy_salary_cap_entry_slots (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.fantasy_salary_cap_entries (id) on delete cascade,
  league_id uuid not null references public.fantasy_leagues (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  lineup_slot text not null check (lineup_slot in ('GK', 'DEF_1', 'DEF_2', 'MID_1', 'MID_2', 'MID_3', 'FWD_1', 'FWD_2', 'FLEX')),
  player_id text not null,
  player_name text not null,
  player_position text not null check (player_position in ('GK', 'DEF', 'MID', 'FWD')),
  club_name text not null,
  salary_cost integer not null check (salary_cost > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (entry_id, lineup_slot),
  unique (entry_id, player_id)
);

create index if not exists fantasy_salary_cap_entry_slots_entry_idx
  on public.fantasy_salary_cap_entry_slots (entry_id, lineup_slot);

alter table public.fantasy_salary_cap_entries enable row level security;
alter table public.fantasy_salary_cap_entry_slots enable row level security;

grant select, insert, update, delete on public.fantasy_salary_cap_entries to authenticated;
grant select, insert, update, delete on public.fantasy_salary_cap_entry_slots to authenticated;

drop policy if exists fantasy_salary_cap_entries_select_self on public.fantasy_salary_cap_entries;
create policy fantasy_salary_cap_entries_select_self
  on public.fantasy_salary_cap_entries
  for select
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.fantasy_league_memberships memberships
      where memberships.league_id = fantasy_salary_cap_entries.league_id
        and memberships.user_id = auth.uid()
    )
  );

drop policy if exists fantasy_salary_cap_entries_insert_self on public.fantasy_salary_cap_entries;
create policy fantasy_salary_cap_entries_insert_self
  on public.fantasy_salary_cap_entries
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.fantasy_league_memberships memberships
      where memberships.league_id = fantasy_salary_cap_entries.league_id
        and memberships.user_id = auth.uid()
    )
  );

drop policy if exists fantasy_salary_cap_entries_update_self on public.fantasy_salary_cap_entries;
create policy fantasy_salary_cap_entries_update_self
  on public.fantasy_salary_cap_entries
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.fantasy_league_memberships memberships
      where memberships.league_id = fantasy_salary_cap_entries.league_id
        and memberships.user_id = auth.uid()
    )
  );

drop policy if exists fantasy_salary_cap_entries_delete_self on public.fantasy_salary_cap_entries;
create policy fantasy_salary_cap_entries_delete_self
  on public.fantasy_salary_cap_entries
  for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists fantasy_salary_cap_entry_slots_select_self on public.fantasy_salary_cap_entry_slots;
create policy fantasy_salary_cap_entry_slots_select_self
  on public.fantasy_salary_cap_entry_slots
  for select
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.fantasy_salary_cap_entries entries
      where entries.id = fantasy_salary_cap_entry_slots.entry_id
        and entries.user_id = auth.uid()
    )
  );

drop policy if exists fantasy_salary_cap_entry_slots_insert_self on public.fantasy_salary_cap_entry_slots;
create policy fantasy_salary_cap_entry_slots_insert_self
  on public.fantasy_salary_cap_entry_slots
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.fantasy_salary_cap_entries entries
      where entries.id = fantasy_salary_cap_entry_slots.entry_id
        and entries.user_id = auth.uid()
        and entries.league_id = fantasy_salary_cap_entry_slots.league_id
    )
  );

drop policy if exists fantasy_salary_cap_entry_slots_update_self on public.fantasy_salary_cap_entry_slots;
create policy fantasy_salary_cap_entry_slots_update_self
  on public.fantasy_salary_cap_entry_slots
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.fantasy_salary_cap_entries entries
      where entries.id = fantasy_salary_cap_entry_slots.entry_id
        and entries.user_id = auth.uid()
        and entries.league_id = fantasy_salary_cap_entry_slots.league_id
    )
  );

drop policy if exists fantasy_salary_cap_entry_slots_delete_self on public.fantasy_salary_cap_entry_slots;
create policy fantasy_salary_cap_entry_slots_delete_self
  on public.fantasy_salary_cap_entry_slots
  for delete
  to authenticated
  using (user_id = auth.uid());
