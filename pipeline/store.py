"""Dataset storage.

Master copy: data/battles/<source>/<event-slug>.json, one file per event.
Each battle keeps every non-empty cell of its row in the org's wide format
(`cells`, keyed by column name such as r2j5phys), so the org's TSVs can be
regenerated exactly. Columns and their order per judging system live in
data/schema/headers.json.
"""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
BATTLES = DATA / "battles"
EXPORT = DATA / "export"
SCHEMA = DATA / "schema" / "headers.json"

LEGACY_SYSTEMS = ["Traditional", "RoundByRound", "SingleSlider", "Threefold",
                  "PseudoThreefold", "Trivium", "WDSFSystem"]
SYSTEMS = LEGACY_SYSTEMS + ["PointsPerRound"]
# Break Konnect's format, which the original dataset had no sheet for: each judge gives both sides points.
POINTS_HEADER = (
    ["event", "stage", "breaker 1 (red)", "breaker 2 (blue)", "winner", "battle rounds", "number of judges",
     "breaker 1 round wins", "breaker 2 round wins", "tie rounds", "breaker 1 vote count",
     "breaker 2 vote count", "tie vote count", "breaker 1 points", "breaker 2 points"]
    + [f"judge {j} name" for j in range(1, 10)]
    + [f"r{r}j{j}{k}" for r in range(1, 6) for j in range(1, 10) for k in ("over", "redp", "blup")])
# columns appended to the org's format on export
EXTRA_COLS = ["date", "source", "source url", "video url"]


def col_keys(header: list[str]) -> list[str]:
    """Unique key per column. Blank or repeated header cells get a positional key."""
    seen, keys = set(), []
    for i, name in enumerate(header):
        key = name if name.strip() and name not in seen else f"_c{i}"
        seen.add(key)
        keys.append(key)
    return keys


def headers() -> dict[str, list[str]]:
    return {**json.loads(SCHEMA.read_text(encoding="utf-8")), "PointsPerRound": POINTS_HEADER}


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:80] or "event"


def year_of(event: str, date: str | None = None) -> int | None:
    if date:
        return int(date[:4])
    found = re.findall(r"(?<!\d)(19[89]\d|20[0-3]\d)(?!\d)", event)
    return int(found[-1]) if found else None


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def event_files() -> list[Path]:
    return sorted(BATTLES.glob("*/*.json"))


def load_events() -> list[dict]:
    return [json.loads(p.read_text(encoding="utf-8")) for p in event_files()]


def all_battles() -> list[dict]:
    """Every battle with its event's fields folded in."""
    out = []
    for ev in load_events():
        for b in ev["battles"]:
            out.append({**b, "event": ev["event"], "date": ev.get("date"),
                        "source": ev["source"], "year": ev.get("year"),
                        "event_url": ev.get("url")})
    return out


VOTE_ONLY = ("Traditional", "RoundByRound")


def system_uncertain(b: dict) -> bool:
    """A scraped battle whose judging system could not be read off the page.

    When a page shows only who each judge voted for, Traditional and Round-by-Round look the same, and a
    site may also be hiding slider or category scores. Such a battle is kept, but held out of the
    confirmed dataset (exports, totals, rankings) until someone confirms its system.
    b: a battle from all_battles(), which carries its event's source.
    """
    return b["source"] != "seed" and b["system"] in VOTE_ONLY


def confirmed_battles() -> list[dict]:
    return [b for b in all_battles() if not system_uncertain(b)]


def judges_of(cells: dict) -> list[str]:
    return [cells[f"judge {i} name"] for i in range(1, 10) if cells.get(f"judge {i} name")]


def export_order(b: dict):
    # seed rows keep the org's original order; scraped rows follow, oldest first
    return (0, b["order"], "", "") if b["source"] == "seed" else (1, 0, b.get("date") or "", b["id"])


def export_tsvs() -> dict[str, int]:
    """Write one TSV per judging system in the org's column layout."""
    hdrs = headers()
    by_system: dict[str, list[dict]] = {s: [] for s in SYSTEMS}
    for b in confirmed_battles():
        by_system[b["system"]].append(b)
    EXPORT.mkdir(parents=True, exist_ok=True)
    counts = {}
    for system, battles in by_system.items():
        header = hdrs[system]
        keys = col_keys(header)
        lines = ["\t".join(header + EXTRA_COLS)]
        for b in sorted(battles, key=export_order):
            row = [b["cells"].get(k, "") for k in keys]
            row += [b.get("date") or "", b["source"], b.get("url") or b.get("event_url") or "", b.get("video") or ""]
            lines.append("\t".join(row))
        (EXPORT / f"{system}DataRaw.tsv").write_text("\n".join(lines) + "\n", encoding="utf-8")
        counts[system] = len(battles)
    return counts
