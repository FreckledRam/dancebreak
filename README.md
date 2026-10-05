# Settle It In The Cypher

Automated collection of judge scores from competitive breaking battles.

**Live site: https://sushimaster124.github.io/Settle_It_In_The_Cypher/**

The site shows which sources are being watched, when each was last checked, the full dataset, and a log
of everything the pipeline has done.

## Sources
- And8 (and8.dance)
- WDSF (worlddancesport.org)
- Break Konnect (breakkonnect.com)

## How it works
A scheduled GitHub Action checks each source for new events, scrapes them, validates the result, commits
it to `data/`, and republishes the site. Nobody has to run anything.

```
sources/     one module per site: find events, fetch pages, parse battles
pipeline/    store (dataset + TSV export), state (source status, run log), build_site
data/
  battles/   master dataset, one JSON file per event
  export/    one TSV per judging system, in the original column layout plus date, source, source url
  legacy/    the original hand-collected TSVs this dataset was seeded from
site/        the static site
```

## Data format
One row per battle. Score columns are `r#j#cate`: round, judge seat, category (4 letters).
Negative favors red, positive favors blue. 1 vs 1 battles only.

## Run locally
```bash
uv sync
uv run pytest
uv run python -m pipeline.build_site
python3 -m http.server -d site 8000
```

## Credit and license
Seeded from the dataset compiled by [settleitinthecypher](https://github.com/settleitinthecypher/settleitinthecypher.github.io).
Licensed CC BY-NC-SA 4.0, same as the original.
