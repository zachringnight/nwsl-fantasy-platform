create or replace function public.fantasy_is_non_anonymous_authenticated()
returns boolean
language sql
stable
set search_path = public, auth
as $$
  select auth.uid() is not null
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false;
$$;

create or replace function public.fantasy_is_commissioner(target_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.fantasy_is_non_anonymous_authenticated()
    and exists(
      select 1
      from public.fantasy_leagues leagues
      where leagues.id = target_league_id
        and leagues.commissioner_user_id = auth.uid()
    );
$$;

create or replace function public.fantasy_is_league_member(target_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.fantasy_is_non_anonymous_authenticated()
    and exists(
      select 1
      from public.fantasy_league_memberships memberships
      where memberships.league_id = target_league_id
        and memberships.user_id = auth.uid()
    );
$$;

alter policy fantasy_profiles_insert_own
on public.fantasy_profiles
to authenticated
with check (
  public.fantasy_is_non_anonymous_authenticated()
  and user_id = auth.uid()
);

alter policy fantasy_profiles_select_own
on public.fantasy_profiles
to authenticated
using (
  public.fantasy_is_non_anonymous_authenticated()
  and user_id = auth.uid()
);

alter policy fantasy_profiles_update_own
on public.fantasy_profiles
to authenticated
using (
  public.fantasy_is_non_anonymous_authenticated()
  and user_id = auth.uid()
)
with check (
  public.fantasy_is_non_anonymous_authenticated()
  and user_id = auth.uid()
);

drop policy if exists fantasy_leagues_select_authenticated on public.fantasy_leagues;

create policy fantasy_leagues_select_member_or_commissioner
on public.fantasy_leagues
for select
to authenticated
using (
  public.fantasy_is_commissioner(id)
  or public.fantasy_is_league_member(id)
);

alter policy fantasy_leagues_insert_commissioner
on public.fantasy_leagues
to authenticated
with check (
  public.fantasy_is_non_anonymous_authenticated()
  and commissioner_user_id = auth.uid()
);

alter policy fantasy_leagues_update_commissioner
on public.fantasy_leagues
to authenticated
using (public.fantasy_is_commissioner(id))
with check (public.fantasy_is_commissioner(id));

alter policy fantasy_leagues_delete_commissioner
on public.fantasy_leagues
to authenticated
using (public.fantasy_is_commissioner(id));

drop policy if exists fantasy_memberships_select_authenticated on public.fantasy_league_memberships;

create policy fantasy_memberships_select_member_or_commissioner
on public.fantasy_league_memberships
for select
to authenticated
using (
  public.fantasy_is_commissioner(league_id)
  or public.fantasy_is_league_member(league_id)
);

alter policy fantasy_memberships_insert_self
on public.fantasy_league_memberships
to authenticated
with check (
  public.fantasy_is_non_anonymous_authenticated()
  and user_id = auth.uid()
  and public.fantasy_is_commissioner(league_id)
);

alter policy fantasy_memberships_update_commissioner
on public.fantasy_league_memberships
to authenticated
using (public.fantasy_is_commissioner(league_id))
with check (public.fantasy_is_commissioner(league_id));

alter policy user_lists_insert_own
on public.user_lists
to authenticated
with check (
  public.fantasy_is_non_anonymous_authenticated()
  and user_id = auth.uid()
);

alter policy user_lists_select_own
on public.user_lists
to authenticated
using (
  public.fantasy_is_non_anonymous_authenticated()
  and user_id = auth.uid()
);

alter policy user_lists_update_own
on public.user_lists
to authenticated
using (
  public.fantasy_is_non_anonymous_authenticated()
  and user_id = auth.uid()
)
with check (
  public.fantasy_is_non_anonymous_authenticated()
  and user_id = auth.uid()
);

alter policy user_lists_delete_own
on public.user_lists
to authenticated
using (
  public.fantasy_is_non_anonymous_authenticated()
  and user_id = auth.uid()
);
