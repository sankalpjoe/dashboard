import { type IntelItem } from './intel-service';

const SUBREDDITS = ['goldmansachs', 'wallstreetbets', 'investing', 'finance'];

const SEARCH_QUERIES = [
    'Goldman Sachs',
    'David Solomon',
    'John Waldron',
    'Denis Coleman',
    'Kathryn Ruemmler'
];

export async function fetchRedditIntel(): Promise<IntelItem[]> {
    const results: IntelItem[] = [];

    // 1. Fetch from subreddits (Top posts of the month to get high-impact recentish stuff)
    const subredditPromises = SUBREDDITS.slice(0, 6).map(async (sub) => {
        try {
            const res = await fetch(`/api/reddit/r/${sub}/top.json?t=month&limit=15`, {
                headers: { 'User-Agent': 'WorldMonitor/1.0' }
            });
            const data = await res.json();
            return data.data.children
                .filter((c: any) => {
                    const text = (c.data.title + ' ' + (c.data.selftext || '')).toLowerCase();
                    return text.includes('goldman') ||
                        text.includes('david solomon') ||
                        text.includes('john waldron') ||
                        text.includes('denis coleman') ||
                        text.includes('kathryn ruemmler');
                })
                .map((c: any) => ({
                    id: `rd-${c.data.id}`,
                    headline: c.data.title,
                    source: `r/${c.data.subreddit}`,
                    time: getRelativeTime(new Date(c.data.created_utc * 1000)),
                    url: `https://reddit.com${c.data.permalink}`,
                    type: 'cyber',
                    riskLevel: getRiskLevel(c.data.title),
                }));
        } catch (err) {
            console.warn(`Failed to fetch r/${sub}`, err);
            return [];
        }
    });

    // 2. Fetch from comprehensive searches (using relevance to catch those specific posts)
    const query = SEARCH_QUERIES[Math.floor(Date.now() / 60000) % SEARCH_QUERIES.length];

    // Perform both 'new' and 'relevance' searches to balance live alerts and historical context
    const searchTypes = ['new', 'relevance'];
    const searchPromises = searchTypes.map(async (sort) => {
        try {
            const res = await fetch(`/api/reddit/search.json?q=${encodeURIComponent(query)}&sort=${sort}&limit=15`, {
                headers: { 'User-Agent': 'WorldMonitor/1.0' }
            });
            const data = await res.json();
            return data.data.children
                .filter((c: any) => {
                    const text = (c.data.title + ' ' + (c.data.selftext || '')).toLowerCase();
                    return text.includes('goldman') ||
                        text.includes('david solomon') ||
                        text.includes('john waldron') ||
                        text.includes('denis coleman') ||
                        text.includes('kathryn ruemmler');
                })
                .map((c: any) => ({
                    id: `rd-search-${sort}-${c.data.id}`,
                    headline: c.data.title,
                    source: `REDDIT ${sort.toUpperCase()}`,
                    time: getRelativeTime(new Date(c.data.created_utc * 1000)),
                    url: `https://reddit.com${c.data.permalink}`,
                    type: 'cyber',
                    riskLevel: getRiskLevel(c.data.title),
                }));
        } catch (err) {
            console.warn(`Failed reddit ${sort} search for ${query}`, err);
            return [];
        }
    });

    const allResults = await Promise.all([...subredditPromises, ...searchPromises]);
    return allResults.flat();
}

function getRiskLevel(title: string): IntelItem['riskLevel'] {
    const t = title.toLowerCase();
    if (t.includes('scandal') || t.includes('fraud') || t.includes('indicted')) return 'critical';
    if (t.includes('lawsuit') || t.includes('investigation') || t.includes('penalty')) return 'high';
    if (t.includes('backlash') || t.includes('criticism') || t.includes('regulatory') || t.includes('fine')) return 'medium';
    return 'info';
}

function getRelativeTime(date: Date): string {
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}
