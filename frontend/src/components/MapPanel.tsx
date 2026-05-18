import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import maplibregl from "maplibre-gl";
import { Map as MapInstance } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useIndiaFlights, useIndiaShips } from "@/hooks/useTracking";
import { useUSNIShips } from "@/lib/usni-service";
import { useLiveIntel } from "@/hooks/useIntel";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ScatterplotLayer, GeoJsonLayer, IconLayer, TextLayer, PathLayer } from "@deck.gl/layers";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import { INDIA_MARKERS, MARKER_COLORS } from "@/config/hotspots";
import { INDIA_SUBZONES } from "@/config/india-subzones";
import { STRATEGIC_ASSETS } from "@/config/strategic-assets";
import { CHOKEPOINTS, CHOKEPOINT_STATUS_COLORS, CHOKEPOINT_LINE_COLORS } from "@/config/chokepoints";
import { WORLD_LEADERS, WorldLeader } from "@/config/world-leaders";
import { Location } from "@/hooks/useRoutePlanner";

// ─── ICAO airline prefix → operator name ──────────────────────────────────────
const ICAO_AIRLINES: Record<string, string> = {
  // India
  AIC: 'Air India', IGO: 'IndiGo', SEJ: 'SpiceJet', GOW: 'GoAir',
  AXB: 'Air Asia India', VTI: 'Vistara', BSG: 'Blue Dart', FDB: 'flydubai',
  // India military
  IAF: 'Indian Air Force', IND: 'IAF', IAM: 'IAF Military',
  // Pakistan
  PIA: 'Pakistan Int\'l Airlines', PAF: 'Pakistan Air Force',
  // US military
  RCH: 'USAF AMC', AIO: 'US Army', BRK: 'US Navy', CPT: 'USAF', DCM: 'USMC',
  CNV: 'US Navy', RRR: 'USAF AFSOC', SUI: 'US Navy VQ', EVS: 'US Army Aviation',
  // Civilian international
  UAE: 'Emirates', ETD: 'Etihad', QTR: 'Qatar Airways', THY: 'Turkish Airlines',
  SIA: 'Singapore Airlines', BAW: 'British Airways', DLH: 'Lufthansa',
  AFR: 'Air France', KLM: 'KLM Royal Dutch', SVA: 'Saudia', FDX: 'FedEx',
  UPS: 'UPS Airlines', CLX: 'Cargolux', MSR: 'EgyptAir', ETH: 'Ethiopian Airlines',
  KAL: 'Korean Air', CPA: 'Cathay Pacific', ANA: 'All Nippon Airways',
  VTE: 'Vietnam Airlines', MAS: 'Malaysia Airlines',
};

function decodeCallsign(callsign?: string): { airline: string | null; flight: string } {
  if (!callsign) return { airline: null, flight: '—' };
  const cs = callsign.trim().toUpperCase();
  const prefix = cs.replace(/[0-9].*/g, '').slice(0, 3);
  const airline = ICAO_AIRLINES[prefix] ?? null;
  return { airline, flight: cs };
}

// ─── Squawk code interpretation ────────────────────────────────────────────────
const SQUAWK_LABELS: Record<string, string> = {
  '7500': '⚠ HIJACK',
  '7600': '⚠ RADIO FAIL',
  '7700': '⚠ EMERGENCY',
  '1200': 'VFR',
  '2000': 'IFR Oceanic',
  '0000': 'Not set',
};

// ─── GPS Jam Zones (approximate known regions) ─────────────────────────────────
const GPS_JAM_ZONES = [
  { lat: 32.0, lon: 34.8, weight: 9, label: 'Israel / Gaza' },
  { lat: 36.5, lon: 36.5, weight: 7, label: 'Syria-Turkey Border' },
  { lat: 54.0, lon: 28.0, weight: 5, label: 'Belarus / Kaliningrad' },
  { lat: 60.0, lon: 30.0, weight: 6, label: 'Finland-Russia Border' },
  { lat: 48.0, lon: 39.0, weight: 8, label: 'Eastern Ukraine' },
  { lat: 44.0, lon: 44.0, weight: 7, label: 'North Caucasus' },
  { lat: 25.5, lon: 56.5, weight: 5, label: 'Strait of Hormuz' },
  { lat: 15.0, lon: 44.0, weight: 6, label: 'Yemen / Red Sea' },
  { lat: 33.0, lon: 35.5, weight: 7, label: 'Lebanon / Hezbollah Zone' },
  { lat: 14.0, lon: 43.5, weight: 6, label: 'Bab-el-Mandeb' },
  { lat: 30.0, lon: 32.3, weight: 4, label: 'Suez Approaches' },
];
// ─── Static config ─────────────────────────────────────────────────────────────
// IMPORTANT: keywords here must be SPECIFIC city/event phrases, NOT broad country
// adjectives like 'iran','iranian','pakistan' — those match India-related articles
// that merely reference those countries and cause wrong map placement.

const INTEL_LOCATIONS = [
  { keywords: ['srinagar', 'kashmir', 'loc violation', 'ceasefire violation'], lat: 34.0837, lon: 74.7973, code: 'LOC' },
  { keywords: ['doklam', 'galwan', 'lac standoff', 'depsang', 'arunachal border', 'aksai chin', 'tawang'], lat: 35.8617, lon: 104.1954, code: 'CHN' },
  { keywords: ['sri lanka', 'colombo', 'jaffna'], lat: 7.8731, lon: 80.7718, code: 'LKA' },
  { keywords: ['kabul', 'kandahar', 'jalalabad', 'taliban'], lat: 34.5553, lon: 69.2075, code: 'AFG' },
  { keywords: ['islamabad', 'karachi', 'lahore', 'rawalpindi', 'peshawar'], lat: 33.6844, lon: 73.0479, code: 'PAK' },
  { keywords: ['dhaka', 'bangladesh', 'rohingya', 'cox bazar'], lat: 23.8103, lon: 90.4125, code: 'BGD' },
  { keywords: ['myanmar', 'naypyidaw', 'manipur border', 'moreh'], lat: 21.9162, lon: 95.9560, code: 'MMR' },
  { keywords: ['nepal', 'kathmandu', 'pokhara'], lat: 27.7172, lon: 85.3240, code: 'NPL' },
  { keywords: ['maldives', 'male', 'india out'], lat: 4.1755, lon: 73.5093, code: 'MDV' },
  { keywords: ['houthi', 'red sea', 'bab-el-mandeb', 'yemen'], lat: 15.5527, lon: 48.5164, code: 'YEM' },
  { keywords: ['iran', 'tehran', 'isfahan', 'hormuz'], lat: 32.6539, lon: 51.6660, code: 'IRN' },
  { keywords: ['gaza', 'israel', 'west bank'], lat: 31.5, lon: 34.7, code: 'ISR' },
  { keywords: ['afghanistan', 'taliban'], lat: 33.9391, lon: 67.7099, code: 'AFG' },
];

const CONFLICT_ZONE_CONFIG: Record<string, {
  alertLevel: 'HIGH' | 'ELEVATED' | 'MONITOR';
  label: string; startDate?: string; casualties?: string; displaced?: string; status?: string;
  wikiSlug?: string;
}> = {
  PAK: {
    alertLevel: 'HIGH',
    label: 'India–Pakistan — Active Military Confrontation',
    startDate: 'May 2025',
    casualties: 'Escalating — classified',
    displaced: 'Civilian evacuations LoC sector',
    status: 'Post-Operation Sindoor: India conducted precision strikes on militant infrastructure in Pakistan. LoC remains highly volatile. Cross-border drone/artillery incidents ongoing.',
    wikiSlug: '2025_India%E2%80%93Pakistan_conflict',
  },
  CHN: {
    alertLevel: 'ELEVATED',
    label: 'China — LAC Friction Zones',
    startDate: '2020',
    casualties: 'Undisclosed',
    displaced: 'None',
    status: 'PLA infrastructure buildup in Depsang, Demchok. Patrol friction continues. Tawang and Arunachal remain flashpoints.',
    wikiSlug: 'Sino-Indian_War',
  },
  MMR: {
    alertLevel: 'ELEVATED',
    label: 'Myanmar — Civil War / Border Instability',
    startDate: '2021',
    casualties: '60,000+',
    displaced: '3.2 Million',
    status: 'Refugee flow into Mizoram/Manipur. India deployed CAPF along Moreh border. Border fencing accelerated.',
    wikiSlug: 'Myanmar_civil_war_(2021%E2%80%93present)',
  },
  AFG: {
    alertLevel: 'HIGH',
    label: 'Afghanistan — Taliban / Border Threat',
    startDate: '2021',
    casualties: 'Classified',
    displaced: '4.2 Million+',
    status: 'TTP active in border regions. Cross-border militancy channels into India remain active.',
    wikiSlug: 'Islamic_Emirate_of_Afghanistan',
  },
  BGD: {
    alertLevel: 'MONITOR',
    label: 'Bangladesh — Border & Migration',
    startDate: '2024',
    casualties: 'Unknown',
    displaced: 'Undetermined',
    status: 'Border fencing disputes. Rohingya crisis strain. Illegal migration and human trafficking along India-Bangladesh border.',
    wikiSlug: 'Bangladesh',
  },
  NPL: {
    alertLevel: 'MONITOR',
    label: 'Nepal — Border Friction',
    startDate: '2020',
    casualties: 'None',
    displaced: 'None',
    status: 'Kalapani-Limpiyadhura border dispute. Chinese influence in Nepalese politics. India-Nepal trade route blockades.',
    wikiSlug: 'Nepal',
  },
  LKA: {
    alertLevel: 'MONITOR',
    label: 'Sri Lanka — Strategic Concerns',
    startDate: '2022',
    casualties: 'None',
    displaced: 'None',
    status: "Chinese research vessel monitoring. Tamil Nadu fishing disputes. Economic recovery post-default. India's southern maritime neighbor.",
    wikiSlug: 'Sri_Lanka',
  },
  MDV: {
    alertLevel: 'ELEVATED',
    label: 'Maldives — India-China Competition',
    startDate: '2023',
    casualties: 'None',
    displaced: 'None',
    status: '"India Out" campaign. Chinese port/infrastructure deals. Indian military personnel withdrawal. Geostrategic Indian Ocean location.',
    wikiSlug: 'Maldives',
  },
  IRN: {
    alertLevel: 'ELEVATED',
    label: 'Iran — Regional Proxy / Hormuz',
    startDate: '2024',
    casualties: 'Escalating',
    displaced: 'Unknown',
    status: "Iran-Israel tensions. Strait of Hormuz disruptions affect India's energy imports. Chabahar port development under watch.",
    wikiSlug: 'Iran%E2%80%93Israel_proxy_conflict',
  },
  YEM: {
    alertLevel: 'HIGH',
    label: 'Yemen — Houthi Red Sea Campaign',
    startDate: '2014',
    casualties: '377,000+',
    displaced: '4.5 Million',
    status: 'Houthi attacks on Red Sea shipping. Indian Navy escort missions in Gulf of Aden. Trade route disruption impacts India-EU commerce.',
    wikiSlug: 'Red_Sea_crisis_(2023%E2%80%93present)',
  },
};

const ALERT_FILLS: Record<string, [number, number, number, number]> = {
  HIGH: [170, 0, 0, 140],
  ELEVATED: [204, 68, 0, 140],
  MONITOR: [136, 102, 0, 140],
};
const ALERT_LINES: Record<string, [number, number, number, number]> = {
  HIGH: [255, 34, 0, 230],
  ELEVATED: [255, 102, 0, 230],
  MONITOR: [255, 170, 0, 230],
};

const ASSET_COLORS: Record<string, [number, number, number, number]> = {
  nuclear: [180, 50, 200, 230],
  spaceport: [50, 150, 255, 230],
  base: [100, 120, 100, 230],
  cable: [50, 200, 200, 230],
  pipeline: [255, 120, 0, 230],
  datacenter: [0, 100, 255, 230],
};

const ASSET_LAYER_MAP: Record<string, string> = {
  nuclear: 'NUCLEAR_SITES',
  spaceport: 'SPACEPORTS',
  base: 'MILITARY_BASES',
  cable: 'CABLES',
  pipeline: 'PIPELINES',
  datacenter: 'DATACENTERS',
};

// Route colors: primary cyan, alt1 purple, alt2 orange — matches HTML
const ROUTE_COLORS: [number, number, number, number][] = [
  [0, 229, 255, 255], // cyan   — primary
  [167, 139, 250, 255], // purple — alt 1
  [251, 146, 60, 255], // orange — alt 2
];
const ROUTE_COLORS_DIM: [number, number, number, number][] = [
  [0, 229, 255, 50],
  [167, 139, 250, 50],
  [251, 146, 60, 50],
];
const ROUTE_WIDTHS = [5, 3, 3];

// ─── SVG constants ─────────────────────────────────────────────────────────────

const AIRPLANE_SVG = `data:image/svg+xml;charset=utf-8,%3Csvg width='24' height='24' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg' fill='white'%3E%3Cpath d='M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z'/%3E%3C/svg%3E`;
const PIN_GREEN = `data:image/svg+xml;charset=utf-8,%3Csvg width='24' height='24' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg' fill='%2310b981'%3E%3Cpath d='M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z'/%3E%3C/svg%3E`;
const PIN_RED = `data:image/svg+xml;charset=utf-8,%3Csvg width='24' height='24' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg' fill='%23f04c35'%3E%3Cpath d='M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z'/%3E%3C/svg%3E`;
// Clean AIS-style vessel — teardrop pointing up (bow), flat stern
const SHIP_SVG = `data:image/svg+xml;charset=utf-8,%3Csvg width='20' height='26' viewBox='0 0 20 26' xmlns='http://www.w3.org/2000/svg'%3E%3Cpolygon points='10,1 19,22 10,18 1,22' fill='white' stroke='%23222' stroke-width='1.2' stroke-linejoin='round'/%3E%3C/svg%3E`;

const ICON_SIZE_24 = { width: 24, height: 24, anchorY: 24 };
const ICON_SIZE_32 = { width: 32, height: 32, anchorY: 32 };

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Point-to-segment distance (degree space) */
function ptSegDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  if (!dx && !dy) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Build a list of coordinate-pair segments on `routeCoords` that lie within
 * `thresh` degrees of any critical incident. Used to paint blocked road sections red.
 */
function buildBlockedSegments(
  routeCoords: [number, number][],
  criticalIncidents: any[],
  thresh = 0.015
): [number, number][][] {
  if (!criticalIncidents.length || routeCoords.length < 2) return [];

  const blocked = new Set<number>();
  criticalIncidents.forEach(inc => {
    const lng = inc.location?.lng;
    const lat = inc.location?.lat;
    if (lng == null || lat == null) return;
    for (let i = 0; i < routeCoords.length - 1; i++) {
      const [a0, a1] = routeCoords[i];
      const [b0, b1] = routeCoords[i + 1];
      if (ptSegDist(lng, lat, a0, a1, b0, b1) < thresh) blocked.add(i);
    }
  });

  if (!blocked.size) return [];

  // Group consecutive blocked indices into polyline segments
  const groups: [number, number][][] = [];
  let current: [number, number][] | null = null;
  for (let i = 0; i < routeCoords.length - 1; i++) {
    if (blocked.has(i)) {
      if (!current) current = [routeCoords[i]];
      current.push(routeCoords[i + 1]);
    } else if (current) {
      groups.push(current);
      current = null;
    }
  }
  if (current) groups.push(current);
  return groups;
}

/** Severity → RGBA */
function incidentColor(severity: number): [number, number, number, number] {
  if (severity >= 4) return [255, 61, 87, 220];
  if (severity >= 3) return [255, 107, 53, 220];
  if (severity >= 2) return [255, 193, 7, 220];
  return [0, 230, 118, 220];
}

// ─── Types ─────────────────────────────────────────────────────────────────────

interface MapPanelProps {
  personnel?: any[];
  activeLayers: string[];
  routeAnalysis?: any;
  selectedRouteIndex?: number;
  incidents?: any[];
  origin?: Location | null;
  destination?: Location | null;
  onSelectVessel?: (vessel: any) => void;
  onSelectLeader?: (leader: WorldLeader) => void;
}

// ─── Component ─────────────────────────────────────────────────────────────────

const SATELLITE_STYLE = {
  version: 8,
  sources: {
    'esri-satellite': {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256
    }
  },
  layers: [
    {
      id: 'satellite',
      type: 'raster',
      source: 'esri-satellite',
      minzoom: 0,
      maxzoom: 22
    }
  ]
};

const MapPanel = ({
  personnel = [],
  activeLayers,
  routeAnalysis,
  selectedRouteIndex = 0,
  incidents = [],
  origin,
  destination,
  onSelectVessel,
  onSelectLeader,
}: MapPanelProps) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const overlayRef = useRef<any | null>(null);
  const pulseLayerRef = useRef<ScatterplotLayer | null>(null);
  const staticLayersRef = useRef<any[]>([]);

  const [mapReady, setMapReady] = useState(false);
  const [pulsePhase, setPulsePhase] = useState(0);
  const [worldGeoJSON, setWorldGeoJSON] = useState<any>(null);
  const [hoverInfo, setHoverInfo] = useState<any>(null);

  // Phase 4 settings
  const [mapStyle, setMapStyle] = useState<'dark' | 'satellite'>('satellite');
  const [isGlobe, setIsGlobe] = useState(false);
  const [mapFilter, setMapFilter] = useState<'none' | 'nv' | 'ir'>('none');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleHover = useCallback((info: any) => setHoverInfo(info), []);

  // World GeoJSON ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson')
      .then(r => r.json())
      .then(data => setWorldGeoJSON({
        type: 'FeatureCollection',
        features: data.features
          .filter((f: any) => f.properties?.ISO_A3 in CONFLICT_ZONE_CONFIG || f.properties?.ISO_A3_EH in CONFLICT_ZONE_CONFIG)
          .map((f: any) => {
            const iso = f.properties?.ISO_A3 in CONFLICT_ZONE_CONFIG ? f.properties.ISO_A3 : f.properties?.ISO_A3_EH;
            return {
              ...f,
              properties: { ...f.properties, _iso: iso, ...CONFLICT_ZONE_CONFIG[iso] },
            };
          }),
      }))
      .catch(console.error);
  }, []);

  // Live data ──────────────────────────────────────────────────────────────
  const { flights } = useIndiaFlights();
  const { vessels } = useIndiaShips();
  const { usniVessels } = useUSNIShips();
  const { intel } = useLiveIntel();

  // Stable scatter offsets for intel hotspots
  const scatterCache = useRef<Map<string, [number, number]>>(new Map());
  const liveHotspots = useMemo(() => {
    const spots: any[] = [];
    intel.forEach(item => {
      const text = item.headline.toLowerCase();
      for (const loc of INTEL_LOCATIONS) {
        if (loc.keywords.some((k: string) => text.includes(k))) {
          const key = `${item.headline}-${loc.code}`;
          if (!scatterCache.current.has(key)) {
            scatterCache.current.set(key, [(Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5]);
          }
          const [dLon, dLat] = scatterCache.current.get(key)!;
          spots.push({ lat: loc.lat + dLat, lon: loc.lon + dLon, code: loc.code, ...item });
          break;
        }
      }
    });
    return spots;
  }, [intel]);

  // ── All routes (primary + alternates) for rendering ───────────────────────
  const allRoutes = useMemo(() => {
    if (!routeAnalysis) return [];
    return [routeAnalysis.primaryRoute, ...(routeAnalysis.alternateRoutes ?? [])].filter(Boolean);
  }, [routeAnalysis]);

  // ── Selected route ─────────────────────────────────────────────────────────
  const selectedRoute = useMemo(() => allRoutes[selectedRouteIndex] ?? null, [allRoutes, selectedRouteIndex]);

  // ── Critical incidents on the selected route for red-segment overlay ───────
  const criticalIncidents = useMemo(
    () => incidents.filter(i => i.severity >= 3),
    [incidents]
  );

  // ── Blocked road segments ──────────────────────────────────────────────────
  const blockedSegments = useMemo(() => {
    if (!selectedRoute?.geometry?.coordinates) return [];
    return buildBlockedSegments(selectedRoute.geometry.coordinates, criticalIncidents);
  }, [selectedRoute, criticalIncidents]);

  // ── Pulse animation (~20fps, only rebuilds pulse layer) ───────────────────
  useEffect(() => {
    let lastT = 0, raf: number;
    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      if (ts - lastT < 50) return;
      lastT = ts;
      setPulsePhase(p => (p + 2) % 100);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!mapReady || !overlayRef.current) return;
    const scale = 1 + pulsePhase / 100;
    const opacity = Math.round(255 * (1 - pulsePhase / 100));
    const pulseRings = new ScatterplotLayer({
      id: 'pulse-rings',
      data: INDIA_MARKERS.filter(m => m.type === 'alert' || m.type === 'hot'),
      visible: activeLayers.includes('ARMED_CONFLICT'),
      getPosition: (d: any) => [d.lon, d.lat],
      getRadius: 8 * scale, radiusUnits: 'pixels',
      getFillColor: [0, 0, 0, 0], stroked: true,
      getLineColor: (d: any) => [...MARKER_COLORS[d.type], opacity] as [number, number, number, number],
      lineWidthMinPixels: 2,
      updateTriggers: { getRadius: [scale], getLineColor: [opacity] },
    });
    pulseLayerRef.current = pulseRings;
    overlayRef.current?.setProps({ layers: [...staticLayersRef.current, pulseRings] });
  }, [pulsePhase, mapReady, activeLayers]);

  // ── Map init ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = new MapInstance({
      container: mapContainerRef.current,
      style: 'https://tiles.openfreemap.org/styles/dark',
      center: [78.96, 20.59], zoom: 4.2, minZoom: 2, maxZoom: 14, attributionControl: false,
      antialias: true,
    });
    mapRef.current = map;
    map.on('load', () => {
      setMapReady(true);
      const overlay = new MapboxOverlay({ interleaved: true, layers: [] });
      map.addControl(overlay as any);
      overlayRef.current = overlay;
    });
    return () => { map.remove(); mapRef.current = null; overlayRef.current = null; };
  }, []);

  // ── Sync Map Style and Projection ──────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    mapRef.current.setStyle(mapStyle === 'dark' ? 'https://tiles.openfreemap.org/styles/dark' : SATELLITE_STYLE as any);
  }, [mapStyle, mapReady]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    mapRef.current.setProjection({ type: isGlobe ? 'globe' : 'mercator' });
  }, [isGlobe, mapReady]);

  // ── All static layers ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !overlayRef.current) return;

    // 1. Conflict country zones
    const countryZonesLayer = new GeoJsonLayer({
      id: 'conflict-countries', data: worldGeoJSON,
      visible: !!worldGeoJSON && activeLayers.includes('CONFLICT_ZONES'),
      filled: true, stroked: true,
      getFillColor: (d: any) => ALERT_FILLS[d.properties.alertLevel] ?? [51, 51, 51, 140],
      getLineColor: (d: any) => ALERT_LINES[d.properties.alertLevel] ?? [102, 102, 102, 230],
      lineWidthMinPixels: 1.5, pickable: true, onHover: handleHover,
      onClick: (info: any) => {
        if (!info.object) return;
        const slug = info.object.properties?.wikiSlug;
        const name = info.object.properties?.NAME_EN || info.object.properties?.NAME || info.object.properties?.label;
        const url = slug
          ? `https://en.wikipedia.org/wiki/${slug}`
          : `https://en.wikipedia.org/wiki/${encodeURIComponent(String(name ?? '').replace(/\s/g, '_'))}`;
        window.open(url, '_blank', 'noopener');
      },
      getCursor: () => 'pointer',
    });

    // 2. Sub-national zones
    const subZonesLayer = new ScatterplotLayer({
      id: 'conflict-subzones', data: INDIA_SUBZONES,
      visible: activeLayers.includes('CONFLICT_ZONES'),
      getPosition: (d: any) => [d.coordinates[1], d.coordinates[0]],
      getRadius: 12000, radiusUnits: 'meters',
      getFillColor: (d: any) => ALERT_FILLS[d.alertLevel] ?? [51, 51, 51, 140],
      stroked: true,
      getLineColor: (d: any) => ALERT_LINES[d.alertLevel] ?? [102, 102, 102, 230],
      lineWidthMinPixels: 2, pickable: true, onHover: handleHover,
    });

    // 3. Flight heatmap
    const flightHeatmap = new HeatmapLayer({
      id: 'flights-heatmap', data: flights,
      visible: activeLayers.includes('AVIATION'),
      getPosition: (d: any) => [d.lon, d.lat],
      getWeight: (d: any) => d.isMilitary || d.isEmergency ? 10 : 1,
      radiusPixels: 60, intensity: 1.5, threshold: 0.05,
      colorRange: [[0, 0, 0, 0], [103, 169, 207, 80], [209, 229, 240, 140], [253, 219, 199, 200], [239, 138, 98, 230], [240, 76, 53, 255]],
      aggregation: 'SUM',
    });

    // 4. Flight icons
    const flightDots = new IconLayer({
      id: 'flights-icon', data: flights,
      visible: activeLayers.includes('AVIATION'),
      getPosition: (d: any) => [d.lon, d.lat],
      getIcon: () => ({ url: AIRPLANE_SVG, ...ICON_SIZE_24, anchorY: 12, mask: true }),
      getSize: 20, getAngle: (d: any) => -(d.heading ?? 0),
      getColor: (d: any): [number, number, number, number] =>
        d.isEmergency ? [240, 76, 53, 255] : d.isMilitary ? [255, 140, 0, 255] : [74, 144, 217, 255],
      pickable: true, onHover: handleHover,
    });

    // 5. Ships — with click handler
    const shipDots = new IconLayer({
      id: 'ships-icon', data: [...vessels, ...usniVessels],
      visible: activeLayers.includes('SHIP_TRAFFIC'),
      getPosition: (d: any) => [d.lon, d.lat],
      getIcon: () => ({ url: SHIP_SVG, ...ICON_SIZE_24, mask: true }),
      getSize: 28,
      getColor: (d: any): [number, number, number, number] =>
        d.isDistress ? [240, 76, 53, 255] : d.isMilitary ? [251, 146, 60, 255] : [200, 200, 196, 255],
      pickable: true,
      onHover: handleHover,
      onClick: (info: any) => { if (info.object && onSelectVessel) onSelectVessel(info.object); },
    });

    // 5b. Chokepoints
    const chopkDots = new ScatterplotLayer({
      id: 'chokepoints-dots',
      data: CHOKEPOINTS,
      visible: activeLayers.includes('CHOKEPOINTS'),
      getPosition: (d: any) => [d.lon, d.lat],
      getRadius: (d: any) => d.radiusKm * 1000,
      radiusUnits: 'meters',
      getFillColor: (d: any) => CHOKEPOINT_STATUS_COLORS[d.status] ?? [100, 100, 100, 80],
      stroked: true,
      getLineColor: (d: any) => CHOKEPOINT_LINE_COLORS[d.status] ?? [200, 200, 200, 200],
      lineWidthMinPixels: 1.5,
      pickable: true, onHover: handleHover,
    });

    const chokpLabels = new TextLayer({
      id: 'chokepoints-labels',
      data: CHOKEPOINTS,
      visible: activeLayers.includes('CHOKEPOINTS'),
      getPosition: (d: any) => [d.lon, d.lat],
      getText: (d: any) => d.shortName,
      getSize: 11,
      getColor: [255, 255, 255, 220],
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'center',
      fontWeight: 'bold',
      background: true,
      getBackgroundColor: [10, 10, 10, 180] as [number, number, number, number],
      backgroundPadding: [5, 3] as [number, number],
    });

    // 5c. GPS Jam heatmap
    const gpsJamLayer = new HeatmapLayer({
      id: 'gps-jam-heatmap',
      data: GPS_JAM_ZONES,
      visible: activeLayers.includes('GPS_JAM'),
      getPosition: (d: any) => [d.lon, d.lat],
      getWeight: (d: any) => d.weight,
      radiusPixels: 80,
      intensity: 2,
      threshold: 0.05,
      colorRange: [
        [0, 0, 0, 0],
        [120, 50, 200, 60],
        [160, 0, 255, 120],
        [200, 0, 255, 180],
        [240, 50, 200, 220],
        [255, 100, 255, 255],
      ],
      aggregation: 'SUM',
    });

    // 6. Static conflict incident dots
    const incidentDots = new ScatterplotLayer({
      id: 'incident-dots', data: INDIA_MARKERS,
      visible: activeLayers.includes('ARMED_CONFLICT'),
      getPosition: (d: any) => [d.lon, d.lat],
      getRadius: 8, radiusUnits: 'pixels',
      getFillColor: (d: any) => [...MARKER_COLORS[d.type], 255] as [number, number, number, number],
      stroked: true, getLineColor: [255, 255, 255, 150], lineWidthMinPixels: 1,
      pickable: true, onHover: handleHover,
    });

    // 7. Pulse rings placeholder
    const pulseRings = pulseLayerRef.current ?? new ScatterplotLayer({
      id: 'pulse-rings', data: [],
      getPosition: () => [0, 0] as [number, number],
      getRadius: 8, radiusUnits: 'pixels',
      getFillColor: [0, 0, 0, 0], stroked: true,
      getLineColor: [255, 0, 0, 0], lineWidthMinPixels: 2,
    });

    // 8. Personnel
    const personnelDots = new ScatterplotLayer({
      id: 'personnel-dots', data: personnel,
      visible: activeLayers.includes('ASSETS'),
      getPosition: (d: any) => [d.lon, d.lat],
      getRadius: 6, radiusUnits: 'pixels',
      getFillColor: [16, 185, 129, 255],
      stroked: true, getLineColor: [255, 255, 255, 200], lineWidthMinPixels: 1.5,
      pickable: true, onHover: handleHover,
    });
    const personnelText = new TextLayer({
      id: 'personnel-text', data: personnel,
      visible: activeLayers.includes('ASSETS'),
      getPosition: (d: any) => [d.lon, d.lat],
      getText: (d: any) => `${d.name} [${d.id}]`,
      getSize: 10, getColor: [255, 255, 255, 255],
      getPixelOffset: [0, -15], getTextAnchor: 'middle', getAlignmentBaseline: 'bottom',
      fontWeight: 'bold', background: true,
      getBackgroundColor: [16, 185, 129, 200] as [number, number, number, number],
      backgroundPadding: [4, 2] as [number, number],
    });

    // 9. Live intel
    const liveIntelDots = new ScatterplotLayer({
      id: 'live-intel-dots', data: liveHotspots,
      visible: activeLayers.includes('ARMED_CONFLICT'),
      getPosition: (d: any) => [d.lon, d.lat],
      getRadius: (d: any) => d.riskLevel === 'critical' || d.riskLevel === 'high' ? 14 : 9,
      radiusUnits: 'pixels',
      getFillColor: (d: any): [number, number, number, number] =>
        d.riskLevel === 'critical' ? [255, 34, 0, 220] : [255, 170, 0, 220],
      stroked: true, getLineColor: [255, 255, 255, 255], lineWidthMinPixels: 2,
      pickable: true, onHover: handleHover,
    });

    // 10. Strategic assets (merged)
    const strategicDots = new ScatterplotLayer({
      id: 'strategic-assets',
      data: STRATEGIC_ASSETS.filter(a => activeLayers.includes(ASSET_LAYER_MAP[a.type] ?? '')),
      getPosition: (d: any) => [d.lon, d.lat],
      getRadius: 10, radiusUnits: 'pixels',
      getFillColor: (d: any) => ASSET_COLORS[d.type] ?? [150, 150, 150, 230],
      stroked: true, getLineColor: [255, 255, 255, 200], lineWidthMinPixels: 2,
      pickable: true, onHover: handleHover,
    });

    // ── 11. Route layers ─────────────────────────────────────────────────────
    // Draw all routes, alternates faint behind the selected one.
    // Render in reverse order so selected (index 0 usually) paints on top.
    const routePathLayers = [...allRoutes].reverse().map((r: any, revIdx: number) => {
      const i = allRoutes.length - 1 - revIdx; // original index
      const isSelected = i === selectedRouteIndex;
      return new PathLayer({
        id: `route-path-${i}`,
        data: [{ path: r.geometry.coordinates }],
        visible: activeLayers.includes('TRADE_ROUTES') || activeLayers.includes('TRANSPORTATION') || allRoutes.length > 0,
        getPath: (d: any) => d.path,
        getColor: isSelected
          ? (ROUTE_COLORS[i] ?? ROUTE_COLORS[0])
          : (ROUTE_COLORS_DIM[i] ?? ROUTE_COLORS_DIM[0]),
        getWidth: isSelected ? (ROUTE_WIDTHS[i] ?? 4) : 2,
        widthMinPixels: 2,
        pickable: !isSelected, // alternates are clickable to select
      });
    });

    // ── 12. Blocked segment overlay (red) ────────────────────────────────────
    // Paints critical-incident road stretches in red over the selected route.
    const blockedLayer = new PathLayer({
      id: 'blocked-segments',
      data: blockedSegments.map(seg => ({ path: seg })),
      visible: (activeLayers.includes('TRADE_ROUTES') || activeLayers.includes('TRANSPORTATION') || allRoutes.length > 0) && blockedSegments.length > 0,
      getPath: (d: any) => d.path,
      getColor: [255, 61, 87, 240],
      getWidth: 7,
      widthMinPixels: 4,
    });

    // ── 13. Route pin markers ─────────────────────────────────────────────────
    const routeMarkersLayer = new IconLayer({
      id: 'route-markers',
      data: selectedRoute ? [
        { position: selectedRoute.geometry.coordinates[0], type: 'origin' },
        { position: selectedRoute.geometry.coordinates[selectedRoute.geometry.coordinates.length - 1], type: 'destination' },
      ] : [],
      getPosition: (d: any) => d.position,
      getIcon: (d: any) => ({ url: d.type === 'origin' ? PIN_GREEN : PIN_RED, ...ICON_SIZE_24 }),
      getSize: 32,
    });

    // ── 14. Traffic incident markers (severity-colored circles) ───────────────
    // Matches HTML: colored circle per severity, sized by criticality.
    const trafficIncidentDots = new ScatterplotLayer({
      id: 'traffic-incidents',
      data: incidents,
      visible: activeLayers.includes('TRAFFIC'),
      getPosition: (d: any) => [d.location.lng, d.location.lat],
      getRadius: (d: any) => d.severity >= 3 ? 12 : 8,
      radiusUnits: 'pixels',
      getFillColor: (d: any) => incidentColor(d.severity),
      stroked: true,
      getLineColor: [255, 255, 255, 180],
      lineWidthMinPixels: 2,
      pickable: true, onHover: handleHover,
    });

    // ── 15. Pending markers (before route is calculated) ──────────────────────
    const pendingMarkers = new IconLayer({
      id: 'pending-markers',
      data: !selectedRoute ? [
        ...(origin ? [{ position: [origin.lng, origin.lat], type: 'origin' }] : []),
        ...(destination ? [{ position: [destination.lng, destination.lat], type: 'destination' }] : []),
      ] : [],
      getPosition: (d: any) => d.position,
      getIcon: (d: any) => ({ url: d.type === 'origin' ? PIN_GREEN : PIN_RED, ...ICON_SIZE_24 }),
      getSize: 32,
    });

    // 16b. News markers → replaced by HTML teardrop pins (see separate useEffect)

    // 16. World Leader Avatars (Phase 6)
    // First, a background circle so it looks like a clean pin
    const leaderBg = new ScatterplotLayer({
      id: 'leaders-bg',
      data: WORLD_LEADERS,
      visible: activeLayers.includes('LEADERS'),
      getPosition: (d: any) => [d.lon, d.lat],
      getRadius: 24,
      radiusUnits: 'pixels',
      getFillColor: [10, 10, 10, 255],
      stroked: true,
      getLineColor: (d: any) => d.status === 'active' ? [0, 255, 128, 255] : d.status === 'traveling' ? [0, 200, 255, 255] : [255, 170, 0, 255],
      lineWidthMinPixels: 2,
      pickable: true,
      onHover: handleHover,
      onClick: (info: any) => { if (info.object && onSelectLeader) onSelectLeader(info.object); },
    });

    // We use IconLayer to load the portrait.
    const leaderIcons = new IconLayer({
      id: 'leaders-avatar',
      data: WORLD_LEADERS,
      visible: activeLayers.includes('LEADERS'),
      getPosition: (d: any) => [d.lon, d.lat],
      getIcon: (d: any) => ({
        url: d.photoUrl,
        width: 128, height: 128, anchorY: 64
      }),
      getSize: 36,
      pickable: false,
    });

    staticLayersRef.current = [
      countryZonesLayer, subZonesLayer,
      flightHeatmap, flightDots,
      shipDots, chopkDots, chokpLabels, gpsJamLayer,
      incidentDots,
      personnelDots, personnelText,
      liveIntelDots,
      strategicDots,
      leaderBg, leaderIcons,
      ...routePathLayers,
      blockedLayer,
      routeMarkersLayer,
      trafficIncidentDots,
      pendingMarkers,
    ];

    overlayRef.current?.setProps({
      layers: [...staticLayersRef.current, pulseLayerRef.current ?? pulseRings],
    });
  }, [
    mapReady, flights, vessels, usniVessels, activeLayers,
    worldGeoJSON, personnel, liveHotspots,
    allRoutes, selectedRoute, selectedRouteIndex,
    incidents, blockedSegments, origin, destination,
    handleHover, onSelectVessel, onSelectLeader,
  ]);


  // ── Fit bounds to selected route ───────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !selectedRoute?.geometry?.coordinates?.length) return;
    const coords: [number, number][] = selectedRoute.geometry.coordinates;
    const bounds = coords.reduce(
      (acc, c) => acc.extend(c),
      new maplibregl.LngLatBounds(coords[0], coords[0])
    );
    mapRef.current.fitBounds(bounds, { padding: 50, maxZoom: 12, duration: 1500 });
  }, [selectedRoute]);

  // ── Clamp tooltip to viewport ──────────────────────────────────────────────
  const tooltipStyle = useMemo(() => {
    if (!hoverInfo) return {};
    return {
      left: Math.min(hoverInfo.x + 15, window.innerWidth - 330),
      top: Math.min(hoverInfo.y + 15, window.innerHeight - 210),
    };
  }, [hoverInfo]);

  // ── NV/IR CSS filter strings ───────────────────────────────────────────────
  const filterStyle: Record<typeof mapFilter, string> = {
    none: 'none',
    nv: 'grayscale(1) brightness(0.45) contrast(3) sepia(1) hue-rotate(72deg) saturate(12)',
    ir: 'sepia(1) saturate(6) hue-rotate(310deg) contrast(1.5) brightness(0.88)',
  };

  // ── Pre-compute conflict zone config from hovered feature's _iso ──────────
  const hoveredIso = hoverInfo?.object?.properties?._iso as string | undefined;
  const hoveredZoneConf = hoveredIso ? CONFLICT_ZONE_CONFIG[hoveredIso] : null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 min-h-0 h-full flex flex-col bg-bg-dark relative">
      <div className="flex-1 min-h-0 h-full relative overflow-hidden">
        {/* Map container — filter applied here for NV/IR */}
        <div
          ref={mapContainerRef}
          className="absolute inset-0 deckgl-container transition-all duration-500"
          style={{ filter: filterStyle[mapFilter] }}
        />
        {/* NV/IR green scan-line overlay */}
        {mapFilter === 'nv' && (
          <div
            className="absolute inset-0 pointer-events-none z-10"
            style={{
              background: 'repeating-linear-gradient(0deg, rgba(0,255,70,0.04) 0px, rgba(0,255,70,0.04) 1px, transparent 1px, transparent 3px)',
              mixBlendMode: 'screen',
            }}
          />
        )}

        {/* Stats overlay */}
        <div className="absolute top-4 left-4 bg-bg-dark/90 px-3 py-1.5 flex flex-col gap-1 z-10 border border-signal/20">
          <div className="flex items-center gap-2">
            <span className="text-signal font-mono text-sm font-bold">{flights.filter(f => !f.isMilitary).length}</span>
            <span className="mono-label text-text-light text-[10px]">CIV FLIGHTS</span>
            <span className="ml-2 text-amber-400 font-mono text-sm font-bold">{flights.filter(f => f.isMilitary).length}</span>
            <span className="mono-label text-text-light text-[10px]">MIL</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-text-light font-mono text-sm font-bold">{vessels.filter(v => !v.isMilitary).length}</span>
            <span className="mono-label text-text-light text-[10px]">CIV VESSELS</span>
            <span className="ml-2 text-amber-400 font-mono text-sm font-bold">{vessels.filter(v => v.isMilitary).length + usniVessels.length}</span>
            <span className="mono-label text-text-light text-[10px]">MIL</span>
          </div>
          {incidents.length > 0 && activeLayers.includes('TRAFFIC') && (
            <div className="flex items-center gap-2">
              <span className="text-red-500 font-mono text-sm font-bold">{incidents.length}</span>
              <span className="mono-label text-text-light text-[10px]">EN ROUTE INCIDENTS</span>
              {blockedSegments.length > 0 && (
                <span className="mono-label text-red-400 text-[10px] animate-pulse">● ROAD BLOCKED</span>
              )}
            </div>
          )}
          {(flights.some(f => f.isEmergency) || vessels.some(v => v.isDistress)) && (
            <span className="mt-1 text-red-500 font-bold mono-label animate-pulse">DISTRESS / EMERGENCY DETECTED</span>
          )}
        </div>

        {/* Collapsible Map Settings */}
        <div className="absolute top-4 right-4 z-50 flex flex-col items-end gap-1">
          <button
            onClick={() => setSettingsOpen(o => !o)}
            className="flex items-center gap-1.5 bg-bg-dark/80 backdrop-blur-sm border border-signal/30 px-2.5 py-1.5 hover:bg-signal/20 transition-colors"
          >
            <span className="mono-label text-signal text-[9px] font-bold tracking-wider">MAP SETTINGS</span>
            <span className="font-mono text-[8px] text-signal/60">{settingsOpen ? '▲' : '▼'}</span>
          </button>

          {settingsOpen && (
            <div className="bg-bg-dark/90 backdrop-blur-md border border-signal/30 p-3 shadow-2xl flex flex-col gap-3 min-w-[200px]">
              {/* Basemap */}
              <div className="flex flex-col gap-1.5">
                <span className="mono-label text-text-light/50 text-[9px]">BASEMAP</span>
                <div className="flex bg-bg-dark border border-text-light/20 p-0.5">
                  <button onClick={() => setMapStyle('dark')} className={`flex-1 py-1.5 text-[9px] font-mono transition-colors ${mapStyle === 'dark' ? 'bg-signal text-text-light font-bold' : 'text-text-light hover:text-white'}`}>DARK</button>
                  <button onClick={() => setMapStyle('satellite')} className={`flex-1 py-1.5 text-[9px] font-mono transition-colors ${mapStyle === 'satellite' ? 'bg-signal text-text-light font-bold' : 'text-text-light hover:text-white'}`}>SAT</button>
                </div>
              </div>

              {/* Vision Mode */}
              <div className="flex flex-col gap-1.5 pt-2 border-t border-text-light/10">
                <span className="mono-label text-text-light/50 text-[9px]">VISION MODE</span>
                <div className="flex bg-bg-dark border border-text-light/20 p-0.5">
                  {(['none', 'nv', 'ir'] as const).map(m => (
                    <button key={m} onClick={() => setMapFilter(m)}
                      className={`flex-1 py-1.5 text-[9px] font-mono transition-colors ${mapFilter === m ? (m === 'nv' ? 'bg-green-600 text-white font-bold' : m === 'ir' ? 'bg-red-700 text-white font-bold' : 'bg-signal text-text-light font-bold') : 'text-text-light hover:text-white'}`}>
                      {m === 'none' ? 'STD' : m.toUpperCase()}
                    </button>
                  ))}
                </div>
                <span className="font-mono text-[7.5px] text-text-light/25 tracking-wider">
                  {mapFilter === 'nv' ? '● NIGHT VISION ACTIVE' : mapFilter === 'ir' ? '● IR THERMAL ACTIVE' : ''}
                </span>
              </div>

              {/* Projection */}
              <div className="flex flex-col gap-1.5 pt-2 border-t border-text-light/10">
                <span className="mono-label text-text-light/50 text-[9px]">PROJECTION</span>
                <button
                  onClick={() => setIsGlobe(!isGlobe)}
                  className="flex justify-between items-center w-full mono-label text-[10px] text-text-light hover:text-white transition-colors cursor-pointer"
                >
                  <span>3D GLOBE</span>
                  <div className={`w-7 h-3.5 flex items-center p-0.5 transition-colors ${isGlobe ? 'bg-signal' : 'bg-bg-mid border border-text-light/30'}`}>
                    <div className={`w-2 h-2 bg-white transition-transform ${isGlobe ? 'translate-x-3.5' : 'translate-x-0'}`} />
                  </div>
                </button>
              </div>

              <div className="pt-2 border-t border-text-light/10">
                <span className="font-mono text-[7px] text-text-light/20 tracking-wider">CLICK CONFLICT ZONE → WIKI</span>
              </div>
            </div>
          )}
        </div>

        {/* Route legend — shown when multiple routes are drawn */}
        {allRoutes.length > 1 && (activeLayers.includes('TRADE_ROUTES') || activeLayers.includes('TRANSPORTATION')) && (
          <div className="absolute top-4 right-4 bg-bg-dark/90 px-3 py-2 z-10 border border-signal/20 flex flex-col gap-1.5">
            <span className="mono-label text-text-light text-[10px] mb-0.5">ROUTE OPTIONS</span>
            {allRoutes.map((_: any, i: number) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-5 h-1.5 rounded-full"
                  style={{ background: `rgba(${ROUTE_COLORS[i]?.slice(0, 3).join(',')},${i === selectedRouteIndex ? 1 : 0.4})` }} />
                <span className={`mono-label text-[10px] ${i === selectedRouteIndex ? 'text-text-light' : 'text-text-light/40'}`}>
                  {i === 0 ? 'PRIMARY' : `ALT ${i}`}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="absolute bottom-4 right-4 z-10">
          <span className="mono-label text-text-light/30">OPENFREEMAP · ADSB.LOL · AISSTREAM</span>
        </div>

        {!mapReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-dark z-20">
            <span className="mono-label text-text-light/30 animate-pulse">INITIALIZING DECK.GL ENGINE...</span>
          </div>
        )}

        {/* Hover tooltip */}
        {hoverInfo?.object && (
          <div
            className="absolute z-50 pointer-events-none bg-bg-dark border border-signal/50 p-3 shadow-2xl flex flex-col gap-2 min-w-[280px] max-w-[320px]"
            style={tooltipStyle}
          >
            {/* News item (has headline + numeric severity + city) */}
            {hoverInfo.object.headline && typeof hoverInfo.object.severity === 'number' ? (
              <>
                <div className="flex justify-between items-start border-b border-signal/30 pb-2 mb-1">
                  <span className="font-mono text-signal font-bold tracking-tight">NEWS // {hoverInfo.object.city ?? hoverInfo.object.source}</span>
                  <span className={`text-[10px] font-mono px-1 border ${hoverInfo.object.severity <= 2 ? 'text-red-400 border-red-400/40' : hoverInfo.object.severity <= 3 ? 'text-amber-400 border-amber-400/40' : 'text-signal/80 border-signal/30'}`}>
                    SEV {hoverInfo.object.severity}
                  </span>
                </div>
                <div className="text-[11px] font-mono tracking-wide text-white leading-snug">{hoverInfo.object.headline}</div>
                <div className="flex justify-between pt-2 border-t border-text-light/10 text-[10px] font-mono text-text-light/50">
                  <span className="flex items-center gap-1">
                    {hoverInfo.object.langLabel && <span className="text-signal/60">{hoverInfo.object.langLabel}</span>}
                    <span>{hoverInfo.object.source}</span>
                  </span>
                  <span className="text-text-light/30">{hoverInfo.object.time}</span>
                </div>
              </>
            ) : hoverInfo.object.headline && hoverInfo.object.riskLevel ? (
              /* Live OSINT intel plot */
              <>
                <div className="flex justify-between items-start border-b border-signal/30 pb-2 mb-1">
                  <span className="font-mono text-signal font-bold tracking-tight">INTEL PLOT // {hoverInfo.object.source}</span>
                  <span className="text-[10px] font-mono text-signal/80 bg-signal/10 px-1 border border-signal/30">{hoverInfo.object.riskLevel?.toUpperCase()}</span>
                </div>
                <div className="text-[11.5px] font-mono tracking-wide text-white leading-snug">{hoverInfo.object.headline}</div>
                <div className="flex justify-between pt-2 border-t border-text-light/10 text-[10px] font-mono text-text-light/50">
                  <span>{hoverInfo.object.source}</span><span>{hoverInfo.object.time}</span>
                </div>
              </>
            ) : hoverInfo.object.severity != null && hoverInfo.object.location ? (
              /* Traffic incident tooltip */
              <>
                <div className="flex justify-between items-start border-b border-signal/30 pb-2 mb-1">
                  <span className="font-mono text-signal font-bold tracking-tight">TRAFFIC INCIDENT</span>
                  <span className={`text-[10px] font-mono px-1 border ${hoverInfo.object.severity >= 4 ? 'text-red-400 border-red-400/40 bg-red-950/20' :
                    hoverInfo.object.severity >= 3 ? 'text-lime-500 border-lime-500/40 bg-lime-950/20' :
                      'text-yellow-400 border-yellow-400/40 bg-yellow-950/20'
                    }`}>SEV {hoverInfo.object.severity}</span>
                </div>
                <div className="text-[11.5px] font-mono text-white">{hoverInfo.object.type}</div>
                <div className="text-[10px] text-text-light/60 font-mono">{hoverInfo.object.description}</div>
                {hoverInfo.object.delay > 60 && (
                  <div className="text-[10px] text-yellow-400 font-mono font-bold">
                    +{Math.round(hoverInfo.object.delay / 60)} min delay
                  </div>
                )}
                {hoverInfo.object.roadNumbers?.length > 0 && (
                  <div className="text-[10px] text-signal font-mono">{hoverInfo.object.roadNumbers.join(', ')}</div>
                )}
              </>
            ) : hoverInfo.object.callsign ? (
              (() => {
                const { airline, flight } = decodeCallsign(hoverInfo.object.callsign);
                const squawkLabel = hoverInfo.object.squawk ? SQUAWK_LABELS[hoverInfo.object.squawk] ?? null : null;
                const isEmergencySquawk = ['7500','7600','7700'].includes(hoverInfo.object.squawk ?? '');
                return (
                  <>
                    <div className="flex justify-between items-start border-b border-signal/30 pb-2 mb-1">
                      <div className="flex flex-col">
                        <span className="font-mono text-signal font-bold tracking-tight">{flight}</span>
                        {airline && <span className="font-mono text-[8.5px] text-text-light/50 tracking-widest mt-0.5">{airline}</span>}
                      </div>
                      <span className={`text-[10px] font-mono px-1 border shrink-0 ml-2 ${hoverInfo.object.isEmergency || isEmergencySquawk ? 'text-red-400 border-red-400/40 animate-pulse' : hoverInfo.object.isMilitary ? 'text-amber-400 border-amber-400/40' : 'text-signal/80 border-signal/30'}`}>
                        {hoverInfo.object.isEmergency || isEmergencySquawk ? 'EMERGENCY' : hoverInfo.object.isMilitary ? 'MILITARY' : 'CIVILIAN'}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 text-[10.5px] font-mono text-silver">
                      {[
                        ['ALTITUDE', hoverInfo.object.altitude ? `${Math.round(hoverInfo.object.altitude).toLocaleString()} ft` : '—'],
                        ['HEADING',  hoverInfo.object.heading  ? `${Math.round(hoverInfo.object.heading)}°` : '—'],
                        ['SPEED',    hoverInfo.object.velocity ? `${Math.round(hoverInfo.object.velocity)} kts` : '—'],
                        ...(hoverInfo.object.squawk ? [['SQUAWK', `${hoverInfo.object.squawk}${squawkLabel ? ' · ' + squawkLabel : ''}`]] : []),
                      ].map(([label, value]) => (
                        <div key={label} className="flex gap-2">
                          <span className="text-text-light/50 w-20">{label}:</span>
                          <span className={`${isEmergencySquawk && label === 'SQUAWK' ? 'text-red-400 font-bold' : 'text-white'}`}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()
            ) : hoverInfo.object.type && ['nuclear', 'base', 'spaceport', 'cable', 'pipeline', 'datacenter'].includes(hoverInfo.object.type) ? (
              <>
                <div className="flex justify-between items-start border-b border-signal/30 pb-2 mb-1">
                  <span className="font-mono text-signal font-bold tracking-tight">STRATEGIC ASSET // {hoverInfo.object.type.toUpperCase()}</span>
                  <span className="text-[10px] font-mono text-signal/80 bg-signal/10 px-1 border border-signal/30">{hoverInfo.object.status?.toUpperCase()}</span>
                </div>
                <div className="text-[11.5px] font-mono text-white">{hoverInfo.object.name}</div>
                <div className="pt-2 border-t border-text-light/10 text-[10px] font-mono text-white leading-tight">{hoverInfo.object.details ?? 'No further details.'}</div>
              </>
            ) : hoverInfo.object.name && hoverInfo.object.country ? (
              <>
                <div className="flex justify-between items-start border-b border-signal/30 pb-2 mb-1">
                  <span className="font-mono text-signal font-bold tracking-tight">ASSET TRACKING // ID: {hoverInfo.object.id ?? 'UNKNOWN'}</span>
                  <span className="text-[10px] font-mono text-signal/80 bg-signal/10 px-1 border border-signal/30">PERSONNEL</span>
                </div>
                <div className="text-[11.5px] font-mono text-white uppercase">{hoverInfo.object.name}</div>
                <div className="flex flex-col gap-1 text-[11px] font-mono text-silver pt-2 border-t border-text-light/10">
                  {[['COUNTRY', hoverInfo.object.country], ['COORDS', `${hoverInfo.object.lat?.toFixed(4)}, ${hoverInfo.object.lon?.toFixed(4)}`]].map(([l, v]) => (
                    <div key={l} className="flex gap-2"><span className="text-text-light/50 w-24">{l}:</span><span className="text-white uppercase">{v}</span></div>
                  ))}
                </div>
              </>
            ) : hoverInfo.object.mmsi && hoverInfo.object.name ? (
              /* USNI / AIS Ship tooltip */
              <>
                <div className="flex justify-between items-start border-b border-signal/30 pb-2 mb-1">
                  <span className="font-mono text-signal font-bold tracking-tight text-[10.5px] leading-snug">{hoverInfo.object.name || `MMSI: ${hoverInfo.object.mmsi}`}</span>
                  <span className={`text-[10px] font-mono px-1 border shrink-0 ml-2 ${hoverInfo.object.isMilitary ? 'text-amber-400 border-amber-400/40 bg-amber-950/20' : 'text-signal/80 border-signal/30 bg-signal/10'}`}>
                    {hoverInfo.object.isMilitary ? 'MILITARY' : 'CIVILIAN'}
                  </span>
                </div>
                {hoverInfo.object.vesselClass && (
                  <div className="text-[9px] font-mono text-text-light/60 uppercase tracking-widest">{hoverInfo.object.vesselClass}</div>
                )}
                {hoverInfo.object.description && (
                  <div className="mt-1.5 text-[9.5px] font-mono text-white/80 leading-snug">{hoverInfo.object.description}</div>
                )}
                <div className="flex flex-col gap-1 text-[10.5px] font-mono text-silver pt-2 mt-1 border-t border-text-light/10">
                  {hoverInfo.object.destination && (
                    <div className="flex gap-2"><span className="text-text-light/50 w-20">DEST:</span><span className="text-white">{hoverInfo.object.destination}</span></div>
                  )}
                  {hoverInfo.object.navStatusLabel && (
                    <div className="flex gap-2"><span className="text-text-light/50 w-20">STATUS:</span><span className="text-white">{hoverInfo.object.navStatusLabel}</span></div>
                  )}
                  {hoverInfo.object.speedKnots != null && (
                    <div className="flex gap-2"><span className="text-text-light/50 w-20">SPEED:</span><span className="text-white">{hoverInfo.object.speedKnots} kts</span></div>
                  )}
                  {hoverInfo.object.mmsi > 0 && (
                    <div className="flex gap-2"><span className="text-text-light/50 w-20">MMSI:</span><span className="text-white/60">{hoverInfo.object.mmsi}</span></div>
                  )}
                </div>
              </>
            ) : hoverInfo.object.role && hoverInfo.object.country ? (
              /* World Leader tooltip */
              <>
                <div className="flex justify-between items-start border-b border-signal/30 pb-2 mb-1">
                  <span className="font-mono text-signal font-bold tracking-tight">{hoverInfo.object.name.toUpperCase()}</span>
                  <span className={`text-[10px] font-mono px-1 border ${hoverInfo.object.status === 'traveling' ? 'text-blue-400 border-blue-400/40 bg-blue-950/20' : 'text-signal/80 border-signal/30 bg-signal/10'}`}>
                    {hoverInfo.object.status.toUpperCase()}
                  </span>
                </div>
                <div className="text-[11.5px] font-mono text-white tracking-wide">{hoverInfo.object.role}, {hoverInfo.object.country}</div>
                <div className="pt-2 mt-1 border-t border-text-light/10 text-[10px] font-mono text-silver">
                  <span className="text-text-light/50">LOC:</span> {hoverInfo.object.lastKnownLocation}
                </div>
              </>
            ) : hoverInfo.object.name && hoverInfo.object.alertLevel && !hoverInfo.object.properties ? (
              /* India sub-national zone (ScatterplotLayer — raw object, no .properties) */
              <>
                <div className="flex justify-between items-start border-b border-signal/30 pb-2 mb-1">
                  <span className="font-mono text-signal font-bold tracking-tight">{hoverInfo.object.name}</span>
                  <span className={`text-[10px] font-mono px-1 border ${hoverInfo.object.alertLevel === 'HIGH' ? 'text-red-400 border-red-400/40' : 'text-amber-400 border-amber-400/40'}`}>
                    {hoverInfo.object.alertLevel}
                  </span>
                </div>
                <div className="pt-1 text-[10px] font-mono text-white leading-snug">{hoverInfo.object.status}</div>
              </>
            ) : hoverInfo.object.label && hoverInfo.object.type ? (
              /* INDIA_MARKERS / Static hotspots */
              <>
                <div className="flex justify-between items-start border-b border-signal/30 pb-2 mb-1">
                  <span className="font-mono text-signal font-bold tracking-tight">STRATEGIC HOTSPOT</span>
                  <span className={`text-[10px] font-mono px-1 border ${hoverInfo.object.type === 'alert' ? 'text-red-400 border-red-400/40 bg-red-950/20' : hoverInfo.object.type === 'hot' ? 'text-amber-400 border-amber-400/40 bg-amber-950/20' : 'text-signal/80 border-signal/30 bg-signal/10'}`}>
                    {hoverInfo.object.type.toUpperCase()}
                  </span>
                </div>
                <div className="pt-1 text-[11px] font-mono text-white leading-snug">{hoverInfo.object.label}</div>
              </>
            ) : (
              /* GeoJSON conflict country zone — use hoveredZoneConf (pre-computed from _iso) */
              (() => {
                const zLabel = hoveredZoneConf?.label ?? hoverInfo.object.properties?.label ?? hoverInfo.object.properties?.NAME_EN ?? 'CONFLICT ZONE';
                const zAlert = hoveredZoneConf?.alertLevel ?? hoverInfo.object.properties?.alertLevel ?? 'ACTIVE';
                const zStart = hoveredZoneConf?.startDate ?? hoverInfo.object.properties?.startDate ?? '—';
                const zCas   = hoveredZoneConf?.casualties ?? hoverInfo.object.properties?.casualties ?? '—';
                const zDis   = hoveredZoneConf?.displaced ?? hoverInfo.object.properties?.displaced ?? '—';
                const zStat  = hoveredZoneConf?.status ?? hoverInfo.object.properties?.status ?? '';
                return (
                  <>
                    <div className="flex justify-between items-start border-b border-signal/30 pb-2 mb-1">
                      <span className="font-mono text-signal font-bold tracking-tight text-[10.5px] leading-snug max-w-[200px]">{zLabel}</span>
                      <span className={`text-[10px] font-mono px-1 border shrink-0 ml-2 ${zAlert === 'HIGH' ? 'text-red-400 border-red-400/40' : zAlert === 'ELEVATED' ? 'text-amber-400 border-amber-400/40' : 'text-signal/80 border-signal/30'}`}>
                        {zAlert}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 text-[11px] font-mono">
                      {[
                        ['START',      zStart],
                        ['CASUALTIES', zCas],
                        ['DISPLACED',  zDis],
                      ].map(([l, v]) => (
                        <div key={l} className="flex gap-2">
                          <span className="text-text-light/50 w-24">{l}:</span>
                          <span className="text-white">{v}</span>
                        </div>
                      ))}
                    </div>
                    {zStat && (
                      <div className="pt-2 border-t border-text-light/10 text-[9.5px] font-mono text-white/70 leading-snug">{zStat}</div>
                    )}
                    <div className="text-[8px] font-mono text-signal/40 tracking-wider pt-1">CLICK → WIKIPEDIA</div>
                  </>
                );
              })()
            )}
          </div>
        )}
      </div>

    </div>
  );
};


export default MapPanel;
