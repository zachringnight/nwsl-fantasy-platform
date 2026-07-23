# Public Soccer Modeling Research Notes - 2026-05-26

## Executive Takeaways

Public soccer forecasting research does not point to one magic model. The strongest pattern is an ensemble of disciplined pieces:

- A simple, hard-to-beat team-strength baseline: home advantage plus ratings.
- A score model: independent Poisson, Dixon-Coles, bivariate Poisson, or Bayesian hierarchical attack/defense.
- Time dynamics: recent form and current-season xG/shot-quality should matter more as the season grows.
- Player impact: starting XI and availability matter, but public evidence suggests they work best as an add-on to team ratings, not as a replacement.
- Market validation: profitability claims need closing-line value, bootstrap confidence intervals, and out-of-sample threshold selection. Small-sample ROI can easily be noise.

For this NWSL model, the main practical implication is not "make the model more complex." It is:

1. Use current-season xG/team-strength and roster continuity as the core signal.
2. Use last season as a prior only, especially with high roster turnover.
3. Convert injuries/lineups into deltas from a normal team XI.
4. Evaluate against market-implied probabilities, home-field, and rolling xG baselines.
5. Treat bets as unpublishable unless the model beats baselines and shows CLV.

The best next build is therefore an SPI-lite/xG-rating model plus market-aware validation, then a calibrated ensemble with the existing Dixon-Coles and bivariate Poisson models. That path is more defensible than adding broad features to the current score model until it overfits a 33-match validation slice.

## Public Model Patterns

### Dixon-Coles And Poisson Score Models

The Dixon-Coles family remains a public reference point for soccer score modeling. The original paper, "Modelling Association Football Scores and Inefficiencies in the Football Betting Market," used a dynamic Poisson-regression structure and explicitly evaluated betting-market returns. Recent women's-football work also treats Dixon-Coles as the reference model to extend, not as a solved final answer.

Its durable ideas are:

- Model home and away goals as team attack/defense intensities.
- Add home advantage.
- Time-weight older matches less.
- Correct the low-score dependence around 0-0, 1-0, 0-1, and 1-1.
- Compare prices to betting markets, not just winner accuracy.

Implication for NWSL:

- Keep Dixon-Coles and bivariate Poisson, but do not rely on raw goal counts only.
- The current model's split regularization is directionally right: team effects should be allowed to move, while context/player effects need heavy shrinkage.
- Test a lower-dimensional score model with only attack, defense, HFA, rolling xG, rest, and lineup delta before adding broader context.

### Bayesian Hierarchical Score Models

Baio and Blangiardo's public Bayesian hierarchical football model emphasizes partial pooling and the overshrinkage problem. This matters for NWSL because the sample is small, teams are unevenly observed early in the year, and expansion/roster churn creates unstable team priors.

Implication for NWSL:

- Use hierarchical shrinkage explicitly instead of many free coefficients.
- Treat 2025 as a preseason prior, then decay it as 2026 matches accumulate.
- Consider a Bayesian or empirical-Bayes layer for attack/defense and total-goals intensity.

### Dynamic Ratings

Rue and Salvesen-style dynamic models and ClubElo-style public ratings both support the same idea: team strength should evolve over time, with home-field advantage and goal-margin/score information feeding the update.

Implication for NWSL:

- The rolling xG baseline should become a first-class model family, not only a baseline.
- Add dynamic attack and defense ratings updated match-by-match using goals and xG.
- Track separate ratings for scoring, conceding, and total pace.

### SPI-Style Forecasting

FiveThirtyEight's public SPI data structure is useful because it exposes what a production-style public model tracks:

- Separate offensive and defensive ratings.
- A goal-based interpretation of ratings.
- League/squad-strength priors where match data is sparse.
- Poisson score probabilities.
- Monte Carlo season simulations that update team ratings during simulated seasons.
- Proper scoring rules like ranked probability score.

Implication for NWSL:

- Build a compact NWSL SPI-like rating: expected goals scored/conceded against league average on neutral field.
- Use roster/player-value priors at season start, then let current-season xG override them.
- If full-season projections are shown, simulate the season "hot" by updating ratings after simulated results, instead of freezing the model for all future matches.

### Player Impact And Starting Lineups

Arntzen and Hvattum's public abstract is directly relevant: they compare Elo team ratings and plus-minus-style player ratings, then use two covariates, team-rating difference and starting-lineup player-rating difference. Their finding is that team and player ratings are about equally useful alone, but forecasts using both are significantly better.

Implication for NWSL:

- Keep lineup strength, but make it a delta versus normal XI rather than an absolute sum.
- Use expected minutes, not just starter boolean.
- Use player value from current-season minutes, starts, xG/xA, g+, and learned plus-minus when available.
- Confirmed lineup should override projected lineup when available.

### Possession-Value Metrics

ASA Goals Added and VAEP/xT-style models are public examples of valuing all actions, not only shots and goals.

Implication for NWSL:

- If ASA g+ is available, aggregate it to player and team strength features.
- Prioritize team g+ differential and player g+ per 90 for lineup impact.
- Do not try to rebuild VAEP/xT without event data; use public ASA-style aggregates first.

### Betting Market Validation

Recent public betting-market research is a warning: apparent profitable strategies often vanish, and positive ROI can occur by chance in efficient markets. Any consumer-facing betting model needs:

- Best available price, not just average price.
- Closing-line value.
- Opening-to-close movement.
- Bootstrap confidence intervals.
- Nested threshold tuning.
- Market-implied probability benchmark after devig.
- Separate results by market: ML, draw, totals, favorites, underdogs, home/away, liquidity.

Implication for NWSL:

- Current positive ML ROI on 33 validation matches is not enough.
- Accepted bets should remain blocked until promotion gates pass.
- Add CLV tracking as a promotion gate.
- Treat totals separately; current totals candidates fail confidence and need a line-specific totals model.

## Highest-Value Implementation Changes

1. Add an SPI-lite model family:
   - neutral attack rating
   - neutral defense rating
   - team pace/total-goals rating
   - current-season xG blend
   - roster-continuity prior
   - match-by-match rating updates

2. Add market baselines:
   - devig 1X2 close
   - devig totals close
   - best-available price at pick time
   - CLV measured against close

3. Replace raw lineup sums with relative deltas:
   - projected XI value minus normal XI value
   - opponent absence value
   - expected minutes weighting
   - confirmed-lineup override

4. Use nested tuning for bets:
   - choose thresholds inside each training fold
   - evaluate on the next chronological holdout
   - require a minimum bet count
   - report bootstrap confidence intervals for ROI and edge

5. Make totals line-aware:
   - model probability over 2.5, 3.0, 3.5, etc.
   - handle pushes on Asian/integer totals
   - track totals profitability separately from ML

## Recommended Build Roadmap

### 1. Stronger Baselines

Add these baselines and require score models to beat them:

- Devig market close 1X2.
- Devig market close totals.
- Rolling xG Poisson with dynamic attack/defense ratings.
- Home-field plus current-season table/xG form.
- SPI-lite neutral attack/defense rating.

### 2. NWSL SPI-Lite Model

Build a compact model:

- Team attack rating: expected goals for versus league average.
- Team defense rating: expected goals allowed versus league average.
- Home-field advantage.
- Total pace rating.
- Current-season xG/ASA blend.
- Roster continuity prior weight.
- Prior decay schedule based on matches played.

### 3. Lineup Delta Model

Replace absolute lineup strength with:

- Expected XI value.
- Normal XI value.
- Availability-adjusted delta.
- Opponent defensive absence delta.
- Confirmed lineup override path.

The current official availability overlay is useful. The next step is making the value of absences relative to each team's normal XI.

### 4. Profitability Evaluation

Before publishing picks:

- Backtest ML and totals separately.
- Include push handling for totals.
- Record CLV for every historical and live pick.
- Add bootstrap confidence intervals for ROI and log-loss improvement.
- Tune thresholds only on training folds, then evaluate on held-out folds.
- Require minimum bet count before using a threshold.

### 5. Calibration And Ensembling

Use an out-of-fold stacked ensemble:

- Home-field baseline.
- Rolling xG model.
- Dixon-Coles.
- Bivariate Poisson.
- SPI-lite.
- Market-implied probability, where available.

Promotion should evaluate the calibrated/stacked forecast if calibration is trained out-of-fold. Raw uncalibrated model performance is still a useful diagnostic, but the product should use the best properly validated probability estimate.

## Sources Reviewed

- Dixon and Coles, "Modelling Association Football Scores and Inefficiencies in the Football Betting Market": https://doi.org/10.1111/1467-9876.00065
- Women's-football Dixon-Coles extension, "Extending the Dixon and Coles model: an application to women's football data": https://academic.oup.com/jrsssc/article/74/1/167/7818323
- Baio and Blangiardo, "Bayesian hierarchical model for the prediction of football results": https://discovery.ucl.ac.uk/id/eprint/16040/
- Rue and Salvesen, "Prediction and retrospective analysis of soccer matches in a league": https://citeseerx.ist.psu.edu/document?doi=d260ef5bd7eedc2dd269453fab3507b5752536f1&repid=rep1&type=pdf
- ClubElo system notes: https://clubelo.com/System
- FiveThirtyEight soccer SPI data and field definitions: https://github.com/fivethirtyeight/data/tree/master/soccer-spi
- Arntzen and Hvattum, "Predicting match outcomes in association football using team ratings and player ratings": https://journals.sagepub.com/doi/abs/10.1177/1471082X20929881
- American Soccer Analysis Goals Added methodology: https://www.americansocceranalysis.com/home/2020/5/4/goals-added-deep-dive-methodology
- socceraction VAEP documentation: https://socceraction.readthedocs.io/en/latest/documentation/valuing_actions/vaep.html
- Decroos et al., "Actions Speak Louder Than Goals: Valuing Player Actions in Soccer": https://arxiv.org/abs/1802.07127
- Elaad, Reade, and Singleton, "Information, Prices and Efficiency in An Online Betting Market": https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3378257
