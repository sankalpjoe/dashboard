# X / Twitter handle ingestion

The Intelligence page pulls tweets from monitored civic / police / utility
handles and geofences them to the 5 cities (Bangalore, Delhi, Hyderabad, Mumbai,
Chennai). Handles and their city mapping live in two places — keep them in sync:

- App:    `frontend/src/lib/intel-service.ts`  →  `HANDLE_CITY`
- Scripts: `scripts/twitter/handles.json`

There are three ways to feed tweets in. The app tries them transparently; you can
use any combination.

## Method 2 — Apify (cloud, no cookies, recommended for "set and forget")
The backend route `api/twitter-intel.js` calls an Apify actor when `APIFY_TOKEN`
is set. Add to your `.env`:

```
APIFY_TOKEN=apify_api_xxxxxxxxxxxxxxxx
# optional — defaults to apidojo~tweet-scraper
APIFY_TWITTER_ACTOR=apidojo~tweet-scraper
```

Apify gives every free account $5/month of credit (~2,000+ tweets/month free).
No code to run — the app calls it live.

## Method 3 — RSS-Bridge (no credentials)
Also handled by `api/twitter-intel.js`. It tries public RSS-Bridge instances
automatically (no setup). Override the instance list if you self-host:

```
RSSBRIDGE_INSTANCES=https://my-rss-bridge.example/bridge01
```

Note: public RSS-Bridge / Nitter instances go up and down as X changes its site,
so treat this as best-effort.

## Method 1 — Scweet / Twikit (Python, uses your session)
Run a script that writes `frontend/public/twitter-intel.json`; the app loads it
at `/twitter-intel.json` and merges it into the live feed.

```bash
# Scweet (uses your browser auth_token cookie)
pip install scweet
export X_AUTH_TOKEN=xxxxxxxx            # F12 > Application > Cookies > x.com > auth_token
python scripts/twitter/fetch_twitter_scweet.py

# Twikit (logs into a free X account you control)
pip install twikit
export X_USERNAME=your_handle
export X_EMAIL=you@example.com
export X_PASSWORD=your_password
python scripts/twitter/fetch_twitter_twikit.py
```

Schedule either script (cron / Windows Task Scheduler) every 10–15 min to keep
the static feed fresh, e.g.:

```
*/15 * * * * cd /path/to/Surveillance_DB && X_AUTH_TOKEN=xxxx python scripts/twitter/fetch_twitter_scweet.py
```

## Backend resolution order
`api/twitter-intel.js` tries, in order, and stops at the first that returns data:
Twitter API v2 → **Apify** → Groq web-search → Nitter → **RSS-Bridge** → RSSHub → Google News.

## Output shape (what the app expects)
```json
{ "items": [
  { "headline": "Power shutdown in Koramangala 10am-2pm", "source": "NammaBESCOM",
    "time": "2026-06-08T04:30:00Z", "category": "general", "riskLevel": "info" }
] }
```
`category` and `riskLevel` are optional. The app re-classifies and re-scores, and
drops anything not tied to one of the 5 cities.
