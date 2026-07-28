# Legacy betting-model salvage

The retired standalone `nwsl_betting` scaffold used a parallel Postgres,
Apify, and Streamlit architecture. The active `nwsl-model` package already
supersedes its modeling, provider, normalization, backtest, and publishing
layers, so the full scaffold was not retained.

Its one missing safety boundary was preserved in
`nwsl-model/src/odds/raw_payload_quality.py`:

- deterministic raw-payload hashes for deduplication;
- nested provider-schema fingerprints;
- fail-closed rejection for invalid or post-kickoff prices; and
- quarantine decisions for schema drift, unknown markets, unknown teams, and
  inactive sportsbooks.

The module is intentionally provider-neutral. Provider adapters should call it
before normalization once an approved schema-fingerprint allowlist is
established for that source. Until an allowlist exists, no provider should be
described as schema-gated.

The retired scaffold was moved to Trash after this salvage so it remains
recoverable locally without leaving a second active NWSL project directory.
