grant delete on public.fantasy_roster_slots to authenticated;

drop policy if exists fantasy_roster_slots_delete_self_or_commissioner on public.fantasy_roster_slots;
create policy fantasy_roster_slots_delete_self_or_commissioner
  on public.fantasy_roster_slots
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.fantasy_leagues leagues
      where leagues.id = fantasy_roster_slots.league_id
        and leagues.commissioner_user_id = auth.uid()
    )
  );
