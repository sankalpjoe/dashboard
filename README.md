# DASHINT — India Crisis Monitor

A real-time, five-city OSINT surveillance dashboard for India (Bengaluru · Mumbai · Delhi · Hyderabad · Chennai). DASHINT continuously ingests news feeds, official civic Twitter/X handles, weather models, and conflict databases, filters the noise with a layered LLM + heuristic pipeline, and presents operational risk — protests, strikes, infrastructure failures, disease outbreaks, traffic disruption — in a single command view.

The system is built around one principle: **every signal shown must be a real, physical, in-scope event.** Everything else — birthday wishes from police handles, car advertisements, metaphorical "protests" against subscription prices, cricket news — is filtered out before it reaches the screen.

---

## What the system does

**Intel Brief** — a live feed of risk signals across the five monitored cities, classified into six operational categories (Infrastructure, Protests & Events, Law & Order, Public Health, Environment, Transport), each enriched by an LLM with a relevance score, three-bullet analysis, and sentiment. Signals can be multi-selected and exported as Word/Excel briefs or emailed directly.

**OSINT view** — tabbed deep-dives: aggregated news feeds, the Official Handle Feed (14 institutional civic/police/utility X accounts), IMD weather + district warnings, a Traffic & Routing impact agent, and protest tracking.

**Traffic & Routing agent** — a two-agent pipeline. Agent 1 (LLM) reads a protest/VIP/roadwork headline and extracts the event type, start→end corridor, venue, date and timing. Agent 2 geocodes the locations, draws the actual driving route, and intersects it against a chokepoint database to report which junctions will lock up, what restrictions to expect, and which adjacent areas will absorb the spillover.

**Civil unrest classification** — a dedicated enrichment endpoint that classifies raw text (news, tweets) into Protest / Strike / Blockade events with structured extraction (location, trigger, impact) and a calibrated confidence score, designed to reject metaphorical and hyperbolic usage.

---

## Engineering log — what has been achieved

### 1. LLM unrest classifier with eval-backed hardening (`api/enrichment/unrest-classify.js`)
The classifier prompt went through a formal evaluation cycle before integration. The original draft had four defects that the eval surfaced: ambiguous confidence semantics (a model 99% sure something was *noise* could legitimately emit 0.99), an unspecified null rule for negative extractions, no precedence rule when an event was both a strike and a protest, and an enum mismatch ("Irrelevant" vs "None"). The deployed version fixes all four and runs as a three-stage pipeline:

1. **Regex prescreen** — texts with zero unrest signals (including behavioral synonyms such as "refused to work", "parked across", and India-specific terms: bandh, dharna, hartal, section 144) never reach the LLM. This is a pure cost guard.
2. **Groq batch classification** — strict JSON output with the refined prompt: physicality gate, Strike > Blockade > Protest precedence, strike-homonym traps (military strike, lightning strike, "strike a deal").
3. **Server-side normalization** — the LLM is never trusted: enum coercion, confidence clamping, the 0.75 threshold enforced in code, extraction forced to `null` on negatives, and fail-closed behavior when the model is unavailable.

Eleven unit tests (`unrest-classify.test.mjs`) encode the eval set against the deterministic layers; all pass under the native Node test runner.

### 2. Twitter/X feed relevance overhaul (`api/twitter-intel.js`)
The Official Handle Feed was leaking junk because the advisory keep-filter contains intentionally broad terms ("health", "route", "signal"), which incidental matches in greetings and ads could exploit — a CM birthday wish mentioning "good health" survived filtering. Five new hard-drop categories were added (greetings/festival wishes/condolences, vehicle sales and catalog content, retail promos and giveaways, horoscope/recruitment/exam notices, real-estate ads), junk now takes strict precedence over advisory matches via `isRelevantCivic()`, and the previously unfiltered search mode applies the same gates. Fourteen regression tests verify that the junk dies while real advisories (diversions, power shutdowns, Section 144 orders, waterlogging) survive. The Nitter fallback mirror list was refreshed to currently maintained instances and made configurable via `NITTER_INSTANCES`.

### 3. Security: leaked credentials removed
Two live Groq API keys were found hardcoded in source — one in `api/enrichment/intel-v2.js`, and one in `frontend/src/lib/orr-intel-service.ts`, the latter shipping to every browser in the JS bundle. Both now read from environment variables (`GROQ_API_KEY` server-side, `VITE_GROQ_API_KEY` client-side) and fail silently when unset. If this repository was ever shared or pushed, those keys must be considered compromised and revoked.

### 4. Local-dev environment bridge (`frontend/vite.config.ts`)
The dev server previously loaded only `VITE_`-prefixed variables from `frontend/`, while the real credentials lived in the repo-root `.env.local` — so the Twitter API, Apify, and Groq tiers of the handle-feed fetcher ran with no credentials at all in local development and silently fell through to dead public mirrors. The config now merges both env files and injects every server-side key the `api/` handlers need (Twitter ×5, Apify, Groq, Upstash, ACLED, RSS-Bridge, freshness overrides).

### 5. News recall fixes (`frontend/src/lib/intel-service.ts`)
A real missed event — a Bengaluru traffic advisory for a Dalit protest at Freedom Park — exposed three compounding recall killers, all fixed: the freshness window discarded anything older than 6 hours despite feeds querying a full day (now 14 h); the per-topic cap (3 items) was applied *before* relevance filtering and the five-city geofence, letting out-of-scope national items consume the slots (caps now run after gating, scoped per topic + city, on the severity-sorted list); and query phrasing missed the "Bengaluru" spelling and had no coverage of Freedom Park, the city's designated protest venue (a dedicated BLR PROTEST WATCH feed was added).

### 6. Dynamic chokepoint database (`frontend/src/lib/chokepoint-db.ts`)
The traffic agent previously matched routes against a hardcoded list of ~8 junctions per city and returned an empty report when no route could be extracted. The chokepoint set is now built at runtime from OpenStreetMap's Overpass API — real flyovers and bridges on trunk/primary roads, motorway interchanges, and named signalized junctions (up to 50 per city), with feeder areas computed as the nearest OSM suburbs and restriction notes derived from road class. Results cache for seven days (localStorage + memory); the static list survives only as an offline seed. The agent also gained a graceful fallback chain: route intersection → endpoint proximity → **single-venue geocoding** (for "protest at Freedom Park"-style events with no corridor) → name matching → a clearly labeled **citywide high-risk junction watchlist**, so a report is never empty.

### 7. Performance optimization of the geospatial pipeline
Cold-batch analysis time dropped from roughly 20–40 s to 8–12 s, and warm runs complete in about a second: the Nominatim rate-limit wait (1.1 s) is now paid only before actual network requests instead of unconditionally per item; geocoding results (including negative results) persist across sessions in localStorage with a 30-day TTL; identical concurrent lookups share one in-flight request; concurrent chokepoint-DB calls for the same city share a single Overpass fetch; and the per-city DBs warm in parallel while the LLM extraction runs.

### 8. UI overhaul — polished light theme
A shared design-token module (`frontend/src/lib/theme.ts`) replaced the token objects that had been copy-pasted into each page. The global stylesheet dropped a `border-radius: 0 !important` rule that had forced a flat brutalist look, and gained an off-white page backdrop, rounded scrollbars, button transitions, and visible focus rings. The Intel page received rounded cards with shadows and hover lift, tinted pill-style severity badges, pill category filters, and a refined export toolbar; the NavBar gained a frosted-glass treatment. Layout and information architecture were intentionally preserved.

### 9. One-click launcher (`start-dashboard.bat`)
Checks for Node.js, creates `.env.local` from the example on first run, installs frontend dependencies when missing, opens the browser, and starts the dev server (which embeds the `/api` functions through Vite plugins) at `http://localhost:5174`.

---

## Architecture

```
Surveillance_DB/
├── frontend/                  # Vite + React 18 + TypeScript SPA
│   ├── src/pages/             #   Intel (brief), Intelligence (OSINT tabs)
│   ├── src/components/        #   NavBar, panels, map, tickers
│   ├── src/lib/               #   theme, intel/news/traffic/chokepoint services
│   └── vite.config.ts         #   dev server + embedded /api function plugins
├── api/                       # Vercel-style edge functions (also run in dev)
│   ├── enrichment/            #   intel-v2, news-v2, unrest-classify (+ tests)
│   ├── twitter-intel.js       #   multi-tier X/Twitter aggregator (+ tests)
│   └── ...                    #   rss-proxy, geocode, telegram-feed, etc.
├── server/                    # Typed RPC gateway (ACLED/GDELT unrest merge…)
├── scripts/                   # Optional Python Twitter scrapers, relays
├── start-dashboard.bat        # One-click Windows launcher
└── .env.example               # Documented configuration surface
```

**Data flow (Intel Brief):** ~60 Google News / RSS / Reddit / official feeds + handle tweets + Open-Meteo alerts → headline dedupe → severity sort → Indic-script translation → relevance gate (noise patterns + risk vocabulary) → strict five-city geofence → per-topic-per-city caps → Groq enrichment (score, category, summary, sentiment) → UI.

**Twitter tiers (first usable source wins):** Apify actor → Twitter API v2 → Groq web search → Nitter mirrors → RSS-Bridge → RSSHub → Google News mentions, each output scrubbed by the junk/advisory gates.

---

## Technology used

| Layer | Choice |
|---|---|
| Frontend | React 18, TypeScript, Vite (SWC), Tailwind CSS + Radix primitives (shadcn/ui), deck.gl for map layers, TanStack Query |
| LLM | Groq-hosted open models (Llama-3.3-70B, Qwen3-32B) via plain `fetch`, strict JSON mode |
| Geospatial | OpenStreetMap stack end-to-end: Nominatim (geocoding), OSRM (routing), Overpass (chokepoint DB) |
| Event data | ACLED, GDELT, Google News RSS, IMD, Open-Meteo, CERT-IN, PIB |
| Caching | Upstash Redis (server), localStorage (client), in-memory maps with in-flight dedupe |
| Testing | Native `node:test` runner — zero test-framework dependencies |
| Runtime | Edge-compatible functions (Web `Request`/`Response`), no long-lived server |

## Deliberately **not** used — and why

- **No state-management framework** (Redux, MobX, Zustand): component state plus TanStack Query covers the dashboard's needs; the feed pipeline is a pure async function with its own cache.
- **No CSS-in-JS library** (styled-components, Emotion): a single shared token module + inline styles + Tailwind keeps the styling surface auditable and build-light.
- **No paid mapping/geocoding APIs** (Google Maps, Mapbox geocoding): the entire geospatial pipeline runs on free, keyless OSM services, rate-limited respectfully and cached aggressively.
- **No LLM orchestration framework** (LangChain, LlamaIndex): every model call is a direct `fetch` with an explicit system prompt, JSON response format, and server-side output validation — easier to eval, debug, and harden than framework abstractions.
- **No traditional database** (Postgres, Mongo): the system is intentionally stateless; Redis acts as a shared TTL cache, localStorage as the client cache, and upstream providers (ACLED, GDELT, OSM) remain the systems of record.
- **No Next.js / SSR framework**: a Vite SPA with Vercel-style edge functions (embedded into the dev server via custom plugins) keeps local dev identical to production routing without a meta-framework.
- **No test framework** (Jest, Vitest for the API layer): the native Node test runner does the job with zero dependencies. (The frontend retains Vitest config for component tests.)
- **No headless-browser scraping** (Selenium, Playwright, Puppeteer) in the serving path: Twitter access uses the official API first, then RSS-based mirrors; the optional Python scrapers are offline batch tools, never runtime dependencies.
- **No hardcoded secrets or venues**: all credentials live in environment variables (documented in `.env.example`), and the chokepoint knowledge base is fetched from OSM rather than maintained by hand.

---

## Running it

**Windows, one click:** double-click `start-dashboard.bat`.

**Manually:**

```bash
cp .env.example .env.local      # fill in the keys you have
cd frontend
npm install
npm run dev                     # http://localhost:5174
```

**Tests:**

```bash
node --test api/enrichment/unrest-classify.test.mjs   # 11 tests
node --test api/twitter-intel.test.mjs                # 14 tests
```

Every API key is optional — the dashboard degrades gracefully — but for full functionality set `GROQ_API_KEY` (LLM enrichment), `TWITTER_BEARER_TOKEN` or `APIFY_TOKEN` (handle feed), `VITE_GROQ_API_KEY` (client-side scoring; use a separate rate-limited key, since VITE_ variables are bundled into the browser build), and optionally `UPSTASH_REDIS_REST_URL`/`TOKEN` (cross-user caching) and `ACLED_ACCESS_TOKEN` (conflict data). See `.env.example` for the complete documented surface.
