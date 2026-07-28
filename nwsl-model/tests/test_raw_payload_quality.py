from src.odds.raw_payload_quality import (
    decide_quality,
    evaluate_raw_payload,
    nested_schema_fingerprint,
    payload_hash,
)


def test_payload_hash_is_stable_for_key_order() -> None:
    assert payload_hash({"a": 1, "b": 2}) == payload_hash({"b": 2, "a": 1})


def test_nested_schema_fingerprint_tracks_all_list_item_shapes() -> None:
    baseline = nested_schema_fingerprint(
        {"events": [{"team": "A"}, {"team": "B", "price": 1.9}]}
    )
    reordered = nested_schema_fingerprint(
        {"events": [{"price": 2.0, "team": "B"}, {"team": "A"}]}
    )
    drifted = nested_schema_fingerprint(
        {"events": [{"team": "A"}, {"team": "B", "odds": 1.9}]}
    )

    assert baseline == reordered
    assert baseline != drifted


def test_schema_drift_is_quarantined_before_normalization() -> None:
    expected = nested_schema_fingerprint({"market": "total", "price": 1.91})
    result = evaluate_raw_payload(
        {"market": "total", "decimal_price": 1.91},
        expected_schema_fingerprints={expected},
        market_known=True,
        team_known=True,
    )

    assert result.decision.status == "quarantined"
    assert result.decision.reason == "schema_drift"


def test_invalid_and_post_kickoff_prices_are_rejected() -> None:
    assert decide_quality(
        market_known=True,
        team_known=True,
        price_valid=False,
    ).reason == "invalid_price"
    assert decide_quality(
        market_known=True,
        team_known=True,
        pre_match_valid=False,
    ).reason == "post_kickoff_price"


def test_known_valid_payload_passes() -> None:
    payload = {"market": "total", "price": 1.91}
    expected = nested_schema_fingerprint(payload)
    result = evaluate_raw_payload(
        payload,
        expected_schema_fingerprints={expected},
        market_known=True,
        team_known=True,
    )

    assert result.decision.status == "valid"
    assert result.decision.reason is None
