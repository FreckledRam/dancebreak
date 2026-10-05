"""Write the data files the static site reads (site/data/).

    uv run python -m pipeline.build_site
"""
from __future__ import annotations

import json
import shutil

from . import state, store

OUT = store.ROOT / "site" / "data"


def queue() -> dict:
    """Per source: events seen but not collected yet, in the order they will be taken (newest first)."""
    out = {}
    for path in sorted((store.DATA / "sources").glob("*.json")):
        index = json.loads(path.read_text(encoding="utf-8"))
        waiting = sorted((e for e in index.values() if e["status"] in ("pending", "failed")),
                         key=lambda e: e["date"], reverse=True)
        out[path.stem] = {"waiting": len(waiting),
                          "next": [{"name": e["name"], "date": e["date"]} for e in waiting[:10]]}
    return out


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
        per_source[ev["source"]] = per_source.get(ev["source"], 0) + len(ev["battles"])
        for i, b in enumerate(ev["battles"]):
            rows.append([len(files) - 1, i, ev.get("year"), ev.get("date"), ev["event"], b["stage"],
                         b["red"], b["blue"], b["winner"], b["system"], len(b["judges"]),
                         ev["source"], b.get("url") or ev.get("url"), ", ".join(b["judges"])])

    cols = ["file", "idx", "year", "date", "event", "stage", "red", "blue", "winner",
            "system", "judges", "source", "url", "judge_names"]
    (OUT / "battles.json").write_text(
        json.dumps({"cols": cols, "files": files, "rows": rows}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8")

    activity = json.loads(state.ACTIVITY.read_text(encoding="utf-8")) if state.ACTIVITY.exists() else []
    review_path = store.DATA / "review.json"
    review = json.loads(review_path.read_text(encoding="utf-8")) if review_path.exists() else []
    (OUT / "review.json").write_text(json.dumps(review, ensure_ascii=False), encoding="utf-8")
    st = state.load()
    status = {
        "built": state.now(),
        "battles": len(rows),
        "events": len(files),
        "battles_by_source": per_source,
        "last_run": next((a["time"] for a in activity if a["kind"] == "check"), None),
        "sources": st["sources"],
        "review": len(review),
        # pace of the scheduled run (check.yml: minute 17 of every 6th hour UTC, 10 events per source)
        "events_per_run": 10,
        "hours_between_runs": 6,
        "run_minute": 17,
        "first_year": min((r[2] for r in rows if r[2]), default=None),
        "queue": queue(),
    }
    (OUT / "status.json").write_text(json.dumps(status, ensure_ascii=False), encoding="utf-8")
    (OUT / "activity.json").write_text(json.dumps(activity, ensure_ascii=False), encoding="utf-8")

    store.export_tsvs()
    shutil.copytree(store.EXPORT, OUT / "export")
    print(f"site data: {len(rows)} battles, {len(files)} events")


if __name__ == "__main__":
    main()
