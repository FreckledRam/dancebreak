"""And8 (and8.dance): the judging system used by many events; every event's results are published there.

Listing:  /en/stats shows the current year; other years come from a POST to /en/stats/reports/.
Bracket:  /en/stats/reports/<event>/<category>/r/ is a picture of the bracket. Clicking it requests
          ?data=1&x=..&y=..&w=1225 and the server answers with the battle under that point.
Groups:   round robin pages link each battle directly.
"""
from __future__ import annotations

import re
from datetime import date

from selectolax.lexbor import LexborHTMLParser as HTMLParser

BASE = "https://and8.dance/en/stats"
FIRST_YEAR = 2015

OTHER_STYLES = re.compile(
    r"hip\s*-?hop|popping|locking|house|waack|krump|all\s*-?styles?|afro|dancehall|vogue|"
    r"experimental|new\s*style|choreo|show|tutting|electro|litefeet|freestyle|heels|k-?pop|salsa", re.I)
BREAKING = re.compile(r"break|b-?\s?boy|b-?\s?girl|bc one|footwork|power\s?move", re.I)
TEAM = re.compile(r"(?<!\d)([2-9]|1\d)\s*(vs?\.?|on|x)\s*([2-9]|1\d)(?!\d)|crew|team|duo|bonnie", re.I)
SOLO = re.compile(r"(?<!\d)1\s*(vs?\.?|on|x)\s*1(?!\d)", re.I)


def classify(category: str) -> str:
    """'solo_breaking', 'skip', or 'unsure' (a person or the event context has to decide)."""
    if TEAM.search(category) or OTHER_STYLES.search(category):
        return "skip"
    if BREAKING.search(category):
        return "solo_breaking"
    return "unsure" if SOLO.search(category) else "skip"


def parse_listing(html: str) -> list[dict]:
    """Events on a listing page, newest first, each with its categories and stage links."""
    events = []
    for block in HTMLParser(html).css("div[id=report_list]"):
        link = block.css_first("a")
        small = block.css_first("small")
        if not link or not small:
            continue
        d, m, y = small.text(strip=True).split(".")
        event = {
            "id": link.attributes["href"].rstrip("/").rsplit("/", 1)[-1],
            "name": link.text(strip=True),
            "date": date(int(y), int(m), int(d)).isoformat(),
            "url": link.attributes["href"],
            "categories": [],
        }
        tags = block.css_first("div[id=hashtags]")
        category = None
        for node in tags.iter() if tags else []:
            if node.tag == "div" and node.text(strip=True):
                category = {"name": node.text(strip=True), "stages": []}
                event["categories"].append(category)
            elif node.tag == "a" and category is not None:
                href = node.attributes.get("href", "")
                if "/review/" in href:      # preselection (showcase) rounds, not battles
                    continue
                category["id"] = href.rstrip("/").split("/")[-2]
                category["stages"].append({"label": node.text(strip=True), "url": href})
        events.append(event)
    return events


def list_events(fetch, years: list[int] | None = None) -> list[dict]:
    this_year = date.today().year
    events = []
    for year in years or range(this_year, FIRST_YEAR - 1, -1):
        if year == this_year:
            html = fetch.get(BASE)
        else:
            html = fetch.post(f"{BASE}/reports/", data={"is_ajax": 1, "year": year})
        events += parse_listing(html)
    return events


# ---- battles

FADER_KEYS = {
    "physical": "phys", "artistic": "arti", "interpretive": "inte",
    "technique": "tech", "variety": "vari", "performativity": "perf", "performance": "perf",
    "musicality": "musi", "creativity": "crea", "personality": "pers",
}
SYSTEM_BY_FADERS = {0: "RoundByRound", 1: "SingleSlider", 3: "Threefold", 6: "Trivium"}


class ParseError(Exception):
    """The page did not have the structure the parser expects."""


def _number(text: str) -> str:
    """'+3,67%' -> '3.67'"""
    m = re.search(r"\d+(?:[.,]\d+)?", text)
    if not m:
        raise ParseError(f"no number in {text!r}")
    return m.group(0).replace(",", ".")


def _signed(value: str, side: str) -> str:
    return "-" + value if side == "1" and float(value) != 0 else value


def _side(node) -> str:
    """'1' (red), '2' (blue) or '' (tie) from an element id such as dancer1_tri."""
    m = re.match(r"dancer([12])", node.attributes.get("id") or "")
    return m.group(1) if m else ""


def parse_battle(html: str) -> dict | None:
    """One battle from the fragment And8 returns for a bracket click or a group link.

    Returns None when the fragment holds no battle. Cells use the dataset's column names.
    """
    tree = HTMLParser(html)
    red, blue = tree.css_first("div[id=dancer1_h]"), tree.css_first("div[id=dancer2_h]")
    if not red or not blue:
        return None
    red, blue = red.text(strip=True), blue.text(strip=True)
    rounds = tree.css("div.round_info")
    if not rounds:
        raise ParseError("battle has no rounds")

    cells, judges, faders_seen = {}, [], set()
    wins, votes = {"1": 0, "2": 0, "": 0}, {"1": 0, "2": 0, "": 0}
    for r, rnd in enumerate(rounds, 1):
        title = rnd.css_first("div.round_title")
        m = re.search(r"dancer([12])_col", title.attributes.get("class") or "") if title else None
        wins[m.group(1) if m else ""] += 1
        seats = rnd.css("div.judges_width")
        if r == 1:
            judges = [s.css_first("b").text(strip=True) for s in seats]
        elif len(seats) != len(judges):
            raise ParseError(f"round {r} has {len(seats)} judges, round 1 had {len(judges)}")
        for j, seat in enumerate(seats, 1):
            box = seat.css_first("div[id^=dancer], div[id*=tri]") or seat
            side = _side(box)
            votes[side] += 1
            faders = seat.css("div.fader_neu")
            faders_seen.add(len(faders))
            if not faders:
                cells[f"r{r}j{j}over"] = {"1": "red", "2": "blue"}.get(side, "tie")
                continue
            overall = re.search(r"</b>\s*(?:<br\s*/?>)?\s*([^<]*\d[^<]*)<", box.html or "")
            if not overall:
                raise ParseError(f"no overall score for judge {j} in round {r}")
            cells[f"r{r}j{j}over"] = _signed(_number(overall.group(1)), side)
            if len(faders) == 1:
                continue
            labels = [d.text(strip=True).lower().split()[0] for d in seat.css("div.fader_desc")]
            if len(labels) != len(faders):
                raise ParseError("fader labels and bars do not line up")
            for label, fader in zip(labels, faders):
                if label not in FADER_KEYS:
                    raise ParseError(f"unknown score category {label!r}")
                bar = fader.css_first("div[id^=dancer]")
                cells[f"r{r}j{j}{FADER_KEYS[label]}"] = _signed(_number(bar.text()), _side(bar)) if bar else "0"
            presses = seat.css_first("div[id=button_presses]")
            if presses:
                for n, side_id in ((1, "dancer1_tri"), (2, "dancer2_tri")):
                    node = presses.css_first(f"div[id={side_id}]")
                    text = re.sub(r"\s+", "", node.text()) if node else ""
                    if text:
                        cells[f"r{r}j{j}but{n}"] = re.sub(r"(\dx)", r"\1 ", text)

    if len(faders_seen) != 1 or next(iter(faders_seen)) not in SYSTEM_BY_FADERS:
        raise ParseError(f"cannot tell the judging system from fader counts {sorted(faders_seen)}")
    if wins["1"] != wins["2"]:
        winner = red if wins["1"] > wins["2"] else blue
    elif votes["1"] != votes["2"]:
        winner = red if votes["1"] > votes["2"] else blue
    else:
        winner = "Tie"
    system = SYSTEM_BY_FADERS[next(iter(faders_seen))]
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


# ---- stages (a bracket or a set of round robin groups)

# Click points on the 1225px-wide bracket picture, final first. Both final layouts are listed
# (with and without a third-place battle); empty points simply return nothing.
_YS32 = (610, 540, 475, 405, 340, 270, 200, 130)
BRACKET_POINTS = {
    2: [(980, 400), (615, 280), (615, 615), (615, 175), (615, 200)],
    4: [(980, 400), (570, 400), (590, 490), (590, 300)],
    8: [(615, 280), (615, 465), (615, 615), (760, 360), (465, 360),
        (980, 430), (980, 160), (245, 430), (245, 160)],
    16: [(615, 175), (615, 525), (615, 615), (745, 360), (480, 360),
         (785, 495), (785, 225), (440, 495), (440, 225),
         (1085, 540), (1085, 405), (1085, 270), (1085, 135), (135, 540), (135, 405), (135, 270), (135, 135)],
    32: [(615, 200), (615, 545), (695, 375), (535, 375), (740, 500), (740, 245), (490, 500), (490, 245),
         (775, 565), (775, 435), (775, 310), (775, 180), (450, 565), (450, 435), (450, 310), (450, 180)]
        + [(935, y) for y in _YS32] + [(300, y) for y in _YS32],
}


def bracket_size(label: str) -> int | None:
    """'Top 22 Knock-Out' -> 32, 'Final KnockOut' -> 2. None if the bracket is larger than we can map."""
    m = re.search(r"top\s*(\d+)", label, re.I)
    n = int(m.group(1)) if m else 2 if re.search(r"final", label, re.I) else None
    return next((size for size in BRACKET_POINTS if n and n <= size), None)


def _signature(battle: dict) -> tuple:
    return (battle["red"], battle["blue"], tuple(sorted(battle["cells"].items())))


def _as_traditional(battle: dict) -> dict:
    """Re-key a votes-only battle (one round, or a tied round plus a tiebreaker) to the Traditional columns."""
    old, n = battle["cells"], len(battle["judges"])
    first = [old[f"r1j{j}over"] for j in range(1, n + 1)]
    tie = [old[f"r2j{j}over"] for j in range(1, n + 1)] if old["battle rounds"] == "2" else []
    cells = {k: v for k, v in old.items() if k.startswith(("breaker", "judge", "number"))}
    for key in ("breaker 1 round wins", "breaker 2 round wins"):
        cells.pop(key, None)
    cells.update({
        "tiebreaker": "yes" if tie else "no",
        "breaker 1 vote count": str(first.count("red")), "breaker 2 vote count": str(first.count("blue")),
        "tie vote count": str(first.count("tie")),
    })
    cells.update({f"j{j}vote": v for j, v in enumerate(first, 1)})
    if tie:
        cells.update({
            "tie breaker 1 vote count": str(tie.count("red")), "tie breaker 2 vote count": str(tie.count("blue")),
            "tie tie vote count": str(tie.count("tie")),
        })
        cells.update({f"tiej{j}vote": v for j, v in enumerate(tie, 1)})
    decisive = tie or first
    reds, blues = decisive.count("red"), decisive.count("blue")
    winner = battle["red"] if reds > blues else battle["blue"] if blues > reds else "Tie"
    cells["winner"] = winner
    return {**battle, "system": "Traditional", "winner": winner, "cells": cells}


def settle_system(battles: list[dict]) -> list[dict]:
    """And8 shows Traditional judging as a one-round battle of plain votes (two rounds when the first
    was tied). A stage where every battle looks like that is Traditional, otherwise Round-by-Round."""
    def looks_traditional(b):
        c = b["cells"]
        if b["system"] != "RoundByRound":
            return False
        return c["battle rounds"] == "1" or (
            c["battle rounds"] == "2" and c["breaker 1 round wins"] == c["breaker 2 round wins"] == "0")
    if battles and all(looks_traditional(b) for b in battles):
        return [_as_traditional(b) for b in battles]
    return battles


def scrape_stage(fetch, stage_url: str, label: str, save=None) -> tuple[list[dict], list[str]]:
    """All battles of one stage, plus a list of problems worth a human look.

    save(name, html) is called with every page fetched so it can be kept as a snapshot.
    """
    save = save or (lambda name, html: None)
    problems, found, seen = [], [], set()
    page = fetch.get(stage_url)
    save("stage.html", page)
    stated = re.search(r"<b>(\d+) Battles</b>", page)

    def add(html: str, url: str, group: str = "") -> None:
        battle = parse_battle(html)
        if battle and _signature(battle) not in seen:
            seen.add(_signature(battle))
            found.append({**battle, "url": url, "group": group})

    groups = HTMLParser(page).css("div.RR_Group")
    if groups:
        for group in groups:
            name = group.css_first("div.RR_open_hide")
            name = name.text(strip=True) if name else ""
            for n, link in enumerate(group.css("a.rr_battles"), 1):
                html = fetch.get(link.attributes["href"])
                save(f"{name or 'group'}-{n}.html".replace(" ", "_"), html)
                add(html, link.attributes["href"], name)
    elif re.search(r"smoke", label, re.I):
        return [], []           # seven to smoke is not a bracket of 1 vs 1 battles
    else:
        size = bracket_size(label)
        if size is None:
            return [], [f"bracket layout not mapped for '{label}'"]
        new_style = stage_url.rstrip("/").endswith("/r")
        base = re.sub(r"/r/?$", "/", stage_url)
        for x, y in BRACKET_POINTS[size]:
            url = f"{base}?data=1&x={x}&y={y}&w=1225&type={'r' if new_style else ''}"
            html = fetch.get(url)
            if "dancer1_h" in html:
                save(f"x{x}y{y}.html", html)
            add(html, url)

    if stated and int(stated.group(1)) != len(found):
        problems.append(f"page says {stated.group(1)} battles, found {len(found)}")
    elif not found:
        problems.append("no battles found")
    return settle_system(found), problems
