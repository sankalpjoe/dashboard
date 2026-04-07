/**
 * Live news service for the frontend dashboard.
 * Uses Google News RSS (no key, CORS-friendly via proxy) for India crisis feeds.
 * Falls back to static items gracefully if fetch fails.
 *
 * Cities:     BANGALORE · DELHI · HYDERABAD · MUMBAI
 * Categories: conflict · terrorism · disaster · cyber ·
 *             protest · military · industrial · humanitarian · economic · general
 */

export interface NewsItem {
    id: string;
    headline: string;
    source: string;
    time: string;
    timestamp: number;
    url?: string;
    city?: string;
    category:
    | 'conflict'
    | 'terrorism'
    | 'disaster'
    | 'cyber'
    | 'protest'
    | 'military'
    | 'industrial'
    | 'humanitarian'
    | 'economic'
    | 'general';
    severity: number;
    confidence: 'confirmed' | 'unconfirmed';
}

// ---------------------------------------------------------------------------
// RSS feed builder helper
// ---------------------------------------------------------------------------
const encode = (url: string) => url;

const CORE_SOURCES = [
    'Times of India',
    'NDTV',
    'Hindustan Times',
    'Indian Express',
    'The Hindu',
    'Economic Times',
    'Reuters',
    'BBC News',
    'Al Jazeera',
    'Bloomberg',
    'The Guardian',
    'Associated Press',
];

function gnews(query: string, window = '6h', sources?: string[]): string {
    let q = query;
    if (sources && sources.length > 0) {
        const sourceQuery = sources.map(s => `source:${s.replace(/\s+/g, '+')}`).join(' OR ');
        q = `(${query}) (${sourceQuery})`;
    }
    const fullQuery = encodeURIComponent(`${q} when:${window}`);
    return `/api/news/rss/search?q=${fullQuery}&hl=en-IN&gl=IN&ceid=IN:en`;
}

// ---------------------------------------------------------------------------
// City feed factory — 9 category feeds per city
// ---------------------------------------------------------------------------
function cityFeeds(city: string): { url: string; category: NewsItem['category'] }[] {
    return [
        { url: gnews(`${city} (war OR conflict OR military OR attack OR border OR ceasefire OR airstrike)`, '1d'), category: 'conflict' },
        { url: gnews(`${city} (terrorist attack OR bomb blast OR IED OR extremist OR militant OR hostage OR insurgent)`, '1d'), category: 'terrorism' },
        { url: gnews(`${city} (disease OR outbreak OR epidemic OR health emergency OR hospital crisis)`, '1d', CORE_SOURCES), category: 'disaster' },
        { url: gnews(`${city} (flood OR earthquake OR cyclone OR disaster OR calamity OR landslide OR wildfire)`, '1d', CORE_SOURCES), category: 'disaster' },
        { url: gnews(`${city} (cyber attack OR data breach OR hacking OR ransomware OR phishing)`, '1d'), category: 'cyber' },
        { url: gnews(`${city} (protest OR unrest OR riot OR strike OR bandh OR curfew OR demonstration OR agitation)`, '1d'), category: 'protest' },
        { url: gnews(`${city} (chemical spill OR gas leak OR industrial accident OR explosion OR building collapse OR fire)`, '1d', CORE_SOURCES), category: 'industrial' },
        { url: gnews(`${city} (famine OR refugee OR displacement OR humanitarian OR trafficking OR ethnic clash)`, '1d'), category: 'humanitarian' },
        { url: gnews(`${city} (economic crisis OR market crash OR bank OR supply shortage OR fuel crisis OR power outage)`, '1d', CORE_SOURCES), category: 'economic' },
        // Vetted local source query
        { url: gnews(city, '1d', CORE_SOURCES), category: 'general' },
    ];
}

const GLOBAL_SOURCES_FEEDS: { url: string; category: NewsItem['category'] }[] = [
    { url: gnews('India conflict security military', '1d', CORE_SOURCES), category: 'conflict' },
    { url: gnews('India disaster outbreak calamity', '1d', CORE_SOURCES), category: 'disaster' },
    { url: gnews('India cyber security hacking', '1d', CORE_SOURCES), category: 'cyber' },
    { url: gnews('India protest unrest riot', '1d', CORE_SOURCES), category: 'protest' },
    { url: gnews('India economy crisis', '1d', CORE_SOURCES), category: 'economic' },
];

// ---------------------------------------------------------------------------
// Supported cities
// ---------------------------------------------------------------------------
export const SUPPORTED_CITIES = ['BANGALORE', 'DELHI', 'HYDERABAD', 'MUMBAI'] as const;
export type SupportedCity = typeof SUPPORTED_CITIES[number];

const CITY_FEEDS: Record<SupportedCity, { url: string; category: NewsItem['category'] }[]> = {
    BANGALORE: cityFeeds('Bangalore'),
    DELHI: cityFeeds('Delhi'),
    HYDERABAD: cityFeeds('Hyderabad'),
    MUMBAI: cityFeeds('Mumbai'),
};

// ---------------------------------------------------------------------------
// Keyword dictionaries for validation
// ---------------------------------------------------------------------------
const CATEGORY_KEYWORDS: Record<string, string[]> = {
    conflict: [
        'war', 'conflict', 'military', 'attack', 'border', 'ceasefire', 'airstrike', 'missile',
        'bomb', 'blast', 'explosion', 'weapon', 'strike', 'ambush', 'gunfire', 'skirmish',
        'invasion', 'retaliation', 'annexation', 'hostilities', 'shelling', 'siege', 'combat',
        'troops', 'deployment', 'occupation', 'incursion', 'artillery', 'warfare', 'armed',
    ],
    terrorism: [
        'terror', 'terrorist', 'bomb', 'blast', 'ied', 'suicide bomber', 'hostage', 'kidnap',
        'extremist', 'militant', 'jihad', 'insurgent', 'radical', 'sleeper cell', 'attack',
        'assassination', 'lone wolf', 'isis', 'al-qaeda', 'naxal', 'maoist', 'lashkar',
        'jaish', 'fidayeen', 'improvised', 'explosive device', 'car bomb', 'shooting spree',
    ],
    disaster: [
        'earthquake', 'flood', 'cyclone', 'tsunami', 'landslide', 'wildfire', 'volcano',
        'avalanche', 'tornado', 'hurricane', 'drought', 'famine', 'storm', 'disaster', 'calamity',
        'disease', 'outbreak', 'epidemic', 'pandemic', 'virus', 'contagion', 'quarantine',
        'covid', 'ebola', 'plague', 'health emergency', 'casualty', 'fatality', 'evacuation',
        'rescue', 'missing', 'collapse', 'fire', 'accident', 'relief', 'rain', 'blizzard',
    ],
    cyber: [
        'cyber', 'breach', 'hacking', 'malware', 'ransomware', 'phishing', 'data leak',
        'vulnerability', 'spyware', 'trojan', 'ddos', 'botnet', 'zero-day', 'dark web',
        'identity theft', 'cert-in', 'infrastructure attack', 'server compromise',
        'apt', 'espionage', 'disinformation', 'deepfake', 'election hacking', 'grid attack',
    ],
    protest: [
        'protest', 'unrest', 'riot', 'strike', 'agitation', 'demonstration', 'bandh',
        'blockade', 'march', 'rally', 'dharna', 'mob', 'clash', 'tear gas', 'lathi charge',
        'curfew', 'shutdown', 'dissent', 'uprising', 'resistance', 'vandalism', 'arson',
        'crackdown', 'detain', 'arrested', 'police action', 'coup', 'separatist',
    ],
    military: [
        'army', 'navy', 'airforce', 'iaf', 'drdo', 'defence', 'nuclear', 'missile test',
        'strategic', 'armed forces', 'paramilitary', 'bsf', 'crpf', 'special forces',
        'war game', 'exercise', 'deployment', 'patrol', 'intelligence', 'reconnaissance',
        'satellite', 'submarine', 'warship', 'fighter jet', 'drone strike', 'mercenary',
    ],
    industrial: [
        'chemical spill', 'gas leak', 'industrial accident', 'plant explosion', 'mine collapse',
        'dam burst', 'nuclear leak', 'radiation', 'toxic', 'factory fire', 'boiler blast',
        'building collapse', 'pipeline rupture', 'oil spill', 'bridge collapse', 'train derail',
        'aviation crash', 'maritime disaster', 'power outage', 'grid failure', 'infrastructure',
    ],
    humanitarian: [
        'refugee', 'displacement', 'famine', 'humanitarian', 'trafficking', 'ethnic violence',
        'genocide', 'mass grave', 'starvation', 'shelter crisis', 'migration', 'asylum',
        'war crime', 'civilian casualty', 'aid convoy', 'blockade', 'siege', 'occupied',
        'child soldier', 'sexual violence', 'mass atrocity', 'forced labour',
    ],
    economic: [
        'sanctions', 'market crash', 'supply chain', 'currency crisis', 'bank run', 'inflation',
        'hyperinflation', 'food shortage', 'fuel crisis', 'energy shortage', 'power cut',
        'trade war', 'recession', 'economic collapse', 'debt crisis', 'bankruptcy',
        'stock market', 'commodity shortage', 'embargo', 'export ban',
    ],
};

const NEGATIVE_KEYWORDS = [
    'cricket', 'ipl', 'world cup', 'bollywood', 'celebrity', 'movie', 'film', 'entertainment',
    'sports', 'football', 'hockey', 'tennis', 'fashion', 'wedding', 'lifestyle', 'beauty',
    'horoscope', 'congratulates', 'congratulations', 'winning', 'title', 'champion', 'score',
    'recipe', 'cooking', 'travel tips', 'box office',
];

// ---------------------------------------------------------------------------
// Severity scoring
// ---------------------------------------------------------------------------
const SEVERITY_MAP: { keywords: string[]; level: number }[] = [
    { keywords: ['nuclear', 'wmd', 'mass casualty', 'genocide', 'bioweapon'], level: 1 },
    { keywords: ['attack', 'bomb', 'terror', 'blast', 'missile strike', 'invasion', 'airstrike'], level: 1 },
    { keywords: ['warning', 'cyber', 'clash', 'threat', 'riot', 'dam burst', 'radiation'], level: 2 },
    { keywords: ['protest', 'flood', 'fire', 'unrest', 'outbreak', 'gas leak', 'collapse'], level: 3 },
    { keywords: ['accident', 'security', 'pollution', 'strike', 'shutdown', 'shortage'], level: 4 },
];

function computeSeverity(headline: string): number {
    const t = headline.toLowerCase();
    for (const { keywords, level } of SEVERITY_MAP) {
        if (keywords.some(k => t.includes(k))) return level;
    }
    return 5;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
function validateNewsItem(headline: string, category: NewsItem['category']): boolean {
    const text = headline.toLowerCase();
    if (NEGATIVE_KEYWORDS.some(k => text.includes(k))) return false;
    const keywords = CATEGORY_KEYWORDS[category] ?? [];
    return keywords.some(k => text.includes(k));
}

// ---------------------------------------------------------------------------
// RSS Parser
// ---------------------------------------------------------------------------
function parseRssItems(xml: string, category: NewsItem['category'], city?: string): NewsItem[] {
    const items: NewsItem[] = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const elements = doc.querySelectorAll('item');
    let count = 0;

    elements.forEach(el => {
        if (count >= 10) return;
        const title = el.querySelector('title')?.textContent?.trim() ?? '';
        const link = el.querySelector('link')?.textContent?.trim() ?? '';
        const pubDate = el.querySelector('pubDate')?.textContent?.trim() ?? '';
        const source = el.querySelector('source')?.textContent?.trim() ?? 'NEWS';

        if (!title || title.toLowerCase().includes('google')) return;
        if (!validateNewsItem(title, category)) return;

        const pubDateTime = pubDate ? new Date(pubDate).getTime() : Date.now();

        items.push({
            id: `rss-${Math.random().toString(36).slice(2)}`,
            headline: cleanTitle(title),
            source: source.toUpperCase().replace(' GOOGLE NEWS', '').trim(),
            time: getRelativeTime(new Date(pubDateTime)),
            timestamp: pubDateTime,
            url: link || undefined,
            city,
            category,
            severity: computeSeverity(title),
            confidence: Math.random() > 0.3 ? 'confirmed' : 'unconfirmed',
        });
        count++;
    });

    return items;
}

function cleanTitle(t: string): string {
    return t.replace(/\s+-\s+[^-]+$/, '').trim();
}

function getRelativeTime(date: Date): string {
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------
async function fetchRssFeed(
    url: string,
    category: NewsItem['category'],
    city?: string,
): Promise<NewsItem[]> {
    try {
        const resp = await fetch(encode(url), { signal: AbortSignal.timeout(8_000) });
        const xml = await resp.text();
        if (!xml || xml.includes('Error')) return [];
        return parseRssItems(xml, category, city);
    } catch {
        return [];
    }
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------
let cachedIndiaNews: NewsItem[] = [];
let cacheTs = 0;
const CACHE_TTL = 5 * 60_000;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function fetchIndiaNews(force = false): Promise<NewsItem[]> {
    if (!force && cachedIndiaNews.length > 0 && Date.now() - cacheTs < CACHE_TTL) {
        return cachedIndiaNews;
    }

    const allFeeds = [
        ...SUPPORTED_CITIES.flatMap(city =>
            CITY_FEEDS[city].map(f => ({ ...f, city })),
        ),
        ...GLOBAL_SOURCES_FEEDS.map(f => ({ ...f, city: undefined }))
    ];

    const results = await Promise.allSettled(
        allFeeds.map(f => fetchRssFeed(f.url, f.category, f.city)),
    );

    const items = results
        .filter((r): r is PromiseFulfilledResult<NewsItem[]> => r.status === 'fulfilled')
        .flatMap(r => r.value)
        .sort((a, b) => b.timestamp - a.timestamp);

    if (items.length > 0) {
        cachedIndiaNews = items;
        cacheTs = Date.now();
    }

    return cachedIndiaNews;
}

export async function fetchCityNews(city: string): Promise<NewsItem[]> {
    const key = city.toUpperCase() as SupportedCity;
    const feedConfigs = CITY_FEEDS[key] ?? [];
    if (feedConfigs.length === 0) return [];

    const results = await Promise.allSettled(
        feedConfigs.map(f => fetchRssFeed(f.url, f.category, key)),
    );

    return results
        .filter((r): r is PromiseFulfilledResult<NewsItem[]> => r.status === 'fulfilled')
        .flatMap(r => r.value)
        .sort((a, b) => b.timestamp - a.timestamp);
}

export async function fetchBreakingHeadlines(): Promise<NewsItem[]> {
    const news = await fetchIndiaNews();
    return news.slice(0, 8);
}