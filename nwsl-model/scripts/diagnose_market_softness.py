#!/usr/bin/env python3
"""Per-market predictive-edge diagnostic vs the closing line.

Answers: in which market (1X2 vs totals) does any model beat the market's
no-vig closing probability? CLV/line-timing is NOT measurable here because the
backtest only stored closing odds (open == close, clv == 0).
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

EPS = 1e-12


def log_loss(p: np.ndarray, _y: np.ndarray) -> float:
    p = np.clip(np.asarray(p, dtype=float), EPS, 1.0)
    return float(-np.mean(np.log(p)))


def main() -> None:
    base = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(
        "data/processed/models/2025plus-20260528T180732Z/backtest"
    )
    dl = pd.read_csv(base / "decision_log_dixon_coles.csv")
    pred = pd.read_csv(base / "predictions_dixon_coles.csv").set_index("match_id")

    # Market no-vig 1X2
    x = dl[dl["market"].str.startswith("1x2")].copy()
    x["s"] = x["market"].map({"1x2_home": "home", "1x2_draw": "draw", "1x2_away": "away"})
    piv = x.pivot_table(index="match_id", columns="s", values="market_no_vig_probability", aggfunc="first").dropna()
    y1 = pred.loc[piv.index].apply(
        lambda r: 0 if r["home_goals_90"] > r["away_goals_90"] else (1 if r["home_goals_90"] == r["away_goals_90"] else 2),
        axis=1,
    ).to_numpy()
    P = piv[["home", "draw", "away"]].to_numpy()
    P = P / P.sum(1, keepdims=True)
    mkt_1x2 = log_loss(P[np.arange(len(y1)), y1], y1)

    # Market no-vig totals 2.5
    t = dl[dl["market"].str.startswith("total")].copy()
    t["s"] = t["market"].map({"total_over_2.5": "over", "total_under_2.5": "under"})
    tp = t.pivot_table(index="match_id", columns="s", values="market_no_vig_probability", aggfunc="first").dropna()
    yt = pred.loc[tp.index].apply(
        lambda r: 1 if (r["home_goals_90"] + r["away_goals_90"]) > 2.5 else 0, axis=1
    ).to_numpy()
    Pt = tp[["over", "under"]].to_numpy()
    Pt = Pt / Pt.sum(1, keepdims=True)
    mkt_tot = log_loss(np.where(yt == 1, Pt[:, 0], Pt[:, 1]), yt)

    bar = "=" * 70
    print(bar)
    print("MARKET (no-vig closing, OddsPortalAvg):")
    print(f"  1X2     log-loss = {mkt_1x2:.4f}   (n={len(y1)})")
    print(f"  O/U 2.5 log-loss = {mkt_tot:.4f}   (n={len(yt)})")
    print(bar)
    print(f"{'model':24s}{'1X2':>10s}{'vs mkt':>8s}{'O/U 2.5':>10s}{'vs mkt':>8s}")
    print("-" * 70)

    for m in ["spi_lite_baseline", "team_ratings_poisson", "rolling_npxg_poisson", "dixon_coles", "bivariate_poisson"]:
        f = base / f"predictions_{m}.csv"
        if not f.exists():
            continue
        pm = pd.read_csv(f).set_index("match_id")
        sub = pm.loc[piv.index]
        yc = sub.apply(
            lambda r: 0 if r["home_goals_90"] > r["away_goals_90"] else (1 if r["home_goals_90"] == r["away_goals_90"] else 2),
            axis=1,
        ).to_numpy()
        Pm = sub[["prob_home", "prob_draw", "prob_away"]].to_numpy()
        Pm = Pm / Pm.sum(1, keepdims=True)
        m1 = log_loss(Pm[np.arange(len(yc)), yc], yc)
        w1 = "WIN" if m1 < mkt_1x2 else "lose"
        if "prob_over_2.5" in pm.columns:
            subt = pm.loc[tp.index]
            ytt = subt.apply(lambda r: 1 if (r["home_goals_90"] + r["away_goals_90"]) > 2.5 else 0, axis=1).to_numpy()
            po = subt["prob_over_2.5"].to_numpy()
            mt = log_loss(np.where(ytt == 1, po, 1 - po), ytt)
            mts, wt = f"{mt:.4f}", ("WIN" if mt < mkt_tot else "lose")
        else:
            mts, wt = "n/a", "n/a"
        print(f"{m:24s}{m1:>10.4f}{w1:>8s}{mts:>10s}{wt:>8s}")

    print(bar)
    print("CLV / line-timing: NOT measurable. Backtest stored closing odds only")
    print("(open == close, clv == 0 for all 941 rows). Needs opening-line history.")


if __name__ == "__main__":
    main()
