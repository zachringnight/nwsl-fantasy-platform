create table if not exists public.fantasy_scoring_overrides (
  id uuid primary key default gen_random_uuid(),
  player_id text not null,
  player_name text not null,
  match_id text not null,
  original_points numeric not null,
  corrected_points numeric not null,
  reason text not null,
  status text not null default 'applied'
    check (status in ('applied', 'reverted')),
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists fantasy_scoring_overrides_lookup_idx
  on public.fantasy_scoring_overrides (player_id, match_id, created_at desc);

create table if not exists public.fantasy_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_id text not null,
  status text not null check (status in ('success', 'skipped', 'error')),
  summary text not null,
  started_at timestamptz not null,
  completed_at timestamptz not null default now()
);

create index if not exists fantasy_job_runs_job_completed_idx
  on public.fantasy_job_runs (job_id, completed_at desc);

alter table public.fantasy_scoring_overrides enable row level security;
alter table public.fantasy_job_runs enable row level security;

create policy "Fantasy scoring overrides are publicly readable"
  on public.fantasy_scoring_overrides for select
  using (true);
