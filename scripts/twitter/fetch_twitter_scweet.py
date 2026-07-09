#!/usr/bin/env python3
"""
Method 1 — Scweet route.

Fetches recent tweets from the monitored civic/police/utility X handles using
Scweet (which injects your browser auth_token cookie into normal HTTP requests),
and writes them to frontend/public/twitter-intel.json in the shape the dashboard
ingests:

    { "items": [ { "headline": "...", "source": "handle", "time": "ISO8601",
                   "category": "general", "riskLevel": "info" }, ... ] }

The Intelligence page picks this file up automatically at /twitter-intel.json
(see fetchStaticHandleIntel in frontend/src/lib/intel-service.ts) and geofences
each item to its city via the handle map.

--------------------------------------------------------------------------------
SETUP
  pip install scweet

GET YOUR auth_token
  1. Log into x.com in your browser.
  2. Press F12  ->  Application  ->  Cookies  ->  https://x.com
  3. Copy the value of the `auth_token` cookie.

RUN
  # token via env (preferred)
  export X_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxx
  python scripts/twitter/fetch_twitter_scweet.py

  # or pass it inline + a custom handle list
  python scripts/twitter/fetch_twitter_scweet.py --auth-token XXXX --handles MumbaiPolice,hydcitypolice

  # schedule it (every 15 min) with cron / Task Scheduler to keep the feed fresh.
--------------------------------------------------------------------------------
NOTE: Scweet's API has changed across versions. This script tries the documented
`Scweet(auth_token=...).get_profile_tweets(...)` interface first and falls back
to the older `scrape(...)` function-style API. If your installed version differs,
adjust `fetch_handle()` accordingly.
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Resolve <repo>/frontend/public/twitter-intel.json relative to this file.
REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = REPO_ROOT / "frontend" / "public" / "twitter-intel.json"
HANDLES_JSON = Path(__file__).resolve().parent / "handles.json"


def load_default_handles() -> list[str]:
    try:
        data = json.loads(HANDLES_JSON.read_text(encoding="utf-8"))
        return list(data.get("handles", {}).keys())
    except Exception:
        return ["MumbaiPolice", "BlrCityPolice", "hydcitypolice", "DelhiPolice"]


def to_iso(ts) -> str:
    """Best-effort convert assorted timestamp formats to ISO-8601."""
    if not ts:
        return datetime.now(timezone.utc).isoformat()
    if isinstance(ts, (int, float)):
        try:
            return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
        except Exception:
            return datetime.now(timezone.utc).isoformat()
    s = str(ts).strip()
    for fmt in ("%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ",
                "%Y-%m-%d %H:%M:%S", "%a %b %d %H:%M:%S %z %Y"):
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=timezone.utc).isoformat()
        except Exception:
            continue
    return s  # leave as-is; the app tolerates raw strings


def fetch_handle(scweet_obj, handle: str, limit: int) -> list[dict]:
    """Return a list of {text, timestamp} for one handle, across Scweet versions."""
    # Newer object API: Scweet(auth_token=...).get_profile_tweets(username=..., limit=...)
    if scweet_obj is not None and hasattr(scweet_obj, "get_profile_tweets"):
        rows = scweet_obj.get_profile_tweets(username=handle, limit=limit)
        out = []
        for t in rows or []:
            text = t.get("text") or t.get("content") or ""
            out.append({"text": text, "timestamp": t.get("timestamp") or t.get("time")})
        return out
    return []


def main() -> int:
    ap = argparse.ArgumentParser(description="Fetch X handle tweets via Scweet -> twitter-intel.json")
    ap.add_argument("--auth-token", default=os.environ.get("X_AUTH_TOKEN", ""),
                    help="X auth_token cookie value (or set X_AUTH_TOKEN env)")
    ap.add_argument("--handles", default="", help="Comma-separated handles (defaults to handles.json)")
    ap.add_argument("--limit", type=int, default=20, help="Tweets per handle")
    ap.add_argument("--out", default=str(DEFAULT_OUT), help="Output JSON path")
    args = ap.parse_args()

    if not args.auth_token:
        print("ERROR: no auth token. Set X_AUTH_TOKEN env or pass --auth-token.", file=sys.stderr)
        return 2

    handles = [h.strip() for h in args.handles.split(",") if h.strip()] or load_default_handles()

    try:
        from Scweet import Scweet  # type: ignore
        scweet_obj = Scweet(auth_token=args.auth_token)
    except Exception as e:  # pragma: no cover
        print(f"ERROR: could not initialise Scweet ({e}). Is it installed? pip install scweet",
              file=sys.stderr)
        return 3

    items: list[dict] = []
    for handle in handles:
        try:
            rows = fetch_handle(scweet_obj, handle, args.limit)
            for r in rows:
                text = (r.get("text") or "").strip()
                if len(text) < 5:
                    continue
                items.append({
                    "headline": text,
                    "source": handle,
                    "time": to_iso(r.get("timestamp")),
                    "category": "general",
                    "riskLevel": "info",
                })
            print(f"  @{handle}: {len(rows)} tweets")
        except Exception as e:
            print(f"  @{handle}: FAILED ({e})", file=sys.stderr)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps({"items": items, "generated": datetime.now(timezone.utc).isoformat()},
                                   ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nWrote {len(items)} items -> {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
