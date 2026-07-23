# Step 4 Output: Core User Flows

## 1. First visit to sign up

- Entry point: landing page
- Steps:
  1. Tap `Create account` from landing page.
  2. Enter display name and email on sign-up screen.
  3. Continue into onboarding.
  4. Choose fantasy familiarity and favorite club.
  5. Choose `Create league` or `Join league`.
- Decision points: create vs join
- Tap count on mobile: 4 to 5
- Friction risks: sign-up feels like paperwork; user does not know what happens next
- Design mitigation: short form, visible next step, no dead-end confirmation screen

## 2. Create a league

- Entry point: dashboard or onboarding
- Steps:
  1. Tap `Create league`.
  2. Confirm defaults: league name, draft time, manager count.
  3. Review rules summary.
  4. Create league.
  5. Copy invite link or share join code.
- Decision points: accept defaults vs customize
- Tap count on mobile: 3 to 4
- Friction risks: too many commissioner settings too early
- Design mitigation: strong defaults and advanced settings hidden behind secondary affordance

## 3. Join a league

- Entry point: invite link or `/leagues/join`
- Steps:
  1. Open invite link or type league code.
  2. Review league name, commissioner, and draft date.
  3. Confirm join.
  4. Land on league home.
- Decision points: accept vs back out
- Tap count on mobile: 2 via link, 3 via code
- Friction risks: uncertainty about whether the correct league is being joined
- Design mitigation: confirmation screen with league identity, size, and rules snapshot

## 4. Enter draft room

- Entry point: league home
- Steps:
  1. Tap draft card from league home.
  2. Enter draft lobby.
  3. Review order, clock, roster settings, and autopick state.
  4. Tap `Enter draft room`.
- Decision points: queue players first or enter immediately
- Tap count on mobile: 2
- Friction risks: user enters room unprepared or does not understand autopick state
- Design mitigation: lobby summary and explicit queue/autopick indicators

## 5. Draft players

- Entry point: live draft room
- Steps:
  1. Monitor current pick clock.
  2. Search or browse available players.
  3. Add players to queue or draft immediately.
  4. Confirm pick.
  5. Watch roster tracker update.
- Decision points: queue vs immediate pick; manual pick vs autopick fallback
- Tap count on mobile: 2 to 3 from board to confirmed selection
- Friction risks: unclear queue order, fear that autopick will ignore queue
- Design mitigation: queue panel always visible or one swipe away, queue-first autopick rule stated in UI

## 6. Set lineup

- Entry point: league home or dashboard
- Steps:
  1. Tap `Set lineup`.
  2. Open lineup editor.
  3. Review lock states and injury badges.
  4. Confirm lineup.
- Decision points: keep projected lineup or edit
- Tap count on mobile: 2 from dashboard, 1 from league home
- Friction risks: user cannot tell which players are still movable
- Design mitigation: explicit lock iconography and unavailable slots visually disabled

## 7. Swap a player before lock

- Entry point: lineup editor
- Steps:
  1. Tap current starter.
  2. Highlight eligible bench replacements.
  3. Tap replacement.
  4. Confirm swap.
- Decision points: same-slot vs FLEX swap
- Tap count on mobile: 3
- Friction risks: illegal swaps or confusion about FLEX eligibility
- Design mitigation: only eligible players become interactive after selecting a slot

## 8. Track live scoring during a match

- Entry point: league home, dashboard alert, or matchup route
- Steps:
  1. Tap active matchup.
  2. View current score and live event feed.
  3. Expand player contribution detail if needed.
- Decision points: stay at matchup level vs drill into player detail
- Tap count on mobile: 1 to 2
- Friction risks: score moves without explanation
- Design mitigation: every scoring change paired with visible player/event context

## 9. Review standings

- Entry point: league subnav
- Steps:
  1. Tap `Standings`.
  2. Review current rank, record, PF, PA.
  3. View playoff cutoff context.
- Decision points: regular table view vs team detail drill-in
- Tap count on mobile: 1
- Friction risks: unclear tiebreak order
- Design mitigation: tiebreak explanation inline below the table

## 10. Add/drop a player

- Entry point: player browser or player detail
- Steps:
  1. Open player.
  2. Tap add.
  3. Select drop candidate from bench.
  4. Confirm transaction type and timing.
- Decision points: immediate add vs waiver claim
- Tap count on mobile: 3 to 4
- Friction risks: user does not realize player will go through waivers
- Design mitigation: transaction sheet explains timing, lock state, and roster consequence before submit

## 11. Submit a waiver claim

- Entry point: transactions or player detail
- Steps:
  1. Tap `Claim on waivers`.
  2. Select drop candidate if required.
  3. Review current rolling priority and processing time.
  4. Submit claim.
- Decision points: claim now or wait for free agency
- Tap count on mobile: 3
- Friction risks: users misunderstand priority order and processing time
- Design mitigation: priority number and run time shown before submit and on confirmation

## 12. Commissioner edits

- Entry point: league settings
- Steps:
  1. Tap `League settings`.
  2. Open allowed in-season settings.
  3. Make safe change such as invite access or announcement.
  4. Save.
- Decision points: safe change vs blocked core-rule edit
- Tap count on mobile: 2 to 3
- Friction risks: commissioner assumes scoring or roster rules can be changed mid-season
- Design mitigation: locked settings are visible but disabled with explanation

## Summary table

| Flow | Mobile taps | Key screen | Biggest friction risk |
|------|-------------|------------|-----------------------|
| First visit to sign up | 4-5 | Sign up | User does not understand what comes next |
| Create a league | 3-4 | Create league | Too many rules choices too early |
| Join a league | 2-3 | Join league | Joining the wrong league |
| Enter draft room | 2 | Draft lobby | User misses queue/autopick status |
| Draft players | 2-3 | Live draft room | Queue trust and clock pressure |
| Set lineup | 1-2 | Lineup editor | Lock-state confusion |
| Swap a player | 3 | Lineup editor | Illegal slot changes |
| Track live scoring | 1-2 | Matchup | Score movement lacks explanation |
| Review standings | 1 | Standings | Tiebreak ambiguity |
| Add/drop a player | 3-4 | Player detail | Timing and waiver misunderstanding |
| Submit a waiver claim | 3 | Transactions | Priority confusion |
| Commissioner edits | 2-3 | League settings | Mid-season rule integrity confusion |
