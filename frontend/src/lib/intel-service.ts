/**
 * OSINT Intel service for the frontend dashboard.
 * Fetches primary source intel feeds via allorigins.win CORS proxy.
 */

export interface IntelItem {
    id: string;
    headline: string;
    source: string;
    time: string;
    url?: string;
    type: 'gov' | 'cyber' | 'humanitarian' | 'military';
    riskLevel: 'critical' | 'high' | 'medium' | 'info';
    lat?: number;
    lon?: number;
}

const encode = (url: string) => url;

const INTEL_FEEDS = [
    // Govt Defence / Military
    { url: '/api/pib/RssMain.aspx?ModId=6&Lang=1&Regid=3', source: 'PIB DEFENCE', type: 'gov' as const },
    // Cyber Security
    { url: '/api/cert/RSS.jsp', source: 'CERT-IN', type: 'cyber' as const },
    // Humanitarian
    { url: '/api/reliefweb/updates/rss.xml?primary_country=119', source: 'RELIEFWEB', type: 'humanitarian' as const },
    // Strategic/Military via Google News (Indian Region)
    { url: '/api/news/rss/search?q=(Indian+Army+OR+Indian+Navy+OR+IAF+OR+DRDO+OR+LOC+OR+LAC)+when:1d&hl=en-IN&gl=IN&ceid=IN:en', source: 'SOUTH ASIA AGGREGATOR', type: 'military' as const },
    // Global Conflict / Military via Google News (Global)
    { url: '/api/news/rss/search?q=(Iran+Missile+Strike+OR+Tehran+OR+Israel+IDF+OR+Gaza+OR+Ukraine+War+OR+Houthis+Red+Sea)+when:1d&hl=en-US&gl=US&ceid=US:en', source: 'GLOBAL INTEL DESK', type: 'military' as const },
];

function getRiskLevel(title: string, type: string): IntelItem['riskLevel'] {
    const t = title.toLowerCase();
    if (t.includes('critical') || t.includes('vulnerability') || t.includes('attack') || t.includes('strike')) return 'critical';
    if (t.includes('high') || t.includes('warning') || t.includes('alert') || t.includes('breach') || t.includes('ceasefire')) return 'high';
    if (t.includes('update') || t.includes('advisory')) return 'medium';
    return 'info';
}

function getRelativeTime(date: Date): string {
    if (isNaN(date.getTime())) return 'recently';
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

const REGION_MAPPINGS = [
    { keys: ['sri lanka', 'colombo'], lat: 7.8731, lon: 80.7718 },
    { keys: ['isfahan', 'tehran', 'iran', 'iranian'], lat: 32.4279, lon: 53.6880 },
    { keys: ['kabul', 'afghanistan', 'taliban'], lat: 33.9391, lon: 67.7099 },
    { keys: ['islamabad', 'pakistan', 'loc', 'kashmir'], lat: 33.6844, lon: 73.0479 },
    { keys: ['myanmar', 'junta'], lat: 21.9162, lon: 95.9560 },
    { keys: ['yemen', 'houthi', 'red sea', 'gulf of aden'], lat: 15.5527, lon: 48.5164 },
    { keys: ['syria', 'damascus'], lat: 34.8021, lon: 38.9968 },
    { keys: ['sudan'], lat: 12.8628, lon: 30.2176 },
    { keys: ['china', 'lac', 'beijing'], lat: 35.8617, lon: 104.1954 },
    { keys: ['delhi', 'new delhi', 'indian army', 'iaf', 'drdo'], lat: 28.6139, lon: 77.2090 },
    { keys: ['ukraine', 'kyiv', 'russia', 'moscow'], lat: 50.4501, lon: 30.5234 },
    { keys: ['israel', 'gaza', 'hamas', 'tel aviv'], lat: 31.0461, lon: 34.8516 },
];

function extractCoordinates(headline: string): { lat?: number, lon?: number } {
    const text = headline.toLowerCase();
    for (const region of REGION_MAPPINGS) {
        if (region.keys.some(k => text.includes(k))) {
            // Apply slight random jitter so markers don't perfectly stack
            return {
                lat: region.lat + (Math.random() - 0.5) * 1.5,
                lon: region.lon + (Math.random() - 0.5) * 1.5
            };
        }
    }
    return {};
}

function parseRssItems(xml: string, source: string, type: IntelItem['type']): IntelItem[] {
    const items: IntelItem[] = [];
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');
        const elements = doc.querySelectorAll('item');

        let count = 0;
        elements.forEach(el => {
            // Limit to top 5 items per feed to avoid noise
            if (count >= 5) return;
            let title = el.querySelector('title')?.textContent?.trim() ?? '';
            const link = el.querySelector('link')?.textContent?.trim() ?? '';
            const pubDate = el.querySelector('pubDate')?.textContent?.trim() ?? '';

            if (!title) return;

            // Clean up Google News suffix if present
            if (source.includes('AGGREGATOR') || source.includes('GLOBAL')) {
                title = title.replace(/\s+-\s+[^-]+$/, '').trim();
            }

            const risk = getRiskLevel(title, type);
            const timeStr = pubDate ? getRelativeTime(new Date(pubDate)) : 'recently';
            const coords = extractCoordinates(title);

            items.push({
                id: `intel-${Math.random().toString(36).substring(2)}`,
                headline: title,
                source: source,
                time: timeStr,
                url: link || undefined,
                type,
                riskLevel: risk,
                lat: coords.lat,
                lon: coords.lon
            });
            count++;
        });
    } catch (e) {
        console.error(`Failed to parse XML for ${source}`, e);
    }
    return items;
}

async function fetchFeed(feed: typeof INTEL_FEEDS[0]): Promise<IntelItem[]> {
    try {
        const resp = await fetch(encode(feed.url), { signal: AbortSignal.timeout(10_000) });
        const xml = await resp.text();
        if (!xml || xml.includes('Error')) return [];
        return parseRssItems(xml, feed.source, feed.type);
    } catch (err) {
        console.warn(`Failed to fetch ${feed.source}:`, err);
        return [];
    }
}

let cachedIntel: IntelItem[] = [];
let cacheTs = 0;
const CACHE_TTL = 30_000; // Drop cache to 30 seconds for near real-time freshness

export async function fetchLiveIntel(force = false): Promise<IntelItem[]> {
    if (!force && cachedIntel.length > 0 && Date.now() - cacheTs < CACHE_TTL) {
        return cachedIntel;
    }
    const results = await Promise.allSettled(
        INTEL_FEEDS.map(fetchFeed)
    );

    const items = results
        .filter((r): r is PromiseFulfilledResult<IntelItem[]> => r.status === 'fulfilled')
        .flatMap(r => r.value)
        // Sort roughly by risk
        .sort((a, b) => {
            const pA = a.riskLevel === 'critical' ? 3 : a.riskLevel === 'high' ? 2 : a.riskLevel === 'medium' ? 1 : 0;
            const pB = b.riskLevel === 'critical' ? 3 : b.riskLevel === 'high' ? 2 : b.riskLevel === 'medium' ? 1 : 0;
            return pB - pA;
        });

    if (items.length > 0) {
        cachedIntel = items;
        cacheTs = Date.now();
    }
    return items;
}
