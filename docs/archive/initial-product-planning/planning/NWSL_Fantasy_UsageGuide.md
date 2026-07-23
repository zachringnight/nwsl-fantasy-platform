# NWSL Fantasy Platform: Prompt Chain Usage Guide

## What's in this package

| File | Purpose |
|------|---------|
| `MasterContext_v1.md` | Reusable foundation. Paste this at the top of every step prompt. |
| `Step01_ProductStrategy_v1.md` | Product strategy framing |
| `Step02_CompetitiveTeardown_v1.md` | Competitor analysis and win matrix |
| `Step03_InformationArchitecture_v1.md` | Sitemap, routes, navigation |
| `Step04_CoreUserFlows_v1.md` | User flow mapping with tap counts |
| `Step05_UXDesignSystem_v1.md` | Design system, tokens, components |
| `Step06_GameMechanics_v1.md` | Rules engine and game design |
| `Step07_TechnicalArchitecture_v1.md` | Data model, schema, system design |
| `Step08_ScreenSpecs_v1.md` | Screen-by-screen product spec |
| `Step09_BuildPlan_v1.md` | Phased implementation plan |
| `Step10_ImplementationScaffold_v1.md` | Code scaffold for Phase 0 |

## How to use

### Basic workflow
1. Start a new conversation
2. Paste `MasterContext_v1.md` as context
3. Paste `Step01_ProductStrategy_v1.md` as the prompt
4. Review the output. Edit or approve.
5. For Step 2, start a new conversation (or continue if context allows)
6. Paste `MasterContext_v1.md` + the Step 1 output + `Step02_CompetitiveTeardown_v1.md`
7. Continue this pattern through Step 10

### What to feed forward
Each step prompt tells you which prior outputs to reference. The pattern:
- Steps 1 and 2 only need the master context
- Steps 3 through 6 need master context + relevant prior outputs
- Steps 7 through 10 need master context + multiple prior outputs

You do not need to paste every prior output into every step. Follow the "Reference" lines at the top of each step prompt.

### When to course-correct
After each step, review before moving on. Common adjustments:
- **Step 1:** You might want to adjust the MVP/Phase 2 boundary
- **Step 3:** You might want to add or remove routes
- **Step 5:** You might want to change the color system or token values
- **Step 6:** You might want to adjust scoring values after seeing sample outputs
- **Step 7:** You might want to simplify the schema for MVP

If you change something, update the master context if it affects locked decisions, then re-run only the downstream steps that are affected.

### Tips for best output
- Keep conversations focused on one step at a time
- If output quality drops, it's usually because too much context was pasted. Trim prior outputs to just the sections referenced.
- Steps 7 and 10 produce the most code. Give them fresh conversations with maximum context window.
- Use Claude Projects to store the master context as a project file so you don't have to paste it every time.

## Updating the master context

When you make a decision during any step that should be locked for future steps:
1. Add it to the "Locked decisions" section of the master context
2. Remove it from the "Open decisions" section
3. Version bump the filename (MasterContext_v2.md, etc.)
