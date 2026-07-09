#!/usr/bin/env python3
"""
Method 1 (alternative) — Twikit route.

Twikit logs into a free X account you control and pulls timelines as clean JSON.
Writes the same frontend/public/twitter-intel.json the dashboard ingests.

SETUP
  pip install twikit

CREDENTIALS (env)
  export X_USERNAME=your_handle           # without @
  export X_EMAIL=you@example.com
  export X_PASSWORD=your_password

RUN
  python scripts/twitter/fetch_twitter_twikit.py
  python scripts/twitter/fetch_twitter_twikit.py --handles MumbaiPolice,hydcitypolice --limit 20

Twikit caches a login cookie in scripts/twitter/.twikit_cookies.json so you are
not logging in on every run (avoids tripping X's anti-abuse checks). Schedule
this with cron / Task Scheduler to keep the feed fresh.
"""
import argparse
import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = REPO_ROOT / "frontend" / "public" / "twitter-intel.json"
HANDLES_JSON = Path(__file__).resolve().parent / "handles.json"
COOKIE_FILE = Path(__file__).resolve().parent / ".twikit_cookies.json"


def load_default_handles() -> list[str]:
    try:
        data = json.loads(HANDLES_JSON.read_text(encoding="utf-8"))
        return list(data.get("handles", {}).keys())
    except Exception:
        return ["MumbaiPolice", "BlrCityPolice", "hydcitypolice", "DelhiPolice"]


async def run(handles: list[str], limit: int, out_path: Path) -> int:
    try:
        from twikit import Client  # type: ignore
    except Exception as e:
        print(f"ERROR: twikit not installed ({e}). pip install twikit", file=sys.stderr)
        return 3

    username = os.environ.get("X_USERNAME", "")
    email = os.environ.get("X_EMAIL", "")
    password = os.environ.get("X_PASSWORD", "")
    if not (username and password):
        print("ERROR: set X_USERNAME, X_EMAIL and X_PASSWORD env vars.", file=sys.stderr)
        return 2

    client = Client("en-US")
    try:
        if COOKIE_FILE.exists():
            client.load_cookies(str(COOKIE_FILE))
        else:
            await client.login(auth_info_1=username, auth_info_2=email, password=password)
            client.save_cookies(str(COOKIE_FILE))
    except Exception as e:
        print(f"ERROR: login failed ({e}).", file=sys.stderr)
        return 4

    items: list[dict] = []
    for handle in handles:
        try:
            user = await client.get_user_by_screen_name(handle)
            tweets = await user.get_tweets("Tweets", count=limit)
            n = 0
            for t in tweets:
                text = (getattr(t, "text", "") or "").strip()
                if len(text) < 5:
                    continue
                created = getattr(t, "created_at", None)
                items.append({
                    "headline": text,
                    "source": handle,
                    "time": str(created) if created else datetime.now(timezone.utc).isoformat(),
                    "category": "general",
                    "riskLevel": "info",
                })
                n += 1
            print(f"  @{handle}: {n} tweets")
        except Exception as e:
            print(f"  @{handle}: FAILED ({e})", file=sys.stderr)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps({"items": items, "generated": datetime.now(timezone.utc).isoformat()},
                                   ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nWrote {len(items)} items -> {out_path}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Fetch X handle tweets via Twikit -> twitter-intel.json")
    ap.add_argument("--handles", default="", help="Comma-separated handles (defaults to handles.json)")
    ap.add_argument("--limit", type=int, default=20, help="Tweets per handle")
    ap.add_argument("--out", default=str(DEFAULT_OUT), help="Output JSON path")
    args = ap.parse_args()
    handles = [h.strip() for h in args.handles.split(",") if h.strip()] or load_default_handles()
    return asyncio.run(run(handles, args.limit, Path(args.out)))


if __name__ == "__main__":
    raise SystemExit(main())
