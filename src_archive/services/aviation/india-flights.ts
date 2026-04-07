/**
 * India Flight Tracking Service
 *
 * Primary:  adsb.lol — open, keyless, real-time ADS-B (ODbL 1.0)
 * Fallback: OpenSky Network — free OAuth2, rate-limited to 4,000 calls/day
 *
 * India bounding box: lat 6.5–37.1, lon 68.1–97.4
 * Extended Indian Ocean:  lat 0–25, lon 60–100
 */

import { ofetch } from 'ofetch';
import { z } from 'zod';
import pRetry from 'p-retry';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Full India subcontinent bounding box */
export const INDIA_BBOX = {
    lat: 20.59, // centre latitude for adsb.lol distance query
    lon: 78.96, // centre longitude
    distNm: 2000, // nautical miles radius — covers entire subcontinent + IOR
} as const;

/** Exact bbox for OpenSky bounding-box query */
const INDIA_BBOX_EXACT = {
    lamin: 6.5,
    lamax: 37.1,
    lomin: 68.1,
    lomax: 97.4,
} as const;

/** India-registered ICAO hex range (assigned by ICAO to India) */
const IAF_HEX_MIN = 0x800000;
const IAF_HEX_MAX = 0x87ffff;

/** Emergency squawk codes */
export const EMERGENCY_SQUAWKS: Record<string, string> = {
    '7700': 'General Emergency',
    '7600': 'Radio Failure (NORDO)',
    '7500': 'Unlawful Interference (HIJACK)',
};

const POLL_INTERVAL_MS = 30_000; // 30 s — adsb.lol updates every ~8 s
const CACHE_TTL_MS = 25_000; // slightly under poll interval

// ---------------------------------------------------------------------------
// Zod schemas for runtime validation
// ---------------------------------------------------------------------------

const AdsbLolAircraftSchema = z.object({
    hex: z.string(),
    flight: z.string().optional(),
    lat: z.number().optional(),
    lon: z.number().optional(),
    alt_baro: z.union([z.number(), z.literal('ground')]).optional(),
    gs: z.number().optional(),     // ground speed (knots)
    track: z.number().optional(),     // heading (degrees)
    squawk: z.string().optional(),
    category: z.string().optional(),     // A1-A7 | B1-B8 | C1-C4
    emergency: z.string().optional(),
    type: z.string().optional(),     // adsb_icao | mlat | mode_s | ...
    r: z.string().optional(),     // registration
    t: z.string().optional(),     // aircraft type code
    dbFlags: z.number().optional(),
    nav_altitude_mcp: z.number().optional(),
    nic: z.number().optional(),
}).passthrough();

const AdsbLolResponseSchema = z.object({
    ac: z.array(AdsbLolAircraftSchema),
    msg: z.string().optional(),
    now: z.number().optional(),
});

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface IndiaFlight {
    id: string;
    hex: string;
    callsign: string;
    registration?: string;
    typeCode?: string;
    lat: number;
    lon: number;
    altitudeFt: number;
    speedKnots: number;
    heading: number;
    squawk?: string;
    category?: string;
    dataSource: 'adsb' | 'mlat' | 'mode_s' | 'unknown';
    // OSINT classifications
    isEmergency: boolean;
    emergencyType?: string;
    isMilitary: boolean;
    isIndianReg: boolean;
    isDark: boolean; // no ADS-B transponder (mlat only)
    lastSeen: Date;
}

export interface FlightServiceStatus {
    source: 'adsb.lol' | 'opensky' | 'offline';
    count: number;
    emergencies: number;
    lastUpdated?: Date;
}

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

let cachedFlights: IndiaFlight[] = [];
let cacheTimestamp: number = 0;
let serviceStatus: FlightServiceStatus = { source: 'offline', count: 0, emergencies: 0 };
let pollTimer: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// OSINT classification helpers
// ---------------------------------------------------------------------------

function classifyEmergency(squawk: string | undefined, emergencyField: string | undefined) {
    if (emergencyField && emergencyField !== 'none') {
        return { isEmergency: true, emergencyType: emergencyField };
    }
    if (squawk && squawk in EMERGENCY_SQUAWKS) {
        return { isEmergency: true, emergencyType: EMERGENCY_SQUAWKS[squawk] };
    }
    return { isEmergency: false, emergencyType: undefined };
}

function isIndianRegistered(hex: string): boolean {
    const n = parseInt(hex, 16);
    return n >= IAF_HEX_MIN && n <= IAF_HEX_MAX;
}

/**
 * Heuristic: aircraft is likely military if:
 * - MLAT-only (no ADS-B transponder — common for military)
 * - hex starts with "~" (non-ICAO mode-S)
 * - Indian hex range + no civilian callsign pattern
 * - category B2 (military helicopter)
 */
function classifyMilitary(ac: z.infer<typeof AdsbLolAircraftSchema>): boolean {
    if (ac.type === 'mlat') return true;
    if (ac.hex?.startsWith('~')) return true;
    if (ac.category === 'B2') return true;
    // Indian Air Force / Navy callsigns
    const callsign = (ac.flight || '').trim().toUpperCase();
    if (/^(IAF|INS|HAL|VT-[A-Z]{3}|AXB|IAC|INDIA|SHN)/.test(callsign)) return true;
    return false;
}

// ---------------------------------------------------------------------------
// adsb.lol primary fetch
// ---------------------------------------------------------------------------

async function fetchAdsbLol(): Promise<IndiaFlight[]> {
    const url = `https://api.adsb.lol/v2/lat/${INDIA_BBOX.lat}/lon/${INDIA_BBOX.lon}/dist/${INDIA_BBOX.distNm}/`;
    const raw = await pRetry(
        () => ofetch(url, { timeout: 10_000, responseType: 'json' }),
        { retries: 2, minTimeout: 1_000 }
    );

    const parsed = AdsbLolResponseSchema.safeParse(raw);
    if (!parsed.success) throw new Error('adsb.lol response validation failed');

    return parsed.data.ac
        .filter(ac => ac.lat !== undefined && ac.lon !== undefined)
        .map(ac => {
            const emergencyInfo = classifyEmergency(ac.squawk, ac.emergency);
            const alt = typeof ac.alt_baro === 'number' ? ac.alt_baro : 0;
            return {
                id: `adsbLol-${ac.hex}`,
                hex: ac.hex.toUpperCase(),
                callsign: (ac.flight || '').trim() || `UNKN-${ac.hex.substring(0, 4).toUpperCase()}`,
                registration: ac.r,
                typeCode: ac.t,
                lat: ac.lat!,
                lon: ac.lon!,
                altitudeFt: alt,
                speedKnots: Math.round(ac.gs ?? 0),
                heading: Math.round(ac.track ?? 0),
                squawk: ac.squawk,
                category: ac.category,
                dataSource: (ac.type === 'mlat' ? 'mlat' : ac.type === 'adsb_icao' ? 'adsb' : ac.type === 'mode_s' ? 'mode_s' : 'unknown') as IndiaFlight['dataSource'],
                isEmergency: emergencyInfo.isEmergency,
                emergencyType: emergencyInfo.emergencyType,
                isMilitary: classifyMilitary(ac),
                isIndianReg: isIndianRegistered(ac.hex),
                isDark: ac.type === 'mlat',
                lastSeen: new Date(),
            } satisfies IndiaFlight;
        });
}

// ---------------------------------------------------------------------------
// OpenSky fallback (OAuth2 — needs VITE_OPENSKY_CLIENT_ID/SECRET)
// ---------------------------------------------------------------------------

let openSkyToken: string | null = null;
let openSkyTokenExpiry = 0;

async function getOpenSkyToken(): Promise<string | null> {
    const clientId = import.meta.env.VITE_OPENSKY_CLIENT_ID;
    const clientSecret = import.meta.env.VITE_OPENSKY_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;

    if (openSkyToken && Date.now() < openSkyTokenExpiry) return openSkyToken;

    try {
        const resp = await ofetch<{ access_token: string; expires_in: number }>(
            'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`,
            }
        );
        openSkyToken = resp.access_token;
        openSkyTokenExpiry = Date.now() + (resp.expires_in - 60) * 1000;
        return openSkyToken;
    } catch {
        return null;
    }
}

async function fetchOpenSkyFallback(): Promise<IndiaFlight[]> {
    const token = await getOpenSkyToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const { lamin, lamax, lomin, lomax } = INDIA_BBOX_EXACT;
    const url = `https://opensky-network.org/api/states/all?lamin=${lamin}&lamax=${lamax}&lomin=${lomin}&lomax=${lomax}`;

    interface OpenSkyResp { states: (string | number | boolean | null)[][] | null }
    const raw = await ofetch<OpenSkyResp>(url, { headers, timeout: 15_000 });
    if (!raw.states) return [];

    return raw.states
        .filter(s => typeof s[6] === 'number' && typeof s[5] === 'number')
        .map(s => {
            const hex = String(s[0] || '');
            const callsign = String(s[1] || '').trim();
            const lat = s[6] as number;
            const lon = s[5] as number;
            const squawk = s[14] ? String(s[14]) : undefined;
            const altM = typeof s[7] === 'number' ? s[7] : 0;
            const velMs = typeof s[9] === 'number' ? s[9] : 0;
            const track = typeof s[10] === 'number' ? s[10] : 0;
            const emer = classifyEmergency(squawk, undefined);
            return {
                id: `opensky-${hex}`,
                hex: hex.toUpperCase(),
                callsign: callsign || `UNKN-${hex.substring(0, 4).toUpperCase()}`,
                lat, lon,
                altitudeFt: Math.round(altM * 3.281),
                speedKnots: Math.round(velMs * 1.944),
                heading: Math.round(track),
                squawk,
                dataSource: 'adsb' as const,
                isEmergency: emer.isEmergency,
                emergencyType: emer.emergencyType,
                isMilitary: false,
                isIndianReg: isIndianRegistered(hex),
                isDark: false,
                lastSeen: new Date(),
            } satisfies IndiaFlight;
        });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Fetch all flights over India — adsb.lol primary, OpenSky fallback. */
export async function fetchIndiaFlights(): Promise<IndiaFlight[]> {
    // Serve from cache if still fresh
    if (Date.now() - cacheTimestamp < CACHE_TTL_MS) return cachedFlights;

    try {
        const flights = await fetchAdsbLol();
        cachedFlights = flights;
        cacheTimestamp = Date.now();
        serviceStatus = {
            source: 'adsb.lol',
            count: flights.length,
            emergencies: flights.filter(f => f.isEmergency).length,
            lastUpdated: new Date(),
        };
        return flights;
    } catch (primary) {
        console.warn('[IndiaFlights] adsb.lol failed, trying OpenSky fallback:', primary);
        try {
            const flights = await fetchOpenSkyFallback();
            cachedFlights = flights;
            cacheTimestamp = Date.now();
            serviceStatus = { source: 'opensky', count: flights.length, emergencies: 0, lastUpdated: new Date() };
            return flights;
        } catch (fallback) {
            console.error('[IndiaFlights] Both sources failed:', fallback);
            serviceStatus = { source: 'offline', count: 0, emergencies: 0 };
            return cachedFlights; // return stale if available
        }
    }
}

/** Start automatic 30-second polling */
export function startFlightPolling(onUpdate?: (flights: IndiaFlight[]) => void): void {
    if (pollTimer) return;
    const tick = async () => {
        const flights = await fetchIndiaFlights();
        onUpdate?.(flights);
    };
    void tick();
    pollTimer = setInterval(tick, POLL_INTERVAL_MS);
}

/** Stop polling */
export function stopFlightPolling(): void {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

/** Get current service status */
export function getFlightServiceStatus(): FlightServiceStatus {
    return serviceStatus;
}

/** Get only emergency flights */
export function getEmergencyFlights(): IndiaFlight[] {
    return cachedFlights.filter(f => f.isEmergency);
}

/** Get only military / dark aircraft */
export function getMilitaryFlights(): IndiaFlight[] {
    return cachedFlights.filter(f => f.isMilitary);
}

/** Get only Indian-registered aircraft */
export function getIndianRegisteredFlights(): IndiaFlight[] {
    return cachedFlights.filter(f => f.isIndianReg);
}
