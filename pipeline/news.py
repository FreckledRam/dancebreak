"""News tab: upcoming breaking events and recent headlines -> data/news.json.

    uv run python -m pipeline.news

Only text is collected. Pictures stay on the site that owns them and are asked for at thumbnail
size, so neither the repository nor the page carries them.
"""
from __future__ import annotations

import html
import json
import re
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

from selectolax.lexbor import LexborHTMLParser as HTMLParser

from sources import and8, breakkonnect, wdsf

from . import store
from .http import Fetcher

NEWS = store.DATA / "news.json"
CACHE = store.DATA / "news_cache.json"      # and8 event id -> is it a breaking event, and its city
AND8_NEW_PER_RUN = 60                       # event pages read per run to answer that for new events
MONTHS_AHEAD = 6
MAX_UPCOMING, MAX_HEADLINES, MAX_FEATURES = 80, 14, 6
HEADLINE_DAYS = 14

AND8_EVENTS = "https://and8.dance/en/events/overview"
BK_IMAGES = "https://images-ivn6elc3dq-uc.a.run.app"
GOOGLE_NEWS = "https://news.google.com/rss/search"
QUERY = '"breaking" (bboy OR bgirl OR "b-boy" OR "b-girl" OR breakdance) when:14d'
ABBR = {m: i for i, m in enumerate("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(), 1)}


def _text(markup: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", markup))).strip()


# ---- upcoming events

def and8_dates(text: str, today: date) -> tuple[str, str] | None:
    """'Oct 9 th - 10 th in 3 days' or 'Oct 31 st - Nov 1 st'. The list prints no year."""
    m = re.match(r"([A-Z][a-z]{2}) (\d+)(?: \w{2})?(?: - (?:([A-Z][a-z]{2}) )?(\d+))?", text)
    if not m or m.group(1) not in ABBR:
        return None
    month, day = ABBR[m.group(1)], int(m.group(2))
    start = date(today.year, month, day)
    if start < today - timedelta(days=60):
        start = date(today.year + 1, month, day)
    end = start
    if m.group(4):
        end_month = ABBR.get(m.group(3), month)
        end = date(start.year + (end_month < month), end_month, int(m.group(4)))
    return start.isoformat(), end.isoformat()


def parse_and8(markup: str, today: date) -> list[dict]:
    events = []
    for row in HTMLParser(markup).css("tr.d_list"):
        cells = row.css("td")
        link = row.css_first("a[href*='/e/']")
        if len(cells) < 3 or not link:
            continue
        dates = and8_dates(_text(cells[0].html), today)
        if not dates:
            continue
        event_id = link.attributes["href"].rstrip("/").rsplit("/", 1)[-1]
        flag = cells[2].css_first("img")
        country = (flag.attributes.get("title") or "") if flag else ""
        venue = _text(cells[2].html)
        events.append({"source": "and8", "id": event_id, "name": link.text(strip=True),
                       "start": dates[0], "end": dates[1], "url": f"https://and8.dance/en/e/{event_id}",
                       "place": ", ".join(p for p in (venue, country) if p), "image": None})
    return events


def read_and8_event(name: str, page: str) -> dict:
    """and8 lists every street dance style. The event's own page says which ones it runs, and where:
    '... International Breaking Battle in Aarau (Switzerland) in 4 days ...'"""
    body = _text(re.sub(r"<(script|style).*?</\1>", " ", page, flags=re.S))
    body = re.split(r"Share this event|more Events|similar Events", body)[0]    # what follows is other events
    body = body.split("You are here:")[-1]
    where = re.search(r" in ([^()0-9,:]{2,40}) \(([^()0-9,:]{2,40})\)", body[:400])     # the line under the title
    return {"breaking": bool(and8.BREAKING.search(f"{name} {body}")),
            "place": f"{where.group(1).strip()}, {where.group(2).strip()}" if where else ""}


def upcoming_and8(fetch, today: date, cache: dict) -> list[dict]:
    known = cache.setdefault("and8", {})
    events = parse_and8(fetch.get(AND8_EVENTS), today)
    budget = AND8_NEW_PER_RUN
    for ev in events:
        if ev["id"] in known or budget <= 0:
            continue
        budget -= 1
        try:
            known[ev["id"]] = read_and8_event(ev["name"], fetch.get(ev["url"]))
        except Exception:
            continue                                    # asked again next run
    wanted = {ev["id"] for ev in events}
    for gone in [k for k in known if k not in wanted]:
        del known[gone]                                 # the event has passed
    return [{**ev, "place": known[ev["id"]]["place"] or ev["place"]} for ev in events if known.get(ev["id"], {}).get("breaking")]


def short_place(address: str) -> str:
    """'132 Valentine Ln, Yonkers, NY 10705, USA' -> 'Yonkers, NY, USA'"""
    parts = [re.sub(r"\s+(\d{4,}(-\d+)?|[A-Z]\d[A-Z] ?\d[A-Z]\d)$", "", p).strip() for p in address.split(",")]
    parts = [p for p in parts if p]
    if len(parts) > 2 and re.match(r"\d", parts[0]):
        parts = parts[1:]
    return ", ".join(parts[-3:])


def parse_breakkonnect(text: str) -> list[dict]:
    events = []
    for e in json.loads(text):
        if not (e.get("title") or "").strip() or e.get("status") != "published" or e.get("isFinished"):
            continue
        if breakkonnect.TEST_EVENT.search(e["title"]):
            continue
        events.append({"source": "breakkonnect", "id": str(e["id"]), "name": e["title"].strip(),
                       "start": e["dateStart"][:10], "end": (e.get("dateEnd") or e["dateStart"])[:10],
                       "url": f"{breakkonnect.SITE}/event/{e['id']}",
                       "place": short_place(e.get("locationAddress") or ""),
                       "image": f"{BK_IMAGES}/{e['image']}/480/300" if e.get("image") else None})
    return events


def upcoming_breakkonnect(fetch, today: date, cache: dict) -> list[dict]:
    events = {}
    for page in (1, 2, 3):
        raw = fetch.get(f"{breakkonnect.API}/events", params={"t": "upcoming", "p": page, "pp": breakkonnect.PAGE_SIZE})
        if not json.loads(raw):
            break
        for ev in parse_breakkonnect(raw):
            events.setdefault(ev["id"], ev)
    return list(events.values())


def parse_wdsf(markup: str) -> list[dict]:
    events = []
    for item in HTMLParser(markup).css("a.calendarlist__item"):
        listed = wdsf.parse_listing(f'href="{item.attributes.get("href", "")}"')
        if not listed:
            continue
        ev = listed[0]
        place = item.css_first(".calendarlist__item__location")
        groups = [g.text(strip=True).rstrip(":").strip() for g in item.css(".calendarlist__item__competitions__group")]
        groups = list(dict.fromkeys(g for g in groups if g))
        events.append({"source": "wdsf", "id": ev["id"], "name": " / ".join(groups[:2]) or "WDSF event",
                       "start": ev["start"], "end": ev["date"], "url": ev["url"],
                       "place": ", ".join(dict.fromkeys(place.text(strip=True).split(" - "))) if place else "", "image": None})
    return events


def upcoming_wdsf(fetch, today: date, cache: dict) -> list[dict]:
    events, (y, m) = {}, (today.year, today.month)
    for _ in range(MONTHS_AHEAD):
        page = fetch.get(f"{wdsf.BASE}/Calendar/Competitions", params={"DisciplineIds": wdsf.BREAKING, "Month": m, "Year": y})
        for ev in parse_wdsf(page):
            events.setdefault(ev["id"], ev)
        y, m = (y, m + 1) if m < 12 else (y + 1, 1)
    return list(events.values())


UPCOMING = {"and8": upcoming_and8, "wdsf": upcoming_wdsf, "breakkonnect": upcoming_breakkonnect}


# ---- articles

def parse_wdsf_news(markup: str) -> list[dict]:
    """The federation's breaking page: its latest articles, each with a picture."""
    articles = []
    for item in HTMLParser(markup).css("a.news__item"):
        title, img, when = (item.css_first(s) for s in (".news__item__title", "img", ".news__item__date"))
        if not title or not when:
            continue
        d, m, y = when.text(strip=True).split("/")
        src = img.attributes.get("src", "") if img else ""
        image = wdsf.BASE + re.sub(r"/\d+x\d+/", "/480x280/", src) if src.startswith("/media/") else None
        articles.append({"title": title.text(strip=True), "source": "WDSF", "date": f"{y}-{m}-{d}",
                         "url": wdsf.BASE + item.attributes["href"], "image": image})
    return articles


def parse_google_news(xml: str, today: date) -> list[dict]:
    articles, seen = [], set()
    for item in re.findall(r"<item>(.*?)</item>", xml, re.S):
        field = lambda tag: html.unescape(m.group(1)).strip() if (m := re.search(rf"<{tag}[^>]*>(.*?)</{tag}>", item, re.S)) else ""
        source, link = field("source").split(" | ")[0], field("link")
        title = field("title")
        title = title.rsplit(" - ", 1)[0].strip() if " - " in title else title
        try:
            when = parsedate_to_datetime(field("pubDate")).date()
        except (TypeError, ValueError):
            continue
        key = re.sub(r"[^a-z0-9]", "", title.lower())[:48]
        # a title of a few words is a profile or tag page, not an article
        if len(title.split()) < 5 or key in seen or not link or (today - when).days > HEADLINE_DAYS:
            continue
        if "worlddancesport" in source.lower() or source == "WDSF":
            continue                                    # those come with pictures from the federation's own page
        seen.add(key)
        articles.append({"title": title, "source": source, "date": when.isoformat(), "url": link, "image": None})
    return sorted(articles, key=lambda a: a["date"], reverse=True)


def features(fetch, today: date) -> list[dict]:
    return parse_wdsf_news(fetch.get(f"{wdsf.BASE}/Breaking"))[:MAX_FEATURES]


def headlines(fetch, today: date) -> list[dict]:
    xml = fetch.get(GOOGLE_NEWS, params={"q": QUERY, "hl": "en-US", "gl": "US", "ceid": "US:en"})
    return parse_google_news(xml, today)[:MAX_HEADLINES]


# ---- one file for the site

def merge_upcoming(by_source: dict[str, list[dict]], today: date) -> list[dict]:
    events, seen = [], set()
    for key in ("wdsf", "breakkonnect", "and8"):        # on a tie, keep the listing that has a picture or a title
        for ev in by_source.get(key, []):
            name_key = (re.sub(r"[^a-z0-9]", "", ev["name"].lower()), ev["start"])
            if ev["end"] < today.isoformat() or name_key in seen:
                continue
            seen.add(name_key)
            events.append(ev)
    return sorted(events, key=lambda e: (e["start"], e["name"]))[:MAX_UPCOMING]


def main() -> None:
    today = datetime.now(timezone.utc).date()
    old = json.loads(NEWS.read_text(encoding="utf-8")) if NEWS.exists() else {}
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    fetch = Fetcher()
    errors = {}

    # a source that fails keeps what it gave last time
    by_source = {}
    for key, collect in UPCOMING.items():
        try:
            by_source[key] = collect(fetch, today, cache)
        except Exception as exc:
            errors[key] = str(exc)[:200]
            by_source[key] = [e for e in old.get("upcoming", []) if e["source"] == key]
        print(f"{key}: {len(by_source[key])} upcoming{' (kept from last run)' if key in errors else ''}")

    articles = {}
    for key, collect in (("features", features), ("headlines", headlines)):
        try:
            articles[key] = collect(fetch, today)
        except Exception as exc:
            errors[key] = str(exc)[:200]
            articles[key] = old.get(key, [])
        print(f"{key}: {len(articles[key])}{' (kept from last run)' if key in errors else ''}")

    store.write_json(CACHE, cache)
    store.write_json(NEWS, {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "upcoming": merge_upcoming(by_source, today),
        **articles,
        "errors": errors,
    })


if __name__ == "__main__":
    main()
