/**
 * Traffic & Routing analysis — Agents 1 (News Context) + 2 (Geospatial Traffic).
 *
 * Agent 1: extract Event Type + Start (X) + End (Y) + timing from an article
 *          (Groq batch call; heuristic fallback when no key).
 * Agent 2: geocode X/Y (Nominatim) → OSRM driving route → intersect with the
 *          per-city congestion choke-point DB → structured impact report.
 *
 * Everything runs client-side (CORS-friendly endpoints, no keys except Groq).
 * Results are cached per article id; geocodes cached per query.
 */
import { CONGESTION_DB, haversineMeters, type ChokePoint, type CongestionCity } from '@/config/congestion';
import { getChokePoints, topJunctions } from './chokepoint-db';
import { resolveCityFromText } from './news-service';
import type { IntelItem } from './intel-service';

// LLM calls go through the server-side proxy (/api/groq-chat) — no key in bundle.
const GROQ_CHAT_URL = '/api/groq-chat';
const GROQ_MODEL = ((import.meta as ImportMeta).env?.VITE_GROQ_MODEL as string | undefined) ?? 'openai/gpt-oss-120b';

// ── Types ────────────────────────────────────────────────────────────────────
export interface EventExtraction {
  id: string;
  eventType: string;
  start: string;   // X
  end: string;     // Y
  venue: string;   // single location when there is no X→Y corridor
  date: string;
  time: string;
  duration: string;
}

export interface TrafficImpact {
  id: string;
  headline: string;
  city: CongestionCity;
  eventType: string;
  routeTrajectory: string;
  start: string;
  end: string;
  date: string;
  time: string;
  duration: string;
  intersectingChokePoints: { name: string; note: string }[];
  majorRestrictions: string[];
  congestionProneAreas: string[];
  routed: boolean;     // a real OSRM route was used
  geocoded: boolean;   // at least one endpoint geocoded
  cityWide: boolean;   // no corridor/venue resolved — showing citywide watchlist
}

// ── Candidate filter — protest / VIP / road events ───────────────────────────
const TRAFFIC_RE = /protest|rally|march|procession|dharna|bandh|morcha|gherao|vip\s*movement|green\s*corridor|roadshow|yatra|road\s*(repair|closure|closed|block|diversion|work|widening)|metro\s*work|flyover\s*work|diversion|cordon|section\s*144|convoy|funeral procession/i;

export function isTrafficRelevant(item: IntelItem): boolean {
  return item.type === 'protest' || item.type === 'vip' || TRAFFIC_RE.test(item.headline || '');
}

function cityOf(item: IntelItem): CongestionCity | null {
  const c = resolveCityFromText(item.headline || '');
  if (c && (c in CONGESTION_DB)) return c as CongestionCity;
  return null;
}

// ── Agent 1 — extraction ─────────────────────────────────────────────────────
function heuristicExtract(it: { id: string; headline: string }): EventExtraction {
  const h = it.headline;
  let start = '', end = '';
  const m = h.match(/from\s+([A-Z][\w .'-]{2,40}?)\s+to\s+([A-Z][\w .'-]{2,40})/i);
  if (m) { start = m[1].trim(); end = m[2].trim(); }
  const evt = /vip|convoy|green corridor/i.test(h) ? 'VIP Movement'
    : /road|metro|flyover|repair|diversion/i.test(h) ? 'Road Work'
    : /march|procession|rally/i.test(h) ? 'March/Rally'
    : 'Protest';
  // Single-venue fallback: "at/in/near <Proper Noun phrase>"
  const v = h.match(/\b(?:at|in|near|outside)\s+([A-Z][\w .'-]{2,40}?)(?=[,.;:]|\s+(?:on|till|until|from|by|today|tomorrow)\b|$)/);
  return { id: it.id, eventType: evt, start, end, venue: v?.[1]?.trim() ?? '', date: '', time: '', duration: '' };
}

export async function extractEvents(
  items: { id: string; headline: string; summary?: string; city?: string }[],
): Promise<EventExtraction[]> {
  if (!items.length) return [];

  try {
    const lines = items
      .map((it, i) => `${i}. [${it.city ?? ''}] ${it.headline}${it.summary ? ' — ' + it.summary : ''}`)
      .join('\n');

    const resp = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GROQ_MODEL,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are a deep-reading intelligence agent. For each numbered news line about an event ' +
              '(protest, rally, march, VIP movement, road work, procession), extract: eventType, the exact ' +
              'START location/landmark/area (X) and the END/destination (Y), plus date, start time and ' +
              'duration if stated. If there is no X→Y corridor but a single venue/locality is named ' +
              '(e.g. a park, chowk, ground, office), put it in "venue". Read for geographic anchors; ' +
              'never invent. Unknown fields = "". ' +
              'Return ONLY JSON: {"items":[{"i":0,"eventType":"","start":"","end":"","venue":"","date":"","time":"","duration":""}]}',
          },
          { role: 'user', content: lines },
        ],
        temperature: 0.1,
        max_tokens: 1200,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!resp.ok) return items.map(heuristicExtract);
    const data = await resp.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{"items":[]}');
    const arr: any[] = parsed.items || [];
    return items.map((it, i) => {
      const e = arr.find(x => x.i === i) ?? arr[i] ?? {};
      return {
        id: it.id,
        eventType: e.eventType || heuristicExtract(it).eventType,
        start: e.start || '',
        end: e.end || '',
        venue: e.venue || heuristicExtract(it).venue,
        date: e.date || '',
        time: e.time || '',
        duration: e.duration || '',
      };
    });
  } catch {
    return items.map(heuristicExtract);
  }
}

// ── Geocoding (Nominatim) — persistent cache + adaptive throttle ─────────────
// • Cache survives reloads via localStorage (30-day TTL) — repeat venues like
//   "Freedom Park" or "Jantar Mantar" never re-hit the network.
// • The 1.1s Nominatim rate-limit wait is paid ONLY before an actual network
//   request — cached/empty lookups are free.
// • In-flight dedupe: identical concurrent queries share one request.
const GEO_LS_KEY = 'geocache:v1';
const GEO_LS_TTL = 30 * 24 * 3600_000;
const geoCache = new Map<string, [number, number] | null>();
const geoInflight = new Map<string, Promise<[number, number] | null>>();
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

let geoLsLoaded = false;
function loadGeoCache(): void {
  if (geoLsLoaded) return;
  geoLsLoaded = true;
  try {
    const raw = JSON.parse(localStorage.getItem(GEO_LS_KEY) || 'null');
    if (raw && Date.now() - raw.ts < GEO_LS_TTL && raw.entries) {
      for (const [k, v] of Object.entries(raw.entries)) geoCache.set(k, v as [number, number] | null);
    }
  } catch { /* corrupt cache — start fresh */ }
}
function saveGeoCache(): void {
  try {
    localStorage.setItem(GEO_LS_KEY, JSON.stringify({ ts: Date.now(), entries: Object.fromEntries(geoCache) }));
  } catch { /* storage unavailable — non-fatal */ }
}

let lastNominatimAt = 0;
async function nominatimThrottle(): Promise<void> {
  const wait = lastNominatimAt + 1100 - Date.now();
  if (wait > 0) await sleep(wait);
  lastNominatimAt = Date.now();
}

async function geocode(q: string, city: CongestionCity): Promise<[number, number] | null> {
  if (!q || q.length < 2) return null;
  loadGeoCache();
  const key = `${q}|${city}`;
  if (geoCache.has(key)) return geoCache.get(key)!;
  const inflight = geoInflight.get(key);
  if (inflight) return inflight;

  const job = (async (): Promise<[number, number] | null> => {
    try {
      await nominatimThrottle();
      const cityName = city.charAt(0) + city.slice(1).toLowerCase();
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(`${q}, ${cityName}, India`)}`;
      const resp = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(10_000) });
      const data = await resp.json();
      const hit = Array.isArray(data) && data[0] ? [parseFloat(data[0].lat), parseFloat(data[0].lon)] as [number, number] : null;
      geoCache.set(key, hit);
      saveGeoCache();
      return hit;
    } catch {
      geoCache.set(key, null); // negative-cache failures too
      return null;
    } finally {
      geoInflight.delete(key);
    }
  })();
  geoInflight.set(key, job);
  return job;
}

// ── OSRM driving route ───────────────────────────────────────────────────────
async function osrmRoute(a: [number, number], b: [number, number]): Promise<[number, number][] | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    const data = await resp.json();
    const coords = data?.routes?.[0]?.geometry?.coordinates as number[][] | undefined;
    if (!coords?.length) return null;
    return coords.map(c => [c[1], c[0]] as [number, number]); // → [lat,lon]
  } catch {
    return null;
  }
}

// ── Intersection matrix (db = dynamic choke-point set for the city) ──────────
function intersectRoute(route: [number, number][], db: ChokePoint[], thresholdM = 600): ChokePoint[] {
  return db.filter(cp =>
    route.some(([la, lo]) => haversineMeters(la, lo, cp.lat, cp.lon) <= thresholdM));
}

function chokePointsNear(coords: [number, number][], db: ChokePoint[], thresholdM = 1800): ChokePoint[] {
  return db.filter(cp =>
    coords.some(([la, lo]) => haversineMeters(la, lo, cp.lat, cp.lon) <= thresholdM));
}

function chokePointsByName(ex: EventExtraction, headline: string, db: ChokePoint[]): ChokePoint[] {
  const hay = `${ex.start} ${ex.end} ${ex.venue} ${headline}`.toLowerCase();
  return db.filter(cp => {
    const base = cp.name.toLowerCase().split(' (')[0].split(' / ')[0];
    return hay.includes(base) || cp.feeders.some(f => hay.includes(f.toLowerCase()));
  });
}

// ── Agent 2 — per-item impact synthesis ──────────────────────────────────────
async function analyzeOne(ex: EventExtraction, headline: string, city: CongestionCity): Promise<TrafficImpact> {
  let matched: ChokePoint[] = [];
  let routed = false;
  let geocoded = false;
  let cityWide = false;

  // Dynamic DB: OSM Overpass (cached) → static seed fallback.
  const db = await getChokePoints(city);

  const startC = await geocode(ex.start, city); // throttle handled inside geocode
  const endC = await geocode(ex.end, city);
  geocoded = !!(startC || endC);

  if (startC && endC) {
    const route = await osrmRoute(startC, endC);
    if (route?.length) { matched = intersectRoute(route, db); routed = true; }
  }
  if (matched.length === 0) {
    const near = [startC, endC].filter(Boolean) as [number, number][];
    if (near.length) matched = chokePointsNear(near, db);
  }
  // Venue fallback: no corridor, but a single named venue (park/chowk/ground).
  if (matched.length === 0 && ex.venue) {
    const venueC = await geocode(ex.venue, city);
    if (venueC) {
      geocoded = true;
      matched = chokePointsNear([venueC], db, 2500);
    }
  }
  if (matched.length === 0) {
    matched = chokePointsByName(ex, headline, db); // text fallback
  }
  // Last resort: nothing resolved — surface the citywide high-priority
  // junction watchlist instead of an empty report.
  if (matched.length === 0) {
    matched = topJunctions(db, 6);
    cityWide = true;
  }

  const majorRestrictions: string[] = [];
  if (ex.start && ex.end) {
    const when = ex.time ? ` (${ex.time}${ex.duration ? ', ' + ex.duration : ''})` : '';
    majorRestrictions.push(`Corridor ${ex.start} → ${ex.end} likely blocked / diverted${when}.`);
  } else if (ex.venue && !cityWide) {
    majorRestrictions.push(`Roads around ${ex.venue} likely restricted; expect local diversions.`);
  } else if (cityWide) {
    majorRestrictions.push('No specific corridor/venue resolved — showing citywide high-risk junctions as a watchlist.');
  }
  matched.forEach(cp => majorRestrictions.push(`${cp.name}: ${cp.note}`));

  const congestionProneAreas = Array.from(new Set(matched.flatMap(cp => cp.feeders)));

  return {
    id: ex.id,
    headline,
    city,
    eventType: ex.eventType || 'Event',
    routeTrajectory: ex.start && ex.end ? `${ex.start} → ${ex.end}` : (ex.start || ex.end || ex.venue || '—'),
    start: ex.start, end: ex.end, date: ex.date, time: ex.time, duration: ex.duration,
    intersectingChokePoints: matched.map(cp => ({ name: cp.name, note: cp.note })),
    majorRestrictions,
    congestionProneAreas,
    routed,
    geocoded,
    cityWide,
  };
}

// ── Public batch API (cached per id) ─────────────────────────────────────────
const impactCache = new Map<string, TrafficImpact>();

export async function analyzeTrafficBatch(items: IntelItem[], max = 6): Promise<TrafficImpact[]> {
  const candidates = items
    .filter(isTrafficRelevant)
    .map(it => ({ it, city: cityOf(it) }))
    .filter((x): x is { it: IntelItem; city: CongestionCity } => x.city !== null)
    .slice(0, max);
  if (!candidates.length) return [];

  // Serve cached; only extract+analyze the uncached ones.
  const uncached = candidates.filter(c => !impactCache.has(c.it.id));
  if (uncached.length) {
    // Warm the per-city choke-point DBs in parallel (Overpass fetch happens
    // once per city per week; afterwards this resolves from cache instantly).
    void Promise.allSettled(
      [...new Set(uncached.map(c => c.city))].map(city => getChokePoints(city)),
    );
    const extractions = await extractEvents(
      uncached.map(c => ({ id: c.it.id, headline: c.it.headline, summary: (c.it.summary || []).join(' '), city: c.city })),
    );
    // Process sequentially so geocoding stays within Nominatim's rate limit.
    for (const c of uncached) {
      const ex = extractions.find(e => e.id === c.it.id) ?? heuristicExtract({ id: c.it.id, headline: c.it.headline });
      try {
        const impact = await analyzeOne(ex, c.it.headline, c.city);
        impactCache.set(c.it.id, impact);
      } catch { /* skip on failure */ }
    }
  }

  return candidates
    .map(c => impactCache.get(c.it.id))
    .filter((x): x is TrafficImpact => !!x);
}
