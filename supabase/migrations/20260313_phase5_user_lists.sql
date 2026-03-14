create table if not exists public.user_lists (
  user_id uuid not null references auth.users (id) on delete cascade,
  list_key text not null check (char_length(trim(list_key)) > 0),
  item_ids text[] not null default '{}'::text[],
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, list_key)
);

alter table public.user_lists enable row level security;

grant select, insert, update, delete on public.user_lists to authenticated;

drop policy if exists user_lists_select_own on public.user_lists;
create policy user_lists_select_own
  on public.user_lists
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists user_lists_insert_own on public.user_lists;
create policy user_lists_insert_own
  on public.user_lists
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists user_lists_update_own on public.user_lists;
create policy user_lists_update_own
  on public.user_lists
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists user_lists_delete_own on public.user_lists;
create policy user_lists_delete_own
  on public.user_lists
  for delete
  to authenticated
  using (user_id = auth.uid());
