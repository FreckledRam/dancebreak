"""Rankings and statistics derived from the dataset: breakers (Elo), judges, judging systems.

People are matched by name only: spelling, case and punctuation differences are folded together,
but two different people who share a name are counted as one, and one person with two different
stage names is counted as two.
"""
from __future__ import annotations

import re
import unicodedata
from collections import Counter, defaultdict

START, K, K_NEW, NEW_BATTLES = 1500, 24, 40, 10     # Elo: new breakers move faster for their first battles
MIN_BATTLES = 5                                    # below this a breaker is listed but not ranked


def key(name: str) -> str:
    """Identity for a person: 'Phil Wizard', 'PHIL WIZARD' and 'Phil-Wizard' are one."""
    text = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", text) or name.strip().lower()


def division(stage: str) -> str:
    s = stage.lower()
    if re.search(r"b-?\s?girl|women|female|ladies", s):
        return "B-Girls"
    if re.search(r"b-?\s?boy|\bmen\b|\bmale", s):
        return "B-Boys"
    return "Open"


def votes(b: dict) -> list[tuple[str, int, str]]:
    """Every judge decision in a battle as (round, judge seat, 'red' | 'blue' | 'tie')."""
    out = []
    for k, v in b["cells"].items():
        m = re.match(r"^(tie)?(?:r(\d+))?j(\d+)(over|vote)$", k)
        if not m or v == "":
            continue
        rnd = "tie" if m.group(1) else m.group(2) or "1"
        if v in ("red", "blue", "tie"):
            side = v
        else:
            try:
                side = "red" if float(v) < 0 else "blue" if float(v) > 0 else "tie"
            except ValueError:
                continue
        out.append((rnd, int(m.group(3)), side))
    return out


def margins(b: dict) -> list[float]:
    """Sizes of each judge's overall score, for systems that score a margin."""
    out = []
    for k, v in b["cells"].items():
        if re.match(r"^r\d+j\d+over$", k):
            try:
                out.append(abs(float(v)))
            except ValueError:
                pass
    return out


def build(battles: list[dict]) -> dict:
    """battles: store.all_battles(). Returns the data behind the Breakers, Judges and Systems tabs."""
    order = lambda b: (b["date"] or f"{b['year'] or 1900}-07-01", b["event"])
    by_event = defaultdict(list)
    for b in battles:
        by_event[order(b)].append(b)

    names, P = defaultdict(Counter), {}
    def player(name):
        k = key(name)
        names[k][name.strip()] += 1
        return P.setdefault(k, {"elo": START, "peak": START, "n": 0, "w": 0, "l": 0, "t": 0, "events": set(),
                                "years": set(), "div": Counter(), "hist": [], "votes_for": 0, "votes_all": 0})

    for (when, event), group in sorted(by_event.items()):
        delta, touched = Counter(), {}
        for b in group:
            if not b["red"].strip() or not b["blue"].strip() or key(b["red"]) == key(b["blue"]):
                continue
            w = b["winner"].strip()
            score = 1.0 if key(w) == key(b["red"]) else 0.0 if key(w) == key(b["blue"]) else 0.5 if w.lower() == "tie" else None
            if score is None:
                continue
            r, bl = player(b["red"]), player(b["blue"])
            # ratings are frozen for the whole event, so the order of battles inside it does not matter
            expected = 1 / (1 + 10 ** ((bl["elo"] - r["elo"]) / 400))
            for p, s, e, side in ((r, score, expected, "red"), (bl, 1 - score, 1 - expected, "blue")):
                k = K_NEW if p["n"] < NEW_BATTLES else K
                delta[id(p)] += k * (s - e)
                touched[id(p)] = p
                p["n"] += 1
                p["w" if s == 1 else "l" if s == 0 else "t"] += 1
                p["events"].add(event)
                p["div"][division(b["stage"])] += 1
                if b["year"]:
                    p["years"].add(b["year"])
                mine = [v for _, _, v in votes(b)]
                p["votes_for"] += mine.count(side)
                p["votes_all"] += len(mine)
        for pid, p in touched.items():
            p["elo"] += delta[pid]
            p["peak"] = max(p["peak"], p["elo"])
            p["hist"].append([when[:10], round(p["elo"])])

    breakers = []
    for k, p in P.items():
        breakers.append({
            "k": k, "name": names[k].most_common(1)[0][0], "elo": round(p["elo"]), "peak": round(p["peak"]),
            "n": p["n"], "w": p["w"], "l": p["l"], "t": p["t"], "events": len(p["events"]),
            "from": min(p["years"], default=None), "to": max(p["years"], default=None),
            "div": p["div"].most_common(1)[0][0],
            "vote_share": round(100 * p["votes_for"] / p["votes_all"]) if p["votes_all"] else None,
            "hist": p["hist"] if p["n"] >= MIN_BATTLES else [],
        })
    breakers.sort(key=lambda x: (x["n"] < MIN_BATTLES, -x["elo"]))

    # ---- judges: how each one votes compared with the rest of the panel
    J, jnames = {}, defaultdict(Counter)
    for b in battles:
        vs = votes(b)
        rounds = defaultdict(dict)
        for rnd, seat, side in vs:
            rounds[rnd][seat] = side
        size = margins(b)
        for seat, name in enumerate(b["judges"], 1):
            if not name.strip():
                continue
            k = key(name)
            jnames[k][name.strip()] += 1
            j = J.setdefault(k, {"battles": 0, "events": set(), "votes": 0, "with": 0, "red": 0, "blue": 0, "tie": 0,
                                 "alone": 0, "systems": Counter(), "years": set()})
            j["battles"] += 1
            j["events"].add(b["event"])
            j["systems"][b["system"]] += 1
            if b["year"]:
                j["years"].add(b["year"])
            for rnd, seats in rounds.items():
                mine = seats.get(seat)
                if mine is None:
                    continue
                tally = Counter(seats.values())
                red, blue = tally["red"], tally["blue"]
                j["votes"] += 1
                j[mine] += 1
                if red != blue and mine != "tie":
                    majority = "red" if red > blue else "blue"
                    j["with"] += mine == majority
                    j["alone"] += mine != majority and tally[mine] == 1 and len(seats) >= 3
    judges = []
    for k, j in J.items():
        decided = j["red"] + j["blue"]
        judges.append({
            "k": k, "name": jnames[k].most_common(1)[0][0], "battles": j["battles"], "events": len(j["events"]),
            "votes": j["votes"], "with": round(100 * j["with"] / decided, 1) if decided else None,
            "alone": round(100 * j["alone"] / decided, 1) if decided else None,
            "red": round(100 * j["red"] / decided, 1) if decided else None,
            "from": min(j["years"], default=None), "to": max(j["years"], default=None),
            "systems": j["systems"].most_common(),
        })
    judges.sort(key=lambda x: -x["battles"])

    # ---- judging systems: how decisive and how unanimous each one is in practice
    S = defaultdict(lambda: {"battles": 0, "events": set(), "years": set(), "rounds": 0, "unanimous": 0, "one_vote": 0,
                             "red_wins": 0, "decided": 0, "judges": 0, "all_rounds": 0, "margin": 0.0, "margins": 0, "ties": 0})
    for b in battles:
        s = S[b["system"]]
        s["battles"] += 1
        s["events"].add(b["event"])
        s["judges"] += len(b["judges"])
        if b["year"]:
            s["years"].add(b["year"])
        rounds = defaultdict(list)
        for rnd, _, side in votes(b):
            rounds[rnd].append(side)
        s["all_rounds"] += len(rounds)
        for sides in rounds.values():
            red, blue = sides.count("red"), sides.count("blue")
            if len(sides) < 2:      # one judge cannot be unanimous or split
                continue
            s["rounds"] += 1
            s["unanimous"] += max(red, blue) == len(sides)
            s["one_vote"] += abs(red - blue) == 1
        w = key(b["winner"])
        if w == key(b["red"]) or w == key(b["blue"]):
            s["decided"] += 1
            s["red_wins"] += w == key(b["red"])
        elif b["winner"].strip().lower() == "tie":
            s["ties"] += 1
        m = margins(b)
        s["margin"] += sum(m)
        s["margins"] += len(m)
    systems = [{
        "system": name, "battles": s["battles"], "events": len(s["events"]),
        "from": min(s["years"], default=None), "to": max(s["years"], default=None),
        "judges": round(s["judges"] / s["battles"], 1),
        "rounds": round(s["all_rounds"] / s["battles"], 1),
        "unanimous": round(100 * s["unanimous"] / s["rounds"], 1) if s["rounds"] else None,
        "one_vote": round(100 * s["one_vote"] / s["rounds"], 1) if s["rounds"] else None,
        "red_wins": round(100 * s["red_wins"] / s["decided"], 1) if s["decided"] else None,
        "ties": s["ties"],
        "margin": round(s["margin"] / s["margins"], 1) if s["margins"] else None,
    } for name, s in sorted(S.items(), key=lambda kv: -kv[1]["battles"])]

    return {"min_battles": MIN_BATTLES, "breakers": breakers, "judges": judges, "systems": systems}
