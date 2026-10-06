"""Write the data files the static site reads (site/data/).

    uv run python -m pipeline.build_site
"""
from __future__ import annotations

import json
import re
import shutil
from datetime import datetime, timedelta, timezone

from . import analytics, state, store

OUT = store.ROOT / "site" / "data"


def last_run_added(activity: list) -> dict:
    """Events and battles the most recent run added, summed over its per-source log entries."""
    checks = [a for a in activity if a["kind"] == "check"]
    if not checks:
        return {"events": 0, "battles": 0}
    newest = checks[0]
    if newest.get("run"):
        mine = [a for a in checks if a.get("run") == newest["run"]]
    else:       # entries written before runs were numbered: group by time
        t0 = datetime.fromisoformat(newest["time"].replace("Z", "+00:00"))
        mine = [a for a in checks
                if t0 - datetime.fromisoformat(a["time"].replace("Z", "+00:00")) < timedelta(hours=2, minutes=30)
                and not a.get("run")]
    events = 0
    for a in mine:
        m = re.search(r"from (\d+) events", a["text"])
        events += a["events"] if "events" in a else int(m.group(1)) if m else 0
    return {"events": events, "battles": sum(a.get("battles", 0) for a in mine)}


# Things worth a look in the data itself: code -> (what is missing, how it gets fixed)
QUALITY = {
    "g": ("A judge has no score in a round", "Re-collect, or confirm the source has none"),
    "j": ("No judges recorded", "Check the source page"),
    "w": ("No winner recorded", "Check the source page"),
    "n": ("Breaker name blank", "Check the source page"),
    "i": ("System uncertain", "Only votes were visible, so the judging system is not known; held out until confirmed"),
    "d": ("No date or source link", "Original rows; the backfill links them to the source"),
}
UNCERTAIN = "Uncertain"     # the System value shown for battles whose system is not confirmed
SYSCOL = 9
QCOL = 14                  # position of the quality codes in a site row
NEEDS_REVIEW = "gjwni"      # counted in the Null total; the rest are for information


def quality_codes(b: dict, ev: dict) -> str:
    c, codes = b["cells"], ""
    rounds = c.get("battle rounds", "")
    if rounds.isdigit() and any(f"r{r}j{j}over" not in c
                                for r in range(1, int(rounds) + 1) for j in range(1, len(b["judges"]) + 1)):
        codes += "g"
    if not b["judges"]:
        codes += "j"
    if not b["winner"]:
        codes += "w"
    if not b["red"].strip() or not b["blue"].strip():
        codes += "n"
    if store.system_uncertain({**b, "source": ev["source"]}):
        codes += "i"
    if not ev.get("date") or not (b.get("url") or ev.get("url")):
        codes += "d"
    return codes


def runs(activity: list) -> list:
    """One row per run, newest first, from the per-source log entries."""
    out = []
    for a in activity:
        if a["kind"] != "check":
            continue
        t = datetime.fromisoformat(a["time"].replace("Z", "+00:00"))
        last = out[-1] if out else None
        same = last and (a.get("run") == last["run"] if a.get("run") or last["run"]
                         else last["_t"] - t < timedelta(minutes=20))
        if not same:
            last = {"time": a["time"], "run": a.get("run"), "_t": t, "events": 0, "battles": 0, "ok": True, "note": ""}
            out.append(last)
        m = re.search(r"from (\d+) events", a["text"])
        last["events"] += a["events"] if "events" in a else int(m.group(1)) if m else 0
        last["battles"] += a.get("battles", 0)
        last["_t"] = t
        if "failed" in a["text"] or "Could not" in a["text"]:
            last["ok"] = False
            last["note"] = f"{state.SOURCES.get(a['source'], {}).get('name', a['source'])}: {a['text']}"
    return [{k: v for k, v in r.items() if not k.startswith("_")} for r in out[:12]]


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    files, rows, per_source = [], [], {}
    for path in store.event_files():
        ev = json.loads(path.read_text(encoding="utf-8"))
        rel = f"{path.parent.name}/{path.name}"
        files.append(rel)
        dest = OUT / "events" / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(ev, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        for i, b in enumerate(ev["battles"]):
            unsure = store.system_uncertain({**b, "source": ev["source"]})
            if not unsure:
                per_source[ev["source"]] = per_source.get(ev["source"], 0) + 1
            # uncertain battles are listed under their own System value, never under the scraper's guess
            rows.append([len(files) - 1, i, ev.get("year"), ev.get("date"), ev["event"], b["stage"],
                         b["red"], b["blue"], b["winner"], UNCERTAIN if unsure else b["system"], len(b["judges"]),
                         ev["source"], b.get("url") or ev.get("url"), ", ".join(b["judges"]),
                         quality_codes(b, ev), analytics.key(b["red"]), analytics.key(b["blue"])])

    cols = ["file", "idx", "year", "date", "event", "stage", "red", "blue", "winner",
            "system", "judges", "source", "url", "judge_names", "q", "rk", "bk"]
    (OUT / "battles.json").write_text(
        json.dumps({"cols": cols, "files": files, "rows": rows}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8")

    activity = json.loads(state.ACTIVITY.read_text(encoding="utf-8")) if state.ACTIVITY.exists() else []
    review_path = store.DATA / "review.json"
    review = json.loads(review_path.read_text(encoding="utf-8")) if review_path.exists() else []
    (OUT / "review.json").write_text(json.dumps(review, ensure_ascii=False), encoding="utf-8")
    stats = analytics.build(store.confirmed_battles())
    confirmed = [r for r in rows if r[SYSCOL] != UNCERTAIN]
    (OUT / "analytics.json").write_text(json.dumps(stats, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    recent = [r for r in runs(activity) if datetime.fromisoformat(r["time"].replace("Z", "+00:00")) > week_ago]
    years = [r[2] for r in rows if r[2]]
    st = state.load()
    status = {
        "totals": {
            "breakers": len(stats["breakers"]), "judges": len(stats["judges"]), "decisions": stats["decisions"],
            "week_battles": sum(r["battles"] for r in recent), "week_events": sum(r["events"] for r in recent),
            "first_year": min(years, default=None), "last_year": max(years, default=None),
            "newest_date": max((r[3] for r in rows if r[3]), default=None),
        },
        "built": state.now(),
        "battles": len(confirmed),
        "uncertain": len(rows) - len(confirmed),
        "events": len(files),
        "battles_by_source": per_source,
        "last_run": next((a["time"] for a in activity if a["kind"] == "check"), None),
        "sources": st["sources"],
        "review": len(review),
        "quality": [{"code": code, "label": label, "fix": fix, "count": sum(code in r[QCOL] for r in rows)}
                    for code, (label, fix) in QUALITY.items()],
        "need_review": len(review) + sum(any(c in r[QCOL] for c in NEEDS_REVIEW) for r in rows),
        "runs": runs(activity),
        # pace of the scheduled run (check.yml: minute 17 of every 6th hour UTC, 10 events per source)
        "events_per_run": 10,
        "hours_between_runs": 6,
        "run_minute": 17,
        "last_run_added": last_run_added(activity),
        "queue": state.queue(),
    }
    (OUT / "status.json").write_text(json.dumps(status, ensure_ascii=False), encoding="utf-8")


    store.export_tsvs()
    shutil.copytree(store.EXPORT, OUT / "export")
    print(f"site data: {len(rows)} battles, {len(files)} events")


if __name__ == "__main__":
    main()
