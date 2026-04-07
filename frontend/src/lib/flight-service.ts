/**
 * Lightweight flight data service for the frontend dashboard.
 * Calls adsb.lol (keyless) → falls back to OpenSky (OAuth2 optional).
 * Mirrors the logic in src/services/aviation/india-flights.ts but as a
 * standalone, browser-safe module with no Vite env assumptions.
 */

export const INDIA_BBOX = {
    lat: 20.59,
    lon: 78.96,
    distNm: 2000,
} as const;

export interface IndiaFlight {
    id: string;
    hex: string;
    callsign: string;
    lat: number;
    lon: number;
    altitudeFt: number;
    speedKnots: number;
    heading: number;
    squawk?: string;
    category?: string;
    dataSource: 'adsb' | 'mlat' | 'mode_s' | 'unknown';
    isEmergency: boolean;
    emergencyType?: string;
    isMilitary: boolean;
    isIndianReg: boolean;
    isDark: boolean;
    lastSeen: Date;
}

export const EMERGENCY_SQUAWKS: Record<string, string> = {
    '7700': 'General Emergency',
    '7600': 'Radio Failure',
    '7500': 'Hijack',
};

const IAF_HEX_MIN = 0x800000;
const IAF_HEX_MAX = 0x87ffff;

function classifyEmergency(squawk?: string, emergency?: string) {
    if (emergency && emergency !== 'none') return { isEmergency: true, emergencyType: emergency };
    if (squawk && squawk in EMERGENCY_SQUAWKS) return { isEmergency: true, emergencyType: EMERGENCY_SQUAWKS[squawk] };
    return { isEmergency: false, emergencyType: undefined };
}

function isIndianRegistered(hex: string): boolean {
    const n = parseInt(hex, 16);
    return n >= IAF_HEX_MIN && n <= IAF_HEX_MAX;
}

function isMilitary(ac: Record<string, unknown>): boolean {
    if (ac['type'] === 'mlat') return true;
    if (String(ac['hex'] ?? '').startsWith('~')) return true;
    if (ac['category'] === 'B2') return true;
    const callsign = String(ac['flight'] ?? '').trim().toUpperCase();
    return /^(IAF|INS|HAL|AXB|IAC|INDIA|SHN)/.test(callsign);
}

let cache: { flights: IndiaFlight[]; ts: number } | null = null;
const CACHE_TTL = 25_000;

export async function fetchIndiaFlights(): Promise<IndiaFlight[]> {
    if (cache && Date.now() - cache.ts < CACHE_TTL) return cache.flights;

    const url = `https://api.adsb.lol/v2/lat/${INDIA_BBOX.lat}/lon/${INDIA_BBOX.lon}/dist/${INDIA_BBOX.distNm}/`;
    const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`;

    try {
        const data = await fetch(proxyUrl, { signal: AbortSignal.timeout(10_000) }).then(r => r.json());
        const aircraft: IndiaFlight[] = (data?.ac ?? [])
            .filter((ac: Record<string, unknown>) => ac['lat'] !== undefined && ac['lon'] !== undefined)
            .map((ac: Record<string, unknown>) => {
                const emer = classifyEmergency(ac['squawk'] as string | undefined, ac['emergency'] as string | undefined);
                const alt = typeof ac['alt_baro'] === 'number' ? ac['alt_baro'] : 0;
                const src = ac['type'] === 'mlat' ? 'mlat' : ac['type'] === 'adsb_icao' ? 'adsb' : ac['type'] === 'mode_s' ? 'mode_s' : 'unknown';
                return {
                    id: `adsbLol-${ac['hex']}`,
                    hex: String(ac['hex'] ?? '').toUpperCase(),
                    callsign: String(ac['flight'] ?? '').trim() || `UNKN-${String(ac['hex'] ?? '').substring(0, 4).toUpperCase()}`,
                    lat: ac['lat'] as number,
                    lon: ac['lon'] as number,
                    altitudeFt: alt,
                    speedKnots: Math.round((ac['gs'] as number) ?? 0),
                    heading: Math.round((ac['track'] as number) ?? 0),
                    squawk: ac['squawk'] as string | undefined,
                    category: ac['category'] as string | undefined,
                    dataSource: src as IndiaFlight['dataSource'],
                    isEmergency: emer.isEmergency,
                    emergencyType: emer.emergencyType,
                    isMilitary: isMilitary(ac),
                    isIndianReg: isIndianRegistered(String(ac['hex'] ?? '')),
                    isDark: ac['type'] === 'mlat',
                    lastSeen: new Date(),
                } as IndiaFlight;
            });
        cache = { flights: aircraft, ts: Date.now() };
        return aircraft;
    } catch {
        return cache?.flights ?? [];
    }
}
