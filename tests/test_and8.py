"""And8 parsers against saved pages. Expected output lives next to each page as .json;
the Threefold, Round-by-Round, Traditional and round robin pages were also checked cell for cell
against the original hand-collected dataset."""
import json
from pathlib import Path

import pytest

from sources import and8

FIX = Path(__file__).parent / "fixtures" / "and8"
BATTLES = ["threefold", "roundbyround", "singleslider", "traditional", "roundrobin_page"]


def parsed(name):
    battle = and8.parse_battle((FIX / f"{name}.html").read_text(encoding="utf-8"))
    return and8.settle_system([battle])[0]


@pytest.mark.parametrize("name", BATTLES)
def test_battle(name):
    assert parsed(name) == json.loads((FIX / f"{name}.json").read_text(encoding="utf-8"))


def test_listing():
    events = and8.parse_listing((FIX / "listing_2019.html").read_text(encoding="utf-8"))
    assert len(events) == 35
    assert all(e["id"].isdigit() and len(e["date"]) == 10 for e in events)
    assert any(c["stages"] for e in events for c in e["categories"])


def test_classify():
    assert and8.classify("1vs1 Breaking OPEN B-Boy") == "solo_breaking"
    assert and8.classify("2vs2 Breaking Adults") == "skip"
    assert and8.classify("1vs1 Hip Hop") == "skip"
    assert and8.classify("1vs1 Kids") == "unsure"


def test_no_battle():
    assert and8.parse_battle("<div id='ok'>click on a battle</div>") is None


if __name__ == "__main__":      # regenerate expected output after a deliberate parser change
    for name in BATTLES:
        (FIX / f"{name}.json").write_text(json.dumps(parsed(name), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
