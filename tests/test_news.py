from datetime import date

from pipeline import news

TODAY = date(2026, 10, 6)


def test_and8_dates_have_no_year_and_can_cross_a_month():
    assert news.and8_dates("Oct 9 th - 10 th in 3 days", TODAY) == ("2026-10-09", "2026-10-10")
    assert news.and8_dates("Oct 31 st - Nov 1 st in 25 days", TODAY) == ("2026-10-31", "2026-11-01")
    assert news.and8_dates("Jan 16 th in 102 days", TODAY) == ("2027-01-16", "2027-01-16")
    assert news.and8_dates("Dec 31 st - Jan 1 st", TODAY) == ("2026-12-31", "2027-01-01")


def test_and8_event_page_says_whether_it_is_breaking_and_where():
    page = ("<p>You are here: and8.dance / Dead Paradise Battle 2026 Oct 10 International Breaking Battle "
            "in Aarau (Switzerland) in 4 days</p><p>Share this event</p><p>similar Events Break Rumble</p>")
    assert news.read_and8_event("Dead Paradise Battle 2026", page) == {"breaking": True, "place": "Aarau, Switzerland"}
    other = "<p>You are here: and8.dance / Pop City Hip Hop and Popping in Paris (France)</p><p>Share this event Break Rumble</p>"
    assert news.read_and8_event("Pop City", other)["breaking"] is False


def test_breakkonnect_skips_drafts_and_shortens_the_address():
    raw = ('[{"id":1,"title":"","image":"","locationAddress":"","dateStart":"2026-10-31T17:00:00Z","status":"draft"},'
           '{"id":2,"title":"Battle of the Boroughs ","image":"abc","locationAddress":"132 Valentine Ln, Yonkers, NY 10705, USA",'
           '"dateStart":"2026-10-31T17:00:00Z","dateEnd":"2026-10-31T22:00:00Z","status":"published","isFinished":false}]')
    (ev,) = news.parse_breakkonnect(raw)
    assert (ev["name"], ev["place"], ev["start"]) == ("Battle of the Boroughs", "Yonkers, NY, USA", "2026-10-31")
    assert ev["image"].endswith("/abc/480/300")


def test_google_news_drops_short_titles_and_repeats():
    item = lambda title, source: (f"<item><title>{title} - {source}</title><link>https://example.org/a</link>"
                                  f"<pubDate>Sat, 03 Oct 2026 07:00:00 GMT</pubDate><source url=\"x\">{source}</source></item>")
    xml = item("Hong 10", "Red Bull") + item("Kim Hong-yul wins silver in breaking at Asian Games", "Yonhap") * 2
    (a,) = news.parse_google_news(xml, TODAY)
    assert (a["title"], a["source"], a["date"]) == ("Kim Hong-yul wins silver in breaking at Asian Games", "Yonhap", "2026-10-03")


def test_merge_drops_past_events_and_sorts_by_date():
    ev = lambda name, start, end: {"source": "and8", "id": name, "name": name, "start": start, "end": end}
    out = news.merge_upcoming({"and8": [ev("B", "2026-10-20", "2026-10-20"), ev("Past", "2026-10-01", "2026-10-02"),
                                        ev("A", "2026-10-05", "2026-10-07")]}, TODAY)
    assert [e["name"] for e in out] == ["A", "B"]
