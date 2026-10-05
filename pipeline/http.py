"""Polite HTTP: one identified client, a pause between requests, retries, optional snapshots."""
from __future__ import annotations

import time
from pathlib import Path

import httpx

from . import store

USER_AGENT = "SettleItInTheCypher/0.1 (+https://github.com/FreckledRam/dancebreak)"
SNAPSHOTS = store.ROOT / "snapshots"


class Fetcher:
    def __init__(self, delay: float = 1.0):
        self.client = httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=40, follow_redirects=True)
        self.delay = delay
        self._last = 0.0
        self.requests = 0

    def request(self, method: str, url: str, **kwargs) -> httpx.Response:
        for attempt in range(3):
            wait = self.delay - (time.monotonic() - self._last)
            if wait > 0:
                time.sleep(wait)
            self._last = time.monotonic()
            self.requests += 1
            try:
                resp = self.client.request(method, url, **kwargs)
                if resp.status_code < 500:
                    resp.raise_for_status()
                    return resp
            except httpx.TransportError:
                pass
            time.sleep(5 * (attempt + 1))
        raise RuntimeError(f"failed after 3 tries: {method} {url}")

    def get(self, url: str, **kwargs) -> str:
        return self.request("GET", url, **kwargs).text

    def post(self, url: str, **kwargs) -> str:
        return self.request("POST", url, **kwargs).text


def snapshot(source: str, event_id: str, name: str, text: str) -> Path:
    path = SNAPSHOTS / source / str(event_id) / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path
