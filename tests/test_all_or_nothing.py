"""A scraper run adds everything or nothing: a failed pre-scrape check or one failed event writes no battles."""
import json
import types

import pytest

from pipeline import check, state, store


def battle(red, blue):
    cells = {"breaker 1 (red)": red, "breaker 2 (blue)": blue, "winner": red, "battle rounds": "1",
             "number of judges": "1", "judge 1 name": "J", "r1j1over": "-5"}
    return {"system": "SingleSlider", "red": red, "blue": blue, "winner": red, "judges": ["J"],
            "id": f"x-{red}-{blue}", "stage": "1vs1 Breaking Final", "cells": cells}


def event(n):
    return {"id": str(n), "name": f"Jam {n}", "date": f"2026-01-0{n}", "url": f"https://example.org/{n}"}


@pytest.fixture
def world(tmp_path, monkeypatch):
    """A throwaway data folder and a fake scraper whose behaviour each test sets."""
    monkeypatch.setattr(store, "BATTLES", tmp_path / "battles")
    monkeypatch.setattr(check, "INDEX", tmp_path / "sources")
    monkeypatch.setattr(check, "REVIEW", tmp_path / "review.json")
    monkeypatch.setattr(check, "PROGRESS", tmp_path / "progress.json")
    monkeypatch.setattr(state, "STATE", tmp_path / "state.json")
    monkeypatch.setattr(state, "ACTIVITY", tmp_path / "activity.json")
    monkeypatch.delenv("PUSH_PROGRESS", raising=False)
    fake = types.SimpleNamespace(listed=[], results={}, calls=[])

    def collect(fetch, ev, save=None):
        fake.calls.append(ev["id"])
        result = fake.results[ev["id"]]
        if isinstance(result, Exception):
            raise result
        return [dict(b) for b in result], []

    fake.discover = lambda fetch, full=False: [dict(e) for e in fake.listed]
    fake.collect = collect
    monkeypatch.setattr(check.importlib, "import_module", lambda name: fake)

    def run():
        st = state.load()
        check.RUN.update(running=False, started="t", current=None, sources={})
        check.run_source("and8", None, st, [], False, 10)
        return st["sources"]["and8"]

    fake.run = run
    fake.saved = lambda: sorted(p.name for p in (tmp_path / "battles" / "and8").glob("*.json"))
    fake.index = lambda: json.loads((tmp_path / "sources" / "and8.json").read_text())
    return fake


def test_all_events_succeed_everything_is_saved(world):
    world.listed = [event(1), event(2)]
    world.results = {"1": [battle("A", "B")], "2": [battle("C", "D")]}
    src = world.run()
    assert src["status"] == "ok" and src["note"] is None
    assert world.saved() == ["1.json", "2.json"]


def test_one_failed_event_saves_nothing(world):
    world.listed = [event(1), event(2), event(3)]
    world.results = {"3": [battle("A", "B")], "2": RuntimeError("boom"), "1": [battle("E", "F")]}
    src = world.run()
    assert src["status"] == "broken"
    assert src["note"].startswith("Run cancelled: error scraping event: Jam 2.")
    assert "Nothing from this run was saved" in src["note"]
    assert world.saved() == []                                  # not even the event that worked
    statuses = {k: v["status"] for k, v in world.index().items()}
    assert statuses == {"1": "pending", "2": "failed", "3": "pending"}      # all still in the queue


def test_changed_site_is_caught_before_any_new_event(world):
    world.listed = [event(1)]
    world.results = {"1": [battle("A", "B")]}
    world.run()                                                 # event 1 collected: it becomes the test event
    world.listed = [event(1), event(2)]
    world.results = {"1": [battle("A", "SOMEONE ELSE")], "2": [battle("C", "D")]}   # the site now reads differently
    world.calls.clear()
    src = world.run()
    assert src["status"] == "broken" and src["note"].startswith("Did not run:")
    assert world.calls == ["1"]                                 # only the test scrape; event 2 was never touched
    assert world.saved() == ["1.json"]


def test_quiet_run_does_no_test_scrape(world):
    world.listed = [event(1)]
    world.results = {"1": [battle("A", "B")]}
    world.run()
    world.calls.clear()
    src = world.run()                                           # nothing new listed
    assert src["status"] == "ok" and world.calls == []
