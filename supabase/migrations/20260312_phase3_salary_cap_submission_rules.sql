alter table public.fantasy_salary_cap_entries
  add column if not exists submitted_at timestamptz;

update public.fantasy_salary_cap_entries
set submitted_at = coalesce(submitted_at, updated_at)
where status = 'submitted'
  and submitted_at is null;
