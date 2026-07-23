-- Fantasy social tables: chat, achievements, streaks, trades.
-- Adds the six tables that fantasy-trades.ts / fantasy-chat.ts / fantasy-achievements.ts
-- already read and write but that were never created (confirmed absent via list_tables
-- against project rnfvmqflktghriqefatc on 2026-07-22). Additive only.
--
-- "fantasy_teams" was referenced by an old join alias in fantasy-trades.ts but was never
-- modeled as a real table anywhere in this schema. Every new "team" FK below points at
-- fantasy_league_memberships (id), the table the rest of the app already uses to represent
-- a manager's team within a league.

-- Chat -------------------------------------------------------------------------
create table if not exists public.fantasy_chat_messages (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues (id) on delete cascade,
  -- References fantasy_profiles (not auth.users directly) so PostgREST can resolve the
  -- `profile:fantasy_profiles!inner ( display_name )` embed in fantasy-chat.ts's loadChatMessages.
  user_id uuid not null references public.fantasy_profiles (user_id) on delete cascade,
  body text not null check (char_length(body) <= 500),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists fantasy_chat_messages_league_created_idx
  on public.fantasy_chat_messages (league_id, created_at desc);

-- Achievements -------------------------------------------------------------------
create table if not exists public.fantasy_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  league_id uuid references public.fantasy_leagues (id) on delete cascade,
  key text not null check (key in (
    'FIRST_DRAFT_PICK', 'WIN_STREAK_3', 'WIN_STREAK_5', 'WIN_STREAK_7',
    'POINTS_100_WEEK', 'POINTS_150_WEEK', 'PERFECT_LINEUP', 'WAIVER_WIRE_HERO',
    'COMEBACK_WIN', 'SEASON_CHAMPION', 'CLEAN_SWEEP', 'TOP_SCORER_WEEK',
    'TRADE_PARTNER', 'CHAT_STARTER'
  )),
  label text not null,
  description text not null,
  earned_at timestamptz not null default timezone('utc', now()),
  metadata jsonb,
  unique (user_id, league_id, key)
);

create index if not exists fantasy_achievements_league_earned_idx
  on public.fantasy_achievements (league_id, earned_at desc);

create index if not exists fantasy_achievements_user_idx
  on public.fantasy_achievements (user_id, earned_at desc);

-- Streaks --------------------------------------------------------------------
create table if not exists public.fantasy_streaks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  league_id uuid not null references public.fantasy_leagues (id) on delete cascade,
  fantasy_team_id uuid not null references public.fantasy_league_memberships (id) on delete cascade,
  streak_type text not null,
  current_count integer not null default 0,
  best_count integer not null default 0,
  last_updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, league_id, streak_type)
);

create index if not exists fantasy_streaks_league_idx
  on public.fantasy_streaks (league_id);

-- Trade proposals --------------------------------------------------------------
create table if not exists public.fantasy_trade_proposals (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues (id) on delete cascade,
  proposer_team_id uuid not null,
  receiver_team_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'vetoed', 'canceled', 'expired')),
  message text,
  review_period_ends_at timestamptz not null,
  veto_count integer not null default 0,
  veto_threshold integer not null default 1,
  responded_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint fantasy_trade_proposals_proposer_team_id_fkey
    foreign key (proposer_team_id) references public.fantasy_league_memberships (id) on delete cascade,
  constraint fantasy_trade_proposals_receiver_team_id_fkey
    foreign key (receiver_team_id) references public.fantasy_league_memberships (id) on delete cascade
);

create index if not exists fantasy_trade_proposals_league_status_idx
  on public.fantasy_trade_proposals (league_id, status, created_at desc);

create index if not exists fantasy_trade_proposals_proposer_idx
  on public.fantasy_trade_proposals (proposer_team_id);

create index if not exists fantasy_trade_proposals_receiver_idx
  on public.fantasy_trade_proposals (receiver_team_id);

-- Trade assets -------------------------------------------------------------------
create table if not exists public.fantasy_trade_assets (
  id uuid primary key default gen_random_uuid(),
  trade_proposal_id uuid not null references public.fantasy_trade_proposals (id) on delete cascade,
  from_team_id uuid not null references public.fantasy_league_memberships (id) on delete cascade,
  player_id text not null,
  player_name text not null,
  player_position text not null check (player_position in ('GK', 'DEF', 'MID', 'FWD')),
  club_name text not null
);

create index if not exists fantasy_trade_assets_proposal_idx
  on public.fantasy_trade_assets (trade_proposal_id);

-- Trade votes --------------------------------------------------------------------
create table if not exists public.fantasy_trade_votes (
  id uuid primary key default gen_random_uuid(),
  trade_proposal_id uuid not null references public.fantasy_trade_proposals (id) on delete cascade,
  fantasy_team_id uuid not null references public.fantasy_league_memberships (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  decision text not null check (decision in ('approve', 'veto')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (trade_proposal_id, fantasy_team_id)
);

create index if not exists fantasy_trade_votes_proposal_idx
  on public.fantasy_trade_votes (trade_proposal_id);

-- RLS ------------------------------------------------------------------------
alter table public.fantasy_chat_messages enable row level security;
alter table public.fantasy_achievements enable row level security;
alter table public.fantasy_streaks enable row level security;
alter table public.fantasy_trade_proposals enable row level security;
alter table public.fantasy_trade_assets enable row level security;
alter table public.fantasy_trade_votes enable row level security;

grant select, insert on public.fantasy_chat_messages to authenticated;
grant select, insert, update on public.fantasy_achievements to authenticated;
grant select, insert, update on public.fantasy_streaks to authenticated;
grant select, insert, update on public.fantasy_trade_proposals to authenticated;
grant select, insert on public.fantasy_trade_assets to authenticated;
grant select, insert, update on public.fantasy_trade_votes to authenticated;

-- Chat: any league member can read; a member can only post as themselves.
drop policy if exists fantasy_chat_messages_select_member on public.fantasy_chat_messages;
create policy fantasy_chat_messages_select_member
  on public.fantasy_chat_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.fantasy_league_memberships memberships
      where memberships.league_id = fantasy_chat_messages.league_id
        and memberships.user_id = auth.uid()
    )
  );

drop policy if exists fantasy_chat_messages_insert_self on public.fantasy_chat_messages;
create policy fantasy_chat_messages_insert_self
  on public.fantasy_chat_messages
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.fantasy_league_memberships memberships
      where memberships.league_id = fantasy_chat_messages.league_id
        and memberships.user_id = auth.uid()
    )
  );

-- Achievements: a user can always see their own; league members can see league-wide
-- achievements (loadLeagueAchievements). Writes are self-attributed and league-scoped
-- when a league_id is present.
drop policy if exists fantasy_achievements_select_own_or_league on public.fantasy_achievements;
create policy fantasy_achievements_select_own_or_league
  on public.fantasy_achievements
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or (
      league_id is not null
      and exists (
        select 1
        from public.fantasy_league_memberships memberships
        where memberships.league_id = fantasy_achievements.league_id
          and memberships.user_id = auth.uid()
      )
    )
  );

drop policy if exists fantasy_achievements_insert_self on public.fantasy_achievements;
create policy fantasy_achievements_insert_self
  on public.fantasy_achievements
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and (
      league_id is null
      or exists (
        select 1
        from public.fantasy_league_memberships memberships
        where memberships.league_id = fantasy_achievements.league_id
          and memberships.user_id = auth.uid()
      )
    )
  );

drop policy if exists fantasy_achievements_update_self on public.fantasy_achievements;
create policy fantasy_achievements_update_self
  on public.fantasy_achievements
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (
      league_id is null
      or exists (
        select 1
        from public.fantasy_league_memberships memberships
        where memberships.league_id = fantasy_achievements.league_id
          and memberships.user_id = auth.uid()
      )
    )
  );

-- Streaks: league-scoped, self-attributed (mirrors fantasy_waiver_claims_insert_self).
drop policy if exists fantasy_streaks_select_member on public.fantasy_streaks;
create policy fantasy_streaks_select_member
  on public.fantasy_streaks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.fantasy_league_memberships memberships
      where memberships.league_id = fantasy_streaks.league_id
        and memberships.user_id = auth.uid()
    )
  );

drop policy if exists fantasy_streaks_insert_self on public.fantasy_streaks;
create policy fantasy_streaks_insert_self
  on public.fantasy_streaks
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.fantasy_league_memberships memberships
      where memberships.league_id = fantasy_streaks.league_id
        and memberships.user_id = auth.uid()
    )
  );

drop policy if exists fantasy_streaks_update_self on public.fantasy_streaks;
create policy fantasy_streaks_update_self
  on public.fantasy_streaks
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.fantasy_league_memberships memberships
      where memberships.league_id = fantasy_streaks.league_id
        and memberships.user_id = auth.uid()
    )
  );

-- Trade proposals: any league member can read; only the owner of proposer_team_id can
-- propose; any league member can update (accept/reject/cancel/vote-driven status changes
-- are all gated further by application logic, e.g. .eq("status", "pending")).
drop policy if exists fantasy_trade_proposals_select_member on public.fantasy_trade_proposals;
create policy fantasy_trade_proposals_select_member
  on public.fantasy_trade_proposals
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.fantasy_league_memberships memberships
      where memberships.league_id = fantasy_trade_proposals.league_id
        and memberships.user_id = auth.uid()
    )
  );

drop policy if exists fantasy_trade_proposals_insert_proposer on public.fantasy_trade_proposals;
create policy fantasy_trade_proposals_insert_proposer
  on public.fantasy_trade_proposals
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.fantasy_league_memberships memberships
      where memberships.id = fantasy_trade_proposals.proposer_team_id
        and memberships.league_id = fantasy_trade_proposals.league_id
        and memberships.user_id = auth.uid()
    )
  );

drop policy if exists fantasy_trade_proposals_update_member on public.fantasy_trade_proposals;
create policy fantasy_trade_proposals_update_member
  on public.fantasy_trade_proposals
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.fantasy_league_memberships memberships
      where memberships.league_id = fantasy_trade_proposals.league_id
        and memberships.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.fantasy_league_memberships memberships
      where memberships.league_id = fantasy_trade_proposals.league_id
        and memberships.user_id = auth.uid()
    )
  );

-- Trade assets: readable/insertable by members of the proposal's league. Assets are
-- inserted by the proposer immediately after creating the parent proposal.
drop policy if exists fantasy_trade_assets_select_member on public.fantasy_trade_assets;
create policy fantasy_trade_assets_select_member
  on public.fantasy_trade_assets
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.fantasy_trade_proposals proposals
      join public.fantasy_league_memberships memberships
        on memberships.league_id = proposals.league_id
      where proposals.id = fantasy_trade_assets.trade_proposal_id
        and memberships.user_id = auth.uid()
    )
  );

drop policy if exists fantasy_trade_assets_insert_member on public.fantasy_trade_assets;
create policy fantasy_trade_assets_insert_member
  on public.fantasy_trade_assets
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.fantasy_trade_proposals proposals
      join public.fantasy_league_memberships memberships
        on memberships.league_id = proposals.league_id
      where proposals.id = fantasy_trade_assets.trade_proposal_id
        and memberships.user_id = auth.uid()
    )
  );

-- Trade votes: readable by league members; a member can only cast their own vote,
-- attributed to a team they own.
drop policy if exists fantasy_trade_votes_select_member on public.fantasy_trade_votes;
create policy fantasy_trade_votes_select_member
  on public.fantasy_trade_votes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.fantasy_trade_proposals proposals
      join public.fantasy_league_memberships memberships
        on memberships.league_id = proposals.league_id
      where proposals.id = fantasy_trade_votes.trade_proposal_id
        and memberships.user_id = auth.uid()
    )
  );

drop policy if exists fantasy_trade_votes_insert_self on public.fantasy_trade_votes;
create policy fantasy_trade_votes_insert_self
  on public.fantasy_trade_votes
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.fantasy_league_memberships memberships
      where memberships.id = fantasy_trade_votes.fantasy_team_id
        and memberships.user_id = auth.uid()
    )
  );

drop policy if exists fantasy_trade_votes_update_self on public.fantasy_trade_votes;
create policy fantasy_trade_votes_update_self
  on public.fantasy_trade_votes
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.fantasy_league_memberships memberships
      where memberships.id = fantasy_trade_votes.fantasy_team_id
        and memberships.user_id = auth.uid()
    )
  );
