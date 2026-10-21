"""Checks on the dataset itself, so a hand edit to data/battles cannot quietly break the site or the exports.

Each battle stores some facts twice: once at the top (red, blue, winner, judges, read by the site and the
rankings) and once in `cells` (the org's wide row, written out to the TSVs). An edit must change both.
Run `uv run pytest tests/test_data_files.py` after editing; a failure names the file and the battle.
"""
import json

import pytest

from pipeline import store

FILES = store.event_files()
SYSTEMS = set(store.SYSTEMS)
EVENT_FIELDS = {"event", "source", "battles"}


def battles():
    for path in FILES:
        ev = json.loads(path.read_text(encoding="utf-8"))
        for b in ev["battles"]:
            yield path.relative_to(store.ROOT), ev, b


@pytest.mark.parametrize("path", FILES, ids=lambda p: str(p.relative_to(store.BATTLES)))
def test_event_file_reads(path):
    ev = json.loads(path.read_text(encoding="utf-8"))           # fails on a stray comma or quote
    assert EVENT_FIELDS <= set(ev), f"{path}: an event file needs {sorted(EVENT_FIELDS)}"
    assert ev["source"] == path.parent.name, f"{path}: 'source' must match its folder ({path.parent.name})"
    if ev.get("date"):
        assert len(ev["date"]) == 10 and ev["date"][4] == "-", f"{path}: date must be YYYY-MM-DD"


def test_battles_agree_with_their_cells():
    wrong = []
    for path, ev, b in battles():
        c = b["cells"]
        where = f"{path}, {b.get('stage', '')}, {b.get('red')} vs {b.get('blue')}"
        if b["system"] not in SYSTEMS:
            wrong.append(f"{where}: system {b['system']!r} is not one of {sorted(SYSTEMS)}")
        for field, column in (("red", "breaker 1 (red)"), ("blue", "breaker 2 (blue)"), ("winner", "winner")):
            if (b.get(field) or "") != (c.get(column) or ""):
                wrong.append(f"{where}: {field!r} is {b.get(field)!r} but cells[{column!r}] is {c.get(column)!r}")
        if any(k.startswith("judge ") for k in c) and b.get("judges", []) != store.judges_of(c):
            wrong.append(f"{where}: 'judges' {b.get('judges')} does not match the 'judge N name' cells {store.judges_of(c)}")
        if c.get("event", ev["event"]) != ev["event"]:
            wrong.append(f"{where}: cells['event'] is {c.get('event')!r}, the event is {ev['event']!r}")
    assert not wrong, f"{len(wrong)} battle(s) disagree with their cells:\n" + "\n".join(wrong[:20])


def test_battle_ids_are_unique():
    seen, dupes = {}, []
    for path, _, b in battles():
        if "id" in b:
            if b["id"] in seen:
                dupes.append(f"{b['id']} in {seen[b['id']]} and {path}")
            seen[b["id"]] = path
    assert not dupes, "battle ids must be unique:\n" + "\n".join(dupes[:20])
