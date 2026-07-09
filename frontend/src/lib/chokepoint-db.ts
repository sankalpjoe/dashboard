/**
 * Dynamic choke-point database — replaces the hardcoded CONGESTION_DB lookup.
 *
 * Source: OpenStreetMap Overpass API (CORS-enabled, no key).
 *   • flyovers / bridges on motorway/trunk/primary roads
 *   • motorway_junction nodes (interchanges)
 *   • named signalized junctions on arterials
 *   • suburb/neighbourhood place nodes → feeder areas (3 nearest per point)
 *
 * Caching: in-memory + localStorage (7-day TTL) per city.
 * Fallback: the static CONGESTION_DB seed when Overpass is unreachable.
 */
import { CONGESTION_DB, haversineMeters, type ChokePoint, type CongestionCity } from '@/config/congestion';
import { CITY_COORDS } from './news-service';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const CACHE_VERSION = 'v1';
const CACHE_TTL_MS = 7 * 24 * 3600_000;
const CITY_RADIUS_M = 22_000;
const MAX_POINTS = 50;
const DEDUPE_RADIUS_M = 400;
const FEEDER_RADIUS_M = 4_000;

const memCache = new Map<string, ChokePoint[]>();

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function buildQuery(lat: number, lon: number): string {
  const r = CITY_RADIUS_M;
  return `[out:json][timeout:30];
(
  node["highway"="motorway_junction"](around:${r},${lat},${lon});
  way["bridge"="yes"]["highway"~"^(motorway|trunk|primary)$"]["name"](around:${r},${lat},${lon});
  node["highway"="traffic_signals"]["name"](around:${r},${lat},${lon});
  node["place"~"^(suburb|neighbourhood)$"]["name"](around:${r},${lat},${lon});
);
out center 400;`;
}

/** Rank: interchanges & flyovers above signalized junctions. */
function rankOf(tags: Record<string, string>): number {
  if (tags['highway'] === 'motorway_junction') return 0;
  if (tags['bridge'] === 'yes') return 1;
  return 2;
}

function noteOf(tags: Record<string, string>): string {
  if (tags['highway'] === 'motorway_junction')
    return 'Highway interchange — primary diversion point when the corridor is closed.';
  if (tags['bridge'] === 'yes')
    return 'Flyover/bridge bottleneck — lane closures ripple along feeder roads.';
  return 'Signalized arterial junction — spillover under march/rally load.';
}

function fromOverpass(elements: OverpassElement[]): ChokePoint[] {
  const places: { name: string; lat: number; lon: number }[] = [];
  const raw: { name: string; lat: number; lon: number; rank: number; note: string }[] = [];

  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    const tags = el.tags || {};
    const name = tags['name'];
    if (lat == null || lon == null || !name) continue;

    if (tags['place']) {
      places.push({ name, lat, lon });
    } else {
      raw.push({ name, lat, lon, rank: rankOf(tags), note: noteOf(tags) });
    }
  }

  // Rank, then dedupe points that sit within DEDUPE_RADIUS of a better one.
  raw.sort((a, b) => a.rank - b.rank);
  const kept: typeof raw = [];
  for (const p of raw) {
    if (kept.length >= MAX_POINTS) break;
    if (kept.some(k => haversineMeters(k.lat, k.lon, p.lat, p.lon) <= DEDUPE_RADIUS_M)) continue;
    kept.push(p);
  }

  // Feeders: 3 nearest named localities within FEEDER_RADIUS.
  return kept.map(p => {
    const feeders = places
      .map(pl => ({ pl, d: haversineMeters(p.lat, p.lon, pl.lat, pl.lon) }))
      .filter(x => x.d <= FEEDER_RADIUS_M)
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .map(x => x.pl.name);
    return { name: p.name, lat: p.lat, lon: p.lon, feeders, note: p.note };
  });
}

async function fetchOverpass(city: CongestionCity): Promise<ChokePoint[] | null> {
  const [lat, lon] = (CITY_COORDS as Record<string, [number, number]>)[city] ?? [];
  if (lat == null) return null;
  const query = buildQuery(lat, lon);

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(35_000),
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      const points = fromOverpass(data?.elements || []);
      if (points.length >= 5) return points; // sanity floor
    } catch { /* try next endpoint */ }
  }
  return null;
}

function cacheKey(city: CongestionCity): string {
  return `chokepoints:${CACHE_VERSION}:${city}`;
}

function readCache(city: CongestionCity): ChokePoint[] | null {
  try {
    const rawValue = localStorage.getItem(cacheKey(city));
    if (!rawValue) return null;
    const { ts, points } = JSON.parse(rawValue);
    if (!Array.isArray(points) || Date.now() - ts > CACHE_TTL_MS) return null;
    return points as ChokePoint[];
  } catch { return null; }
}

function writeCache(city: CongestionCity, points: ChokePoint[]): void {
  try {
    localStorage.setItem(cacheKey(city), JSON.stringify({ ts: Date.now(), points }));
  } catch { /* storage full / unavailable — non-fatal */ }
}

const inflight = new Map<CongestionCity, Promise<ChokePoint[]>>();

/**
 * Get the choke-point DB for a city: memory → localStorage → Overpass → seed.
 * Always resolves (the static seed guarantees a non-empty result).
 * Concurrent callers for the same city share a single Overpass request.
 */
export async function getChokePoints(city: CongestionCity): Promise<ChokePoint[]> {
  const mem = memCache.get(city);
  if (mem) return mem;

  const cached = readCache(city);
  if (cached) { memCache.set(city, cached); return cached; }

  const pending = inflight.get(city);
  if (pending) return pending;

  const job = (async (): Promise<ChokePoint[]> => {
    try {
      const live = await fetchOverpass(city);
      if (live) {
        // Merge: live OSM data first, then any seed points not already covered.
        const seed = (CONGESTION_DB[city] || []).filter(
          s => !live.some(l => haversineMeters(l.lat, l.lon, s.lat, s.lon) <= DEDUPE_RADIUS_M),
        );
        const merged = [...live, ...seed];
        memCache.set(city, merged);
        writeCache(city, merged);
        return merged;
      }
      const seed = CONGESTION_DB[city] || [];
      memCache.set(city, seed);
      return seed;
    } finally {
      inflight.delete(city);
    }
  })();
  inflight.set(city, job);
  return job;
}

/** Top-N highest-priority junctions citywide (for no-route watchlists). */
export function topJunctions(db: ChokePoint[], n = 6): ChokePoint[] {
  return db.slice(0, n);
}
