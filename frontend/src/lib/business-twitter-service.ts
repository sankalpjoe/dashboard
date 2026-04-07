import { type IntelItem } from './intel-service';

const TWITTER_BASE = 'http://127.0.0.1:8765';

// Goldman Sachs OSINT search queries to rotate through
const GS_QUERIES = [
    'Goldman Sachs scandal',
    'Goldman Sachs investigation',
    'Goldman Sachs fraud',
    '"Goldman Sachs" penalty OR fine',
    '"David Solomon" Goldman backlash',
    '"John Waldron" Goldman',
    '"Denis Coleman" Goldman',
];

export async function fetchBusinessTwitterFeed(): Promise<IntelItem[]> {
    // Rotate queries to maximize coverage, minimize rate limit hits
    const query = GS_QUERIES[Math.floor(Date.now() / 60000) % GS_QUERIES.length];

    try {
        const res = await fetch(`${TWITTER_BASE}/search?q=${encodeURIComponent(query)}&limit=10`);
        const data = await res.json();

        if (data.error === 'rate_limited') {
            console.warn('[Twitter] Rate limited');
            return [];
        }

        if (data.tweets && Array.isArray(data.tweets)) {
            return data.tweets.map((t: any) => ({
                id: `tw-${t.id || Math.random().toString(36).substring(2)}`,
                headline: t.text || '',
                source: 'X / TWITTER',
                time: 'recently',
                url: `https://twitter.com/x/status/${t.id}`,
                type: 'cyber',
                riskLevel: getRiskLevel(t.text || ''),
            }));
        }

        return [];
    } catch (err) {
        console.error("Failed to fetch Twitter feed", err);
        return [];
    }
}

// High-value OSINT accounts to monitor directly
const OSINT_ACCOUNTS = [
    'GoldmanSachs',
    'DavidSolomon',
    'JohnWaldronGS',
    'SECgov',
    'WSJmarkets',
    'business',
    'FT',
];

export async function fetchBusinessAccountTimelines(): Promise<IntelItem[]> {
    // Stagger account fetches to avoid rate limits
    const results: IntelItem[] = [];
    try {
        for (const handle of OSINT_ACCOUNTS.slice(0, 2)) { // 2 per cycle
            const res = await fetch(`${TWITTER_BASE}/user/${handle}?limit=3`);
            const data = await res.json();

            if (!data.error && data.tweets && Array.isArray(data.tweets)) {
                const mapped = data.tweets.map((t: any) => ({
                    id: `tw-user-${t.id || Math.random().toString(36).substring(2)}`,
                    headline: t.text || '',
                    source: `@${handle} (X)`,
                    time: 'recently',
                    url: `https://twitter.com/${handle}/status/${t.id}`,
                    type: 'cyber',
                    riskLevel: getRiskLevel(t.text || ''),
                }));
                results.push(...mapped);
            }
            await new Promise(r => setTimeout(r, 2000)); // 2s between requests
        }
    } catch (err) {
        console.error("Failed to fetch Twitter timelines", err);
    }
    return results;
}

function getRiskLevel(text: string): IntelItem['riskLevel'] {
    const t = text.toLowerCase();
    if (t.includes('scandal') || t.includes('fraud') || t.includes('indicted')) return 'critical';
    if (t.includes('lawsuit') || t.includes('investigation') || t.includes('penalty')) return 'high';
    if (t.includes('backlash') || t.includes('criticism') || t.includes('regulatory') || t.includes('fine')) return 'medium';
    return 'info';
}
