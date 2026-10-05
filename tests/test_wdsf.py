"""WDSF parsers against saved pages from the 2023 World Championship (B-Girls final bracket)."""
import json
from pathlib import Path

from sources import wdsf

FIX = Path(__file__).parent / "fixtures" / "wdsf"


def phase():
    return wdsf.parse_phase((FIX / "finalbracket.html").read_text(encoding="utf-8"))


def test_final_bracket():
    info, battles, listed = phase()
    assert info == {"series": "WDSF World Championships Breaking", "solo": True,
                    "category": "1vs1 B-Girls Adult", "city": "Leuven", "top": 8}
    assert listed == len(battles) == 8
    assert battles == json.loads((FIX / "finalbracket.json").read_text(encoding="utf-8"))


def test_scores_add_up():
    for b in phase()[1]:
        c = b["cells"]
        for r in range(1, int(c["battle rounds"]) + 1):
            for j in range(1, len(b["judges"]) + 1):
                parts = sum(float(c[f"r{r}j{j}{k}"]) for k in ("tech", "voca", "orig", "exec", "musi"))
                assert abs(parts - float(c[f"r{r}j{j}over"])) < 0.35


def test_listing_and_event():
    events = wdsf.parse_listing((FIX / "listing.html").read_text(encoding="utf-8"))
    assert [(e["id"], e["date"]) for e in events] == [("7959", "2023-09-24")]
    comps = wdsf.parse_event((FIX / "event.html").read_text(encoding="utf-8"))
    assert len(comps) == 2 and all("1-vs-1" in c for c in comps)


if __name__ == "__main__":
    (FIX / "finalbracket.json").write_text(json.dumps(phase()[1], ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
