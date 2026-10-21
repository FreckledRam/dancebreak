# Settle It In The Cypher

Judge-by-judge scores from competitive breaking battles, collected automatically and published as a site.

**Live site: https://freckledram.github.io/dancebreak/**

Every battle in the dataset records who battled, who won, which judges sat on the panel, and what each judge
gave each round. The site ranks breakers (Elo), profiles judges and judging systems, lists every event, and
shows how the scrapers are doing. Everything here is plain files in this repository: if a number on the site
is wrong, the fix is an edit to a file, and this README says which one.

- [Where the data comes from](#where-the-data-comes-from)
- [Where everything lives](#where-everything-lives)
- [Fixing the data](#fixing-the-data)
- [How a run works](#how-a-run-works)
- [Fixing or adding a scraper](#fixing-or-adding-a-scraper)
- [Working on the site](#working-on-the-site)
- [Credit and license](#credit-and-license)

## Where the data comes from

| Source | What it is | Code |
|---|---|---|
| [And8](https://and8.dance/en/stats) | Judging software used by many events; publishes every event's results | [`sources/and8.py`](sources/and8.py) |
| [WDSF](https://www.worlddancesport.org/Calendar/Results?DisciplineIds=104) | The Olympic governing body's own competitions | [`sources/wdsf.py`](sources/wdsf.py) |
| [Break Konnect](https://breakkonnect.com/events) | Event platform; judges give both sides points | [`sources/breakkonnect.py`](sources/breakkonnect.py) |
| Original collection | About 6,500 battles hand-collected by [settleitinthecypher](https://github.com/settleitinthecypher/settleitinthecypher.github.io), imported once | [`pipeline/seed.py`](pipeline/seed.py) |

Only 1 vs 1 breaking battles are collected. Crew battles and other styles are skipped on purpose.

The News tab is built separately by [`pipeline/news.py`](pipeline/news.py) (upcoming events, WDSF articles,
Google News headlines). It never touches the dataset.

## Where everything lives

```
data/
  battles/<source>/<event>.json   THE DATASET. One file per event. Edit these to fix data.
  sources/<source>.json           Every event each scraper has seen, and what happened to it (the queue)
  schema/headers.json             The column layout of each judging system's sheet
  legacy/                         The original collection's TSVs, as imported. Never edited.
  export/*.tsv                    Generated: one sheet per judging system. Do not edit, it is rewritten.
  review.json                     Generated: what the scrapers flagged (shown on the Null page)
  state.json, activity.json,
  progress.json                   Written by the bot: scraper status, run log, live progress
  news.json, news_cache.json      The News tab
sources/                          One scraper per site
pipeline/
  check.py                        The scheduled run: find new events, collect them, all or nothing
  store.py                        Reading the dataset and writing the TSV exports
  analytics.py                    Rankings, judge and system stats, from the dataset
  build_site.py                   Turns data/ into site/data/ (the files the site loads)
  state.py, http.py               Scraper status and run log; polite, cached web requests
  seed.py, videos.py              One-time imports from the original collection
site/                             The static site (HTML, CSS, plain JS; no build step)
tests/                            Scraper tests on saved pages, and checks on the data files
.github/workflows/                check.yml (the daily scrape), pages.yml (publish the site)
```

## Fixing the data

### The short version

1. Find the event file: `data/battles/<source>/<event>.json`. The Events tab shows each event's source; the
   file name is the event's id on that site (And8, WDSF, Break Konnect) or a slug of its name (original
   collection, in `seed/`). `grep -rl "Event Name" data/battles` finds it.
2. Edit it (see below for what to change).
3. Check it: `uv run pytest tests/test_data_files.py`. It names any file and battle that is now inconsistent.
4. Preview it (optional): `uv run python -m pipeline.build_site && python3 -m http.server -d site 8000`.
5. Commit and push to `main`, or open a pull request. The site republishes itself in about a minute.

Your edit will not be undone by the scraper: an event is collected once and never scraped again, unless you
put it back in the queue (see [Re-collecting an event](#re-collecting-an-event)).

### What an event file looks like

```jsonc
{
 "event": "Castle Rock Jam & Battle 2025",
 "source": "and8",                     // must match the folder name
 "date": "2025-11-22",                 // YYYY-MM-DD; original-collection events may only have "year"
 "year": 2025,
 "url": "https://and8.dance/en/stats/reports/4587",
 "battles": [
  {
   "system": "Threefold",              // judging system; one of the sheets in data/schema/headers.json
   "red": "Sebi",                      // ┐
   "blue": "Del Vito",                 // │ what the site and the rankings read
   "winner": "Del Vito",               // │
   "judges": ["Goofy", "Chris Cross", "Kelava"],   // ┘
   "stage": "1vs1 Breaking Kids Top 16 KnockOut",
   "id": "and8-4587-3766-top16knockout-01",        // unique; leave it alone
   "url": "https://and8.dance/...",                // where this battle's scores were read
   "cells": {                          // the battle as one row of its system's sheet, written to the TSVs
    "breaker 1 (red)": "Sebi",
    "breaker 2 (blue)": "Del Vito",
    "winner": "Del Vito",
    "judge 1 name": "Goofy", "judge 2 name": "Chris Cross", "judge 3 name": "Kelava",
    "r1j1over": "3.33",                // round 1, judge 1, category "over" (overall)
    ...
   }
  }
 ]
}
```

**The one rule:** names and the winner are stored twice, at the top of the battle and in `cells`.
Change both. `red` goes with `cells["breaker 1 (red)"]`, `blue` with `cells["breaker 2 (blue)"]`,
`winner` with `cells["winner"]`, and `judges` (in order) with `cells["judge 1 name"]`, `"judge 2 name"`, ...
The data check fails if they disagree.

**Score cells** are named `r<round>j<judge seat><category>`, for example `r2j5phys` is round 2, judge 5,
the "phys" category. Negative numbers favour red, positive favour blue. Which categories exist depends on
the judging system; the full list of columns for each is in `data/schema/headers.json`. Break Konnect's
system (`PointsPerRound`) gives each side points instead: `over`, `redp`, `blup`.

### Common fixes

**A name is misspelled.** Change it everywhere it appears in that battle (top and `cells`). To fix one
person across many events: `grep -rl '"Old Name"' data/battles`, then edit each file.

**One person shows up as two breakers (or judges).** The site treats two spellings as one person when they
match after ignoring capitals, accents, spaces and punctuation (`analytics.key`), so `B-Girl Ami`, `bgirl ami`
and `Bgirl Ami` are one person, but `Ami` is someone else. Pick the spelling you want and use it in every file.
There is no alias list: the files are the source of truth.

**The wrong side won.** Fix `winner` and `cells["winner"]`. If the scores themselves are wrong, fix the score
cells too. Elo comes from `winner` alone; judge votes, unanimous and one-vote rates come from the score cells.

**The judging system is wrong.** Change `system` to the right sheet name. The score cells must use that
sheet's columns, or the export has nowhere to put them (the scraper flags this as "no export column").
Battles whose system could not be read from the page (`Traditional` or `RoundByRound` from a scraped site)
are held out of the totals and shown on the Null page until someone confirms them.

**A battle should not be in the dataset** (a crew battle, a showcase, a duplicate). Delete it from the
`battles` list. To drop a whole event, delete its file, and in `data/sources/<source>.json` set that event's
`"status"` to `"skipped"` so it is clearly not waiting to be collected.

**The event date or name is wrong.** Edit `event`, `date` and `year` at the top. If you rename the event, also
change `cells["event"]` in each battle (the data check catches a mismatch).

**A video link is missing.** Add `"video": "https://..."` to the battle. It appears in the Dataset tab and
the exports.

### Re-collecting an event

If a site has corrected its results, set the event's `"status"` to `"pending"` in
`data/sources/<source>.json`. The next run collects it again and **replaces the whole event file**, so any
hand edits to that event are lost. Hand edits are only for things the source itself has wrong.

### Things to leave alone

- `data/export/` and `site/data/`: generated from `data/battles` on every build.
- `data/legacy/`: the original collection exactly as imported, kept for reference.
- `state.json`, `activity.json`, `progress.json`, `review.json`: the bot rewrites them every run.
- A battle's `id`.

One side effect to know: before scraping, each scraper re-reads up to three small events it collected before
and compares the breakers' names, to catch a site that has changed its layout. If you rename breakers in those
particular events, that check can think the site changed and skip the run; the Scrapers tab says so. It is
rare, and putting the names back (or re-collecting the event) clears it.

## How a run works

[`.github/workflows/check.yml`](.github/workflows/check.yml) runs once a day at 10:17 UTC (with a backup at
16:17 that does nothing if the first one ran). For each source, [`pipeline/check.py`](pipeline/check.py):

1. Lists the site's events and adds new ones to the queue (`data/sources/<source>.json`).
2. Waits until an event is two days old, so its results have been posted.
3. Runs the pre-scrape check above. If it fails, that scraper does nothing this run.
4. Collects up to 10 queued events, newest first, in memory.
5. Only if every one succeeds, writes them all. One failure means nothing from that scraper is saved, and the
   event that failed is retried next run. After 3 failures it is set aside and listed on the Null page, so it
   cannot block the events behind it.
6. Commits to `main`, which republishes the site ([`pages.yml`](.github/workflows/pages.yml)).

Pages fetched during a failed scrape are saved under `snapshots/` so the parser can be fixed against them.

**Manual runs.** The Manual run button on the Scrapers tab opens the workflow's "Run workflow" page on GitHub,
which needs write access to this repository. Manual runs are limited to one every 24 hours (enforced in
`check.yml`, step "Manual run cooldown") so the sites are not visited more than they need to be. A backfill of
older events: run the workflow with "Look at every year" ticked and a larger "Events to collect".

## Fixing or adding a scraper

Each file in `sources/` is one site, and exposes two functions:

- `discover(fetch, full)` returns the site's events: `[{"id", "name", "date", "url"}, ...]`, newest first.
  `full=True` means every year, not just recent ones.
- `collect(fetch, event, save_page)` returns `(battles, problems)` for one event. Each battle has the shape
  shown above; `problems` are notes for the Null page (`{"stage", "url", "reason"}`). Raise on anything
  unexpected rather than guessing: the run is all or nothing, so an error is safe and a wrong guess is not.

`fetch` is the shared client from `pipeline/http.py`: `fetch.get(url)` and `fetch.post(url, data=...)` return
the page text, wait a second between requests, retry three times, and identify the bot to the site. To add a site: write the module, add it to
`SOURCES` in `pipeline/check.py` and `pipeline/state.py`, and add tests in `tests/` against saved pages in
`tests/fixtures/`.

To try a scraper locally without pushing anything:

```bash
uv run python -m pipeline.check --only and8 --max 2
git diff --stat data     # see what it would add; `git checkout data` to throw it away
```

## Working on the site

Plain HTML, CSS and JavaScript in `site/`, no framework and no build step. `index.html` holds every tab;
`app.js` runs the Scrapers, Dataset and Null pages, `analytics.js` the Breakers, Judges, Events and Systems
tables, `export.js` downloads, `news.js` and `home.js` their tabs, `nav.js` the header and search.

```bash
uv sync
uv run pytest                                  # scraper tests and data checks
uv run python -m pipeline.build_site           # data/ -> site/data/
python3 -m http.server -d site 8000            # then open http://localhost:8000
```

`pages.yml` refuses to publish if any script fails `node --check` or a data file is not readable.

## Credit and license

The history, competition and judging explanations on the Home tab are adapted from *Intro Overview of
Competitive Breaking and the Dataset*, a presentation by **Vincent Qiu**.

Seeded from the dataset compiled by [settleitinthecypher](https://github.com/settleitinthecypher/settleitinthecypher.github.io).
Licensed CC BY-NC-SA 4.0, same as the original.
