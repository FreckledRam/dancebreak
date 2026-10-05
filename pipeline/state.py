"""Source status (data/state.json) and the run log (data/activity.json)."""
from __future__ import annotations

import json
from datetime import datetime, timezone

from . import store

STATE = store.DATA / "state.json"
ACTIVITY = store.DATA / "activity.json"

SOURCES = {
    "and8": {"name": "And8", "url": "https://and8.dance/en/stats"},
    "wdsf": {"name": "WDSF", "url": "https://www.worlddancesport.org/Calendar/Results?DisciplineIds=104"},
    "breakkonnect": {"name": "Break Konnect", "url": "https://breakkonnect.com/events"},
}


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load() -> dict:
    state = json.loads(STATE.read_text(encoding="utf-8")) if STATE.exists() else {"sources": {}}
    for key, info in SOURCES.items():
        src = state["sources"].setdefault(key, {})
        src.update(info)
        # status: pending (not automated yet) | ok | repairing | broken
        src.setdefault("status", "pending")
        for field in ("last_checked", "last_changed", "newest_event", "newest_date", "note"):
            src.setdefault(field, None)
        src.setdefault("events_seen", 0)
        src.setdefault("events_pending", 0)
    return state


def save(state: dict) -> None:
    store.write_json(STATE, state)


def log(kind: str, text: str, source: str | None = None, **extra) -> None:
    entries = json.loads(ACTIVITY.read_text(encoding="utf-8")) if ACTIVITY.exists() else []
    entries.insert(0, {"time": now(), "kind": kind, "source": source, "text": text, **extra})
    store.write_json(ACTIVITY, entries[:500])
