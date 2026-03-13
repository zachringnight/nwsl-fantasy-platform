alter table public.fantasy_salary_cap_entries
  add column if not exists slate_key text;

update public.fantasy_salary_cap_entries entries
set slate_key = case leagues.contest_horizon
  when 'season' then 'season-2026'
  when 'weekly' then 'week-01'
  else '2026-03-13'
end
from public.fantasy_leagues leagues
where leagues.id = entries.league_id
  and entries.slate_key is null;

alter table public.fantasy_salary_cap_entries
  alter column slate_key set default 'season-2026';

alter table public.fantasy_salary_cap_entries
  alter column slate_key set not null;

alter table public.fantasy_salary_cap_entries
  drop constraint if exists fantasy_salary_cap_entries_league_id_user_id_key;

drop index if exists public.fantasy_salary_cap_entries_league_user_idx;

create unique index if not exists fantasy_salary_cap_entries_league_user_slate_key
  on public.fantasy_salary_cap_entries (league_id, user_id, slate_key);
