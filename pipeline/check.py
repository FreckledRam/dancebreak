"""The scheduled run: look for new events on each source, collect them, update status.

    uv run python -m pipeline.check                    # normal run
    uv run python -m pipeline.check --full --max 40    # backfill older events
    uv run python -m pipeline.check --only and8
"""
from __future__ import annotations

import argparse
import importlib
import json
import os
import re
import subprocess
import traceback
from datetime import date, timedelta

from . import http, state, store

SOURCES = ["and8", "wdsf", "breakkonnect"]
SETTLE_DAYS = 2          # leave an event alone until its results have had time to be posted
SAVE_EVERY = 10          # events between saves, so a long run shows progress and keeps its work if cut off
REVIEW = store.DATA / "review.json"
INDEX = store.DATA / "sources"


def name_key(name: str, year) -> tuple[str, str]:
    """Event identity that survives a trailing year and punctuation differences."""
    bare = re.sub(r"\s*(19|20)\d\d\s*$", "", name).lower()
    return re.sub(r"[^a-z0-9]", "", bare), str(year)


def seed_events() -> dict:
    out = {}
    for path in (store.BATTLES / "seed").glob("*.json"):
        ev = json.loads(path.read_text(encoding="utf-8"))
        out[name_key(ev["event"], ev.get("year"))] = (path, ev)
    return out


def pairs(battles: list[dict]) -> set:
    return {frozenset((b["red"].lower(), b["blue"].lower())) for b in battles}


def seed_overlap(battles: list[dict], seeds: dict):
    """The original-dataset event that already holds most of these battles, if any.
    Catches events the org collected under a hand-written name."""
    mine = pairs(battles)
    if len(mine) < 4:
        return None
    for path, data in seeds.values():
        if len(mine & pairs(data["battles"])) >= 0.6 * len(mine):
            return path, data
    return None


def load_json(path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def flag(review: list, source: str, event: dict, problems: list[dict]) -> None:
    """Replace this event's entries in the review list."""
    review[:] = [r for r in review if not (r["source"] == source and r["event_id"] == event["id"])]
    for p in problems:
        review.append({"source": source, "event_id": event["id"], "event": event["name"],
                       "date": event["date"], **p})


def check_columns(battles: list[dict]) -> list[dict]:
    """Scores that have no column in the export (more rounds or judges than the layout allows)."""
    headers = {s: set(store.col_keys(h)) for s, h in store.headers().items()}
    problems = []
    for b in battles:
        extra = sorted(set(b["cells"]) - headers[b["system"]])
        if extra:
            problems.append({"stage": b["stage"], "url": b.get("url"),
                             "reason": f"{b['red']} vs {b['blue']}: no export column for {', '.join(extra[:4])}"})
    return problems


def save_progress(key, index, st, review, message: str) -> None:
    """Write everything collected so far and, on GitHub, push it, so a run that dies keeps its work."""
    if index is not None:
        store.write_json(INDEX / f"{key}.json", index)
    state.save(st)
    store.write_json(REVIEW, review)
    if not os.environ.get("PUSH_PROGRESS"):
        return
    http.SNAPSHOTS.mkdir(exist_ok=True)
    for cmd in (["git", "add", "data", "snapshots"], ["git", "commit", "-q", "-m", f"Progress: {message}"],
                ["git", "pull", "-q", "--rebase"], ["git", "push", "-q"]):
        if subprocess.run(cmd, cwd=store.ROOT).returncode:
            print(f"progress not pushed ({' '.join(cmd[:2])} failed); carrying on")
            break


def run_source(key: str, fetch, st: dict, review: list, full: bool, limit: int) -> None:
    module = importlib.import_module(f"sources.{key}")
    src = st["sources"][key]
    index = load_json(INDEX / f"{key}.json", {})
    seeds = seed_events()
    events = module.discover(fetch, full)
    src["last_checked"] = state.now()
    cutoff = (date.today() - timedelta(days=SETTLE_DAYS)).isoformat()

    new_names = []
    for ev in events:
        entry = index.get(ev["id"])
        if entry is None:
            entry = index[ev["id"]] = {"name": ev["name"], "date": ev["date"], "status": "pending"}
            new_names.append(ev["name"])
        seeded = seeds.get(name_key(ev["name"], ev["date"][:4]))
        if seeded and entry["status"] == "pending":
            # already in the original dataset: keep those rows, just record when and where it happened
            path, data = seeded
            data.update(date=ev["date"], url=ev["url"], year=int(ev["date"][:4]))
            store.write_json(path, data)
            entry["status"] = "in_original"

    todo = [ev for ev in events if index[ev["id"]]["status"] in ("pending", "failed") and ev["date"] <= cutoff]
    added_events = added_battles = 0
    errors = []
    for n, ev in enumerate(todo[:limit], 1):
        try:
            entry = index[ev["id"]]
            pages = {}
            try:
                battles, problems = module.collect(fetch, ev, lambda name, html: pages.__setitem__(name, html))
            except Exception as exc:
                entry["status"] = "failed"
                entry["error"] = f"{type(exc).__name__}: {exc}"
                errors.append(f"{ev['name']}: {entry['error']}")
                for name, html in pages.items():        # keep what was fetched so the parser can be repaired
                    http.snapshot(key, ev["id"], name, html)
                traceback.print_exc()
                continue
            entry["name"] = ev["name"]
            already = seed_overlap(battles, seeds)
            if already:
                path, data = already
                data.update(date=ev["date"], url=ev["url"], year=int(ev["date"][:4]))
                store.write_json(path, data)
                entry.update(status="in_original", battles=0)
                entry.pop("error", None)
                flag(review, key, ev, [])
                print(f"{key}: {ev['date']} {ev['name']}: already in the original dataset as '{data['event']}'")
                continue
            problems += check_columns(battles)
            flag(review, key, ev, problems)
            entry.pop("error", None)
            entry["battles"] = len(battles)
            entry["status"] = "collected" if battles else "nothing_to_collect"
            if battles:
                store.write_json(store.BATTLES / key / f"{ev['id']}.json", {
                    "event": ev["name"], "source": key, "date": ev["date"], "year": int(ev["date"][:4]),
                    "url": ev["url"], "battles": battles})
                added_events += 1
                added_battles += len(battles)
                src["last_changed"] = state.now()
            print(f"{key}: {ev['date']} {ev['name']}: {len(battles)} battles, {len(problems)} flagged")
        finally:
            if n % SAVE_EVERY == 0:
                save_progress(key, index, st, review, f"{key}: {n} of {min(len(todo), limit)} events")

    listed = [index[e["id"]] for e in events]
    newest = max(events, key=lambda e: e["date"], default=None)
    if newest:
        src["newest_event"], src["newest_date"] = index[newest["id"]]["name"], newest["date"]
    src["events_seen"] = len(index)
    src["events_pending"] = sum(1 for e in index.values() if e["status"] in ("pending", "failed"))
    src["status"] = "broken" if errors else "ok"
    src["note"] = errors[0] if errors else None
    store.write_json(INDEX / f"{key}.json", index)

    parts = [f"{len(listed)} events listed"]
    if new_names:
        parts.append(f"{len(new_names)} new")
    if added_events:
        parts.append(f"collected {added_battles} battles from {added_events} events")
    if errors:
        parts.append(f"{len(errors)} failed to parse")
    if src["events_pending"]:
        parts.append(f"{src['events_pending']} waiting")
    state.log("check", ", ".join(parts) + ".", key, battles=added_battles)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--full", action="store_true", help="list every year, not just this one and last")
    ap.add_argument("--max", type=int, default=10, help="events to collect per source per run")
    ap.add_argument("--only", choices=SOURCES)
    args = ap.parse_args()

    st = state.load()
    review = load_json(REVIEW, [])
    for key in [args.only] if args.only else SOURCES:
        fetch = http.Fetcher()
        try:
            run_source(key, fetch, st, review, args.full, args.max)
        except Exception as exc:                 # the listing itself could not be read
            traceback.print_exc()
            st["sources"][key].update(status="broken", note=f"{type(exc).__name__}: {exc}",
                                      last_checked=state.now())
            state.log("check", f"Could not read the event listing: {exc}", key)
        print(f"{key}: {fetch.requests} requests")
    store.export_tsvs()
    save_progress(None, None, st, review, "run finished")


if __name__ == "__main__":
    main()
