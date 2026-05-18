import { useState, useEffect, useRef, useCallback, useId } from "react";
import {
  MapPin, Navigation, AlertTriangle, ArrowUpDown, X,
  Key, ChevronDown, ChevronUp, Loader2, Zap
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import {
  useRoutePlanner, useAlternateRoutes, useGeocoding,
  fetchTrafficIncidents, filterIncidentsNearRoute,
  type Location, type GeocodeSuggestion
} from "@/hooks/useRoutePlanner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoutePlannerPanelProps {
  onRouteUpdate: (analysis: any) => void;
  onSelectRoute: (index: number) => void;
  onIncidentsUpdate: (incidents: any[]) => void;
  origin: Location | null;
  destination: Location | null;
  onOriginChange: (loc: Location | null) => void;
  onDestinationChange: (loc: Location | null) => void;
  incidents: any[];
  selectedRouteIndex?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDistance = (meters: number) => `${(meters / 1000).toFixed(1)} km`;

const formatDuration = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const formatDelta = (seconds: number) => {
  const abs = Math.abs(seconds);
  const h = Math.floor(abs / 3600), m = Math.round((abs % 3600) / 60);
  const str = h ? `${h}h ${m}m` : `${m}m`;
  return seconds > 0 ? `+${str}` : `−${str}`;
};

const toDisplayName = (raw: string) => raw.split(",").slice(0, 2).join(", ").trim();

// Route colors matching MapPanel — cyan / purple / orange
const ROUTE_COLORS = ['#00e5ff', '#a78bfa', '#fb923c'];
const ROUTE_NAMES = ['Primary Route', 'Alternate 1', 'Alternate 2'];

// ─── LocationInput ────────────────────────────────────────────────────────────

interface LocationInputProps {
  label: string;
  placeholder: string;
  value: string;
  pinColor: "green" | "red";
  suggestions: GeocodeSuggestion[] | undefined;
  isPending: boolean;
  onChange: (v: string) => void;
  onClear: () => void;
  onSelect: (s: GeocodeSuggestion) => void;
  showSuggestions: boolean;
  onShowSuggestions: (v: boolean) => void;
  containerRef: React.RefObject<HTMLDivElement>;
}

const LocationInput = ({
  label, placeholder, value, pinColor, suggestions, isPending,
  onChange, onClear, onSelect, showSuggestions, onShowSuggestions, containerRef,
}: LocationInputProps) => {
  const listboxId = useId();
  const [activeIdx, setActiveIdx] = useState(-1);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || !suggestions?.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && activeIdx >= 0) { e.preventDefault(); onSelect(suggestions[activeIdx]); }
    else if (e.key === "Escape") onShowSuggestions(false);
  };

  useEffect(() => { setActiveIdx(-1); }, [suggestions]);

  const open = showSuggestions && value.length >= 3;

  return (
    <div className="space-y-1" ref={containerRef}>
      <label className="text-[10px] font-bold text-red-500/80 uppercase tracking-widest ml-1">{label}</label>
      <div className="relative">
        <MapPin className={`absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 z-10 pointer-events-none
          ${pinColor === "green" ? "text-green-500" : "text-red-500"}`} />
        <Input
          placeholder={placeholder}
          value={value}
          aria-label={label}
          aria-autocomplete="list"
          aria-controls={open ? listboxId : undefined}
          aria-expanded={open}
          autoComplete="off"
          onChange={e => { onChange(e.target.value); onShowSuggestions(true); }}
          onFocus={() => onShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          className="pl-9 pr-8 h-9 bg-black/50 border-red-900/30 focus-visible:ring-red-500
                     text-red-200 placeholder:text-red-900/40 text-sm"
        />
        {value && (
          <button onClick={onClear} aria-label="Clear"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-red-900/50 hover:text-red-400 transition-colors">
            <X className="h-3 w-3" />
          </button>
        )}
        {open && (
          <ul id={listboxId} role="listbox"
            className="absolute z-50 left-0 right-0 top-full mt-1
                       bg-black/95 border border-red-900/30 rounded-lg shadow-2xl
                       max-h-48 overflow-y-auto backdrop-blur-md">
            {isPending && (
              <li className="px-4 py-2.5 text-xs text-red-400/60 flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Searching…
              </li>
            )}
            {!isPending && suggestions?.length === 0 && (
              <li className="px-4 py-2.5 text-xs text-red-950/60 italic">No results — try a broader term.</li>
            )}
            {suggestions?.map((s, idx) => (
              <li key={idx} role="option" aria-selected={idx === activeIdx}
                className={`px-4 py-2 cursor-pointer border-b border-red-900/10 last:border-b-0 transition-colors
                  ${idx === activeIdx ? "bg-red-950/30" : "hover:bg-red-950/20"}`}
                onMouseDown={() => onSelect(s)}
                onMouseEnter={() => setActiveIdx(idx)}>
                <div className="font-semibold text-xs text-red-200 uppercase tracking-tight truncate">
                  {s.display_name.split(",")[0]}
                </div>
                <div className="text-[10px] text-red-900/60 truncate">
                  {s.display_name.split(",").slice(1, 4).join(",")}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

// ─── Incident card ────────────────────────────────────────────────────────────

const INCIDENT_ICONS: Record<number, { icon: string; label: string }> = {
  0: { icon: '🚧', label: 'Unknown' },
  1: { icon: '💥', label: 'Accident' },
  2: { icon: '🌫️', label: 'Fog' },
  3: { icon: '⚠️', label: 'Dangerous Conditions' },
  4: { icon: '🌧️', label: 'Rain' },
  5: { icon: '🧊', label: 'Ice / Snow' },
  6: { icon: '🚗', label: 'Traffic Jam' },
  7: { icon: '🔀', label: 'Lane Closed' },
  8: { icon: '🚫', label: 'Road Closed' },
  9: { icon: '🛤️', label: 'Road Works' },
  10: { icon: '💨', label: 'High Winds' },
  11: { icon: '🌊', label: 'Flooding' },
  14: { icon: '🚗', label: 'Broken Down Vehicle' },
};

function sevBorderClass(severity: number) {
  if (severity >= 4) return 'border-l-red-500';
  if (severity >= 3) return 'border-l-lime-600';
  if (severity >= 2) return 'border-l-yellow-500';
  return 'border-l-green-500';
}

function sevIconBg(severity: number) {
  if (severity >= 4) return 'bg-red-500/15';
  if (severity >= 3) return 'bg-lime-600/15';
  if (severity >= 2) return 'bg-yellow-500/15';
  return 'bg-green-500/15';
}

function incCountColor(count: number, hasCritical: boolean) {
  if (count === 0) return 'text-green-400';
  if (hasCritical) return 'text-red-400';
  return 'text-yellow-400';
}

// ─── Main Component ───────────────────────────────────────────────────────────

export const RoutePlannerPanel = ({
  onRouteUpdate,
  onSelectRoute,
  onIncidentsUpdate,
  origin,
  destination,
  onOriginChange,
  onDestinationChange,
  incidents,
  selectedRouteIndex = 0,
}: RoutePlannerPanelProps) => {
  const { tomtomKey, setTomtomKey } = useRoutePlanner();
  const [originInput, setOriginInput] = useState("");
  const [destInput, setDestInput] = useState("");
  const [debouncedOrigin, setDebouncedOrigin] = useState("");
  const [debouncedDest, setDebouncedDest] = useState("");
  const [showOriginSug, setShowOriginSug] = useState(false);
  const [showDestSug, setShowDestSug] = useState(false);
  const [showApiSettings, setShowApiSettings] = useState(false);
  const originRef = useRef<HTMLDivElement>(null);
  const destRef = useRef<HTMLDivElement>(null);

  // ── Debounce ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebouncedOrigin(originInput), 400);
    return () => clearTimeout(t);
  }, [originInput]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedDest(destInput), 400);
    return () => clearTimeout(t);
  }, [destInput]);

  // ── Geocoding ───────────────────────────────────────────────────────────────
  const originGeocode = useGeocoding(debouncedOrigin, showOriginSug && debouncedOrigin.length >= 3);
  const destGeocode = useGeocoding(debouncedDest, showDestSug && debouncedDest.length >= 3);
  const alternateRoutes = useAlternateRoutes(origin, destination, incidents);

  // ── Sync route data upward (ref-guarded to avoid loop) ─────────────────────
  const prevRouteRef = useRef<any>(null);
  useEffect(() => {
    if (alternateRoutes.data && alternateRoutes.data !== prevRouteRef.current) {
      prevRouteRef.current = alternateRoutes.data;
      onRouteUpdate(alternateRoutes.data);
    }
  }, [alternateRoutes.data, onRouteUpdate]);

  // ── Close dropdowns on outside click ───────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (originRef.current && !originRef.current.contains(e.target as Node)) setShowOriginSug(false);
      if (destRef.current && !destRef.current.contains(e.target as Node)) setShowDestSug(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const toLocation = useCallback((s: GeocodeSuggestion): Location => ({
    lat: s.lat, lng: s.lon, name: toDisplayName(s.display_name),
  }), []);

  const selectOrigin = useCallback((s: GeocodeSuggestion) => {
    const loc = toLocation(s);
    onOriginChange(loc); setOriginInput(loc.name); setShowOriginSug(false);
  }, [toLocation, onOriginChange]);

  const selectDest = useCallback((s: GeocodeSuggestion) => {
    const loc = toLocation(s);
    onDestinationChange(loc); setDestInput(loc.name); setShowDestSug(false);
  }, [toLocation, onDestinationChange]);

  const clearOrigin = useCallback(() => { setOriginInput(""); onOriginChange(null); }, [onOriginChange]);
  const clearDest = useCallback(() => { setDestInput(""); onDestinationChange(null); }, [onDestinationChange]);

  const swapLocations = useCallback(() => {
    const tmpInput = originInput, tmpLoc = origin;
    setOriginInput(destInput); setDestInput(tmpInput);
    onOriginChange(destination); onDestinationChange(tmpLoc);
  }, [originInput, destInput, origin, destination, onOriginChange, onDestinationChange]);

  // ── Calculate ───────────────────────────────────────────────────────────────
  const handleCalculate = useCallback(async () => {
    if (!origin || !destination) return;

    // Fire route mutation immediately
    alternateRoutes.mutate();

    // Fetch incidents in parallel
    if (tomtomKey) {
      const bbox: [number, number, number, number] = [
        Math.min(origin.lng, destination.lng), Math.min(origin.lat, destination.lat),
        Math.max(origin.lng, destination.lng), Math.max(origin.lat, destination.lat),
      ];
      try {
        const raw = await fetchTrafficIncidents(bbox, tomtomKey);
        const coords = alternateRoutes.data?.primaryRoute?.geometry?.coordinates;
        onIncidentsUpdate(coords ? filterIncidentsNearRoute(raw, coords, 0.025) : raw);
      } catch { /* non-critical */ }
    }
  }, [origin, destination, tomtomKey, alternateRoutes, onIncidentsUpdate]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const canCalculate = !!origin && !!destination && !alternateRoutes.isPending;
  const data = alternateRoutes.data;
  const primary = data?.primaryRoute;
  const alternates = data?.alternateRoutes ?? [];
  const recommendation = data?.recommendation;

  // All routes in one flat array: [primary, ...alternates]
  const allRoutes = primary ? [primary, ...alternates] : [];

  // Sorted incidents for the current route
  const sortedIncidents = [...incidents].sort(
    (a, b) => (b.severity ?? 0) - (a.severity ?? 0)
  );
  const hasCritical = incidents.some(i => i.severity >= 4);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Card className="w-full">
      {/* ── Header ── */}
      <CardHeader className="border-b border-red-900/20 bg-black/40 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-red-600 text-base">
            <Navigation className="h-4 w-4 text-red-600" />
            AI Route Planner
          </CardTitle>
          <Button variant="ghost" size="sm" aria-label="Toggle API settings"
            onClick={() => setShowApiSettings(v => !v)}
            className="text-red-900/50 hover:text-red-500 hover:bg-red-950/20 h-7">
            <Key className="h-3.5 w-3.5 mr-1" />
            {showApiSettings ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </div>
        <CardDescription className="text-red-400/70 text-xs">
          Smart routing with real-time incident detection and alternate route scoring
        </CardDescription>

        <Collapsible open={showApiSettings} onOpenChange={setShowApiSettings}>
          <CollapsibleContent className="pt-3 space-y-1.5">
            <label className="text-[10px] font-bold text-red-900 uppercase tracking-widest ml-1">
              TomTom API Key
            </label>
            <Input
              type="password"
              placeholder="Paste TomTom key for live incidents…"
              value={tomtomKey}
              onChange={e => setTomtomKey(e.target.value)}
              className="bg-black/80 border-red-950/40 text-red-500 focus-visible:ring-red-600
                         placeholder:text-red-950/30 text-xs h-8"
            />
            <p className="text-[9px] text-red-900/40 ml-1">
              Free key at developer.tomtom.com enables real-time jams &amp; road closures.
            </p>
          </CollapsibleContent>
        </Collapsible>
      </CardHeader>

      <CardContent className="space-y-3 pt-4">
        {/* ── Inputs ── */}
        <div className="space-y-1">
          <LocationInput
            label="Starting point" placeholder="Enter origin…"
            value={originInput} pinColor="green"
            suggestions={originGeocode.data} isPending={originGeocode.isPending}
            onChange={setOriginInput} onClear={clearOrigin} onSelect={selectOrigin}
            showSuggestions={showOriginSug} onShowSuggestions={setShowOriginSug}
            containerRef={originRef}
          />

          {/* Swap */}
          <div className="flex justify-center py-0.5">
            <Button variant="ghost" size="sm" onClick={swapLocations}
              disabled={!origin && !destination} aria-label="Swap"
              className="h-6 px-3 text-red-900/40 hover:text-red-500 hover:bg-red-950/10 disabled:opacity-20">
              <ArrowUpDown className="h-3 w-3 mr-1" />
              <span className="text-[10px]">Swap</span>
            </Button>
          </div>

          <LocationInput
            label="Destination" placeholder="Enter destination…"
            value={destInput} pinColor="red"
            suggestions={destGeocode.data} isPending={destGeocode.isPending}
            onChange={setDestInput} onClear={clearDest} onSelect={selectDest}
            showSuggestions={showDestSug} onShowSuggestions={setShowDestSug}
            containerRef={destRef}
          />

          <Button onClick={handleCalculate} disabled={!canCalculate}
            className="w-full mt-1 bg-black text-red-500 border border-red-600
                       hover:bg-red-950/20 hover:text-red-400 font-bold transition-all
                       shadow-[0_0_15px_rgba(220,38,38,0.1)] disabled:opacity-40 disabled:cursor-not-allowed">
            {alternateRoutes.isPending
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Calculating…</>
              : <><Zap className="mr-2 h-4 w-4" />Calculate Route</>}
          </Button>
        </div>

        {/* ── Error ── */}
        {alternateRoutes.isError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>Failed to calculate routes. Please check your inputs and try again.</AlertDescription>
          </Alert>
        )}

        {/* ── Empty state ── */}
        {!data && !alternateRoutes.isPending && !alternateRoutes.isError && (
          <div className="text-center py-10 text-muted-foreground">
            <Navigation className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">Enter origin and destination</p>
            <p className="text-xs mt-1 opacity-50">AI will score routes and flag blocked roads</p>
          </div>
        )}

        {/* ── Results ── */}
        {data && primary && (
          <div className="space-y-3">

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-black/30 rounded-lg p-2.5 border border-red-900/10">
                <div className="text-lg font-bold text-red-400 font-mono">{formatDistance(primary.distance)}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide">Distance</div>
              </div>
              <div className="bg-black/30 rounded-lg p-2.5 border border-red-900/10">
                <div className="text-lg font-bold text-red-400 font-mono">{formatDuration(primary.duration)}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide">Est. Time</div>
              </div>
              <div className="bg-black/30 rounded-lg p-2.5 border border-red-900/10">
                <div className={`text-lg font-bold font-mono ${incCountColor(incidents.length, hasCritical)}`}>
                  {incidents.length}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wide">Incidents</div>
              </div>
            </div>

            {/* Route status alert */}
            {hasCritical ? (
              <Alert className="bg-black/80 border-red-900/60 py-2">
                <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                <AlertDescription className="text-red-200 text-xs">
                  <strong className="text-red-400">Road blocked</strong> — {primary.analysis.criticalIncidents} critical
                  incident{primary.analysis.criticalIncidents > 1 ? 's' : ''} on primary route.
                  {alternates.length > 0 && ' Consider an alternate below.'}
                </AlertDescription>
              </Alert>
            ) : incidents.length > 0 ? (
              <Alert className="bg-black/80 border-yellow-900/40 py-2">
                <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
                <AlertDescription className="text-yellow-200 text-xs">
                  {incidents.length} minor incident{incidents.length > 1 ? 's' : ''} detected.
                  ~{Math.round(primary.analysis.totalDelay / 60)} min extra delay expected.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="bg-black/80 border-green-900/30 py-2">
                <AlertDescription className="text-green-400 text-xs font-semibold">
                  ✓ Route clear — no major incidents detected.
                </AlertDescription>
              </Alert>
            )}

            {/* AI recommendation */}
            {recommendation && (
              <div className="flex items-start gap-2 bg-red-950/10 border border-red-900/30 rounded-lg px-3 py-2.5">
                <Zap className="h-3.5 w-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-200 leading-relaxed">
                  <strong className="text-red-400">AI: </strong>{recommendation.reason}
                </p>
              </div>
            )}

            {/* Route options switcher — shown only when alternates exist */}
            {allRoutes.length > 1 && (
              <div className="space-y-1.5">
                <p className="text-[10px] text-red-900/50 font-mono uppercase tracking-widest">
                  // Route Options
                </p>
                {allRoutes.map((r: any, i: number) => {
                  const isSelected = i === selectedRouteIndex;
                  const incCount = i === 0
                    ? primary.analysis.criticalIncidents
                    : (r.analysis?.criticalIncidents ?? 0);
                  const isCritical = incCount >= 2;
                  const isBest = i === 0 && !hasCritical;
                  const timeDiff = i === 0 ? 0 : r.duration - primary.duration;

                  return (
                    <button key={i} onClick={() => onSelectRoute(i)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all
                        ${isSelected
                          ? 'border-red-500/60 bg-red-950/20'
                          : 'border-red-900/20 bg-black/30 hover:border-red-900/50 hover:bg-black/50'}`}>
                      {/* Color dot */}
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{
                          background: ROUTE_COLORS[i],
                          boxShadow: isSelected ? `0 0 7px ${ROUTE_COLORS[i]}99` : 'none',
                        }} />
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-red-200">
                          {ROUTE_NAMES[i] ?? `Route ${i + 1}`}
                        </div>
                        <div className="text-[10px] text-red-900/60 font-mono mt-0.5">
                          {formatDistance(r.distance)} · {formatDuration(r.duration)}
                          {timeDiff !== 0 && (
                            <span className={timeDiff > 0 ? 'text-red-400/70' : 'text-green-400/70'}>
                              {' '}({formatDelta(timeDiff)})
                            </span>
                          )}
                          {incCount > 0 && ` · ${incCount} incident${incCount > 1 ? 's' : ''}`}
                        </div>
                      </div>
                      {/* Badge */}
                      {isCritical && (
                        <span className="text-[9px] font-mono font-bold text-red-400 bg-red-950/30 px-1.5 py-0.5 rounded border border-red-900/30 flex-shrink-0">
                          BLOCKED
                        </span>
                      )}
                      {isBest && !isCritical && (
                        <span className="text-[9px] font-mono font-bold text-green-400 bg-green-950/30 px-1.5 py-0.5 rounded border border-green-900/30 flex-shrink-0">
                          FASTEST
                        </span>
                      )}
                      {i > 0 && !isCritical && r.score >= 70 && (
                        <span className="text-[9px] font-mono font-bold text-cyan-400 bg-cyan-950/20 px-1.5 py-0.5 rounded border border-cyan-900/20 flex-shrink-0">
                          {r.score}/100
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── Incident list ── */}
            {incidents.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-red-900/50 font-mono uppercase tracking-widest">
                    // En Route Incidents
                  </p>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border
                    ${hasCritical
                      ? 'text-red-400 border-red-900/40 bg-red-950/20'
                      : 'text-yellow-400 border-yellow-900/30 bg-yellow-950/10'}`}>
                    {incidents.length} incident{incidents.length > 1 ? 's' : ''}
                  </span>
                </div>

                {sortedIncidents.map((inc, idx) => {
                  const typeInfo = INCIDENT_ICONS[inc.iconCategory ?? 0] ?? INCIDENT_ICONS[0];
                  const delay = inc.delay > 60
                    ? `+${Math.round(inc.delay / 60)} min delay`
                    : null;
                  const isClosed = inc.type === 'Road Closed'
                    || inc.description?.toLowerCase().includes('closed')
                    || inc.iconCategory === 8;

                  return (
                    <div key={inc.id ?? idx}
                      className={`bg-black/30 border border-l-2 ${sevBorderClass(inc.severity)}
                                  border-red-900/20 rounded-lg px-3 py-2.5 space-y-2`}>
                      <div className="flex items-start gap-2.5">
                        <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-sm
                          ${sevIconBg(inc.severity)}`}>
                          {typeInfo.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-red-200">{typeInfo.label}</div>
                          <div className="text-[10px] text-red-900/60 font-mono mt-0.5 truncate">
                            {inc.description}
                          </div>
                        </div>
                      </div>
                      {/* Tags */}
                      <div className="flex flex-wrap gap-1.5">
                        {inc.roadNumbers?.length > 0 && (
                          <span className="text-[10px] font-mono text-cyan-400/80 bg-cyan-950/20 border border-cyan-900/20 px-1.5 py-0.5 rounded">
                            {inc.roadNumbers.join(', ')}
                          </span>
                        )}
                        {delay && (
                          <span className="text-[10px] font-mono text-yellow-400 bg-yellow-950/15 border border-yellow-900/20 px-1.5 py-0.5 rounded">
                            {delay}
                          </span>
                        )}
                        {isClosed && (
                          <span className="text-[10px] font-mono font-bold text-red-400 bg-red-950/20 border border-red-900/30 px-1.5 py-0.5 rounded">
                            ROAD CLOSED
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {incidents.length === 0 && !tomtomKey && (
              <div className="text-center py-6 text-muted-foreground border border-red-900/10 rounded-lg bg-black/20">
                <p className="text-xs font-mono text-red-900/40">🔑 Add TomTom key above for live incidents</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};