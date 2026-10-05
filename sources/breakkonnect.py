"""Break Konnect (breakkonnect.com): event platform used mostly by local and grassroots jams.

The site is a web app over a JSON API, so this reads the API directly.
  /events?t=past&p=<page>&pp=40     finished events
  /events/<id>                      an event and its battles (crewSize 1 = 1 vs 1)
  /battles/<id>/brackets            the bracket: every pairing with a sparring id
  /sparrings/<id>                   one pairing: per round, each judge's points for red and for blue

Its judging differs from the other sources: every judge gives each side points per round.
Those battles go in their own sheet, PointsPerRound, with r#j#redp and r#j#blup, and
r#j#over = blue points minus red points so the sign means the same as everywhere else.
Many organisers only record who won; battles with no judge scores are not collected.
"""
from __future__ import annotations

import json
import re

from .and8 import OTHER_STYLES, ParseError

API = "https://bk2-ivn6elc3dq-uc.a.run.app"
SITE = "https://breakkonnect.com"
PAGE_SIZE = 40
SYSTEM = "PointsPerRound"
TEST_EVENT = re.compile(r"\btest(ing)?\b|\bdemo\b|display mode", re.I)   # the platform's own trial events


def _num(value) -> str:
    return str(int(value)) if float(value) == int(value) else str(value)


def parse_events(text: str) -> list[dict]:
    events = []
    for e in json.loads(text):
        if not e.get("title") or e.get("status") == "draft" or TEST_EVENT.search(e["title"]):
            continue
        events.append({"id": str(e["id"]), "name": e["title"].strip(), "date": e["dateStart"][:10],
                       "url": f"{SITE}/event/{e['id']}"})
    return events


def bracket_pairs(bracket: dict) -> tuple[list[dict], int]:
    """Decided pairings, final first, and the bracket size."""
    halves = [bracket.get("left") or [], bracket.get("right") or []]
    size = 4 * len(halves[0][0]) if halves[0] and halves[0][0] else 2
    pairs = [bracket["final"]] if bracket.get("final") else []
    if bracket.get("third"):
        pairs.append(bracket["third"])
    depth = max((len(h) for h in halves), default=0)
    for level in range(depth - 1, -1, -1):          # later rounds first, like the other sources
        for half in halves:
            pairs += half[level] if level < len(half) else []
    return [p for p in pairs if p.get("winner") and p.get("sparringId")], size


def parse_sparring(sp: dict) -> dict | None:
    """One battle from a sparring record, or None when no judge gave points."""
    try:
        red, blue = sp["red"]["name"].strip(), sp["blue"]["name"].strip()
        rounds = [r["scores"] for r in sp["rounds"] if r.get("scores")]
    except (KeyError, TypeError, AttributeError) as exc:
        raise ParseError(f"sparring record has an unexpected shape: {exc!r}")
    if not rounds or not red or not blue:
        return None
    # judges are listed in the order they submitted, which changes from round to round
    judges = list(dict.fromkeys(s["dancerName"].strip() for scores in rounds for s in scores))
    seat = {name: j for j, name in enumerate(judges, 1)}
    cells = {}
    wins, votes, points = {"1": 0, "2": 0, "": 0}, {"1": 0, "2": 0, "": 0}, {"1": 0.0, "2": 0.0}
    for r, scores in enumerate(rounds, 1):
        tally = {"1": 0, "2": 0, "": 0}
        for s in scores:
            j, rp, bp = seat[s["dancerName"].strip()], s["redPoints"], s["bluePoints"]
            cells[f"r{r}j{j}over"], cells[f"r{r}j{j}redp"], cells[f"r{r}j{j}blup"] = _num(bp - rp), _num(rp), _num(bp)
            tally["1" if rp > bp else "2" if bp > rp else ""] += 1
            points["1"] += rp
            points["2"] += bp
        for side in tally:
            votes[side] += tally[side]
        red_sum, blue_sum = sum(s["redPoints"] for s in scores), sum(s["bluePoints"] for s in scores)
        wins["1" if red_sum > blue_sum else "2" if blue_sum > red_sum else ""] += 1
    winner = {sp["red"].get("id"): red, sp["blue"].get("id"): blue}.get(sp.get("winnerId"), "Tie")
    cells.update({
        "breaker 1 (red)": red, "breaker 2 (blue)": blue, "winner": winner,
        "battle rounds": str(len(rounds)), "number of judges": str(len(judges)),
        "breaker 1 round wins": str(wins["1"]), "breaker 2 round wins": str(wins["2"]), "tie rounds": str(wins[""]),
        "breaker 1 vote count": str(votes["1"]), "breaker 2 vote count": str(votes["2"]),
        "tie vote count": str(votes[""]),
        "breaker 1 points": _num(points["1"]), "breaker 2 points": _num(points["2"]),
    })
    for i, name in enumerate(judges, 1):
        cells[f"judge {i} name"] = name
    return {"system": SYSTEM, "red": red, "blue": blue, "winner": winner, "judges": judges, "cells": cells}


# ---- pipeline interface

def discover(fetch, full: bool = False) -> list[dict]:
    """Finished events, newest pages first. A normal run reads three pages; full reads them all."""
    events, page = {}, 1
    while full or page <= 3:
        batch = parse_events(fetch.get(f"{API}/events", params={"t": "past", "p": page, "pp": PAGE_SIZE}))
        if not batch:
            break
        for ev in batch:
            events.setdefault(ev["id"], ev)
        page += 1
        if page > 60:
            break
    return sorted(events.values(), key=lambda e: e["date"], reverse=True)


def collect(fetch, event: dict, save=None) -> tuple[list[dict], list[dict]]:
    save = save or (lambda name, text: None)
    battles, problems = [], []
    text = fetch.get(f"{API}/events/{event['id']}")
    save("event.json", text)
    for comp in json.loads(text).get("battles") or []:
        title = (comp.get("title") or "").strip()
        if comp.get("crewSize") != 1 or OTHER_STYLES.search(f"{title} {event['name']}"):
            continue
        text = fetch.get(f"{API}/battles/{comp['id']}/brackets")
        save(f"{comp['id']}-brackets.json", text)
        pairs, size = bracket_pairs(json.loads(text))
        stage = f"1vs1 {title} {'Top ' + str(size) if size > 2 else 'Final'} KnockOut"
        found = []
        for n, pair in enumerate(pairs):
            text = fetch.get(f"{API}/sparrings/{pair['sparringId']}")
            save(f"{comp['id']}-sparring-{pair['sparringId']}.json", text)
            battle = parse_sparring(json.loads(text))
            if battle is None and n == 0:
                break               # the final has no judge scores, so this organiser did not record them
            if battle:
                battle.update(id=f"breakkonnect-{event['id']}-{comp['id']}-{pair['sparringId']}",
                              stage=stage, url=f"{SITE}/sparring/{pair['sparringId']}")
                battle["cells"] = {"event": event["name"], "stage": stage, **battle["cells"]}
                found.append(battle)
        if found and len(found) < len(pairs):
            problems.append({"stage": stage, "url": f"{SITE}/battle/{comp['id']}/brackets",
                             "reason": f"{len(pairs)} battles decided, {len(found)} have judge scores"})
        battles += found
    return battles, problems
