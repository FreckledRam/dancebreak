"""Attach video links to battles already in the dataset.

    uv run python -m pipeline.videos

The org's first hand-collected file (data/legacy/battle_videos.csv, their data.csv) lists a YouTube link
for each battle it covers. Most of those battles are not in this dataset, which holds judge-level scores.
Where one is, it is the same event, year and pair of breakers, and the link is written onto that battle
as "video". Safe to run again: it only adds or refreshes that one field.
"""
from __future__ import annotations

import csv
import json
import re
from collections import defaultdict

from . import analytics, store

VIDEOS = store.DATA / "legacy" / "battle_videos.csv"
FILLER = {"bboy", "bgirl", "boy", "girl", "b", "the", "breaking"}
MATCH = 0.75             # share of the listed competition's words that must be in the event's name


def words(name: str) -> set[str]:
    """'Red Bull BC One World BBoy Finals' -> {red, bull, bc, one, world, final}"""
    tokens = re.findall(r"[a-z0-9]+", name.lower().replace("b-boy", "bboy").replace("b-girl", "bgirl"))
    return {t.rstrip("s") or t for t in tokens if t not in FILLER and not re.fullmatch(r"(19|20)\d\d", t)}


def same_event(listed: str, event: str) -> bool:
    a, b = words(listed), words(event)
    return bool(a) and len(a & b) / len(a) >= MATCH


def link(raw: str) -> str | None:
    raw = raw.strip()
    if not re.match(r"^(https?://)?(www\.)?(youtube\.com/watch\?v=|youtu\.be/)[\w-]+", raw):
        return None
    return raw if raw.startswith("http") else "https://" + ("www." + raw if raw.startswith("youtube.com") else raw)


def main() -> None:
    listed = defaultdict(list)          # pair of breakers -> rows of the video list (competition, year or None, link)
    with VIDEOS.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            url = link(row["Video Link"])
            if url:
                pair = frozenset((analytics.key(row["Breaker Left"]), analytics.key(row["Breaker Right"])))
                listed[pair].append((row["Competition"], int(row["Year"]) if row["Year"].isdigit() else None, url))

    events = [(path, json.loads(path.read_text(encoding="utf-8"))) for path in store.event_files()]
    # every battle a listed row could belong to: same pair, an event of the same name, and the same year
    # (a row with no year may belong to any year of that event)
    claims = defaultdict(list)          # link -> battles it could belong to
    for path, ev in events:
        for b in ev["battles"]:
            pair = frozenset((analytics.key(b["red"]), analytics.key(b["blue"])))
            for name, year, url in listed.get(pair, []):
                if same_event(name, ev["event"]) and year in (None, ev.get("year")):
                    claims[url].append(b)
    wanted = defaultdict(set)           # battle -> links claiming it
    for url, battles in claims.items():
        for b in battles:
            wanted[id(b)].add(url)
    added, touched = 0, set()
    for path, ev in events:
        for b in ev["battles"]:
            urls = wanted.get(id(b), set())
            # only when it is certain: one link for this battle, and this battle the only one for that link
            url = next(iter(urls)) if len(urls) == 1 and len(claims[next(iter(urls))]) == 1 else None
            if url:
                added += 1
            if b.get("video") != url:
                b.pop("video", None)
                if url:
                    b["video"] = url
                touched.add(path)
    for path, ev in events:
        if path in touched:
            store.write_json(path, ev)
    print(f"{added} battles have a video link")


if __name__ == "__main__":
    main()
