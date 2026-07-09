# DASHINT — India Crisis Monitor · Run Guide

A five-city (Bengaluru · Mumbai · Delhi · Hyderabad · Chennai) OSINT dashboard:
live news/RSS + civic X handles + weather + traffic/routing, filtered by a
layered LLM + heuristic pipeline.

There are **two ways to run it**:

| | Command | Twitter panel | Needs |
|---|---|---|---|
| **Web app** (primary) | `cd frontend && npm run dev` | X Publish embed (best-effort) | Node 18+ |
| **Desktop app** | `npm run desktop:dev` (repo root) | Native **X Live** window via your own X login (reliable) | Node 18+ **and** Rust |

---

## 1. Repository layout (after cleanup)

```
Surveillance_DB/
├── frontend/        # THE APP — Vite + React 18 + TS SPA (this is DASHINT)
│   ├── src/pages/         Intel (brief) · Intelligence (OSINT tabs)
│   ├── src/components/    NavBar, panels (incl. XPublishFeed = Twitter tab)
│   ├── src/lib/           intel/news/traffic/chokepoint/semantic-gate services
│   └── vite.config.ts     dev server + embeds the ../api functions as middleware
├── api/             # Serverless-style handlers (rss-proxy, twitter-intel,
│                    #   enrichment/intel-v2, news-v2, unrest-classify, geocode …)
├── src-tauri/       # Desktop (Tauri v2) shell + x_live.rs (native X Live window)
├── data/  public/  scripts/  docs/  tests/  e2e/
├── .env.local       # your API keys (git-ignored)
└── RUNNING.md
```

The old `world-monitor` scaffolding (`server/`, `proto/`, `convex/`, `api_alt/`,
`src_archive/`, the `api/*/v1` gateways, root `index.html`/`vite.config.ts`) has
been removed — DASHINT does not use it.

---

## 2. Configure environment (once)

```bash
cp .env.example .env.local     # then edit .env.local
```

Every key is optional — the dashboard degrades gracefully — but for full LLM
enrichment set:

| Variable | Used for |
|---|---|
| `GROQ_API_KEY` | server-side LLM enrichment (brief scoring, unrest/traffic classifiers) |
| `VITE_GROQ_API_KEY` | client-side scoring (bundled into the browser — use a separate, rate-limited key) |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | optional shared cache |
| `ACLED_ACCESS_TOKEN` | optional conflict data |

`frontend/vite.config.ts` automatically merges **both** the repo-root `.env.local`
(server keys) and `frontend/.env.local` (`VITE_` client keys).

> Note: the Twitter panels do **not** need any Twitter/X API key — the web panel
> uses X's free embed widget, and the desktop panel uses your own logged-in X
> session.

---

## 3. Run the web app (primary)

```bash
cd frontend
npm install        # first time only
npm run dev        # http://localhost:5174
```

Windows one-click alternative from the repo root: double-click
**`start.bat`** (checks Node, seeds `.env.local`, installs deps, opens
the browser).

Open **http://localhost:5174** → two views in the top nav:
- **INTEL BRIEF** — live risk feed across the five cities.
- **OSINT** — tabs: News Feeds · **Twitter** · Weather · Traffic · Protests.

### The Twitter tab in the web app
Uses X's free **X Publish** embedded timeline widget. This works only when X
isn't throttling — X has largely deprecated anonymous profile-timeline embeds,
so it frequently shows a **fallback with "Open on X ↗"** and a **⟳ Reload**
button. That's an X-side limit, not a bug. For reliable inline tweets, use the
desktop app (below).

---

## 4. Run the desktop app (reliable live Twitter)

The desktop build wraps the same frontend in a native Tauri window and adds a
native **X Live** viewer that renders real x.com using *your own X login* — free,
no API, no rate limit.

**Prerequisites:** Node 18+ **and** the Rust toolchain. If you don't have Rust,
run `rustup-init.exe` (in the repo) or install from https://rustup.rs.

```bash
# from the repo ROOT (not frontend/)
# stop any standalone `npm run dev` first so port 5174 is free
npm run desktop:dev
```

First launch compiles the Rust (a minute or two). Then in the app:

1. OSINT → **Twitter**
2. **Sign in to X (once)** — a native window opens x.com/login; sign in.
3. Pick a handle → **▶ Open @handle live** — the window shows that handle's real
   timeline. Selecting another handle re-points the same window.

Packaged installers: `npm run desktop:build:full` (macOS/Windows/Linux targets
are configured in `src-tauri/tauri.conf.json`).

---

## 5. Tests

Deterministic, zero-framework tests (native Node runner):

```bash
node --test api/enrichment/unrest-classify.test.mjs      # unrest classifier (11)
node --test api/twitter-intel.test.mjs                   # X junk/advisory gates (14)
node --test frontend/src/lib/semantic-gate.test.mts      # "bunkum" filter (21)
```

(The `.mts` test relies on Node 18.19+/20.6+ native TypeScript stripping.)

---

## 6. Troubleshooting

- **Twitter panel blank / "Open on X" fallback (web):** X is rate-limiting or
  blocking `platform.twitter.com`. Wait a few minutes and ⟳ Reload, disable
  ad-block/tracking-protection for localhost, or use the desktop app.
- **`callGroqBatch … 429`:** Groq rate limit. The enrichment handlers now back
  off + retry and run batches sequentially; if it persists your `GROQ_KEY` is
  out of quota — swap in a fresh key. Enrichment degrades gracefully meanwhile.
- **`Browserslist … 13 months old`:** cosmetic. `npx update-browserslist-db@latest`.
- **`npm run desktop:dev` port conflict:** stop any running `npm run dev` first.
- **Rust compile error on desktop build:** paste it — the Twitter/X-Live Rust
  (`src-tauri/src/x_live.rs`) uses only stable Tauri APIs, so fixes are quick.
