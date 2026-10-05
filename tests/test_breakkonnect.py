"""Break Konnect parsers against saved API responses."""
import json
from pathlib import Path

from sources import breakkonnect as bk

FIX = Path(__file__).parent / "fixtures" / "breakkonnect"
load = lambda name: json.loads((FIX / name).read_text(encoding="utf-8"))


def test_sparring():
    b = bk.parse_sparring(load("sparring.json"))
    c = b["cells"]
    assert (b["red"], b["blue"], b["winner"], b["system"]) == ("Character King", "Lokita", "Character King", "PointsPerRound")
    assert b["judges"] == ["Wesley Swipes", "Max Crebs", "bboy monkee"]
    assert c["battle rounds"] == "2"                        # the empty third round is not a round
    assert (c["r1j1redp"], c["r1j1blup"], c["r1j1over"]) == ("10", "9", "-1")   # negative favors red
    assert (c["breaker 1 points"], c["breaker 2 points"]) == ("53", "48")
    assert (c["breaker 1 round wins"], c["breaker 2 round wins"]) == ("2", "0")


def test_judges_in_a_different_order_each_round():
    sp = load("sparring.json")
    sp["rounds"][1]["scores"].reverse()
    assert bk.parse_sparring(sp) == bk.parse_sparring(load("sparring.json"))


def test_unscored_sparring_is_skipped():
    sp = load("sparring.json")
    for r in sp["rounds"]:
        r["scores"] = []
    assert bk.parse_sparring(sp) is None


def test_brackets():
    pairs, size = bk.bracket_pairs(load("brackets_final_only.json"))
    assert size == 2 and [p["sparringId"] for p in pairs] == [48324]
    pairs, size = bk.bracket_pairs(load("brackets_top8_undecided.json"))
    assert size == 8 and pairs == []                        # nothing decided yet


def test_platform_test_events_are_ignored():
    listing = json.dumps([
        {"id": 1, "title": "Display Mode Test", "dateStart": "2026-03-16T00:00:00Z", "status": "published"},
        {"id": 2, "title": "Holy Smokes", "dateStart": "2026-08-29T19:30:00Z", "status": "published"},
        {"id": 3, "title": "", "dateStart": "2026-10-05T00:00:00Z", "status": "draft"},
    ])
    assert [e["name"] for e in bk.parse_events(listing)] == ["Holy Smokes"]
