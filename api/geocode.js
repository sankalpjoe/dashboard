import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';
import { checkRateLimit } from './_rate-limit.js';

export const config = { runtime: 'edge' };

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const CHROME_UA = 'WorldMonitor/2.0 (https://worldmonitor.app; contact@worldmonitor.app)';

export default async function handler(req) {
    const cors = getCorsHeaders(req, 'GET, OPTIONS');

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: cors });
    }

    if (isDisallowedOrigin(req)) {
        return new Response('Forbidden', { status: 403, headers: cors });
    }

    const rateLimitResult = await checkRateLimit(req, cors);
    if (rateLimitResult) return rateLimitResult;

    const url = new URL(req.url);
    const query = url.searchParams.get('q');
    const countrycodes = url.searchParams.get('countrycodes');
    const viewbox = url.searchParams.get('viewbox');

    if (!query || query.length < 2) {
        return new Response(JSON.stringify({ error: 'Query too short' }), {
            status: 400,
            headers: { ...cors, 'Content-Type': 'application/json' },
        });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
        let searchUrl = `${NOMINATIM_BASE}?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1&accept-language=en`;
        if (countrycodes) searchUrl += `&countrycodes=${encodeURIComponent(countrycodes)}`;
        if (viewbox) searchUrl += `&viewbox=${encodeURIComponent(viewbox)}&bounded=1`;

        const response = await fetch(searchUrl, {
            headers: {
                'User-Agent': CHROME_UA,
                'Accept': 'application/json',
                'Referer': 'https://worldmonitor.app'
            },
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new Error(`Nominatim failed: ${response.status}`);
        }

        const data = await response.json();
        clearTimeout(timeout);

        return new Response(JSON.stringify(data), {
            status: 200,
            headers: {
                ...cors,
                'Content-Type': 'application/json',
                'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600',
            },
        });
    } catch (error) {
        clearTimeout(timeout);
        const isTimeout = error.name === 'AbortError';
        console.error('[geocode] Error:', error);
        return new Response(JSON.stringify({ error: isTimeout ? 'Request timed out' : (error.message || 'Geocoding failed') }), {
            status: isTimeout ? 504 : 502,
            headers: { ...cors, 'Content-Type': 'application/json' },
        });
    }
}
