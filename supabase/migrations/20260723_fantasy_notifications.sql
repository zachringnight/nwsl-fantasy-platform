create table if not exists public.fantasy_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  league_id uuid,
  type text not null,
  channel text not null default 'in_app',
  title text,
  body text,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists fantasy_notifications_user_created_idx
  on public.fantasy_notifications (user_id, created_at desc);
create index if not exists fantasy_notifications_user_unread_idx
  on public.fantasy_notifications (user_id, read_at)
  where read_at is null;

alter table public.fantasy_notifications enable row level security;

drop policy if exists "Users can read their own fantasy notifications"
  on public.fantasy_notifications;
create policy "Users can read their own fantasy notifications"
  on public.fantasy_notifications for select
  using (auth.uid() = user_id);

drop policy if exists "Users can update their own fantasy notifications"
  on public.fantasy_notifications;
create policy "Users can update their own fantasy notifications"
  on public.fantasy_notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
