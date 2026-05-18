/**
 * Ship tracking service for the frontend dashboard.
 * Connects to aisstream.io WebSocket (free key — register at aisstream.io with GitHub).
 * Set VITE_AISSTREAM_API_KEY in frontend/.env.local to activate.
 * Without the key, the service returns empty state gracefully.
 */

export type ShipClass = 'military' | 'tanker' | 'cargo' | 'passenger' | 'fishing' | 'tug' | 'unknown';

const MILITARY_TYPE = 35;
const TANKER_TYPES = [80, 81, 82, 83, 84, 85, 86, 87, 88, 89];
const CARGO_TYPES = [70, 71, 72, 73, 74, 75, 76, 77, 78, 79];

function classifyShip(t?: number): ShipClass {
    if (!t) return 'unknown';
    if (t === MILITARY_TYPE) return 'military';
    if (TANKER_TYPES.includes(t)) return 'tanker';
    if (CARGO_TYPES.includes(t)) return 'cargo';
    if (t >= 60 && t <= 69) return 'passenger';
    if (t >= 30 && t <= 37) return 'fishing';
    if (t === 52) return 'tug';
    return 'unknown';
}

const NAV_LABELS: Record<number, string> = {
    0: 'Under way', 1: 'At anchor', 5: 'Moored', 6: 'Aground',
    14: 'DISTRESS (AIS-SART)',
};

export interface Vessel {
    mmsi: number;
    name?: string;
    lat: number;
    lon: number;
    speedKnots?: number;
    heading?: number;
    navStatus?: number;
    navStatusLabel?: string;
    shipClass: ShipClass;
    destination?: string;
    isDistress: boolean;
    isMilitary: boolean;
    isDark: boolean;
    lastUpdate: number;
    vesselClass?: string;   // e.g. 'Nimitz-class CVN'
    description?: string;   // one-line context blurb
}

const INDIA_MARITIME_BOXES: [[number, number], [number, number]][] = [
    [[0, 55], [25, 78]],     // Arabian Sea
    [[5, 78], [22, 100]],    // Bay of Bengal
    [[-5, 65], [15, 85]],    // Indian Ocean north
    [[20, 66], [28, 78]],    // Gujarat / Karachi coast
];

const DARK_THRESHOLD_MS = 2 * 60 * 60 * 1000;

export type VesselCallback = (vessels: Map<number, Vessel>) => void;

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let isRunning = false;
let messageCount = 0;
const vessels = new Map<number, Vessel>();
const callbacks = new Set<VesselCallback>();

function notify() {
    for (const cb of callbacks) { try { cb(new Map(vessels)); } catch { } }
}

function getOrCreate(mmsi: number): Vessel {
    if (!vessels.has(mmsi)) {
        vessels.set(mmsi, { mmsi, lat: 0, lon: 0, shipClass: 'unknown', isDistress: false, isMilitary: false, isDark: false, lastUpdate: Date.now() });
    }
    return vessels.get(mmsi)!;
}

function handleMessage(raw: string) {
    try {
        const msg = JSON.parse(raw);
        const type = msg.MessageType;
        const inner = msg.Message;
        if (!inner) return;
        messageCount++;

        if (type === 'PositionReport') {
            const r = inner.PositionReport;
            if (!r || !Number.isFinite(r.Latitude) || !Number.isFinite(r.Longitude)) return;
            const v = getOrCreate(r.UserID);
            v.lat = r.Latitude;
            v.lon = r.Longitude;
            v.speedKnots = r.Sog;
            v.heading = r.TrueHeading;
            v.navStatus = r.NavigationalStatus;
            v.navStatusLabel = r.NavigationalStatus !== undefined ? (NAV_LABELS[r.NavigationalStatus] ?? 'Unknown') : undefined;
            v.isDistress = r.NavigationalStatus === 14;
            v.lastUpdate = Date.now();
            v.isDark = false;
        } else if (type === 'ShipStaticData') {
            const d = inner.ShipStaticData;
            if (!d) return;
            const v = getOrCreate(d.UserID);
            if (d.Name) v.name = d.Name.trim();
            v.shipClass = classifyShip(d.Type);
            v.isMilitary = d.Type === MILITARY_TYPE;
            if (d.Destination) v.destination = d.Destination.trim();
            v.lastUpdate = Date.now();
        }
        notify();
    } catch { }
}

function subscribe() {
    const apiKey = import.meta.env.VITE_AISSTREAM_API_KEY || "4bae770ec233776c2cd370d1c3e357af37138fab";
    if (!apiKey || !ws) return;
    ws.send(JSON.stringify({
        APIKey: apiKey,
        BoundingBoxes: INDIA_MARITIME_BOXES,
        FilterMessageTypes: ['PositionReport', 'ShipStaticData', 'SafetyMessage'],
    }));
}

function connect() {
    if (!isRunning) return;
    ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
    ws.onopen = () => subscribe();
    ws.onmessage = e => handleMessage(String(e.data));
    ws.onclose = () => {
        if (isRunning) {
            if (reconnectTimer) clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(connect, 3000);
        }
    };
    ws.onerror = () => ws?.close();
}

export function startShipService(cb: VesselCallback): () => void {
    callbacks.add(cb);
    if (!isRunning) {
        isRunning = true;
        connect();
    }
    return () => {
        callbacks.delete(cb);
        if (callbacks.size === 0) {
            isRunning = false;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            ws?.close();
            ws = null;
        }
    };
}

export function getShipStats() {
    const now = Date.now();
    const all = Array.from(vessels.values()).filter(v => v.lat !== 0);
    return {
        total: all.length,
        distress: all.filter(v => v.isDistress).length,
        military: all.filter(v => v.isMilitary).length,
        dark: all.filter(v => now - v.lastUpdate > DARK_THRESHOLD_MS).length,
        messages: messageCount,
    };
}

export function getAllVessels(): Vessel[] {
    return Array.from(vessels.values()).filter(v => v.lat !== 0);
}
