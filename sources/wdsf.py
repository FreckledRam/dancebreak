"""WDSF (worlddancesport.org): results of the federation's own breaking events.

Listing:      /Calendar/Results?DisciplineIds=104&Month=..&Year=..  -> /Events/<slug>-<id>
Event:        lists its competitions, /Competitions/Ranking/<slug>-<id>
Competition:  /Competitions/FinalBracket/<slug>-<id> and /Competitions/RoundRobin/<slug>-<id>
              each hold every battle of that phase in one page.
On these pages the blue athlete is printed first; red is breaker 1 in the dataset.
"""
from __future__ import annotations

import re
from datetime import date

from selectolax.lexbor import LexborHTMLParser as HTMLParser

from .and8 import FADER_KEYS, ParseError, _number, _signed

BASE = "https://www.worlddancesport.org"
BREAKING = 104                      # the site's discipline id
FIRST = (2018, 1)
ALWAYS_LISTS_EVENTS = False      # a quiet three months can have no breaking events
SYSTEM_BY_KEYS = {
    frozenset(): "RoundByRound",
    frozenset({"phys", "arti", "inte"}): "Threefold",
    frozenset({"tech", "vari", "perf"}): "PseudoThreefold",
    frozenset({"tech", "vari", "perf", "musi", "crea", "pers"}): "Trivium",
    frozenset({"tech", "voca", "orig", "exec", "musi"}): "WDSFSystem",
}
MONTHS = {m: i for i, m in enumerate(
    "january february march april may june july august september october november december".split(), 1)}


def parse_listing(html: str) -> list[dict]:
    """Events on one month of the results calendar."""
    events = {}
    for href in re.findall(r'href="(/Events/[^"#?]*-(\d+))', html):
        path, event_id = href
        m = re.search(r"-(\d{2})(\d{2})(\d{4})(?:-\d{8})?-\d+$", path)
        if not m:
            continue
        d, mo, y = map(int, m.groups())
        # the path ends -<first day>[-<last day>]-<id>; keep the last day when there is one
        last = re.search(r"-(\d{2})(\d{2})(\d{4})-\d+$", path)
        ld, lm, ly = map(int, last.groups())
        events[event_id] = {"id": event_id, "url": BASE + path, "date": date(ly, lm, ld).isoformat(),
                            "start": date(y, mo, d).isoformat()}
    return list(events.values())


def parse_event(html: str) -> list[str]:
    """Competition ranking URLs on an event page."""
    return [BASE + p for p in dict.fromkeys(re.findall(r'href="(/Competitions/Ranking/[^"#?]+)"', html))]


def parse_title(title: str) -> dict | None:
    """'Final round of the WDSF World Championships Breaking 1 vs 1 B-Girls Adult in Leuven - Belgium on ...'"""
    m = re.search(r"of the (.+?) (\d+ vs \d+|Crew|Team)\b(.*?) in (.+?) on ", title)
    if not m:
        return None
    series, form, rest, place = (s.strip() for s in m.groups())
    return {"series": series, "solo": form == "1 vs 1", "category": f"1vs1 {rest}".strip(),
            "city": place.split(" - ")[0].strip()}


def parse_battle(node) -> dict | None:
    red, blue = node.css_first(".athlete-red .athlete-name"), node.css_first(".athlete-blue .athlete-name")
    if not red or not blue:
        raise ParseError("battle without two athlete names")
    red, blue = (re.sub(r"\s*\([A-Z]{2,3}\)\s*$", "", n.text(strip=True)) for n in (red, blue))
    rounds = node.css(".battleresult__round")
    if not rounds:
        return None                 # a bye
    cells, judges, key_sets = {}, [], set()
    wins, votes = {"1": 0, "2": 0, "": 0}, {"1": 0, "2": 0, "": 0}
    for r, rnd in enumerate(rounds, 1):
        seats = rnd.css(".battleresult__round__score")
        names = [s.css_first(".judge-name").text(strip=True) for s in seats]
        if r == 1:
            judges = names
        elif len(names) != len(judges):
            raise ParseError(f"round {r} has {len(names)} judges, round 1 had {len(judges)}")
        tally = {"1": 0, "2": 0, "": 0}
        for j, seat in enumerate(seats, 1):
            scores = seat.css_first(".scores")
            m = re.search(r"winner_([12])", (scores.attributes.get("class") or "") if scores else "")
            side = m.group(1) if m else ""
            tally[side] += 1
            labels = [f.text(strip=True).lower().split()[0] for f in seat.css(".fader-name")]
            bars = seat.css(".score-bar")
            if len(labels) != len(bars):
                raise ParseError("score names and bars do not line up")
            if not bars:
                cells[f"r{r}j{j}over"] = {"1": "red", "2": "blue"}.get(side, "tie")
                key_sets.add(frozenset())
                continue
            overall = seat.css_first("p")
            cells[f"r{r}j{j}over"] = _signed(_number(overall.text() if overall else ""), side)
            keys = []
            for label, bar in zip(labels, bars):
                if label not in FADER_KEYS:
                    raise ParseError(f"unknown score category {label!r}")
                keys.append(FADER_KEYS[label])
                fill = bar.css_first(".score-bar-1, .score-bar-2")
                text = fill.text(strip=True) if fill else ""
                bar_side = "1" if fill and "score-bar-1" in fill.attributes.get("class", "") else "2"
                cells[f"r{r}j{j}{keys[-1]}"] = _signed(_number(text), bar_side) if text else "0"
            key_sets.add(frozenset(keys))
            if len(keys) == 6:      # Trivium also records button presses per side
                for n, cls in ((1, ".athlete2"), (2, ".athlete1")):
                    text = re.sub(r"\s+", "", "".join(x.text() for x in seat.css(f".score-extras {cls}")))
                    if text:
                        cells[f"r{r}j{j}but{n}"] = re.sub(r"(\dx)", r"\1 ", text)
        for side in tally:
            votes[side] += tally[side]
        wins["1" if tally["1"] > tally["2"] else "2" if tally["2"] > tally["1"] else ""] += 1

    if len(key_sets) != 1 or next(iter(key_sets)) not in SYSTEM_BY_KEYS:
        raise ParseError(f"cannot tell the judging system from categories {sorted(map(sorted, key_sets))}")
    system = SYSTEM_BY_KEYS[next(iter(key_sets))]
    if wins["1"] != wins["2"]:
        winner = red if wins["1"] > wins["2"] else blue
    elif votes["1"] != votes["2"]:
        winner = red if votes["1"] > votes["2"] else blue
    else:
        winner = "Tie"
    cells.update({
        "breaker 1 (red)": red, "breaker 2 (blue)": blue, "winner": winner,
        "battle rounds": str(len(rounds)), "number of judges": str(len(judges)),
        "breaker 1 round wins": str(wins["1"]), "breaker 2 round wins": str(wins["2"]),
        "breaker 1 vote count": str(votes["1"]), "breaker 2 vote count": str(votes["2"]),
    })
    if system == "RoundByRound":
        cells.update({"tie rounds": str(wins[""]), "tie vote count": str(votes[""])})
    for i, name in enumerate(judges, 1):
        cells[f"judge {i} name"] = name
    return {"system": system, "red": red, "blue": blue, "winner": winner, "judges": judges, "cells": cells}


def parse_phase(html: str) -> tuple[dict | None, list[dict], int]:
    """(title info, battles, number of battles the page lists) for a bracket or round robin page."""
    tree = HTMLParser(html)
    title = tree.css_first("title")
    info = parse_title(title.text(strip=True)) if title else None
    listed = len(tree.css("a.js-toggle-battle"))
    battles = [b for b in (parse_battle(n) for n in tree.css("div.battleresult")) if b]
    sizes = [int(m.group(1)) for g in tree.css(".group-title") if (m := re.match(r"Top (\d+)", g.text(strip=True)))]
    if info:
        info["top"] = max(sizes, default=None)
    return info, battles, listed


# ---- pipeline interface

PHASES = (("FinalBracket", "KnockOut"), ("RoundRobin", "RoundRobin"), ("PreQualifier", "PreQualifier"))


def discover(fetch, full: bool = False) -> list[dict]:
    """Breaking events with results. A normal run looks at the last three months; full goes back to 2018."""
    today = date.today()
    months, (y, m) = [], (today.year, today.month)
    while (y, m) >= FIRST and (full or len(months) < 3):
        months.append((y, m))
        y, m = (y, m - 1) if m > 1 else (y - 1, 12)
    events = {}
    for y, m in months:
        html = fetch.get(f"{BASE}/Calendar/Results", params={"DisciplineIds": BREAKING, "Month": m, "Year": y})
        for ev in parse_listing(html):
            place = re.sub(r"-\d{8}.*$", "", ev["url"].rsplit("/", 1)[-1]).replace("-", " ")
            events.setdefault(ev["id"], {**ev, "name": f"WDSF event in {place} {ev['date'][:4]}"})
    return sorted(events.values(), key=lambda e: e["date"], reverse=True)


def collect(fetch, event: dict, save=None) -> tuple[list[dict], list[dict]]:
    save = save or (lambda name, html: None)
    battles, problems = [], []
    page = fetch.get(event["url"])
    save("event.html", page)
    for comp_url in parse_event(page):
        comp_id = comp_url.rsplit("-", 1)[-1]
        if not re.search(r"1-vs-1", comp_url):
            continue                # team and crew competitions
        for phase, label in PHASES:
            url = comp_url.replace("/Ranking/", f"/{phase}/")
            html = fetch.get(url)
            try:
                info, found, listed = parse_phase(html)
            except ParseError:
                save(f"{comp_id}-{phase}.html", html)
                raise
            if not info or not info["solo"] or not (found or listed):
                continue
            if "series" in info and not event.get("named"):
                event["name"] = f"{info['series']} - {info['city']} {event['date'][:4]}"
                event["named"] = True
            size = f"Top {info['top']} " if phase == "FinalBracket" and info["top"] else ""
            stage = f"{info['category']} {size}{label}"
            if listed != len(found):
                problems.append({"stage": stage, "url": url,
                                 "reason": f"page lists {listed} battles, {len(found)} have scores"})
            for n, b in enumerate(found, 1):
                b.update(id=f"wdsf-{event['id']}-{comp_id}-{phase.lower()}-{n:02d}", stage=stage, url=url)
                b["cells"] = {"event": event["name"], "stage": stage, **b["cells"]}
                battles.append(b)
    event.pop("named", None)
    for b in battles:               # the event name is only known once a competition page is read
        b["cells"]["event"] = event["name"]
    return battles, problems
