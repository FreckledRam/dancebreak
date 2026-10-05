"""One-time import of the org's existing TSVs (data/legacy) into the master dataset.

    uv run python -m pipeline.seed
"""
from __future__ import annotations

import shutil

from . import store

LEGACY = store.DATA / "legacy"


def read_tsv(system: str) -> tuple[list[str], list[list[str]]]:
    text = (LEGACY / f"{system}DataRaw.tsv").read_text(encoding="utf-8")
    rows = [line.split("\t") for line in text.split("\n")[:-1]]
    return rows[0], rows[1:]


def main() -> None:
    headers, events = {}, {}
    for system in store.LEGACY_SYSTEMS:
        header, rows = read_tsv(system)
        headers[system] = header
        keys = store.col_keys(header)
        for order, row in enumerate(rows):
            cells = {k: v for k, v in zip(keys, row) if v != ""}
            name = cells.get("event", "")
            ev = events.setdefault(name, {
                "event": name, "source": "seed", "date": None,
                "year": store.year_of(name), "url": None, "battles": []})
            ev["battles"].append({
                "id": f"seed-{system}-{order:04d}",
                "system": system, "order": order,
                "stage": cells.get("stage", ""),
                "red": cells.get("breaker 1 (red)", ""),
                "blue": cells.get("breaker 2 (blue)", ""),
                "winner": cells.get("winner", ""),
                "judges": store.judges_of(cells),
                "cells": cells,
            })

    store.write_json(store.SCHEMA, headers)
    seed_dir = store.BATTLES / "seed"
    if seed_dir.exists():
        shutil.rmtree(seed_dir)
    used = set()
    for name, ev in events.items():
        slug = base = store.slugify(name)
        n = 2
        while slug in used:
            slug, n = f"{base}-{n}", n + 1
        used.add(slug)
        store.write_json(seed_dir / f"{slug}.json", ev)

    counts = store.export_tsvs()
    print(f"{len(events)} events, {sum(counts.values())} battles")
    for system, n in counts.items():
        print(f"  {system}: {n}")


if __name__ == "__main__":
    main()
