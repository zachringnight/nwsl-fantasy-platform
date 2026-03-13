alter table public.fantasy_leagues
  add column if not exists game_variant text not null default 'classic_season_long'
    check (game_variant in ('classic_season_long', 'salary_cap_season_long', 'salary_cap_weekly', 'salary_cap_daily')),
  add column if not exists roster_build_mode text not null default 'snake_draft'
    check (roster_build_mode in ('snake_draft', 'salary_cap')),
  add column if not exists player_ownership_mode text not null default 'exclusive'
    check (player_ownership_mode in ('exclusive', 'shared')),
  add column if not exists contest_horizon text not null default 'season'
    check (contest_horizon in ('season', 'weekly', 'daily')),
  add column if not exists salary_cap_amount integer
    check (salary_cap_amount is null or salary_cap_amount > 0);

update public.fantasy_leagues
set
  game_variant = coalesce(game_variant, 'classic_season_long'),
  roster_build_mode = coalesce(roster_build_mode, 'snake_draft'),
  player_ownership_mode = coalesce(player_ownership_mode, 'exclusive'),
  contest_horizon = coalesce(contest_horizon, 'season')
where
  game_variant is distinct from 'classic_season_long'
  or roster_build_mode is distinct from 'snake_draft'
  or player_ownership_mode is distinct from 'exclusive'
  or contest_horizon is distinct from 'season';
