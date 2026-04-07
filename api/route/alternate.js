/**
 * AI-Powered Alternate Route Suggester
 * Analyzes incidents and suggests optimal alternate routes
 */

import { getCorsHeaders, isDisallowedOrigin } from '../_cors.js';
import { checkRateLimit } from '../_rate-limit.js';

export const config = { runtime: 'edge' };

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

async function getRoute(from, to, alternatives = 3) {
  const url = `${OSRM_BASE}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&alternatives=${alternatives}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10-second timeout

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout); // Clear timeout if fetch completes before timeout

    if (!res.ok) {
      throw new Error(`Route calculation failed: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    if (data.code !== 'Ok') {
      throw new Error(`No route found: ${data.code} - ${data.message}`);
    }
    return data.routes;
  } catch (error) {
    clearTimeout(timeout); // Ensure timeout is cleared even if an error occurs
    if (error.name === 'AbortError') {
      throw new Error('Route calculation timed out');
    }
    throw error; // Re-throw other errors
  }
}

/**
 * Basic point-to-line distance check to see if an incident is near the route
 */
function isNearRoute(point, geometry, threshold = 0.01) {
  if (!geometry?.coordinates) return false;
  // Simple check: is the point within the bounding box of the route?
  // For production, use a library like @turf/point-to-line-distance
  return geometry.coordinates.some(coord => {
    const dist = Math.sqrt(Math.pow(coord[0] - point.lng, 2) + Math.pow(coord[1] - point.lat, 2));
    return dist < threshold;
  });
}

function analyzeIncidentImpact(route, incidents) {
  let totalDelay = 0;
  let criticalIncidents = 0;
  let affectedSegments = [];

  // Filter incidents that are actually near this specific route
  const relevantIncidents = incidents.filter(inc => {
    if (!inc.location) return false;
    return isNearRoute(inc.location, route.geometry);
  });

  relevantIncidents.forEach(inc => {
    const severity = inc.severity || inc.properties?.magnitudeOfDelay || 1;
    const delay = inc.delay || inc.properties?.delay || 0;

    if (severity >= 3) criticalIncidents++;
    totalDelay += delay;

    affectedSegments.push({
      lat: inc.location.lat,
      lng: inc.location.lng,
      severity,
      delay,
      type: inc.type || 'Congestion'
    });
  });

  return {
    totalDelay,
    criticalIncidents,
    affectedSegments,
    riskScore: (criticalIncidents * 15) + (totalDelay / 60), // minutes
  };
}

function generateAIRecommendation(primaryRoute, allRoutes, incidents) {
  const processedRoutes = allRoutes.map((route, idx) => {
    const analysis = analyzeIncidentImpact(route, incidents);
    const isPrimary = idx === 0;

    const distanceDiff = isPrimary ? 0 : route.distance - allRoutes[0].distance;
    const timeDiff = isPrimary ? 0 : route.duration - allRoutes[0].duration;
    const distanceDiffKm = (distanceDiff / 1000).toFixed(1);
    const timeDiffMin = Math.round(timeDiff / 60);

    // Calculate potential time saved by avoiding incidents vs primary
    const primaryAnalysis = isPrimary ? analysis : analyzeIncidentImpact(allRoutes[0], incidents);
    const potentialTimeSaved = primaryAnalysis.totalDelay - analysis.totalDelay;

    let reason = '';
    let score = 0;

    if (isPrimary) {
      reason = analysis.criticalIncidents > 0 ? `Primary route has ${analysis.criticalIncidents} major incident(s).` : "Primary route is clear.";
      score = analysis.criticalIncidents > 0 ? 40 : 100;
    } else {
      if (analysis.riskScore < primaryAnalysis.riskScore && (potentialTimeSaved / 60) > timeDiffMin) {
        reason = `Bypasses ${primaryAnalysis.criticalIncidents} incident(s). Net saving: ~${Math.round((potentialTimeSaved / 60) - timeDiffMin)} min.`;
        score = 85;
      } else if (timeDiffMin < 0) {
        reason = `Faster by ${Math.abs(timeDiffMin)} minutes.`;
        score = 80;
      } else if (distanceDiff < 0) {
        reason = `Shorter by ${Math.abs(distanceDiffKm)} km.`;
        score = 70;
      } else {
        reason = `Alternative route (+${distanceDiffKm}km, +${timeDiffMin}min).`;
        score = 50;
      }
    }

    return {
      routeIndex: idx,
      isPrimary,
      distance: route.distance,
      duration: route.duration,
      geometry: route.geometry,
      analysis,
      reason,
      score,
      timeSaved: !isPrimary && potentialTimeSaved > 0 ? Math.round(potentialTimeSaved / 60) : null,
      distanceChange: distanceDiff,
      timeChange: timeDiff,
    };
  });

  // Sort alternates by score
  const alternates = processedRoutes.slice(1).sort((a, b) => b.score - a.score);

  const result = {
    primaryRoute: processedRoutes[0],
    alternateRoutes: alternates,
    recommendation: (alternates.length > 0 && alternates[0].score > (processedRoutes[0].score || 0)) ? alternates[0] : null,
  };

  console.log(`[route/alternate] AI Analysis complete. Recommendation: ${result.recommendation ? 'Found' : 'None'}`);
  return result;
}

export default async function handler(req) {
  console.log('[route/alternate] Handler started');
  const cors = getCorsHeaders(req, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  const originHeader = req.headers.get('origin');
  console.log('[route/alternate] Origin:', originHeader);

  if (isDisallowedOrigin(req)) {
    console.error('[route/alternate] Forbidden origin:', originHeader);
    return new Response('Forbidden', { status: 403, headers: cors });
  }

  console.log('[route/alternate] Checking rate limit');
  const rateLimitResult = await checkRateLimit(req, cors);
  if (rateLimitResult) {
    console.error('[route/alternate] Rate limited');
    return rateLimitResult;
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  try {
    let body;
    try {
      body = await req.json();
      console.log('[route/alternate] Received body:', JSON.stringify(body));
    } catch (e) {
      console.error('[route/alternate] JSON parse error:', e);
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const { origin, destination, incidents = [] } = body;

    // Use loose check for 0 coordinates
    if (origin?.lat === undefined || origin?.lng === undefined ||
      destination?.lat === undefined || destination?.lng === undefined) {
      console.error('[route/alternate] Missing coords in body:', { origin, destination });
      return new Response(JSON.stringify({
        error: 'Origin and destination with lat/lng are required',
        received: { origin, destination }
      }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // Get primary route + 2 alternatives
    console.log(`[route/alternate] Requesting OSRM: ${origin.lng},${origin.lat} to ${destination.lng},${destination.lat}`);
    try {
      const routes = await getRoute(origin, destination, 2);

      if (!routes || routes.length === 0) {
        console.error('[route/alternate] OSRM returned empty routes array');
        return new Response(JSON.stringify({ error: 'No routes found between these locations' }), {
          status: 404,
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }

      console.log(`[route/alternate] Found ${routes.length} routes, generating recommendation`);
      const analysis = generateAIRecommendation(routes[0], routes.slice(1), incidents);

      console.log('[route/alternate] Analysis complete, sending 200 OK');
      return new Response(JSON.stringify(analysis), {
        status: 200,
        headers: {
          ...cors,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      });
    } catch (routeError) {
      console.error('[route/alternate] OSRM Error:', routeError.message);
      return new Response(JSON.stringify({
        error: `Routing service error: ${routeError.message}`,
        details: routeError.stack
      }), {
        status: 502, // Bad Gateway
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('[route/alternate] Unexpected Fatal Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
}
