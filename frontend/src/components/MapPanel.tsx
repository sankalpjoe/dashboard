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

const INTEL_LOCATIONS = [
  { keywords: ['sri lanka', 'colombo'], lat: 7.8731, lon: 80.7718, code: 'LKA' },
  { keywords: ['isfahan'], lat: 32.6539, lon: 51.6660, code: 'IRN' },
  { keywords: ['tehran'], lat: 35.6892, lon: 51.3890, code: 'IRN' },
  { keywords: ['iran', 'iranian'], lat: 32.4279, lon: 53.6880, code: 'IRN' },
  { keywords: ['kabul'], lat: 34.5553, lon: 69.2075, code: 'AFG' },
  { keywords: ['afghanistan', 'taliban'], lat: 33.9391, lon: 67.7099, code: 'AFG' },
  { keywords: ['islamabad'], lat: 33.6844, lon: 73.0479, code: 'PAK' },
  { keywords: ['pakistan', 'loc'], lat: 30.3753, lon: 69.3451, code: 'PAK' },
  { keywords: ['myanmar', 'junta'], lat: 21.9162, lon: 95.9560, code: 'MMR' },
  { keywords: ['yemen', 'houthi', 'red sea', 'gulf of aden'], lat: 15.5527, lon: 48.5164, code: 'YEM' },
  { keywords: ['syria', 'damascus'], lat: 34.8021, lon: 38.9968, code: 'SYR' },
  { keywords: ['sudan'], lat: 12.8628, lon: 30.2176, code: 'SDN' },
  { keywords: ['china', 'lac', 'beijing'], lat: 35.8617, lon: 104.1954, code: 'CHN' },
];

const CONFLICT_ZONE_CONFIG: Record<string, {
  alertLevel: 'HIGH' | 'ELEVATED' | 'MONITOR';
  label: string; startDate?: string; casualties?: string; displaced?: string; status?: string;
}> = {
  PAK: { alertLevel: 'HIGH', label: 'Pakistan — Active Tension', startDate: '1947', casualties: '~50,000+', displaced: '700,000+', status: 'High military mobilization along LoC.' },
  CHN: { alertLevel: 'ELEVATED', label: 'China — LAC Standoff', startDate: '2020', casualties: 'Undisclosed', displaced: 'None', status: 'Ongoing infrastructure buildup; unresolved friction points.' },
  MMR: { alertLevel: 'ELEVATED', label: 'Myanmar — Border Instability', startDate: '2021', casualties: '50,000+', displaced: '2.6 Million', status: 'Junta vs Rebel forces. High cross-border refugee flow.' },
  AFG: { alertLevel: 'HIGH', label: 'Afghanistan — Taliban Border', startDate: '2021', casualties: 'Unknown', displaced: '3.5 Million+', status: 'Border skirmishes. Extreme economic and humanitarian crisis.' },
  IRN: { alertLevel: 'HIGH', label: 'Iran — Active Conflict', startDate: '2024', casualties: 'Escalating', displaced: 'Unknown', status: 'Direct military confrontation involving ballistic missiles and proxy groups.' },
  IRQ: { alertLevel: 'ELEVATED', label: 'Iraq — Instability', startDate: '2003', casualties: '1M+', displaced: '1.2 Million', status: 'Proxy militia operations and continued insurgency.' },
  YEM: { alertLevel: 'HIGH', label: 'Yemen — Active Conflict', startDate: '2014', casualties: '377,000+', displaced: '4.5 Million', status: 'Houthi militant strikes on maritime shipping lanes in Red Sea.' },
  SYR: { alertLevel: 'ELEVATED', label: 'Syria — Ongoing', startDate: '2011', casualties: '600,000+', displaced: '13 Million', status: 'Fragmented territorial control with ongoing foreign interventions.' },
  SDN: { alertLevel: 'ELEVATED', label: 'Sudan — Civil War', startDate: '2023', casualties: '15,000+', displaced: '8.5 Million', status: 'SAF vs RSF urban combat. Imminent famine warning.' },
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
const SHIP_SVG = `data:image/svg+xml;charset=utf-8,%3Csvg width='24' height='24' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg' fill='white'%3E%3Cpath d='M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.93V4.01c0-1.1-.9-2-2-2h-2.15c-.24-.59-.82-1.01-1.51-1.01s-1.27.42-1.51 1.01H10.66c-.24-.59-.82-1.01-1.51-1.01s-1.27.42-1.51 1.01H5.48c-1.1 0-2 .9-2 2v6.92l-1.28.43c-.26.08-.48.26-.6.5s-.14.52-.06.78L3.95 19zM6 4.99h3v5.94l-3 1.01V4.99zm5 0h2v4.61l-2-.67V4.99zm4 0h3v6.95l-3-1.01V4.99z'/%3E%3C/svg%3E`;

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
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const pulseLayerRef = useRef<ScatterplotLayer | null>(null);
  const staticLayersRef = useRef<any[]>([]);

  const [mapReady, setMapReady] = useState(false);
  const [pulsePhase, setPulsePhase] = useState(0);
  const [worldGeoJSON, setWorldGeoJSON] = useState<any>(null);
  const [hoverInfo, setHoverInfo] = useState<any>(null);

  // Phase 4 settings
  const [mapStyle, setMapStyle] = useState<'dark' | 'satellite'>('dark');
  const [isGlobe, setIsGlobe] = useState(false);

  const handleHover = useCallback((info: any) => setHoverInfo(info), []);

  // ── World GeoJSON ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson')
      .then(r => r.json())
      .then(data => setWorldGeoJSON({
        type: 'FeatureCollection',
        features: data.features
          .filter((f: any) => f.properties?.ISO_A3 in CONFLICT_ZONE_CONFIG)
          .map((f: any) => ({
            ...f,
            properties: { ...f.properties, ...CONFLICT_ZONE_CONFIG[f.properties.ISO_A3] },
          })),
      }))
      .catch(console.error);
  }, []);

  // ── Live data ──────────────────────────────────────────────────────────────
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
    overlayRef.current.setProps({ layers: [...staticLayersRef.current, pulseRings] });
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

    overlayRef.current.setProps({
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col bg-bg-dark relative">
      <div className="flex-1 relative overflow-hidden">
        <div ref={mapContainerRef} className="absolute inset-0 deckgl-container" />

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

        {/* Glassmorphism Map Options Overlay */}
        <div className="absolute top-4 right-4 bg-bg-dark/60 backdrop-blur-md border border-signal/30 p-4 shadow-2xl z-50 flex flex-col gap-3 min-w-[220px]">
          <div className="flex justify-between items-center border-b border-signal/20 pb-2">
            <span className="mono-label text-signal text-[10px] tracking-wider font-bold">MAP SETTINGS</span>
          </div>

          {/* Map Style */}
          <div className="flex flex-col gap-2">
            <span className="mono-label text-text-light/50 text-[9px]">BASEMAP STYLE</span>
            <div className="flex bg-bg-dark border border-text-light/20 p-0.5">
              <button onClick={() => setMapStyle('dark')} className={`flex-1 py-1.5 text-[9px] font-mono transition-colors ${mapStyle === 'dark' ? 'bg-signal text-bg-dark font-bold' : 'text-text-light hover:text-white'}`}>DARK</button>
              <button onClick={() => setMapStyle('satellite')} className={`flex-1 py-1.5 text-[9px] font-mono transition-colors ${mapStyle === 'satellite' ? 'bg-signal text-bg-dark font-bold' : 'text-text-light hover:text-white'}`}>SATELLITE</button>
            </div>
          </div>

          {/* Projection */}
          <div className="flex flex-col gap-2 pt-2 border-t border-text-light/10">
            <span className="mono-label text-text-light/50 text-[9px]">PROJECTION</span>
            <button
              onClick={() => setIsGlobe(!isGlobe)}
              className="flex justify-between items-center w-full mono-label text-[10px] text-text-light hover:text-white transition-colors cursor-pointer"
            >
              <span>3D GLOBE ENGINE</span>
              <div className={`w-7 h-3.5 flex items-center p-0.5 transition-colors ${isGlobe ? 'bg-signal' : 'bg-bg-mid border border-text-light/30'}`}>
                <div className={`w-2 h-2 bg-white transition-transform ${isGlobe ? 'translate-x-3.5' : 'translate-x-0'}`} />
              </div>
            </button>
          </div>
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
            {hoverInfo.object.headline ? (
              <>
                <div className="flex justify-between items-start border-b border-signal/30 pb-2 mb-1">
                  <span className="font-mono text-signal font-bold tracking-tight">LIVE INTEL PLOT // {hoverInfo.object.source}</span>
                  <span className="text-[10px] font-mono text-signal/80 bg-signal/10 px-1 border border-signal/30">{hoverInfo.object.riskLevel?.toUpperCase()}</span>
                </div>
                <div className="text-[11.5px] font-mono tracking-wide text-white leading-snug">{hoverInfo.object.headline}</div>
                <div className="flex justify-between pt-2 border-t border-text-light/10 text-[10px] font-mono text-text-light/50">
                  <span>{hoverInfo.object.source}</span><span>{hoverInfo.object.time}</span>
                </div>
              </>
            ) : hoverInfo.object.severity != null ? (
              /* Traffic incident tooltip */
              <>
                <div className="flex justify-between items-start border-b border-signal/30 pb-2 mb-1">
                  <span className="font-mono text-signal font-bold tracking-tight">TRAFFIC INCIDENT</span>
                  <span className={`text-[10px] font-mono px-1 border ${hoverInfo.object.severity >= 4 ? 'text-red-400 border-red-400/40 bg-red-950/20' :
                    hoverInfo.object.severity >= 3 ? 'text-orange-400 border-orange-400/40 bg-orange-950/20' :
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
              <>
                <div className="flex justify-between items-start border-b border-signal/30 pb-2 mb-1">
                  <span className="font-mono text-signal font-bold tracking-tight">{hoverInfo.object.callsign || 'UNKNOWN FLIGHT'}</span>
                  <span className="text-[10px] font-mono text-signal/80 bg-signal/10 px-1 border border-signal/30">{hoverInfo.object.isMilitary ? 'MILITARY' : 'CIVILIAN'}</span>
                </div>
                <div className="flex flex-col gap-1 text-[11px] font-mono text-silver">
                  {[['ALTITUDE', hoverInfo.object.altitude ? `${Math.round(hoverInfo.object.altitude)} ft` : 'Unknown'],
                  ['HEADING', hoverInfo.object.heading ? `${Math.round(hoverInfo.object.heading)}°` : 'Unknown'],
                  ['SPEED', hoverInfo.object.velocity ? `${Math.round(hoverInfo.object.velocity)} kts` : 'Unknown'],
                  ].map(([label, value]) => (
                    <div key={label} className="flex gap-2">
                      <span className="text-text-light/50 w-24">{label}:</span>
                      <span className="text-white">{value}</span>
                    </div>
                  ))}
                </div>
              </>
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
                  <span className="font-mono text-signal font-bold tracking-tight">{hoverInfo.object.name || `MMSI: ${hoverInfo.object.mmsi}`}</span>
                  <span className={`text-[10px] font-mono px-1 border ${hoverInfo.object.isMilitary ? 'text-orange-400 border-orange-400/40 bg-orange-950/20' : 'text-signal/80 border-signal/30 bg-signal/10'}`}>
                    {hoverInfo.object.isMilitary ? 'MILITARY' : 'CIVILIAN'}
                  </span>
                </div>
                <div className="text-[11.5px] font-mono text-white uppercase">{hoverInfo.object.shipClass || 'VESSEL'}</div>
                <div className="flex flex-col gap-1 text-[11px] font-mono text-silver pt-2 mt-1 border-t border-text-light/10">
                  {hoverInfo.object.destination && (
                    <div className="flex gap-2"><span className="text-text-light/50 w-24">DEST:</span><span className="text-white">{hoverInfo.object.destination}</span></div>
                  )}
                  {hoverInfo.object.navStatusLabel && (
                    <div className="flex gap-2"><span className="text-text-light/50 w-24">STATUS:</span><span className="text-white">{hoverInfo.object.navStatusLabel}</span></div>
                  )}
                  {hoverInfo.object.speedKnots != null && (
                    <div className="flex gap-2"><span className="text-text-light/50 w-24">SPEED:</span><span className="text-white">{hoverInfo.object.speedKnots} kts</span></div>
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
            ) : (
              <>
                <div className="flex justify-between items-start border-b border-signal/30 pb-2 mb-1">
                  <span className="font-mono text-signal font-bold tracking-tight">{hoverInfo.object.properties?.label ?? hoverInfo.object.properties?.name ?? 'UNKNOWN ZONE'}</span>
                  <span className="text-[10px] font-mono text-signal/80 bg-signal/10 px-1 border border-signal/30">{hoverInfo.object.properties?.alertLevel ?? 'ACTIVE'}</span>
                </div>
                <div className="flex flex-col gap-1 text-[11px] font-mono text-silver">
                  {[['START DATE', hoverInfo.object.properties?.startDate ?? 'ACTIVE'],
                  ['CASUALTIES', hoverInfo.object.properties?.casualties ?? '—'],
                  ].map(([l, v]) => (
                    <div key={l} className="flex gap-2"><span className="text-text-light/50 w-24">{l}:</span><span className="text-white">{v}</span></div>
                  ))}
                </div>
                <div className="pt-2 border-t border-text-light/10 text-[10px] font-mono text-white leading-tight">{hoverInfo.object.properties?.status ?? 'Area remains highly destabilized.'}</div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MapPanel;