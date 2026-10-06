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

from . import analytics, http, state, store

SOURCES = ["and8", "wdsf", "breakkonnect"]
SETTLE_DAYS = 2          # leave an event alone until its results have had time to be posted
MAX_ATTEMPTS = 3         # an event that fails this many runs in a row is set aside, so it cannot block its scraper for good
CANARIES = 3             # known events tried by the pre-scrape check before it decides the site has changed
# rough seconds per event, only used to draw the estimated progress bar on the site
PACE = {"and8": 45, "wdsf": 12, "breakkonnect": 8}
RUN = {"running": False, "started": None, "current": None, "sources": {}}
PROGRESS = store.DATA / "progress.json"
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


def plain_reason(exc: Exception) -> str:
    """Why a scrape failed, in words anyone can follow. The technical detail is kept separately."""
    name = type(exc).__name__
    if name == "ParseError":
        return "The page layout was not recognised, so the site has probably changed."
    if "failed after" in str(exc) or name in ("ConnectError", "ReadTimeout", "ConnectTimeout", "HTTPStatusError", "TransportError"):
        return "The site did not respond."
    return "Something unexpected went wrong."


def save_progress(key, index, st, review, message: str) -> None:
    """Write everything collected so far and, on GitHub, push it, so a run that dies keeps its work."""
    if index is not None:
        store.write_json(INDEX / f"{key}.json", index)
    state.save(st)
    store.write_json(REVIEW, review)
    store.write_json(PROGRESS, {**RUN, "updated": state.now()})    # the site reads this during a run
    if not os.environ.get("PUSH_PROGRESS"):
        return
    http.SNAPSHOTS.mkdir(exist_ok=True)
    for cmd in (["git", "add", "data", "snapshots"], ["git", "commit", "-q", "-m", f"Progress: {message}"],
                ["git", "pull", "-q", "--rebase"], ["git", "push", "-q"]):
        if subprocess.run(cmd, cwd=store.ROOT).returncode:
            print(f"progress not pushed ({' '.join(cmd[:2])} failed); carrying on")
            break


class NotSafeToScrape(Exception):
    """The pre-scrape check failed, so this scraper does not run at all this time."""


def preflight(module, key: str, fetch, events: list[dict], index: dict) -> None:
    """Decide whether a site is safe to scrape before touching any new event.

    1. The event list loaded and every entry has an id, a name and a date.
    2. A test scrape of an event collected earlier still gives the same battles. If the site has
       changed its layout, this fails here instead of halfway through the new events.
    Raises NotSafeToScrape with a plain-English reason.
    """
    if not events and getattr(module, "ALWAYS_LISTS_EVENTS", True):
        raise NotSafeToScrape("its list of events came back empty")
    if any(not (e.get("id") and e.get("name") and re.fullmatch(r"\d{4}-\d{2}-\d{2}", e.get("date") or "")) for e in events):
        raise NotSafeToScrape("its list of events could not be read properly")
    known = [e for e in events if index.get(e["id"], {}).get("status") == "collected"
             and (store.BATTLES / key / f"{e['id']}.json").exists()]
    if not known:
        return                      # nothing collected yet to test against
    shape = lambda battles: sorted((analytics.key(b["red"]), analytics.key(b["blue"]), b["system"]) for b in battles)
    # The smallest known events first (fewest requests). One that still reads the same is enough: a site
    # sometimes corrects a single old event, and that alone must not stop the scraper for good.
    first_problem = None
    for canary in sorted(known, key=lambda e: index[e["id"]].get("battles", 0))[:CANARIES]:
        stored = load_json(store.BATTLES / key / f"{canary['id']}.json", {})
        try:
            fresh, _ = module.collect(fetch, dict(canary))
        except Exception as exc:
            first_problem = first_problem or NotSafeToScrape(
                f"a test scrape of a known event ({canary['name']}) failed. {plain_reason(exc)}")
            first_problem.__cause__ = first_problem.__cause__ or exc
            continue
        if shape(fresh) == shape(stored["battles"]):
            return
        first_problem = first_problem or NotSafeToScrape(
            f"a test scrape of a known event ({canary['name']}) no longer matches what was "
            "collected before, so the site has probably changed")
    raise first_problem


def run_source(key: str, fetch, st: dict, review: list, full: bool, limit: int) -> None:
    """One scraper, all or nothing: every new event is collected and checked in memory first, and only
    if all of them succeed is anything written. A failed pre-scrape check or a single failed event
    means this scraper adds nothing this run."""
    module = importlib.import_module(f"sources.{key}")
    name = state.SOURCES[key]["name"]
    src = st["sources"][key]
    index = load_json(INDEX / f"{key}.json", {})
    seeds = seed_events()
    events = module.discover(fetch, full)
    src["last_checked"] = state.now()
    cutoff = (date.today() - timedelta(days=SETTLE_DAYS)).isoformat()

    new_names, seed_links = [], []
    for ev in events:
        entry = index.get(ev["id"])
        if entry is None:
            entry = index[ev["id"]] = {"name": ev["name"], "date": ev["date"], "status": "pending"}
            new_names.append(ev["name"])
        seeded = seeds.get(name_key(ev["name"], ev["date"][:4]))
        if seeded and entry["status"] == "pending":
            # already in the original dataset: keep those rows, just record when and where it happened
            seed_links.append((seeded, ev))
            entry["status"] = "in_original"

    todo = [ev for ev in events if index[ev["id"]]["status"] in ("pending", "failed") and ev["date"] <= cutoff][:limit]

    def finish(problem: str | None, detail: str | None, added_events: int, added_battles: int, **log) -> None:
        """Record the outcome. The event list (the queue) is always saved; battles only on success."""
        newest = max(events, key=lambda e: e["date"], default=None)
        if newest:
            src["newest_event"], src["newest_date"] = index[newest["id"]]["name"], newest["date"]
        src["events_seen"] = len(index)
        src["events_pending"] = sum(1 for e in index.values() if e["status"] in ("pending", "failed"))
        src["status"] = "broken" if problem else "ok"
        src["note"], src["detail"] = problem, detail
        store.write_json(INDEX / f"{key}.json", index)
        parts = [f"{len(events)} events listed"]
        if new_names:
            parts.append(f"{len(new_names)} new")
        if added_events:
            parts.append(f"collected {added_battles} battles from {added_events} events")
        if problem:
            parts.append(problem)
        elif src["events_pending"]:
            parts.append(f"{src['events_pending']} waiting")
        state.log("check", ", ".join(parts).rstrip(".") + ".", key, battles=added_battles, events=added_events,
                  run=RUN["started"], **log)

    if not todo:
        for (path, data), ev in seed_links:
            data.update(date=ev["date"], url=ev["url"], year=int(ev["date"][:4]))
            store.write_json(path, data)
        finish(None, None, 0, 0)
        return

    # ---- is the site safe to scrape? If not, do nothing at all.
    try:
        preflight(module, key, fetch, events, index)
    except NotSafeToScrape as exc:
        traceback.print_exc()
        for (_, _), ev in seed_links:
            index[ev["id"]]["status"] = "pending"
        finish(f"Did not run: {exc}. Nothing was scraped.", str(exc.__cause__ or exc), 0, 0, skipped=True)
        return

    RUN.update(running=True, current=key)       # tell the site a run has started before the slow part begins
    RUN["sources"][key] = {"todo": len(todo), "done": 0, "started": state.now(),
                           "eta_seconds": len(todo) * PACE.get(key, 30)}
    save_progress(key, index, st, review, f"{key}: starting {len(todo)} events")

    # ---- collect everything in memory
    staged = []
    for n, ev in enumerate(todo, 1):
        pages = {}
        try:
            battles, problems = module.collect(fetch, ev, lambda name, html: pages.__setitem__(name, html))
            problems += check_columns(battles)
        except Exception as exc:
            traceback.print_exc()
            for page, html in pages.items():        # keep what was fetched so the parser can be repaired
                http.snapshot(key, ev["id"], page, html)
            for (_, _), linked in seed_links:
                index[linked["id"]]["status"] = "pending"
            entry = index[ev["id"]]
            entry.update(status="failed", error=f"{type(exc).__name__}: {exc}", attempts=entry.get("attempts", 0) + 1)
            set_aside = entry["attempts"] >= MAX_ATTEMPTS
            if set_aside:
                # It has now cancelled this scraper several runs running. Take it out of the queue and list it
                # on the Null page for a person to look at, so the events behind it can be collected.
                entry["status"] = "skipped"
                flag(review, key, ev, [{"stage": "", "url": ev.get("url"),
                                        "reason": f"set aside after {MAX_ATTEMPTS} failed attempts. {plain_reason(exc)}"}])
            finish(f"Run cancelled: error scraping event: {ev['name']}. {plain_reason(exc)} "
                   "Nothing from this run was saved."
                   + (" This event has now been set aside so the next run can carry on without it." if set_aside else ""),
                   entry["error"], 0, 0, failed=1, failed_event=ev["name"], cancelled=True)
            return
        staged.append((ev, battles, problems))
        RUN["sources"][key]["done"] = n
        print(f"{key}: {ev['date']} {ev['name']}: {len(battles)} battles, {len(problems)} flagged")
        if n % SAVE_EVERY == 0:                     # progress only; no battles are written yet
            save_progress(key, index, st, review, f"{key}: {n} of {len(todo)} events")

    # ---- every event succeeded: write it all
    added_events = added_battles = 0
    for (path, data), ev in seed_links:
        data.update(date=ev["date"], url=ev["url"], year=int(ev["date"][:4]))
        store.write_json(path, data)
    for ev, battles, problems in staged:
        entry = index[ev["id"]]
        entry["name"] = ev["name"]
        entry.pop("error", None)
        entry.pop("attempts", None)
        already = seed_overlap(battles, seeds)
        if already:
            path, data = already
            data.update(date=ev["date"], url=ev["url"], year=int(ev["date"][:4]))
            store.write_json(path, data)
            entry.update(status="in_original", battles=0)
            flag(review, key, ev, [])
            continue
        flag(review, key, ev, problems)
        entry["battles"] = len(battles)
        entry["status"] = "collected" if battles else "nothing_to_collect"
        if battles:
            store.write_json(store.BATTLES / key / f"{ev['id']}.json", {
                "event": ev["name"], "source": key, "date": ev["date"], "year": int(ev["date"][:4]),
                "url": ev["url"], "battles": battles})
            added_events += 1
            added_battles += len(battles)
            src["last_changed"] = state.now()
    finish(None, None, added_events, added_battles)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--full", action="store_true", help="list every year, not just this one and last")
    ap.add_argument("--max", type=int, default=10, help="events to collect per source per run")
    ap.add_argument("--only", choices=SOURCES)
    args = ap.parse_args()

    st = state.load()
    review = load_json(REVIEW, [])
    RUN["started"] = state.now()
    for key in [args.only] if args.only else SOURCES:
        fetch = http.Fetcher()
        try:
            run_source(key, fetch, st, review, args.full, args.max)
        except Exception as exc:                 # the listing itself could not be read
            traceback.print_exc()
            name = state.SOURCES[key]["name"]
            st["sources"][key].update(
                status="broken", last_checked=state.now(), detail=f"{type(exc).__name__}: {exc}",
                note=f"Could not load the list of events from {name}. {plain_reason(exc)}")
            state.log("check", f"Could not load the list of events: {exc}", key, listing_failed=True, run=RUN["started"])
        print(f"{key}: {fetch.requests} requests")
    store.export_tsvs()
    RUN.update(running=False, current=None)
    save_progress(None, None, st, review, "run finished")


if __name__ == "__main__":
    main()
