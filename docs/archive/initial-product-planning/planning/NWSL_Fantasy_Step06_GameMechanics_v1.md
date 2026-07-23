# Step 6: Game Mechanics and Rules Engine

Reference the master context document for locked scoring categories and format decisions.
Reference Step 1 for target users and MVP scope.

---

## Your task

Design the complete game ruleset for launch. Every decision must be justified. The rules engine must be configurable for future seasons.

---

## Deliver exactly these sections

### 1. Roster construction
Decide and justify:
- Total roster size
- Starting lineup positions (e.g., GK, DEF, MID, FWD, FLEX)
- Bench size
- Whether a FLEX position exists and what positions it covers
- Maximum players per NWSL team (to prevent roster hoarding)

Show the math: how many NWSL players exist, how many leagues can draft without overlap issues, and what league sizes this roster supports.

### 2. Scoring model
Using only the locked scoring categories from the master context, define:
- Exact point values for each stat
- Position-specific scoring differences (if any)
- How minutes thresholds work (e.g., 60+ minutes bonus)
- How clean sheets are credited (full match? 60+ minutes?)

Provide a sample scoring output for a typical GK, DEF, MID, and FWD performance so the values can be sanity-checked.

### 3. Captain mechanic
Yes or no. Justify. If yes, define the multiplier and any restrictions.

### 4. Draft rules
- Snake draft order: how is it determined?
- Pick timer: how long per pick? Does it decrease in later rounds?
- Autopick logic: best available by what ranking?
- Queue: how does it interact with autopick?
- Pause/resume: commissioner controls?

### 5. Lineup management
- When do lineups lock? (Per-game lock vs weekly lock vs hybrid)
- Can users make changes after a gameweek starts for players whose games haven't started?
- How are bye weeks or postponed matches handled?

### 6. Waivers and transactions
Recommend one model and justify:
- FAAB (free agent acquisition budget) vs priority waivers vs first-come-first-served
- Waiver processing cadence
- Add/drop rules
- Maximum transactions per week (if any)
- How dropped players are handled (go to waivers or free agency?)

### 7. Matchup and standings
- How are weekly matchups determined?
- Tie-breaker rules (weekly and season-long)
- Do regular season standings use divisions or one table?

### 8. Playoffs
- Yes or no for launch. Justify.
- If yes: format, number of teams, weeks, bye structure
- If no: what determines the champion?

### 9. Commissioner controls
List every setting a commissioner can configure:
- Before draft
- During season
- What cannot be changed mid-season

### 10. Anti-confusion guardrails
List 3 to 5 specific rules or UI interventions that prevent common fantasy mistakes (e.g., leaving an injured player in the lineup, missing waiver deadlines, not understanding scoring).

### 11. Configurability
What settings are hard-coded for launch vs. configurable by commissioner vs. planned for future configurability?

---

## Format

Use tables for scoring values and commissioner controls. Short paragraphs for justifications. Keep total output under 3,500 words.

---

## Do not include
- Technical implementation of the rules engine (that's Step 7)
- UI for rules display (that's Step 8)
