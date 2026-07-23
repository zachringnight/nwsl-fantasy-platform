from src.data.team_names import canonicalize_team_name


def test_bay_short_name_canonicalizes_to_bay_fc() -> None:
    # The official NWSL API labels the club "Bay"; matches.csv uses "Bay FC".
    assert canonicalize_team_name("Bay") == canonicalize_team_name("Bay FC")
    assert canonicalize_team_name("Bay") == "Bay FC"
