**Capone.AI — What Was Done & Features**

This document summarizes recent work performed in the repository and lists the main features currently present in the frontend application.

**Overview**
- **Project rename**: Branding updates applied from "Varuna / World Monitor" → "Capone.AI" (site title, meta tags, a subset of docs).
- **Safe cleanup strategy**: A static import scan was used to identify candidate unused frontend files (`tmp/unused-front-files.json`). Candidates were copied into `frontend/src/misc/` to allow safe removal later without breaking runtime.
- **Favicon**: A new hat favicon was added at `public/favico/hat.svg` and the app now uses it.

**Key Files/Artifacts Created or Updated**
- `tmp/unused-front-files.json`: static-import scan output (list of candidates).
- `frontend/src/misc/`: safe copies of candidate components and UI primitives.
- `public/favico/hat.svg`: new hat favicon asset.
- `index.html`: updated page title, OG/Twitter metadata, and favicon references to Capone.AI.
- `frontend/src/components/NavBar.tsx`: updated visible logo and app title to "Capone.AI Dashboard" and switched to the hat SVG.
- `frontend/src/components/MapPanel.tsx`: route-layer visibility fixes so route polylines render when route data exists or when appropriate layers are enabled.

**Features (what the frontend offers today)**
- **Live Intelligence Dashboard**: real-time feeds and a breaking ticker for live events.
- **Map view with multiple layers**: conflict zones, live intel hotspots, flight tracking (ADSB), AIS ship tracking, traffic incidents, strategic assets, and heatmaps.
- **Route Planner & Route Visualization**: compute routes (primary + alternates), render polylines on the map, show origin/destination pins, and highlight blocked segments near critical incidents.
- **Layer Controls**: enable/disable categories such as Military & Conflict, Transportation & Logistics, Infrastructure, Cyber, Environment, etc. (`frontend/src/config/layers.ts`).
- **Panels & Tools**: left/right panels for filters and details, route planning panel, timeline and intel pages, upload personnel CSV, and a bottom status bar.
- **Interactive hover/tooltips**: rich tooltips for flights, incidents, assets, and live intel (deck.gl on top of MapLibre).
- **UI primitives & components**: many reusable UI components (forms, dialogs, menus, sidebars) — safe-copied to `frontend/src/misc/ui/` as part of the cleanup.
- **Chat / Copilot panel**: floating assistant button and slide-out chat panel.

**Technical notes**
- Frontend stack: React + TypeScript + Vite. Project is ESM-style (`package.json` uses `type: "module"`).
- Mapping: MapLibre + deck.gl via `@deck.gl/mapbox` overlay; layers include `PathLayer`, `IconLayer`, `ScatterplotLayer`, `GeoJsonLayer`, and `HeatmapLayer`.
- Safety-first changes: Originals under `frontend/src/components/` were intentionally not deleted — safe copies were created under `frontend/src/misc/` so we can revert quickly if needed.

**How to run locally (quick)**
1. Install dependencies in the repo root (if not already):

```bash
cd frontend
npm install
npm run dev
```

2. Open the dev server (Vite) in your browser — typical URL: `http://localhost:5175/`.

**Recent fixes / important changes**
- Fixed map route visibility logic in `frontend/src/components/MapPanel.tsx` so route polylines show when route results exist or when the transportation/trade layer is enabled.
- Updated header branding and site metadata to Capone.AI (`index.html` and `frontend/src/components/NavBar.tsx`).

**Next recommended steps**
- Verify runtime by reproducing a route A→B in the Route Planner UI and confirm polylines + pins render correctly.
- Search-and-replace remaining visible strings if you want a full rename from "World Monitor / Varuna" → "Capone.AI" across the repo.
- After verification, consider deleting the original unused files from `frontend/src/components/` (only once you're confident the misc copies are correct).

If you want, I can (a) run the dev server and test a route now, (b) update the main `README.md` to replace branding, or (c) create a changelog entry with file diffs — tell me which.

---
Generated: March 11, 2026
