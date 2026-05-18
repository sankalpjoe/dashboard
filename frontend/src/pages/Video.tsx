import { useEffect, useRef, useState, useCallback, useMemo, memo } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  ChevronLeft, Maximize2, Eye, EyeOff, Crosshair, Activity,
  Plane, Ship, AlertTriangle, Radio, Layers, Building2, Newspaper, Search, Clock,
  Rss, Zap, Globe, Wind, Shield,
} from "lucide-react";
import { useISRData, type AOIBounds, type ISRObject } from "@/hooks/useISRData";
import { fetchORRIntel, HQ_LAT, HQ_LON, type ORREvent, type ORRSourceStatus } from "@/lib/orr-intel-service";

// ─── HQ Location ──────────────────────────────────────────────────────────────
const HQ = { name: "150 ORR · HELIOS BUSINESS PARK", lat: HQ_LAT, lon: HQ_LON, radiusKm: [1, 3, 5] };

function makeCircle(center: [number, number], radiusKm: number, points = 64): [number, number][] {
  const coords: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const dx = radiusKm * Math.cos(angle);
    const dy = radiusKm * Math.sin(angle);
    const lat = center[1] + dy / 111.32;
    const lon = center[0] + dx / (111.32 * Math.cos(center[1] * Math.PI / 180));
    coords.push([lon, lat]);
  }
  return coords;
}

const SAT_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: { "esri-sat": { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256 } },
  layers: [{ id: "sat", type: "raster", source: "esri-sat" }],
};
const DARK_STYLE = "https://tiles.openfreemap.org/styles/dark";

// ─── Severity helpers ─────────────────────────────────────────────────────────
const SEV_COLOR: Record<number, string> = {
  1: '#FF5757', 2: '#FF9933', 3: '#FFCC33', 4: '#8DB547', 5: '#7FB069',
};
const SEV_BG: Record<number, string> = {
  1: 'rgba(255,87,87,0.12)', 2: 'rgba(255,153,51,0.10)', 3: 'rgba(255,204,51,0.08)',
  4: 'rgba(141,181,71,0.08)', 5: 'rgba(127,176,105,0.06)',
};
const CAT_COLOR: Record<string, string> = {
  // Current ORR categories
  armed_conflict:    '#FF4444',
  terrorism:         '#FF2222',
  embassy_alert:     '#F59E0B',
  civil_disturbance: '#FFB84D',
  transit:           '#60B0E0',
  climate:           '#22C55E',
  disease:           '#EC4899',
  infrastructure:    '#A855F7',
  traffic:           '#60B0E0',
  general:           '#FFB84D',
  // Legacy fallbacks (in case old data surfaces)
  environment: '#22C55E',
  civic:       '#F59E0B',
  health:      '#EC4899',
  safety:      '#EF4444',
  security:    '#EF4444',
};
const SOURCE_TYPE_COLOR: Record<string, string> = {
  mainstream: '#FFB84D', vernacular: '#A855F7', targeted: '#60B0E0',
  official: '#22C55E', social: '#EC4899', predicted: '#7FB069',
};

function formatDist(km: number | undefined): string {
  if (km === undefined) return '—';
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
}

// ─── ISR marker helpers ───────────────────────────────────────────────────────
function makeMarkerEl(obj: ISRObject, isSelected: boolean): HTMLDivElement {
  const el = document.createElement("div");
  const s = isSelected ? "filter:drop-shadow(0 0 6px rgba(107,140,42,0.9));" : "";
  if (obj.type === "flight") {
    const color = obj.isEmergency ? "#ef4444" : obj.isMilitary ? "#f59e0b" : "#3b82f6";
    el.style.cssText = `width:18px;height:18px;cursor:pointer;${s}`;
    el.innerHTML = `<svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><polygon points="9,1 16,14 9,11 2,14" fill="${color}" stroke="#fff" stroke-width="1"/></svg>`;
  } else if (obj.type === "vessel") {
    const color = obj.isEmergency ? "#ef4444" : obj.isMilitary ? "#f59e0b" : "#c8c8c4";
    el.style.cssText = `width:14px;height:14px;cursor:pointer;${s}`;
    el.innerHTML = `<svg viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="8" height="8" fill="${color}" stroke="#fff" stroke-width="1"/></svg>`;
  } else {
    const color = obj.isEmergency ? "#ef4444" : "#F5C400";
    el.style.cssText = `width:16px;height:16px;cursor:pointer;${s}`;
    el.innerHTML = `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="6" fill="${color}" stroke="#fff" stroke-width="1.5" opacity="0.9"/></svg>`;
  }
  return el;
}

// ─── Components ───────────────────────────────────────────────────────────────

function ActivityRow({ obj, selected, onSelect }: { obj: ISRObject; selected: boolean; onSelect: () => void }) {
  const icon = obj.type === "flight" ? <Plane size={10} /> : obj.type === "vessel" ? <Ship size={10} /> : <AlertTriangle size={10} />;
  const color = obj.isEmergency ? "text-red-400" : obj.isMilitary ? "text-amber-400" : obj.type === "intel" ? "text-signal" : "text-blue-400";
  return (
    <button onClick={onSelect} className={`w-full flex items-center gap-2 px-2.5 py-2 text-left transition-colors border ${selected ? "bg-signal/10 border-signal/30" : "hover:bg-black/5 border-transparent"}`}>
      <span className={`flex-shrink-0 ${color}`}>{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="font-mono text-[9px] text-text-light/80 truncate tracking-wider">{obj.label}</div>
        <div className="font-mono text-[7.5px] text-text-light/35 tracking-widest">{obj.sublabel}</div>
      </div>
      <span className="font-mono text-[8px] text-text-light/30 flex-shrink-0">{obj.confidence}%</span>
    </button>
  );
}

function DetailPanel({ obj }: { obj: ISRObject }) {
  const rows: [string, string][] = [
    ["TYPE", obj.type.toUpperCase()], ["LABEL", obj.label], ["STATUS", obj.sublabel ?? "—"],
    ["CONF", `${obj.confidence}%`], ["LAT", `${obj.lat.toFixed(5)}°`], ["LON", `${obj.lon.toFixed(5)}°`],
  ];
  if (obj.type === "flight" && obj.raw) {
    rows.push(["ALT", `${obj.raw.altitudeFt ?? 0} ft`], ["SPD", `${obj.raw.speedKnots ?? 0} kts`], ["HDG", `${obj.raw.heading ?? 0}°`]);
    if (obj.raw.squawk) rows.push(["SQUAWK", obj.raw.squawk]);
  }
  if (obj.type === "vessel" && obj.raw) {
    if (obj.raw.speedKnots != null) rows.push(["SPD", `${obj.raw.speedKnots} kts`]);
    if (obj.raw.destination) rows.push(["DEST", obj.raw.destination]);
    if (obj.raw.navStatusLabel) rows.push(["NAV", obj.raw.navStatusLabel]);
  }
  return (
    <div className="border border-signal/25 bg-signal/5 p-2.5 space-y-1.5">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between items-center">
          <span className="font-mono text-[8px] text-text-light/35 tracking-widest">{k}</span>
          <span className={`font-mono text-[8px] tracking-wider ${k === "CONF" ? "text-green-400" : "text-text-light/80"}`}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function MiniMap({ center, zoom }: { center: [number, number]; zoom: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new maplibregl.Map({ container: ref.current, style: SAT_STYLE, center, zoom: Math.max(zoom - 4, 2), interactive: false, attributionControl: false });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);
  useEffect(() => { mapRef.current?.setCenter(center); mapRef.current?.setZoom(Math.max(zoom - 4, 2)); }, [center, zoom]);
  return (
    <div className="relative w-full" style={{ height: 140 }}>
      <div ref={ref} className="w-full h-full" />
      <div className="absolute pointer-events-none" style={{ top: "20%", left: "25%", right: "25%", bottom: "20%", border: "1.5px solid #F5C400" }} />
      <div className="absolute top-1.5 left-1.5 font-mono text-[7px] text-signal/80 tracking-wider">OVERVIEW</div>
    </div>
  );
}

function STab({ label, active, onClick, badge }: { label: string; active: boolean; onClick: () => void; badge?: number }) {
  return (
    <button onClick={onClick} className={`flex-1 py-1.5 font-mono text-[8.5px] uppercase tracking-widest border-b-2 transition-colors relative ${active ? "text-signal border-signal" : "text-text-light/30 border-transparent hover:text-text-light/60"}`}>
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-1 right-0 bg-red-500 text-white font-mono text-[7px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold">{badge > 9 ? '9+' : badge}</span>
      )}
    </button>
  );
}

// ─── Area Health Ring ─────────────────────────────────────────────────────────
function HealthRing({ score }: { score: number }) {
  const color = score >= 70 ? '#8DB547' : score >= 40 ? '#FFCC33' : '#FF5757';
  const r = 22;
  const circumference = 2 * Math.PI * r;
  const dash = (score / 100) * circumference;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: 64, height: 64 }}>
        <svg width="64" height="64" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="5" />
          <circle
            cx="32" cy="32" r={r} fill="none"
            stroke={color} strokeWidth="5"
            strokeDasharray={`${dash} ${circumference}`}
            strokeLinecap="round"
            transform="rotate(-90 32 32)"
            style={{ filter: `drop-shadow(0 0 6px ${color}88)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono font-bold text-sm leading-none" style={{ color }}>{score}</span>
          <span className="font-mono text-[6px] text-text-light/35 tracking-widest">AHI</span>
        </div>
      </div>
      <span className="font-mono text-[7.5px] tracking-widest" style={{ color }}>
        {score >= 70 ? 'NOMINAL' : score >= 40 ? 'DEGRADED' : 'CRITICAL'}
      </span>
    </div>
  );
}

// ─── ORR Event Card ───────────────────────────────────────────────────────────
const ORRCard = memo(function ORRCard({ event, onClick }: { event: ORREvent; onClick: () => void }) {
  const sevColor = SEV_COLOR[event.severity] ?? '#FFB84D';
  const catColor = CAT_COLOR[event.category] ?? '#FFB84D';

  return (
    <div
      onClick={onClick}
      className="cursor-pointer hover:bg-black/5 transition-colors"
      style={{
        borderLeft: `3px solid ${event.isPredicted ? 'rgba(127,176,105,0.5)' : sevColor}`,
        borderTop: '1px solid rgba(0,0,0,0.04)',
        paddingLeft: 14, paddingRight: 14, paddingTop: 10, paddingBottom: 10,
        background: event.isPredicted ? 'rgba(127,176,105,0.04)' : SEV_BG[event.severity],
        ...(event.isPredicted ? {
          backgroundImage: 'repeating-linear-gradient(135deg, rgba(127,176,105,0.03) 0px, rgba(127,176,105,0.03) 2px, transparent 2px, transparent 8px)',
        } : {}),
      }}
    >
      {/* Row 1: Severity badge + source type + timestamp */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span
            className="font-mono font-bold px-1.5 py-0.5"
            style={{ fontSize: 9, color: event.isPredicted ? '#7FB069' : sevColor, border: `1px solid ${event.isPredicted ? 'rgba(127,176,105,0.4)' : sevColor + '55'}`, letterSpacing: '0.1em' }}
          >
            {event.isPredicted ? 'PRED' : `S${event.severity}`}
          </span>
          <span
            className="font-mono px-1.5 py-0.5"
            style={{ fontSize: 8.5, color: SOURCE_TYPE_COLOR[event.sourceType] ?? '#FFB84D', border: `1px solid ${SOURCE_TYPE_COLOR[event.sourceType] ?? '#FFB84D'}33`, letterSpacing: '0.08em' }}
          >
            {event.sourceType.toUpperCase()}
          </span>
          {event.isTranslated && (
            <span className="font-mono px-1 py-0.5" style={{ fontSize: 8, color: '#A855F7', border: '1px solid rgba(168,85,247,0.35)', letterSpacing: '0.06em' }}>
              KN→EN
            </span>
          )}
          {event.mergedCount > 0 && (
            <span className="font-mono px-1 py-0.5" style={{ fontSize: 8, color: '#60B0E0', border: '1px solid rgba(96,176,224,0.35)', letterSpacing: '0.06em' }}>
              MERGED:{event.mergedCount + 1}
            </span>
          )}
        </div>
        <span className="font-mono text-text-light/30" style={{ fontSize: 9 }}>{event.time}</span>
      </div>

      {/* Row 2: Headline */}
      <div className="font-mono leading-snug mb-2 line-clamp-3" style={{ fontSize: 11, color: 'rgba(0,0,0,0.85)', letterSpacing: '0.02em' }}>
        {event.headline}
      </div>

      {/* Row 3: Original KN headline (if translated) */}
      {event.isTranslated && event.originalHeadline && (
        <div className="font-mono mb-1.5 italic line-clamp-2" style={{ fontSize: 9.5, color: 'rgba(168,85,247,0.60)', letterSpacing: '0.01em' }}>
          {event.originalHeadline}
        </div>
      )}

      {/* Row 4: Tags + distance */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 flex-wrap">
          {event.tags.map(tag => (
            <span key={tag} className="font-mono px-1.5 py-0.5" style={{ fontSize: 8, color: catColor + 'AA', border: `1px solid ${catColor}22`, letterSpacing: '0.05em' }}>
              {tag}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <span className="font-mono" style={{ fontSize: 8.5, color: 'rgba(0,0,0,0.30)' }}>{event.source.slice(0, 12)}</span>
          {event.distanceKm !== undefined && (
            <span className="font-mono font-bold" style={{ fontSize: 9, color: event.distanceKm < 2 ? '#FF9933' : 'rgba(0,0,0,0.35)' }}>
              {formatDist(event.distanceKm)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

// ─── Sources Panel ────────────────────────────────────────────────────────────
function SourcesPanel({ sources }: { sources: ORRSourceStatus[] }) {
  const typeIcon: Record<string, React.ReactNode> = {
    mainstream: <Newspaper size={8} />,
    vernacular: <Globe size={8} />,
    targeted: <Crosshair size={8} />,
    official: <Shield size={8} />,
    social: <Radio size={8} />,
    predicted: <Zap size={8} />,
  };

  const groups = [
    { label: 'MAINSTREAM', types: ['mainstream'] },
    { label: 'VERNACULAR', types: ['vernacular'] },
    { label: 'TARGETED', types: ['targeted', 'official'] },
  ];

  return (
    <div className="p-3 flex flex-col gap-3">
      {/* Geo-gate note */}
      <div className="border border-signal/20 bg-signal/5 p-2.5">
        <div className="font-mono text-signal text-[8px] font-bold tracking-widest mb-1">◉ GEO-GATE ACTIVE</div>
        <div className="font-mono text-text-light/50 text-[7.5px] leading-relaxed">
          All events filtered to 5km perimeter around 150 ORR HQ. City-wide alerts (Bandh, IMD Red Alert) bypass gate automatically.
        </div>
      </div>

      {groups.map(group => {
        const groupSources = sources.filter(s => group.types.includes(s.type));
        if (!groupSources.length) return null;
        return (
          <div key={group.label}>
            <div className="font-mono text-[7.5px] text-text-light/25 tracking-widest mb-1.5">{group.label}</div>
            <div className="flex flex-col gap-1">
              {groupSources.map((src, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 px-2 border border-white/[0.06] bg-black/[0.02]">
                  <div className="flex items-center gap-2">
                    <span style={{ color: SOURCE_TYPE_COLOR[src.type] ?? '#FFB84D' }}>{typeIcon[src.type]}</span>
                    <div>
                      <div className="font-mono text-[8px] text-text-light/80 tracking-wider">{src.name}</div>
                      {src.lang !== 'EN' && (
                        <div className="font-mono text-[7px]" style={{ color: '#A855F7' }}>LANG: {src.lang} · AUTO-TRANSLATE</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[7px] text-text-light/30">{src.itemCount} items</span>
                    <div className={`w-2 h-2 rounded-full ${src.live ? 'bg-green-500' : 'bg-red-500/60'}`} style={{ boxShadow: src.live ? '0 0 5px #22C55E' : 'none' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Pipeline note */}
      <div className="mt-1 border border-white/[0.06] p-2">
        <div className="font-mono text-[7px] text-text-light/20 leading-relaxed tracking-wider">
          PIPELINE: Ingest → Lang Detect → Gemini Translate → Geocode → S1-S5 Score → TF-IDF Dedup → Geo-Gate → Predict
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

const Video = () => {
  const mainMapRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const newsMarkersRef = useRef<maplibregl.Marker[]>([]);

  const [tab, setTab] = useState("INTEL");
  const [selected, setSelected] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mapStyle, setMapStyle] = useState<"sat" | "dark">("sat");
  const [aoi, setAoi] = useState<AOIBounds | null>(null);
  const [showFlights, setShowFlights] = useState(true);
  const [showVessels, setShowVessels] = useState(true);
  const [showIntel, setShowIntel] = useState(true);
  const [showNewsMarkers, setShowNewsMarkers] = useState(true);
  const [mapCenter, setMapCenter] = useState<[number, number]>([HQ.lon, HQ.lat]);
  const [mapZoom, setMapZoom] = useState(13);
  const [utcTime, setUtcTime] = useState("");
  const [timeRange, setTimeRange] = useState<"1h" | "6h" | "24h" | "7d">("24h");
  const [searchQuery, setSearchQuery] = useState("");
  const [catFilter, setCatFilter] = useState<string>("ALL");
  const [orrResult, setOrrResult] = useState<{ events: any[]; sources: ORRSourceStatus[]; areaHealthScore: number; predictedEvents: any[]; fetchedAt: number } | null>(null);
  const [orrLoading, setOrrLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<ORREvent | null>(null);
  const [hqCircle, setHqCircle] = useState<{ cx: number; cy: number; r: number } | null>(null);

  const { objects, activityFeed, stats, loading } = useISRData(aoi);

  // ── Fetch ORR Intel ────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    const poll = async () => {
      setOrrLoading(true);
      try {
        const result = await fetchORRIntel();
        if (active) setOrrResult(result);
      } finally {
        if (active) setOrrLoading(false);
      }
    };
    void poll();
    const t = setInterval(poll, 5 * 60_000);
    return () => { active = false; clearInterval(t); };
  }, []);

  // ── ISR filter ────────────────────────────────────────────────────────────
  const visible = useMemo(() => objects.filter(o =>
    (o.type === "flight" && showFlights) ||
    (o.type === "vessel" && showVessels) ||
    (o.type === "intel" && showIntel)
  ), [objects, showFlights, showVessels, showIntel]);

  const selObj = useMemo(() => visible.find(o => o.id === selected), [visible, selected]);

  // ── ORR Event filter ──────────────────────────────────────────────────────
  const filteredORR = useMemo(() => {
    if (!orrResult) return [];
    const q = searchQuery.trim().toLowerCase();
    return orrResult.events.filter(e => {
      if (catFilter !== 'ALL' && e.category !== catFilter) return false;
      if (q && !e.headline.toLowerCase().includes(q) && !e.source.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [orrResult, catFilter, searchQuery]);

  const criticalCount = useMemo(() => orrResult?.events.filter(e => e.severity === 1 && !e.isPredicted).length ?? 0, [orrResult]);

  // ── Activity histogram ────────────────────────────────────────────────────
  const histogram = useMemo(() => {
    const buckets = 16;
    const counts = Array(buckets).fill(0);
    const rangeMs: Record<string, number> = { "1h": 3_600_000, "6h": 21_600_000, "24h": 86_400_000, "7d": 604_800_000 };
    const ms = rangeMs[timeRange];
    const now = Date.now();
    activityFeed.forEach(o => {
      if (!o.timestamp) return;
      const age = now - o.timestamp;
      if (age > ms) return;
      const bucket = Math.floor(((ms - age) / ms) * (buckets - 1));
      counts[Math.min(bucket, buckets - 1)]++;
    });
    return counts;
  }, [activityFeed, timeRange]);

  // ── UTC clock ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => setUtcTime(new Date().toISOString().replace("T", " ").substring(0, 19) + " Z");
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  // ── Map init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mainMapRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mainMapRef.current,
      style: mapStyle === "sat" ? SAT_STYLE : DARK_STYLE,
      center: mapCenter, zoom: mapZoom, attributionControl: false, antialias: true,
    });
    mapRef.current = map;
    map.on("moveend", () => {
      const c = map.getCenter();
      setMapCenter([c.lng, c.lat]);
      setMapZoom(map.getZoom());
    });

    // HQ marker
    const hqEl = document.createElement("div");
    hqEl.style.cssText = "width:22px;height:22px;cursor:pointer;filter:drop-shadow(0 0 6px rgba(107,140,42,0.8));";
    hqEl.innerHTML = `<svg viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="16" height="16" rx="3" fill="#F5C400" stroke="#fff" stroke-width="2"/><text x="11" y="15" text-anchor="middle" font-size="10" font-weight="bold" fill="#fff" font-family="monospace">H</text></svg>`;
    new maplibregl.Marker({ element: hqEl }).setLngLat([HQ.lon, HQ.lat]).addTo(map);

    // 5km perimeter label marker
    const perimeterLabelEl = document.createElement("div");
    perimeterLabelEl.style.cssText = "font-family:monospace;font-size:10px;color:rgba(96,176,224,1);letter-spacing:0.12em;pointer-events:none;text-shadow:0 0 8px rgba(42,127,191,0.9);font-weight:bold;";
    perimeterLabelEl.textContent = "5km ◂ PERIMETER";
    const labelLon = HQ.lon + 5 / (111.32 * Math.cos(HQ.lat * Math.PI / 180));
    new maplibregl.Marker({ element: perimeterLabelEl, anchor: "left" }).setLngLat([labelLon, HQ.lat]).addTo(map);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // ── Map style switch ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setStyle(mapStyle === "sat" ? SAT_STYLE : DARK_STYLE);
  }, [mapStyle]);

  // ── 5km CSS circle overlay — projects HQ coords to pixels on every move ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => {
      const center = map.project([HQ.lon, HQ.lat]);
      // 5km in pixels: meters-per-pixel at current zoom+latitude
      const mpp = (156543.03392 * Math.cos(HQ.lat * Math.PI / 180)) / Math.pow(2, map.getZoom());
      const radiusPx = 5000 / mpp;
      setHqCircle({ cx: center.x, cy: center.y, r: radiusPx });
    };
    map.on('move', update);
    map.on('zoom', update);
    map.on('load', update);
    map.on('style.load', update);
    if (map.loaded()) update();
    return () => {
      map.off('move', update);
      map.off('zoom', update);
      map.off('load', update);
      map.off('style.load', update);
    };
  }, []);

  // ── ISR Markers ───────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onReady = () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      visible.forEach(obj => {
        const el = makeMarkerEl(obj, obj.id === selected);
        el.addEventListener("click", () => setSelected(p => p === obj.id ? null : obj.id));
        markersRef.current.push(new maplibregl.Marker({ element: el }).setLngLat([obj.lon, obj.lat]).addTo(map));
      });
    };
    if (map.loaded()) onReady(); else map.once("load", onReady);
  }, [visible, selected]);

  // ── ORR Intel Markers ─────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const events = orrResult?.events ?? [];
    const onReady = () => {
      newsMarkersRef.current.forEach(m => m.remove());
      newsMarkersRef.current = [];
      if (!showNewsMarkers) return;
      events.forEach(e => {
        if (!e.lat || !e.lon) return;
        const color = e.isPredicted ? '#7FB069' : (SEV_COLOR[e.severity] ?? '#FFB84D');
        const el = document.createElement("div");
        el.style.cssText = `width:${e.severity <= 2 ? 14 : 10}px;height:${e.severity <= 2 ? 14 : 10}px;cursor:pointer;filter:drop-shadow(0 0 4px ${color}88);`;
        el.innerHTML = `<svg viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg"><circle cx="7" cy="7" r="${e.severity <= 2 ? 6 : 4}" fill="${color}" stroke="#0A0806" stroke-width="1.5" opacity="${e.isPredicted ? 0.7 : 0.9}"/></svg>`;
        el.addEventListener("click", () => setSelectedEvent(e));
        newsMarkersRef.current.push(new maplibregl.Marker({ element: el }).setLngLat([e.lon, e.lat]).addTo(map));
      });
    };
    if (map.loaded()) onReady(); else map.once("load", onReady);
  }, [orrResult, showNewsMarkers]);

  // ── Refined monitoring categories ─────────────────────────────────────────
  const CATEGORIES = ['ALL', 'armed_conflict', 'terrorism', 'embassy_alert', 'civil_disturbance', 'transit', 'climate', 'disease', 'infrastructure', 'traffic'];
  const CAT_ICON: Record<string, string> = {
    ALL: '◉',
    armed_conflict: '⚔',
    terrorism: '💥',
    embassy_alert: '🏛',
    civil_disturbance: '✊',
    transit: '🚧',
    climate: '🌧',
    disease: '⚕',
    infrastructure: '⚡',
    traffic: '🚦',
  };
  const CAT_LABEL: Record<string, string> = {
    ALL: 'ALL',
    armed_conflict: 'CONFLICT',
    terrorism: 'TERROR',
    embassy_alert: 'EMBASSY',
    civil_disturbance: 'UNREST',
    transit: 'TRANSIT',
    climate: 'CLIMATE',
    disease: 'DISEASE',
    infrastructure: 'INFRA',
    traffic: 'TRAFFIC',
  };

  // ── Export / Email Briefing ────────────────────────────────────────────────
  const [exportOpen, setExportOpen] = useState(false);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingText, setBriefingText] = useState<string | null>(null);
  const [briefingModal, setBriefingModal] = useState(false);

  const GROQ_KEY_VID = (import.meta as any).env?.VITE_GROQ_API_KEY as string | undefined;

  const generateBriefing = async () => {
    setBriefingLoading(true);
    setBriefingModal(true);
    setBriefingText(null);
    setExportOpen(false);
    const events = orrResult?.events ?? [];
    if (!events.length) { setBriefingText('No active events to summarise.'); setBriefingLoading(false); return; }
    const top = events.slice(0, 12).map((e, i) =>
      `${i + 1}. [S${e.severity}/${e.category.toUpperCase()}] ${e.headline} — ${e.source} (${e.time})`
    ).join('\n');
    try {
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY_VID}` },
        signal: AbortSignal.timeout(25_000),
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          temperature: 0.2,
          max_tokens: 512,
          messages: [
            { role: 'system', content: `You are a security operations analyst at 150 Outer Ring Road, Bengaluru. Write a concise, professional intelligence briefing email (plain text, no markdown) covering the key events below. Format: Subject line, then 3-5 bullet points, then a short situational assessment. Be direct and factual. Date: ${new Date().toUTCString()}.` },
            { role: 'user', content: `Active events:\n${top}` },
          ],
        }),
      });
      const data = await resp.json();
      setBriefingText(data.choices?.[0]?.message?.content ?? 'Failed to generate briefing.');
    } catch { setBriefingText('Network error — briefing unavailable.'); }
    setBriefingLoading(false);
  };

  return (
    <div className="flex flex-col w-full h-full bg-white overflow-hidden" style={{ fontFamily: "var(--font-mono)" }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-white border-b border-black/[0.1] flex-shrink-0">
        <div className="flex items-center gap-4">
          <div>
            <div className="font-display text-text-light text-base tracking-[0.15em]">150 ORR INTELLIGENCE HUB</div>
            <div className="font-mono text-[10px] text-text-light/40 tracking-widest mt-0.5">
              {mapCenter[1].toFixed(4)}°N {mapCenter[0].toFixed(4)}°E &nbsp;|&nbsp; Z{mapZoom.toFixed(1)} &nbsp;|&nbsp; {utcTime}
            </div>
          </div>
          <div className="flex items-center gap-1.5 bg-signal/15 border border-signal/30 px-2 py-0.5">
            <div className="w-1.5 h-1.5 bg-signal rounded-full animate-pulse" />
            <span className="font-mono text-[8px] text-signal tracking-widest font-bold">LIVE</span>
          </div>
          {criticalCount > 0 && (
            <div className="flex items-center gap-1.5 bg-red-500/15 border border-red-500/30 px-2 py-0.5 animate-pulse">
              <AlertTriangle size={10} className="text-red-400" />
              <span className="font-mono text-[8px] text-red-400 tracking-widest font-bold">{criticalCount} S1 CRITICAL</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {stats.emergencies > 0 && (
            <div className="flex items-center gap-1.5 bg-red-500/15 border border-red-500/30 px-2 py-0.5 animate-pulse">
              <AlertTriangle size={10} className="text-red-400" />
              <span className="font-mono text-[8px] text-red-400 tracking-widest font-bold">{stats.emergencies} ISR ALERT{stats.emergencies !== 1 ? "S" : ""}</span>
            </div>
          )}
          <div className="flex items-center gap-px border border-black/10 overflow-hidden">
            <Clock size={10} className="text-text-light/30 ml-2 mr-1" />
            {(["1h", "6h", "24h", "7d"] as const).map(r => (
              <button key={r} onClick={() => setTimeRange(r)} className={`px-2 py-1 font-mono text-[8px] tracking-widest transition-colors ${timeRange === r ? "bg-signal text-text-light font-bold" : "text-text-light/40 hover:text-text-light/70 hover:bg-black/5"}`}>{r.toUpperCase()}</button>
            ))}
          </div>
          {/* Export dropdown */}
          <div className="relative">
            <button
              onClick={() => setExportOpen(v => !v)}
              className="flex items-center gap-1.5 bg-white/5 border border-black/15 px-3 py-1.5 hover:bg-white/10 transition-colors"
            >
              <span className="font-mono text-[8.5px] text-text-light/70 font-bold tracking-widest">⤓ EXPORT</span>
            </button>
            {exportOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-bg-dark border border-black/15 shadow-xl min-w-[160px]">
                  <button
                    onClick={generateBriefing}
                    className="w-full text-left px-3 py-2.5 font-mono text-[8.5px] text-text-light/70 hover:bg-white/10 hover:text-signal tracking-widest transition-colors flex items-center gap-2"
                  >
                    <span>✉</span> EMAIL BRIEFING
                  </button>
                </div>
              </>
            )}
          </div>

          <button onClick={() => setMapStyle(s => s === "sat" ? "dark" : "sat")} className="flex items-center gap-1.5 bg-signal px-3 py-1.5 hover:bg-signal/80 transition-colors">
            <Layers size={11} className="text-white" />
            <span className="font-mono text-[8.5px] text-white font-bold tracking-widest">{mapStyle === "sat" ? "SATELLITE" : "DARK"}</span>
          </button>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        {!collapsed && (
          <div className="flex flex-col bg-bg-dark border-r border-black/[0.07] flex-shrink-0 overflow-hidden" style={{ width: 360 }}>

            {/* MiniMap */}
            <div className="border-b border-black/[0.07] flex-shrink-0">
              <MiniMap center={mapCenter} zoom={mapZoom} />
            </div>

            {/* Stats strip */}
            <div className="flex border-b border-black/[0.07] px-2 py-2 gap-2 flex-shrink-0">
              {orrResult && (
                <HealthRing score={orrResult.areaHealthScore} />
              )}
              <div className="flex flex-1 gap-1 items-center justify-around">
                {[
                  { label: "EVENTS", value: orrResult?.events.filter(e => !e.isPredicted).length ?? '—', color: "text-signal" },
                  { label: "S1-S2", value: orrResult?.events.filter(e => e.severity <= 2 && !e.isPredicted).length ?? '—', color: "text-red-400" },
                  { label: "PRED", value: orrResult?.predictedEvents.length ?? '—', color: "text-green-400" },
                  { label: "SRCS", value: orrResult?.sources.filter(s => s.live).length ?? '—', color: "text-blue-400" },
                ].map(s => (
                  <div key={s.label} className="text-center">
                    <div className={`font-mono text-sm font-bold ${s.color}`}>{s.value}</div>
                    <div className="font-mono text-[7px] text-text-light/30 tracking-widest">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-black/[0.07] px-1 pt-1 flex-shrink-0">
              {[
                { label: "INTEL", badge: criticalCount },
                { label: "SOURCES" },
                { label: "ACTIVITY" },
                { label: "LAYERS" },
              ].map(t => (
                <STab key={t.label} label={t.label} active={tab === t.label} onClick={() => setTab(t.label)} badge={t.badge} />
              ))}
            </div>

            {/* Tab body */}
            <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.08) transparent" }}>

              {/* ── INTEL TAB ──────────────────────────────────────── */}
              {tab === "INTEL" && (
                <div className="flex flex-col">
                  {/* Search */}
                  <div className="flex items-center gap-2 px-3 py-2.5 border-b border-black/[0.07] flex-shrink-0">
                    <Search size={12} className="text-text-light/30 flex-shrink-0" />
                    <input
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search intel signals..."
                      className="flex-1 bg-transparent font-mono text-[10px] text-text-light/70 placeholder-text-light/20 outline-none tracking-wider"
                    />
                  </div>

                  {/* Category filter chips */}
                  <div className="flex flex-wrap gap-1.5 px-3 py-2.5 border-b border-black/[0.07]">
                    {CATEGORIES.map(cat => {
                      const active = catFilter === cat;
                      const col = cat === 'ALL' ? '#FFB84D' : CAT_COLOR[cat] ?? '#FFB84D';
                      return (
                        <button
                          key={cat}
                          onClick={() => setCatFilter(cat)}
                          className="font-mono py-1 px-2 transition-all"
                          style={{
                            fontSize: 9,
                            letterSpacing: '0.06em',
                            background: active ? col + '25' : 'transparent',
                            border: `1px solid ${active ? col : 'rgba(0,0,0,0.2)'}`,
                            color: '#000000',
                            fontWeight: 'bold',
                          }}
                        >
                          {CAT_ICON[cat] ?? ''} {CAT_LABEL[cat] ?? cat.toUpperCase()}
                        </button>
                      );
                    })}
                  </div>

                  {/* HQ panel */}
                  <div className="border-b border-black/[0.07] px-3 py-2.5 flex-shrink-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Building2 size={11} className="text-signal" />
                      <span className="font-mono text-[10px] text-signal tracking-widest font-bold">HQ LOCATION</span>
                    </div>
                    <div className="font-mono text-[9px] text-text-light/50 tracking-wider">{HQ.name}</div>
                    <div className="font-mono text-[8.5px] text-text-light/30 tracking-widest mt-0.5">{HQ.lat.toFixed(5)}°N, {HQ.lon.toFixed(5)}°E · 5km GEO-GATE</div>
                    <button
                      onClick={() => mapRef.current?.flyTo({ center: [HQ.lon, HQ.lat], zoom: 14, duration: 1200 })}
                      className="mt-2 w-full py-1.5 font-mono text-[9px] text-signal bg-signal/10 border border-signal/20 hover:bg-signal/20 transition-colors tracking-widest"
                    >FLY TO HQ</button>
                  </div>

                  {/* Event list */}
                  {orrLoading && (
                    <div className="py-8 text-center font-mono text-[10px] text-text-light/25 tracking-wider animate-pulse">SCANNING FEEDS…</div>
                  )}
                  {!orrLoading && filteredORR.length === 0 && (
                    <div className="py-8 text-center font-mono text-[10px] text-text-light/25 tracking-wider">NO EVENTS IN PERIMETER</div>
                  )}
                  {filteredORR.map(event => (
                    <ORRCard key={event.id} event={event} onClick={() => {
                      setSelectedEvent(event);
                      if (event.lat && event.lon) {
                        mapRef.current?.flyTo({ center: [event.lon, event.lat], zoom: 15, duration: 1000 });
                      }
                    }} />
                  ))}
                </div>
              )}

              {/* ── SOURCES TAB ────────────────────────────────────── */}
              {tab === "SOURCES" && (
                <SourcesPanel sources={orrResult?.sources ?? []} />
              )}

              {/* ── ACTIVITY TAB ────────────────────────────────────── */}
              {tab === "ACTIVITY" && (
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 px-2.5 py-2 border-b border-black/[0.07]">
                    <Search size={10} className="text-text-light/30 flex-shrink-0" />
                    <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search objects..." className="flex-1 bg-transparent font-mono text-[8.5px] text-text-light/70 placeholder-text-light/20 outline-none tracking-wider" />
                  </div>
                  {loading && <div className="py-8 text-center font-mono text-[8.5px] text-text-light/25 tracking-wider animate-pulse">ACQUIRING ISR FEEDS...</div>}
                  {activityFeed.filter(o => (o.type === "flight" && showFlights) || (o.type === "vessel" && showVessels) || (o.type === "intel" && showIntel)).map(obj => (
                    <ActivityRow key={obj.id} obj={obj} selected={obj.id === selected} onSelect={() => setSelected(p => p === obj.id ? null : obj.id)} />
                  ))}
                </div>
              )}

              {/* ── LAYERS TAB ──────────────────────────────────────── */}
              {tab === "LAYERS" && (
                <div className="p-3 space-y-1">
                  {[
                    { name: "ORR Intel Events", on: showNewsMarkers, toggle: () => setShowNewsMarkers(v => !v), color: "#FFB84D", count: orrResult?.events.length ?? 0 },
                    { name: "ADS-B Flights", on: showFlights, toggle: () => setShowFlights(v => !v), color: "#3b82f6", count: stats.flights },
                    { name: "AIS Vessels", on: showVessels, toggle: () => setShowVessels(v => !v), color: "#c8c8c4", count: stats.vessels },
                    { name: "OSINT Intel", on: showIntel, toggle: () => setShowIntel(v => !v), color: "#F5C400", count: stats.intelHotspots },
                  ].map(layer => (
                    <button key={layer.name} onClick={layer.toggle} className="w-full flex items-center justify-between py-2 px-2 border-b border-white/[0.05] hover:bg-black/5 transition-colors">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: layer.color + "40", border: `1px solid ${layer.color}` }} />
                        <span className="font-mono text-[8.5px] text-text-light/60 tracking-widest">{layer.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[8px] text-text-light/30">{layer.count}</span>
                        {layer.on ? <Eye size={10} className="text-signal/70" /> : <EyeOff size={10} className="text-text-light/15" />}
                      </div>
                    </button>
                  ))}
                  <div className="pt-4 border-t border-black/[0.07] mt-3">
                    <div className="font-mono text-[8px] text-text-light/30 tracking-widest mb-2">MAP STYLE</div>
                    <div className="flex gap-1">
                      {(["sat", "dark"] as const).map(s => (
                        <button key={s} onClick={() => setMapStyle(s)} className={`flex-1 py-1.5 font-mono text-[8.5px] tracking-widest transition-colors ${mapStyle === s ? "bg-signal text-text-light font-bold" : "bg-white/5 text-text-light/40 hover:text-text-light/70"}`}>{s === "sat" ? "SATELLITE" : "DARK MAP"}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Main Map ─────────────────────────────────────────────────── */}
        <div className="flex-1 relative overflow-hidden bg-black">
          <div ref={mainMapRef} className="w-full h-full" />

          {/* 5km SVG circle overlay */}
          {hqCircle && (
            <svg
              className="absolute inset-0 pointer-events-none"
              style={{ width: '100%', height: '100%', overflow: 'visible' }}
            >
              <circle
                cx={hqCircle.cx}
                cy={hqCircle.cy}
                r={hqCircle.r}
                fill="rgba(96,176,224,0.055)"
                stroke="rgba(96,176,224,0.85)"
                strokeWidth="2"
                strokeDasharray="8 4"
              />
            </svg>
          )}

          {/* Collapse toggle */}
          <button onClick={() => setCollapsed(p => !p)} className="absolute top-2 left-2 z-10 w-6 h-6 bg-bg-dark/90 border border-black/15 flex items-center justify-center hover:bg-white/10 transition-colors">
            <ChevronLeft size={11} className={`text-text-light/60 transition-transform ${collapsed ? "rotate-180" : ""}`} />
          </button>

          {/* Center label */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 text-center pointer-events-none">
            <div className="font-display text-text-light text-sm tracking-[0.2em] drop-shadow-lg">150 ORR INTELLIGENCE HUB</div>
            <div className="font-mono text-[8.5px] text-text-light/55 tracking-widest">{utcTime}</div>
          </div>

          {/* Live badges */}
          <div className="absolute top-12 right-3 z-10 flex flex-col gap-1">
            {(orrResult?.events.filter(e => e.severity <= 2 && !e.isPredicted).length ?? 0) > 0 && (
              <div className="flex items-center gap-1.5 bg-bg-dark/85 border border-red-500/30 px-2 py-0.5">
                <AlertTriangle size={9} className="text-red-400" />
                <span className="font-mono text-[7.5px] text-red-400 tracking-widest">{orrResult!.events.filter(e => e.severity <= 2 && !e.isPredicted).length} HIGH+</span>
              </div>
            )}
            {stats.flights > 0 && showFlights && (
              <div className="flex items-center gap-1.5 bg-bg-dark/85 border border-blue-500/30 px-2 py-0.5">
                <Plane size={9} className="text-blue-400" />
                <span className="font-mono text-[7.5px] text-blue-400 tracking-widest">{stats.flights} FLT</span>
              </div>
            )}
            {stats.vessels > 0 && showVessels && (
              <div className="flex items-center gap-1.5 bg-bg-dark/85 border border-text-light/20 px-2 py-0.5">
                <Ship size={9} className="text-text-light/70" />
                <span className="font-mono text-[7.5px] text-text-light/70 tracking-widest">{stats.vessels} VES</span>
              </div>
            )}
          </div>

          {/* Selected event popup */}
          {selectedEvent && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 bg-bg-dark border border-signal/40 p-4 shadow-2xl" style={{ width: 420, maxWidth: '90vw' }}>
              <div className="flex items-start justify-between mb-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold px-2 py-0.5" style={{ fontSize: 10.5, color: selectedEvent.isPredicted ? '#7FB069' : SEV_COLOR[selectedEvent.severity], border: `1px solid ${selectedEvent.isPredicted ? '#7FB069' : SEV_COLOR[selectedEvent.severity]}55`, letterSpacing: '0.12em' }}>
                    {selectedEvent.isPredicted ? 'PREDICTED' : `S${selectedEvent.severity} ${['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'][selectedEvent.severity - 1]}`}
                  </span>
                  {selectedEvent.isTranslated && (
                    <span className="font-mono px-1.5 py-0.5" style={{ fontSize: 9, color: '#A855F7', border: '1px solid rgba(168,85,247,0.4)' }}>KN→EN</span>
                  )}
                </div>
                <button onClick={() => setSelectedEvent(null)} className="font-mono text-[12px] text-text-light/30 hover:text-white transition-colors">✕</button>
              </div>
              <div className="font-mono text-[12px] text-white leading-snug mb-2.5">{selectedEvent.headline}</div>
              {selectedEvent.originalHeadline && (
                <div className="font-mono text-[9.5px] text-purple-400/60 italic mb-2.5 leading-snug">{selectedEvent.originalHeadline}</div>
              )}
              <div className="flex gap-3 text-[9.5px] font-mono">
                <span className="text-text-light/40">{selectedEvent.source}</span>
                <span className="text-text-light/25">{selectedEvent.time}</span>
                {selectedEvent.distanceKm !== undefined && (
                  <span style={{ color: selectedEvent.distanceKm < 2 ? '#FF9933' : 'rgba(0,0,0,0.30)' }}>{formatDist(selectedEvent.distanceKm)} FROM HQ</span>
                )}
              </div>
              {selectedEvent.url && (
                <a href={selectedEvent.url} target="_blank" rel="noopener noreferrer" className="mt-2.5 block font-mono text-[9.5px] text-signal hover:underline tracking-wider">OPEN SOURCE ↗</a>
              )}
            </div>
          )}

          {loading && (
            <div className="absolute bottom-16 left-2 z-10">
              <span className="font-mono text-text-light/25 animate-pulse tracking-widest text-[8px]">ACQUIRING ISR FEEDS...</span>
            </div>
          )}

          {/* ── Briefing modal ─────────────────────────────────────────── */}
          {briefingModal && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="bg-bg-dark border border-white/20 shadow-2xl flex flex-col" style={{ width: 560, maxWidth: '92vw', maxHeight: '80vh' }}>
                {/* Modal header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-black/10 flex-shrink-0">
                  <div>
                    <div className="font-mono text-[10px] text-signal tracking-widest font-bold">⤓ INTELLIGENCE BRIEFING · 150 ORR</div>
                    <div className="font-mono text-[8px] text-white/30 tracking-widest mt-0.5">{new Date().toUTCString()}</div>
                  </div>
                  <button onClick={() => setBriefingModal(false)} className="font-mono text-[11px] text-white/30 hover:text-white transition-colors px-2">✕</button>
                </div>
                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5">
                  {briefingLoading ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                      <div className="w-6 h-6 border-2 border-signal/30 border-t-signal rounded-full animate-spin" />
                      <span className="font-mono text-[9px] text-white/30 tracking-widest animate-pulse">GROQ · GENERATING BRIEFING...</span>
                    </div>
                  ) : (
                    <pre className="font-mono text-[11px] text-white/80 whitespace-pre-wrap leading-relaxed">{briefingText}</pre>
                  )}
                </div>
                {/* Actions */}
                {!briefingLoading && briefingText && (
                  <div className="flex gap-2 px-5 py-3 border-t border-black/10 flex-shrink-0">
                    <button
                      onClick={() => navigator.clipboard.writeText(briefingText ?? '')}
                      className="flex-1 py-2 font-mono text-[9px] tracking-widest bg-white/5 border border-black/15 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                    >
                      ⧉ COPY TEXT
                    </button>
                    <a
                      href={`mailto:?subject=150 ORR Intelligence Briefing — ${new Date().toLocaleDateString('en-IN')}&body=${encodeURIComponent(briefingText ?? '')}`}
                      className="flex-1 py-2 font-mono text-[9px] tracking-widest bg-signal text-bg-dark font-bold hover:bg-signal/80 transition-colors text-center no-underline flex items-center justify-center"
                    >
                      ✉ OPEN IN EMAIL
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="absolute bottom-3 right-3 z-10">
            <span className="font-mono text-[7px] text-text-light/20 tracking-widest">ESRI · ADSB.LOL · AISSTREAM · GROQ · GEMINI · RSS</span>
          </div>
        </div>
      </div>

      {/* ── Bottom bar ──────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-bg-dark border-t border-black/[0.07] px-4 flex items-stretch" style={{ height: 52 }}>
        <div className="flex flex-col justify-center gap-0.5 pr-4 border-r border-black/[0.07] flex-shrink-0">
          <span className="font-mono text-[8px] text-signal tracking-widest font-bold">{utcTime}</span>
          <span className="font-mono text-[7px] text-text-light/30 tracking-widest">{mapCenter[1].toFixed(4)}°N {mapCenter[0].toFixed(4)}°E · 5km GEO-GATE</span>
        </div>
        <div className="flex-1 flex flex-col justify-end px-3 py-1.5 gap-1 overflow-hidden">
          <div className="flex items-center justify-between mb-0.5">
            <span className="font-mono text-[7px] text-text-light/25 tracking-widest">INTEL VOLUME · {timeRange.toUpperCase()}</span>
            <span className="font-mono text-[7px] text-text-light/25 tracking-widest">NOW →</span>
          </div>
          <div className="flex items-end gap-px h-5 w-full">
            {(() => {
              const max = Math.max(...histogram, 1);
              return histogram.map((count, i) => {
                const pct = count / max;
                const isRecent = i >= histogram.length * 0.75;
                return <div key={i} className="flex-1 transition-all duration-500" style={{ height: `${Math.max(pct * 100, 4)}%`, background: isRecent ? `rgba(107,140,42,${0.5 + pct * 0.5})` : `rgba(59,130,246,${0.25 + pct * 0.45})` }} />;
              });
            })()}
          </div>
        </div>
        <div className="flex flex-col justify-center gap-0.5 pl-4 border-l border-black/[0.07] flex-shrink-0">
          <span className="font-mono text-[7px] text-text-light/30 tracking-widest">
            {orrResult?.sources.filter(s => s.live).length ?? 0}/{orrResult?.sources.length ?? 0} FEEDS · {orrResult?.events.filter(e => !e.isPredicted).length ?? 0} EVENTS
          </span>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 bg-signal rounded-full animate-pulse" />
            <span className="font-mono text-[7px] text-signal tracking-widest font-bold">150 ORR INTEL ACTIVE</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Video;
