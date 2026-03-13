# Step 6 Output: Game Mechanics and Rules Engine

## 1. Roster construction

- Total roster size: 12
- Starting lineup: 1 GK, 2 DEF, 3 MID, 2 FWD, 1 FLEX (DEF/MID/FWD)
- Bench size: 3
- FLEX: yes, covers DEF/MID/FWD
- Max players per NWSL club: 4

Roster math:
- Official NWSL 2026 club count: 16
- Official final roster band per club: 22 to 26
- Total registered player pool: 352 to 416
- At 10 managers with 12 roster spots each, a league rosters 120 players
- At 12 managers with 12 roster spots each, a league rosters 144 players
- Even at the largest supported league size, the unrostered pool remains 208 to 272 players, which is enough depth for waivers and injury churn

Recommendation:
- Default to 10 managers because it balances draft scarcity with waiver liquidity
- Support 8 to 12, but optimize the product copy and defaults around 10

## 2. Scoring model

| Category | GK | DEF | MID | FWD |
|----------|----|-----|-----|-----|
| Appearance | 1 | 1 | 1 | 1 |
| 60+ minutes | 1 | 1 | 1 | 1 |
| Goal | 10 | 10 | 8 | 6 |
| Assist | 5 | 5 | 5 | 5 |
| Clean sheet | 4 | 4 | 0 | 0 |
| Save | 0.75 | 0.75 | 0 | 0 |
| Goals conceded | -0.5 | -0.5 | 0 | 0 |
| Yellow card | -1 | -1 | -1 | -1 |
| Red card | -3 | -3 | -3 | -3 |
| Penalty save | 5 | 5 | 0 | 0 |
| Penalty miss | -3 | -3 | -3 | -3 |

Minutes rule:
- Any appearance earns 1 point
- Reaching 60 minutes earns an additional 1 point

Clean sheet rule:
- Credited only if the player is eligible for clean sheets and plays at least 60 minutes

Sample outputs:
- Typical GK line: 90 minutes, clean sheet, 4 saves = 1 + 1 + 4 + 3 = 9
- Typical DEF line: 90 minutes, clean sheet, yellow = 1 + 1 + 4 - 1 = 5
- Typical MID line: 90 minutes, 1 goal, 1 assist = 1 + 1 + 8 + 5 = 15
- Typical FWD line: 72 minutes, 1 goal = 1 + 1 + 6 = 8

## 3. Captain mechanic

No captain at launch.

Reason:
- It adds volatility and regret cost without improving clarity
- It over-rewards last-minute swapping behavior
- Launch needs a cleaner rules story, not more score multiplication edge cases

## 4. Draft rules

- Draft order: randomized automatically and revealed one hour before the draft lobby opens
- Format: snake
- Pick timer: 75 seconds in rounds 1 to 8, 60 seconds in rounds 9 to 12
- Autopick logic: queue first, then highest-ranked eligible player weighted by open roster need
- Queue behavior: explicit, ordered, and always visible in the room
- Pause/resume: commissioner can pause, resume, extend the clock, and force a pick

## 5. Lineup management

- Lock model: per-match lock
- Users can change any player whose real-world fixture has not started
- Locked players stay fixed even if the fantasy week is still live
- Postponed matches count only if replayed within the same fantasy scoring window; otherwise scoring shifts to the future week where the replay is scheduled

## 6. Waivers and transactions

Recommended model: rolling priority waivers

Why:
- Easier for novices to understand than FAAB
- Preserves strategy without introducing bid anxiety
- Fits a 2026 launch audience that likely contains first-time fantasy managers

Rules:
- Waiver run: Tuesday at 02:00 in league-local time
- Dropped players enter waivers before becoming free agents
- Unclaimed players become free agents after processing
- Transaction cap: 3 adds per week
- Claims require an optional drop player when roster is full

## 7. Matchup and standings

- Weekly matchups generated before the season after league fill and draft completion
- One standings table, no divisions
- Weekly ties remain ties
- Season standings sort: win percentage, points for, head-to-head, points against

## 8. Playoffs

Yes for launch.

Format:
- Top 4 teams qualify
- Semifinals: 1 vs 4 and 2 vs 3
- Championship and third-place games in the final fantasy week
- No byes because the season calendar is already tight

## 9. Commissioner controls

### Before draft
- League name, privacy, draft time, invite access
- League size
- Core launch rules if editing is allowed before first invite acceptance

### During season
- Invite management
- League announcements
- Draft pause/resume if draft is live
- Safe scheduling and support actions

### Not changeable mid-season
- Scoring model
- Roster construction
- League size
- Playoff qualification count once the season is live

## 10. Anti-confusion guardrails

1. Locked players are visually unavailable in every surface, not just the lineup editor.
2. Waiver processing time is always visible when adding or claiming a player.
3. Every live score change is tied to a visible event explanation.
4. Commissioner-only controls are separated from manager controls.
5. Invalid lineup swaps are prevented, not merely rejected after submit.

## 11. Configurability

### Hard-coded for launch
- Core scoring values
- Playoff size
- No captain

### Configurable by commissioner at launch
- League privacy
- Draft date and time
- Invite access and announcements

### Planned future configurability
- Alternate roster sizes
- Alternate waiver systems
- More playoff formats
- Scoring customization
