import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ofetch } from "ofetch";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Location {
  lat: number;
  lng: number;
  name: string;
}

export interface GeocodeSuggestion {
  lat: number;
  lon: number;
  display_name: string;
}

export interface RouteIncident {
  id: string;
  type: string;
  severity: number;
  description: string;
  location: { lat: number; lng: number };
  delay?: number;
  roadNumbers?: string[];
}

export interface RouteAnalysis {
  criticalIncidents: number;
  totalDelay: number; // seconds
  riskScore: number;
}

export interface Route {
  distance: number; // meters
  duration: number; // seconds
  geometry: { coordinates: [number, number][] }; // [lng, lat][]
  incidents?: RouteIncident[];
  analysis: RouteAnalysis;
}

export interface AlternateRoute extends Route {
  reason: string;
  score: number;
  timeSaved?: number;
  timeChange?: number;
  distanceChange?: number;
}

export interface AlternateRoutesResult {
  primaryRoute: Route;
  alternateRoutes: AlternateRoute[];
  recommendation?: { reason: string };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";
const CLAUDE_API = "https://api.anthropic.com/v1/messages";

// ─── useRoutePlanner ──────────────────────────────────────────────────────────

export function useRoutePlanner() {
  const [tomtomKey, setTomtomKey] = useState("");

  return { tomtomKey, setTomtomKey };
}

// ─── useGeocoding ─────────────────────────────────────────────────────────────

/**
 * Calls Nominatim (free, no key required) to turn a text query into
 * a list of location suggestions.
 *
 * @param query  - debounced user input
 * @param enabled - only fetch when the dropdown is open and query.length >= 3
 */
export function useGeocoding(query: string, enabled: boolean) {
  return useQuery<GeocodeSuggestion[]>({
    queryKey: ["geocode", query],
    enabled: enabled && query.length >= 3,
    staleTime: 1000 * 60 * 5, // cache for 5 minutes
    queryFn: async () => {
      const results = await ofetch<GeocodeSuggestion[]>(NOMINATIM_BASE, {
        params: {
          q: query,
          format: "json",
          limit: 6,
          addressdetails: 1,
        },
        headers: {
          // Nominatim requires a descriptive User-Agent
          "Accept-Language": "en",
        },
      });
      return results ?? [];
    },
  });
}

// ─── OSRM helpers ─────────────────────────────────────────────────────────────

interface OsrmRoute {
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
}

interface OsrmResponse {
  code: string;
  routes: OsrmRoute[];
}

/** Fetch up to 3 routes from the public OSRM API */
async function fetchOsrmRoutes(
  origin: Location,
  destination: Location
): Promise<OsrmRoute[]> {
  const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const data = await ofetch<OsrmResponse>(`${OSRM_BASE}/${coords}`, {
    params: {
      alternatives: "true",      // ask for up to 3 routes
      geometries: "geojson",
      overview: "full",
      steps: "false",
    },
  });

  if (data.code !== "Ok" || !data.routes?.length) {
    throw new Error(`OSRM error: ${data.code}`);
  }

  return data.routes;
}

// ─── Incident analysis ────────────────────────────────────────────────────────

function analyseIncidents(
  routeCoords: [number, number][],
  incidents: RouteIncident[],
  radiusDeg = 0.025
): RouteAnalysis {
  const nearby = filterIncidentsNearRoute(incidents, routeCoords, radiusDeg);
  const critical = nearby.filter((i) => i.severity >= 3);
  const totalDelay = nearby.reduce((sum, i) => sum + (i.delay ?? 0), 0);
  const riskScore = Math.min(
    100,
    critical.length * 20 + nearby.length * 5 + totalDelay / 60
  );

  return {
    criticalIncidents: critical.length,
    totalDelay,
    riskScore,
  };
}

// ─── AI alternate route scoring ───────────────────────────────────────────────

async function scoreAlternatesWithAI(
  primaryRoute: Route,
  rawAlternates: OsrmRoute[],
  incidents: RouteIncident[],
  origin: Location,
  destination: Location
): Promise<{ alternates: AlternateRoute[]; recommendation?: { reason: string } }> {
  if (!rawAlternates.length) {
    return { alternates: [] };
  }

  const alternatesWithAnalysis = rawAlternates.map((r) => ({
    ...r,
    analysis: analyseIncidents(r.geometry.coordinates, incidents),
  }));

  const prompt = `You are a traffic routing assistant. Analyse these alternate routes vs the primary route and score each one.

PRIMARY ROUTE:
- Distance: ${(primaryRoute.distance / 1000).toFixed(1)} km
- Duration: ${Math.round(primaryRoute.duration / 60)} min
- Critical incidents: ${primaryRoute.analysis.criticalIncidents}
- Risk score: ${primaryRoute.analysis.riskScore.toFixed(1)}
- Total delay: ${Math.round(primaryRoute.analysis.totalDelay / 60)} min

ALTERNATE ROUTES:
${alternatesWithAnalysis.map((r, i) => `Route ${i + 1}:
- Distance: ${(r.distance / 1000).toFixed(1)} km
- Duration: ${Math.round(r.duration / 60)} min
- Critical incidents: ${r.analysis.criticalIncidents}
- Risk score: ${r.analysis.riskScore.toFixed(1)}
- Total delay: ${Math.round(r.analysis.totalDelay / 60)} min`).join("\n\n")}

From ${origin.name} to ${destination.name}.

Respond ONLY with valid JSON in this exact shape (no markdown, no explanation):
{
  "routes": [
    {
      "index": 0,
      "score": 85,
      "reason": "brief driver-friendly explanation under 20 words"
    }
  ],
  "recommendation": "one sentence explaining the best overall choice"
}`;

  try {
    const response = await fetch(CLAUDE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();
    const text = data.content?.find((b: any) => b.type === "text")?.text ?? "";
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());

    const alternates: AlternateRoute[] = alternatesWithAnalysis.map((r, i) => {
      const ai = parsed.routes?.find((x: any) => x.index === i) ?? {};
      return {
        distance: r.distance,
        duration: r.duration,
        geometry: r.geometry,
        analysis: r.analysis,
        score: ai.score ?? 50,
        reason: ai.reason ?? "Alternate path",
        timeSaved: Math.max(0, primaryRoute.duration - r.duration),
        timeChange: r.duration - primaryRoute.duration,
        distanceChange: r.distance - primaryRoute.distance,
      };
    });

    return {
      alternates,
      recommendation: parsed.recommendation
        ? { reason: parsed.recommendation }
        : undefined,
    };
  } catch {
    // If AI call fails, fall back to simple scoring so routing still works
    const alternates: AlternateRoute[] = alternatesWithAnalysis.map((r) => {
      const timeDiff = primaryRoute.duration - r.duration;
      const riskImprovement = primaryRoute.analysis.riskScore - r.analysis.riskScore;
      const score = Math.min(100, Math.max(0, 60 + timeDiff / 60 + riskImprovement));
      return {
        distance: r.distance,
        duration: r.duration,
        geometry: r.geometry,
        analysis: r.analysis,
        score: Math.round(score),
        reason: r.analysis.criticalIncidents < primaryRoute.analysis.criticalIncidents
          ? "Fewer incidents than primary route"
          : timeDiff > 0
            ? `Saves ~${Math.round(timeDiff / 60)} min`
            : "Alternative path",
        timeSaved: Math.max(0, timeDiff),
        timeChange: r.duration - primaryRoute.duration,
        distanceChange: r.distance - primaryRoute.distance,
      };
    });

    return { alternates };
  }
}

// ─── useAlternateRoutes ───────────────────────────────────────────────────────

/**
 * Fetches routes from OSRM, analyses incidents on each, then calls Claude
 * to score the alternates and produce a recommendation.
 */
export function useAlternateRoutes(
  origin: Location | null,
  destination: Location | null,
  incidents: RouteIncident[]
) {
  return useMutation<AlternateRoutesResult>({
    mutationFn: async () => {
      if (!origin || !destination) {
        throw new Error("Origin and destination are required");
      }

      // 1. Fetch routes from OSRM
      const osrmRoutes = await fetchOsrmRoutes(origin, destination);
      const [primary, ...alternateRaw] = osrmRoutes;

      // 2. Analyse incidents on primary
      const primaryAnalysis = analyseIncidents(
        primary.geometry.coordinates,
        incidents
      );

      const primaryRoute: Route = {
        distance: primary.distance,
        duration: primary.duration,
        geometry: primary.geometry,
        incidents,
        analysis: primaryAnalysis,
      };

      // 3. Score alternates with AI (gracefully degrades if AI unavailable)
      const { alternates, recommendation } = await scoreAlternatesWithAI(
        primaryRoute,
        alternateRaw,
        incidents,
        origin,
        destination
      );

      return { primaryRoute, alternateRoutes: alternates, recommendation };
    },
  });
}

// ─── TomTom Traffic Incidents ─────────────────────────────────────────────────

interface TomTomIncidentProperties {
  id: string;
  iconCategory: number;
  magnitudeOfDelay: number;
  events?: { description?: string; code?: number }[];
  startTime?: string;
  endTime?: string;
  roadNumbers?: string[];
  delay?: number;
}

interface TomTomFeature {
  type: "Feature";
  geometry: { type: string; coordinates: number[] | number[][] };
  properties: TomTomIncidentProperties;
}

/**
 * Fetches live traffic incidents from the TomTom Traffic API.
 *
 * @param bbox    - [minLng, minLat, maxLng, maxLat]
 * @param apiKey  - TomTom developer API key
 */
export async function fetchTrafficIncidents(
  bbox: [number, number, number, number],
  apiKey: string
): Promise<RouteIncident[]> {
  const [minLng, minLat, maxLng, maxLat] = bbox;

  const data = await ofetch<{ incidents: TomTomFeature[] }>(
    `https://api.tomtom.com/traffic/services/5/incidentDetails`,
    {
      params: {
        key: apiKey,
        bbox: `${minLng},${minLat},${maxLng},${maxLat}`,
        fields:
          "{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description,code},startTime,endTime,roadNumbers,delay}}}",
        language: "en-GB",
        categoryFilter: "0,1,2,3,4,5,6,7,8,9,10,11,14",
        timeValidityFilter: "present",
      },
    }
  );

  return (data.incidents ?? []).map((feature): RouteIncident => {
    const p = feature.properties;
    // Point geometry → direct coords; LineString → use first point
    const coords =
      feature.geometry.type === "Point"
        ? (feature.geometry.coordinates as number[])
        : (feature.geometry.coordinates as number[][])[0];

    return {
      id: p.id,
      type: iconCategoryToType(p.iconCategory),
      severity: p.magnitudeOfDelay ?? 1,
      description:
        p.events?.[0]?.description ?? iconCategoryToType(p.iconCategory),
      location: { lat: coords[1], lng: coords[0] },
      delay: p.delay,
      roadNumbers: p.roadNumbers,
    };
  });
}

function iconCategoryToType(category: number): string {
  const map: Record<number, string> = {
    0: "Unknown",
    1: "Accident",
    2: "Fog",
    3: "Dangerous Conditions",
    4: "Rain",
    5: "Ice",
    6: "Jam",
    7: "Lane Closed",
    8: "Road Closed",
    9: "Road Works",
    10: "Wind",
    11: "Flooding",
    14: "Broken Down Vehicle",
  };
  return map[category] ?? "Incident";
}

// ─── filterIncidentsNearRoute ─────────────────────────────────────────────────

/**
 * Returns only incidents within `radiusDeg` degrees of any point on the route.
 * Degree-based distance is an approximation sufficient for road-level filtering.
 */
export function filterIncidentsNearRoute(
  incidents: RouteIncident[],
  routeCoords: [number, number][],
  radiusDeg: number
): RouteIncident[] {
  return incidents.filter((incident) =>
    routeCoords.some(([lng, lat]) => {
      const dLat = incident.location.lat - lat;
      const dLng = incident.location.lng - lng;
      return Math.sqrt(dLat * dLat + dLng * dLng) <= radiusDeg;
    })
  );
}