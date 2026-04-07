-- Phase 1: Base tables that all later migrations depend on.
-- Creates fantasy_profiles, fantasy_leagues, fantasy_league_memberships, and user_lists.

-- Profiles -------------------------------------------------------------------
create table if not exists public.fantasy_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text not null,
  favorite_club text,
  experience_level text check (experience_level is null or experience_level in ('new', 'casual', 'experienced')),
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.fantasy_profiles enable row level security;
grant select, insert, update on public.fantasy_profiles to authenticated;

drop policy if exists fantasy_profiles_select_self on public.fantasy_profiles;
create policy fantasy_profiles_select_self
  on public.fantasy_profiles
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists fantasy_profiles_insert_self on public.fantasy_profiles;
create policy fantasy_profiles_insert_self
  on public.fantasy_profiles
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists fantasy_profiles_update_self on public.fantasy_profiles;
create policy fantasy_profiles_update_self
  on public.fantasy_profiles
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Leagues --------------------------------------------------------------------
create table if not exists public.fantasy_leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  privacy text not null default 'private' check (privacy in ('private', 'public')),
  status text not null default 'setup' check (status in ('setup', 'ready', 'live', 'complete')),
  manager_count_target integer not null default 10 check (manager_count_target between 2 and 20),
  draft_at timestamptz,
  commissioner_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists fantasy_leagues_commissioner_idx
  on public.fantasy_leagues (commissioner_user_id);

alter table public.fantasy_leagues enable row level security;
grant select, insert, update, delete on public.fantasy_leagues to authenticated;

drop policy if exists fantasy_leagues_select_member on public.fantasy_leagues;
create policy fantasy_leagues_select_member
  on public.fantasy_leagues
  for select
  to authenticated
  using (
    commissioner_user_id = auth.uid()
    or exists (
      select 1
      from public.fantasy_league_memberships memberships
      where memberships.league_id = fantasy_leagues.id
        and memberships.user_id = auth.uid()
    )
  );

drop policy if exists fantasy_leagues_select_by_code on public.fantasy_leagues;
create policy fantasy_leagues_select_by_code
  on public.fantasy_leagues
  for select
  to authenticated
  using (true);

drop policy if exists fantasy_leagues_insert_authenticated on public.fantasy_leagues;
create policy fantasy_leagues_insert_authenticated
  on public.fantasy_leagues
  for insert
  to authenticated
  with check (commissioner_user_id = auth.uid());

drop policy if exists fantasy_leagues_update_commissioner on public.fantasy_leagues;
create policy fantasy_leagues_update_commissioner
  on public.fantasy_leagues
  for update
  to authenticated
  using (commissioner_user_id = auth.uid())
  with check (commissioner_user_id = auth.uid());

drop policy if exists fantasy_leagues_delete_commissioner on public.fantasy_leagues;
create policy fantasy_leagues_delete_commissioner
  on public.fantasy_leagues
  for delete
  to authenticated
  using (commissioner_user_id = auth.uid());

-- League memberships ---------------------------------------------------------
create table if not exists public.fantasy_league_memberships (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'manager' check (role in ('commissioner', 'manager')),
  display_name text not null,
  team_name text,
  joined_at timestamptz not null default timezone('utc', now()),
  unique (league_id, user_id)
);

create index if not exists fantasy_league_memberships_user_idx
  on public.fantasy_league_memberships (user_id);

create index if not exists fantasy_league_memberships_league_idx
  on public.fantasy_league_memberships (league_id);

alter table public.fantasy_league_memberships enable row level security;
grant select, insert on public.fantasy_league_memberships to authenticated;

drop policy if exists fantasy_league_memberships_select_member on public.fantasy_league_memberships;
create policy fantasy_league_memberships_select_member
  on public.fantasy_league_memberships
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.fantasy_league_memberships my_membership
      where my_membership.league_id = fantasy_league_memberships.league_id
        and my_membership.user_id = auth.uid()
    )
  );

drop policy if exists fantasy_league_memberships_insert_self on public.fantasy_league_memberships;
create policy fantasy_league_memberships_insert_self
  on public.fantasy_league_memberships
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- User lists (watchlists, favorites, etc.) -----------------------------------
create table if not exists public.user_lists (
  user_id uuid not null references auth.users (id) on delete cascade,
  list_key text not null,
  item_ids jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, list_key)
);

alter table public.user_lists enable row level security;
grant select, insert, update on public.user_lists to authenticated;

drop policy if exists user_lists_select_self on public.user_lists;
create policy user_lists_select_self
  on public.user_lists
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists user_lists_insert_self on public.user_lists;
create policy user_lists_insert_self
  on public.user_lists
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists user_lists_update_self on public.user_lists;
create policy user_lists_update_self
  on public.user_lists
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
