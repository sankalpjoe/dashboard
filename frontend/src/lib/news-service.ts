/**
 * Live news service for the frontend dashboard.
 * Uses Google News RSS (no key, CORS-friendly via proxy) for India crisis feeds.
 * Falls back gracefully if fetch fails.
 *
 * Cities:        BANGALORE · DELHI · HYDERABAD · MUMBAI · CHENNAI · KOLKATA
 * Vernacular:    KANNADA · TELUGU · MARATHI · HINDI · TULU (Mangalore/Udupi) · KONKANI (Goa)
 * National:      Hindustan Times · The Hindu · Indian Express · NDTV · Times of India
 * Official:      PIB · MEA · CERT-In · IMD · CPCB · NDMA
 * AI scoring:    Set VITE_GROQ_API_KEY in .env.local to enable enrichment
 *                Model: llama-3.3-70b-versatile (JSON mode, multilingual)
 *
 * Categories: conflict · terrorism · disaster · cyber ·
 *             protest · military · industrial · humanitarian · economic · general
 */

import { isJunk } from './noise-filter';

export interface NewsItem {
    id: string;
    headline: string;
    source: string;
    time: string;
    timestamp: number;
    url?: string;
    city?: string;
    lat?: number;
    lon?: number;
    lang?: string;           // 'en' | 'kn' | 'tu' | 'kon'
    langLabel?: string;      // '[KN]' '[TU]' '[KON]'
    // Original categories for backward compatibility
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
    // Refined monitoring categories
    refinedCategory?:
    | 'war_armed_conflict'          // War & Armed Conflict
    | 'terrorism'                   // Terrorism
    | 'embassy_security_alerts'     // Embassy Security Alerts
    | 'civil_unrest_logistics'      // Civil Unrest & Logistics
    | 'transit_disruptions'         // Transit Disruptions
    | 'climate_natural_disasters'   // Climate & Natural Disasters
    | 'disease_outbreaks'           // Disease Outbreaks
    | 'other';
    // 7-group operational risk taxonomy (see classifyRiskGroup)
    riskGroup?:
    | 'geopolitical_civil'
    | 'mobility_infra'
    | 'aviation_airspace'
    | 'environmental'
    | 'public_health'
    | 'administrative'
    | 'digital_utility';
    severity: number;
    confidence: 'confirmed' | 'unconfirmed';
    // ── Groq / Llama-3-70B enrichment (added after fetch) ───────────────
    sentiment?: number;      // -1.0 (very negative) → 0 (neutral) → +1.0 (positive)
    summary?: string[];      // 3 bullet points from Llama-3-70B
    relevanceScore?: number; // 1-10 from Llama-3-70B; items < 5 are filtered out
    // Groq vetting fields
    groqVetted?: boolean;    // Whether item has been vetted by Groq
    groqQualityScore?: number; // 1-10 quality score from Groq
    groqRejectionReason?: string; // Reason if rejected by Groq
    // Kannada vernacular source tracking
    isKannadaSource?: boolean;
    kannadaConfidence?: number; // 0-1 confidence that source is Kannada vernacular
}

// ---------------------------------------------------------------------------
// Groq / Llama-3-70B — sole enrichment engine
// ---------------------------------------------------------------------------

type EnrichResult = {
    score:     number;   // 1–10 relevance
    headline:  string;   // cleaned/translated English, ≤20 words
    sentiment: number;   // –1.0 … +1.0
    summary:   string[]; // exactly 3 bullet strings
    category?: string;   // optional re-classification
    // Enhanced vetting fields
    refinedCategory?: string; // One of the refined monitoring categories
    qualityScore?: number;    // 1-10 quality assessment
    isGarbage?: boolean;      // Whether item is garbage/noise
    rejectionReason?: string; // Reason if rejected
    isKannadaSource?: boolean; // Whether source is Kannada vernacular
    kannadaConfidence?: number; // 0-1 confidence in Kannada source detection
    localityMatched?: string;  // 18-zone neighbourhood name if locality matched
};

/**
 * Enhanced Groq vetting with refined categories and Kannada source detection.
 *
 * We wrap the response in {"items":[...]} so JSON mode (which requires an
 * object, not an array) can be used for guaranteed valid output.
 */
// Enrichment result from backend

async function enrichWithGroq(items: NewsItem[]): Promise<NewsItem[]> {
    if (items.length === 0) return items;

    try {
        const resp = await fetch('/api/enrichment/news-v2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ headlines: items.map(n => n.headline) }),
            signal: AbortSignal.timeout(45_000),
        });

        if (!resp.ok) {
            console.warn('[NewsService] Enrichment backend failed:', resp.status);
            return items;
        }
        
        const data = await resp.json();
        const enriched: EnrichResult[] = data.items || [];

        return items.map((item, i) => {
            const e = enriched?.[i];
            if (!e) return item;

            return {
                ...item,
                headline: e.headline || item.headline,
                relevanceScore: e.score,
                sentiment: e.sentiment,
                summary: e.summary,
                category: (e.category as any) || item.category,
            };
        });
    } catch (err) {
        console.warn('[NewsService] Enrichment pipeline failed:', err);
        return items;
    }
}

/**
 * Enhanced Groq enrichment pipeline with refined categories, vetting,
 * and 18-zone Bengaluru locality filtering.
 *
 * Sends headlines to Llama in batches, enriches each item with:
 *   • relevanceScore — 1-10 crisis relevance (items < MIN_SCORE filtered out)
 *   • headline       — cleaned/translated English
 *   • sentiment      — threat tone float
 *   • summary        — 3-bullet analysis
 *   • refinedCategory — refined monitoring category
 *   • qualityScore   — 1-10 quality assessment
 *   • isGarbage      — garbage/noise detection
 *   • isKannadaSource — Kannada vernacular source detection
 *   • localityMatched — 18-zone Bengaluru neighbourhood match
 *
 * Post-enrichment: applies strict 18-zone locality filter.
 * Falls back gracefully: if Groq fails for a batch, items pass through unenriched.
 */

// ---------------------------------------------------------------------------
// RSS feed builder helper
// ---------------------------------------------------------------------------
const CORE_SOURCES = [
    // English (National)
    'Times of India', 'The Hindu', 'Hindustan Times', 'Indian Express', 'Economic Times',
    'NDTV', 'Bangalore Mirror', 'Telangana Today',
    // Kannada
    'Vijayavani', 'Vijaya Karnataka', 'Prajavani', 'Udayavani', 'Kannada Prabha',
    // Marathi
    'Lokmat', 'Sakal', 'Maharashtra Times', 'Pudhari', 'Loksatta',
    // Telugu
    'Eenadu', 'Sakshi', 'Andhra Jyothi', 'Namasthe Telangana', 'V6 Velugu',
    // Urdu (Hyderabad)
    'Siasat', 'Munsif', 'Etemaad',
    // Hindi
    'Dainik Bhaskar', 'Dainik Jagran', 'Hindustan', 'Amar Ujala', 'Rajasthan Patrika',
    'Navbharat Times', 'Punjab Kesari',
];

function gnews(query: string, window = '6h', sources?: string[]): string {
    let q = query;
    if (sources && sources.length > 0) {
        const sourceQuery = sources.map(s => `source:${s.replace(/\s+/g, '+')}`).join(' OR ');
        q = `(${query}) (${sourceQuery})`;
    }
    const fullQuery = encodeURIComponent(`${q} when:${window}`);
    const feedUrl = encodeURIComponent(
        `https://news.google.com/rss/search?q=${fullQuery}&hl=en-IN&gl=IN&ceid=IN:en`
    );
    return `/api/rss-proxy?url=${feedUrl}`;
}

// ---------------------------------------------------------------------------
// City feed factory — 9 category feeds per city
// ---------------------------------------------------------------------------
function cityFeeds(city: string): { url: string; category: NewsItem['category'] }[] {
    return [
        { url: gnews(`${city} (war OR conflict OR military OR attack OR border OR ceasefire OR airstrike OR strike OR explosion)`, '1d'), category: 'conflict' },
        { url: gnews(`${city} (terrorist attack OR bomb blast OR IED OR extremist OR militant OR hostage OR insurgent)`, '1d'), category: 'terrorism' },
        { url: gnews(`${city} (disease OR outbreak OR epidemic OR health emergency OR hospital crisis)`, '1d', CORE_SOURCES), category: 'disaster' },
        { url: gnews(`${city} (flood OR earthquake OR cyclone OR disaster OR calamity OR landslide OR wildfire)`, '1d', CORE_SOURCES), category: 'disaster' },
        { url: gnews(`${city} (cyber attack OR data breach OR hacking OR ransomware OR phishing OR CERT-In)`, '1d'), category: 'cyber' },
        { url: gnews(`${city} (protest OR unrest OR riot OR bandh OR curfew OR demonstration OR agitation OR "workers strike" OR "labour strike" OR "trade union")`, '1d'), category: 'protest' },
        { url: gnews(`${city} (chemical spill OR gas leak OR industrial accident OR explosion OR building collapse OR fire)`, '1d', CORE_SOURCES), category: 'industrial' },
        { url: gnews(`${city} (humanitarian OR refugee OR displacement OR trafficking OR ethnic clash OR famine)`, '1d'), category: 'humanitarian' },
        { url: gnews(`${city} (economic crisis OR market crash OR bank OR supply shortage OR fuel crisis OR power outage)`, '1d', CORE_SOURCES), category: 'economic' },
        // ── New risk-group subtypes (Mobility, Aviation, Environment, Health, Admin, Utility) ──
        { url: gnews(`${city} (road closure OR traffic diversion OR metro OR flyover OR bridge construction OR rail strike OR bus strike OR transport strike OR supply chain)`, '1d', CORE_SOURCES), category: 'industrial' },
        { url: gnews(`${city} (airport OR flight grounded OR flights delayed OR flight cancelled OR NOTAM OR air traffic control OR runway closed OR drone OR airspace OR DGCA)`, '1d', CORE_SOURCES), category: 'industrial' },
        { url: gnews(`${city} (cloudburst OR heatwave OR AQI OR air quality OR waterlogging OR urban flooding OR wildfire OR weather warning OR IMD alert)`, '1d', CORE_SOURCES), category: 'disaster' },
        { url: gnews(`${city} (dengue OR cholera OR contamination OR food poisoning OR water contamination OR bio-hazard OR pandemic OR epidemic)`, '1d', CORE_SOURCES), category: 'disaster' },
        { url: gnews(`${city} (VIP movement OR green corridor OR Section 144 OR curfew imposed OR political rally OR summit OR raid OR tax raid OR labour raid)`, '1d', CORE_SOURCES), category: 'protest' },
        { url: gnews(`${city} (power grid OR grid collapse OR power cut OR water supply OR fiber cut OR telecom outage OR internet outage OR ransomware OR data breach)`, '1d', CORE_SOURCES), category: 'cyber' },
        { url: gnews(city, '1d', CORE_SOURCES), category: 'general' },
    ];
}

// ---------------------------------------------------------------------------
// Kannada vernacular source detection
// ---------------------------------------------------------------------------
const KANNADA_SOURCE_KEYWORDS = [
    // Kannada language indicators
    '\u0c95\u0cb0\u0ccd\u0ca8\u0cbe\u0c9f\u0c95', // Karnataka
    '\u0cac\u0cc6\u0c82\u0c97\u0cb3\u0cc2\u0cb0\u0cc1', // Bengaluru
    '\u0cae\u0cc8\u0cb8\u0cc2\u0cb0\u0cc1', // Mysuru
    '\u0cb9\u0cc1\u0cac\u0ccd\u0cac\u0cb3\u0ccd\u0cb3\u0cbf', // Hubballi
    '\u0cae\u0c82\u0c97\u0cb3\u0cc2\u0cb0\u0cc1', // Mangaluru
    '\u0c95\u0ca8\u0ccd\u0ca8\u0ca1', // Kannada
    // Kannada media outlets
    'Vijaya Karnataka',
    'Prajavani',
    'Kannada Prabha',
    'Udayavani',
    'Samyukta Karnataka',
    'Varthabharathi',
    'TV9 Kannada',
    'Public TV',
    'Suvarna News',
    // Regional terms
    'Namma Bengaluru',
    'Bengaluru News',
    'Karnataka News',
    'Local News',
];

/**
 * Detect if a source is likely Kannada vernacular media
 */
function detectKannadaSource(source: string, headline: string): { isKannada: boolean; confidence: number } {
    const text = (source + ' ' + headline).toLowerCase();
    
    // Check for Kannada script characters
    const kannadaScriptRegex = /[\u0C80-\u0CFF]/;
    const hasKannadaScript = kannadaScriptRegex.test(text);
    
    // Check for Kannada keywords
    let keywordMatches = 0;
    for (const keyword of KANNADA_SOURCE_KEYWORDS) {
        if (text.includes(keyword.toLowerCase())) {
            keywordMatches++;
        }
    }
    
    // Calculate confidence
    let confidence = 0;
    if (hasKannadaScript) {
        confidence = 0.9; // High confidence if Kannada script present
    } else if (keywordMatches >= 2) {
        confidence = 0.7; // Medium confidence if multiple keywords
    } else if (keywordMatches === 1) {
        confidence = 0.4; // Low confidence if single keyword
    }
    
    return {
        isKannada: confidence > 0.3,
        confidence
    };
}

// ---------------------------------------------------------------------------
// Vernacular feeds — Kannada (Primary), Konkani (Karnataka Coastal), Tulu
// Pre-compute Kannada URLs to avoid nested backtick syntax errors
// ---------------------------------------------------------------------------
const _kn1 = '/api/rss-proxy?url=' + encodeURIComponent(
    'https://news.google.com/rss/search?q=' +
    encodeURIComponent('\u0cac\u0cc6\u0c82\u0c97\u0cb3\u0cc2\u0cb0\u0cc1 \u0cb8\u0ccd\u0cab\u0ccb\u0c9f \u0caa\u0ccd\u0cb0\u0ca4\u0cbf\u0cad\u0c9f\u0ca8\u0cc6 \u0c95\u0ccd\u0cb0\u0cc8\u0c82 \u0ca6\u0cbe\u0cb3\u0cbf when:1d') +
    '&hl=kn-IN&gl=IN&ceid=IN:kn'
);
const _kn2 = '/api/rss-proxy?url=' + encodeURIComponent(
    'https://news.google.com/rss/search?q=' +
    encodeURIComponent('\u0c95\u0cb0\u0ccd\u0ca8\u0cbe\u0c9f\u0c95 \u0c85\u0caa\u0c98\u0cbe\u0ca4 \u0caa\u0ccd\u0cb0\u0cb5\u0cbe\u0cb9 \u0cac\u0cbf\u0c95\u0ccd\u0c95\u0c9f\u0ccd\u0c9f\u0cc1 when:1d') +
    '&hl=kn-IN&gl=IN&ceid=IN:kn'
);
const _kn3 = '/api/rss-proxy?url=' + encodeURIComponent(
    'https://news.google.com/rss/search?q=' +
    encodeURIComponent('\u0cac\u0cc6\u0c82\u0c97\u0cb3\u0cc2\u0cb0\u0cc1 \u0caa\u0ccd\u0cb0\u0ca4\u0cbf\u0cac\u0ca8\u0ccd\u0ca6\u0ca8\u0cc6 \u0c95\u0ccd\u0cb0\u0cc8\u0c82 \u0ca6\u0cbe\u0cb3\u0cbf when:1d') + // Bengaluru protest
    '&hl=kn-IN&gl=IN&ceid=IN:kn'
);
const _kn4 = '/api/rss-proxy?url=' + encodeURIComponent(
    'https://news.google.com/rss/search?q=' +
    encodeURIComponent('\u0c95\u0cb0\u0ccd\u0ca8\u0cbe\u0c9f\u0c95 \u0c86\u0cb0\u0cbe\u0c95\u0ccd\u0cb7\u0c95 \u0c85\u0caa\u0c98\u0cbe\u0ca4 when:1d') + // Karnataka security incident
    '&hl=kn-IN&gl=IN&ceid=IN:kn'
);
// Additional Kannada URLs
const _kn5 = '/api/rss-proxy?url=' + encodeURIComponent(
    'https://news.google.com/rss/search?q=' +
    encodeURIComponent('\u0cac\u0cc6\u0c82\u0c97\u0cb3\u0cc2\u0cb0\u0cc1 \u0cb8\u0c82\u0c9a\u0cbe\u0cb0 \u0ca8\u0cbf\u0cb0\u0ccd\u0cac\u0c82\u0ca7 \u0cb8\u0cae\u0cb8\u0ccd\u0caf\u0cc6 when:1d') + // Bengaluru traffic issue
    '&hl=kn-IN&gl=IN&ceid=IN:kn'
);
const _kn6 = '/api/rss-proxy?url=' + encodeURIComponent(
    'https://news.google.com/rss/search?q=' +
    encodeURIComponent('\u0cac\u0cc6\u0c82\u0c97\u0cb3\u0cc2\u0cb0\u0cc1 \u0c85\u0caa\u0c98\u0cbe\u0ca4 \u0cac\u0cc6\u0c82\u0c95\u0cbf when:1d') + // Bengaluru accident fire
    '&hl=kn-IN&gl=IN&ceid=IN:kn'
);
const _kn7 = '/api/rss-proxy?url=' + encodeURIComponent(
    'https://news.google.com/rss/search?q=' +
    encodeURIComponent('\u0c95\u0cb0\u0ccd\u0ca8\u0cbe\u0c9f\u0c95 \u0caa\u0ccd\u0cb0\u0c95\u0cc3\u0ca4\u0cbf \u0cb5\u0cbf\u0caa\u0ca4\u0ccd\u0ca4\u0cc1 when:1d') + // Karnataka natural disaster
    '&hl=kn-IN&gl=IN&ceid=IN:kn'
);

const VERNACULAR_FEEDS: { url: string; category: NewsItem['category']; lang: string; langLabel: string; city?: string }[] = [
    // ── Kannada (Primary) — Bangalore/Karnataka crisis terms via Google News kn-IN locale ──
    { url: _kn1, category: 'conflict', lang: 'kn', langLabel: '[KN]', city: 'BANGALORE' },
    { url: _kn2, category: 'disaster', lang: 'kn', langLabel: '[KN]', city: 'BANGALORE' },
    { url: _kn3, category: 'protest', lang: 'kn', langLabel: '[KN]', city: 'BANGALORE' },
    { url: _kn4, category: 'terrorism', lang: 'kn', langLabel: '[KN]', city: 'BANGALORE' },
    { url: _kn5, category: 'general', lang: 'kn', langLabel: '[KN]', city: 'BANGALORE' },
    { url: _kn6, category: 'industrial', lang: 'kn', langLabel: '[KN]', city: 'BANGALORE' },
    { url: _kn7, category: 'disaster', lang: 'kn', langLabel: '[KN]', city: 'BANGALORE' },
    // Additional Kannada English-hybrid sources for comprehensive coverage
    {
        url: gnews('Karnataka OR Bengaluru (flood OR rain OR disaster)', '1d', CORE_SOURCES),
        category: 'disaster', lang: 'kn', langLabel: '[KN]', city: 'BANGALORE',
    },
    {
        url: gnews('Karnataka OR Bengaluru (disease OR outbreak OR health)', '1d', CORE_SOURCES),
        category: 'disaster', lang: 'kn', langLabel: '[KN]', city: 'BANGALORE',
    },
    {
        url: gnews('Bengaluru (traffic jam OR gridlock OR road block OR metro OR BMTC OR KSRTC OR ORR)', '1d', CORE_SOURCES),
        category: 'general', lang: 'kn', langLabel: '[KN]', city: 'BANGALORE',
    },
    {
        url: gnews('Bengaluru (crime OR theft OR robbery OR murder OR police OR arrest OR FIR)', '1d', CORE_SOURCES),
        category: 'conflict', lang: 'kn', langLabel: '[KN]', city: 'BANGALORE',
    },
    {
        url: gnews('Bengaluru OR Karnataka (water shortage OR power cut OR BESCOM OR BWSSB OR garbage OR pothole)', '1d', CORE_SOURCES),
        category: 'economic', lang: 'kn', langLabel: '[KN]', city: 'BANGALORE',
    },
    {
        url: gnews('Bengaluru OR Karnataka (building collapse OR fire accident OR gas leak OR factory)', '1d', CORE_SOURCES),
        category: 'industrial', lang: 'kn', langLabel: '[KN]', city: 'BANGALORE',
    },
    // ── Telugu — Hyderabad/Telangana/Andhra Pradesh ──
    {
        url: gnews('Hyderabad OR Telangana OR "Andhra Pradesh" (flood OR rain OR disaster OR protest OR accident OR blast)', '1d'),
        category: 'general', lang: 'te', langLabel: '[TE]', city: 'HYDERABAD',
    },
    {
        url: gnews('Hyderabad OR Telangana (crime OR riot OR communal OR bandh OR curfew OR attack)', '1d'),
        category: 'conflict', lang: 'te', langLabel: '[TE]', city: 'HYDERABAD',
    },
    {
        url: gnews('Hyderabad (traffic OR metro OR road OR infrastructure OR power OR water)', '1d'),
        category: 'general', lang: 'te', langLabel: '[TE]', city: 'HYDERABAD',
    },
    // ── Marathi — Mumbai/Maharashtra ──
    {
        url: gnews('Mumbai OR Maharashtra (flood OR rain OR building collapse OR train OR local OR protest OR strike)', '1d'),
        category: 'general', lang: 'mr', langLabel: '[MR]', city: 'MUMBAI',
    },
    {
        url: gnews('Mumbai OR Maharashtra (crime OR riot OR communal OR blast OR attack OR accident)', '1d'),
        category: 'conflict', lang: 'mr', langLabel: '[MR]', city: 'MUMBAI',
    },
    {
        url: gnews('Mumbai (traffic OR local train OR metro OR BEST OR infrastructure OR power outage)', '1d'),
        category: 'general', lang: 'mr', langLabel: '[MR]', city: 'MUMBAI',
    },
    // ── Hindi — Delhi/North India ──
    {
        url: gnews('Delhi OR Noida OR Gurugram OR NCR (crime OR protest OR riot OR accident OR blast OR flood OR heatwave)', '1d'),
        category: 'general', lang: 'hi', langLabel: '[HI]', city: 'DELHI',
    },
    {
        url: gnews('Delhi OR NCR (traffic OR metro OR pollution OR AQI OR infrastructure OR power)', '1d'),
        category: 'general', lang: 'hi', langLabel: '[HI]', city: 'DELHI',
    },
    {
        url: gnews('Uttar Pradesh OR Bihar OR Rajasthan (crime OR flood OR disaster OR protest OR accident)', '1d'),
        category: 'general', lang: 'hi', langLabel: '[HI]', city: 'DELHI',
    },
    // ── Tamil — Chennai/Tamil Nadu ──
    {
        url: gnews('Chennai OR "Tamil Nadu" (flood OR rain OR cyclone OR disaster OR accident OR fire OR building collapse)', '1d'),
        category: 'disaster', lang: 'ta', langLabel: '[TA]', city: 'CHENNAI',
    },
    {
        url: gnews('Chennai OR "Tamil Nadu" (crime OR riot OR communal OR protest OR bandh OR strike OR blast OR attack)', '1d'),
        category: 'conflict', lang: 'ta', langLabel: '[TA]', city: 'CHENNAI',
    },
    {
        url: gnews('Chennai (traffic OR metro OR road OR airport OR flight OR power cut OR water supply OR AQI OR infrastructure)', '1d'),
        category: 'general', lang: 'ta', langLabel: '[TA]', city: 'CHENNAI',
    },
];

// ---------------------------------------------------------------------------
// Supported cities
// ---------------------------------------------------------------------------
export const SUPPORTED_CITIES = ['BANGALORE', 'DELHI', 'HYDERABAD', 'MUMBAI', 'CHENNAI'] as const;
export type SupportedCity = typeof SUPPORTED_CITIES[number];

const CITY_FEEDS: Record<SupportedCity, { url: string; category: NewsItem['category'] }[]> = {
    BANGALORE: cityFeeds('Bangalore'),
    DELHI: cityFeeds('Delhi'),
    HYDERABAD: cityFeeds('Hyderabad'),
    MUMBAI: cityFeeds('Mumbai'),
    CHENNAI: cityFeeds('Chennai'),
};

// City centre coordinates for map plotting
export const CITY_COORDS: Record<string, [number, number]> = {
    BANGALORE: [12.9716, 77.5946],
    DELHI: [28.6139, 77.2090],
    MUMBAI: [19.0760, 72.8777],
    HYDERABAD: [17.3850, 78.4867],
    CHENNAI: [13.0827, 80.2707],
    KOLKATA: [22.5726, 88.3639],
};

// ---------------------------------------------------------------------------
// STRICT 5-CITY GEO RESOLVER
// Each article must be attributable to ONE of these 5 cities by its headline
// content. Items that name a foreign / out-of-scope location (and no in-scope
// city) are dropped — this is what stops "San Francisco" style leakage where an
// item is tagged with a city merely because of the feed it came from.
// ---------------------------------------------------------------------------

// City name aliases + state/region terms + signature localities.
// Order matters only for tie-breaks; first city with a hit wins.
const CITY_MATCHERS: { city: SupportedCity; terms: string[] }[] = [
    {
        city: 'BANGALORE',
        terms: [
            'bangalore', 'bengaluru', 'bengaluru city', 'karnataka', 'namma bengaluru',
            'electronic city', 'whitefield', 'koramangala', 'indiranagar', 'hsr layout',
            'marathahalli', 'hebbal', 'yelahanka', 'kr puram', 'mahadevapura', 'bellandur',
            'outer ring road', 'orr', 'devanahalli', 'kempegowda airport', 'bescom', 'bbmp',
            'bwssb', 'bmtc', 'ksrtc', 'majestic', 'mg road bengaluru',
        ],
    },
    {
        city: 'DELHI',
        terms: [
            'delhi', 'new delhi', 'ncr', 'noida', 'gurugram', 'gurgaon', 'ghaziabad',
            'faridabad', 'connaught place', 'dwarka', 'rohini', 'saket', 'igi airport',
            'indira gandhi international', 'lutyens', 'jantar mantar', 'dmrc',
        ],
    },
    {
        city: 'HYDERABAD',
        terms: [
            'hyderabad', 'secunderabad', 'cyberabad', 'telangana', 'hitech city', 'hi-tech city',
            'gachibowli', 'banjara hills', 'jubilee hills', 'madhapur', 'kukatpally',
            'nanakramguda', 'shamshabad', 'rajiv gandhi international', 'ghmc', 'hmda',
            'charminar', 'financial district',
        ],
    },
    {
        city: 'MUMBAI',
        terms: [
            'mumbai', 'bombay', 'maharashtra', 'navi mumbai', 'thane', 'bandra', 'andheri',
            'dadar', 'colaba', 'bkc', 'bandra kurla', 'nariman point', 'cuffe parade',
            'powai', 'borivali', 'churchgate', 'csmt', 'chhatrapati shivaji', 'best bus',
            'mmrda', 'brihanmumbai', 'mahalaxmi', 'worli', 'juhu',
        ],
    },
    {
        city: 'CHENNAI',
        terms: [
            'chennai', 'madras', 'tamil nadu', 'tamilnadu', 't nagar', 't. nagar', 'anna nagar',
            'adyar', 'velachery', 'guindy', 'mylapore', 'marina beach', 'tambaram',
            'meenambakkam', 'chennai international', 'cmda', 'koyambedu', 'omr', 'ecr',
        ],
    },
];

// Out-of-scope locations that commonly leak through loose Google News queries.
// If a headline references any of these AND names no in-scope city, drop it.
const FOREIGN_LOCATION_TERMS = [
    // US
    'san francisco', 'silicon valley', 'new york', 'washington', 'los angeles', 'chicago',
    'texas', 'california', 'seattle', 'boston', 'florida', 'united states', 'u.s.',
    'usa', 'america', 'white house', 'pentagon',
    // Europe
    'london', 'paris', 'berlin', 'brussels', 'madrid', 'rome', 'moscow', 'kyiv', 'kiev',
    'ukraine', 'russia', 'europe', 'germany', 'france', 'united kingdom',
    // Middle East / conflict
    'gaza', 'israel', 'tel aviv', 'iran', 'tehran', 'iraq', 'syria', 'lebanon', 'hezbollah',
    'hamas',
    // South / East Asia (non-India)
    'pakistan', 'islamabad', 'karachi', 'lahore', 'bangladesh', 'dhaka', 'sri lanka',
    'colombo', 'nepal', 'kathmandu', 'china', 'beijing', 'shanghai', 'japan', 'tokyo',
    'singapore', 'dubai', 'abu dhabi', 'doha',
    // Other
    'toronto', 'sydney', 'melbourne', 'canada', 'australia',
];

/**
 * Whole-word match using non-alphanumeric boundaries. This prevents short
 * aliases like "orr" or "ncr" from matching inside unrelated words
 * (e.g. "tomorrow", "corridor", "concrete").
 */
function containsTerm(text: string, term: string): boolean {
    const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
}

/** Detect which of the 5 in-scope cities a headline belongs to, or null. */
export function resolveCityFromText(text: string): SupportedCity | null {
    const t = text.toLowerCase();
    for (const m of CITY_MATCHERS) {
        if (m.terms.some(term => containsTerm(t, term))) return m.city;
    }
    return null;
}

/** True if the headline references an out-of-scope / foreign location. */
export function mentionsForeignLocation(text: string): boolean {
    const t = text.toLowerCase();
    return FOREIGN_LOCATION_TERMS.some(term => containsTerm(t, term));
}

/**
 * STRICT 5-city gate. An item is kept only if it can be tied to one of the 5
 * cities. We trust headline content over the feed it came from:
 *   1. If the headline names an in-scope city → keep & re-tag to that city.
 *   2. Else if it names a foreign location → drop (this kills SF-style leaks).
 *   3. Else fall back to the feed-assigned city ONLY if it is one of the 5.
 * Returns the resolved city, or null if the item should be dropped.
 */
function gateToFiveCities(item: NewsItem): SupportedCity | null {
    const hay = `${item.headline} ${item.source ?? ''}`;
    const fromText = resolveCityFromText(hay);
    if (fromText) return fromText;
    if (mentionsForeignLocation(hay)) return null;
    const tagged = (item.city ?? '').toUpperCase();
    if ((SUPPORTED_CITIES as readonly string[]).includes(tagged)) return tagged as SupportedCity;
    return null;
}

// ---------------------------------------------------------------------------
// 7 RISK-GROUP TAXONOMY (added alongside the existing `category` field)
// ---------------------------------------------------------------------------
export type RiskGroup =
    | 'geopolitical_civil'   // 1. Geopolitical & Civil Threat Matrix
    | 'mobility_infra'       // 2. Mobility & Infrastructure Disruptions
    | 'aviation_airspace'    // 3. Aviation & Airspace Risks
    | 'environmental'        // 4. Environmental & Climate Hazards
    | 'public_health'        // 5. Public Health & Biosecurity
    | 'administrative'       // 6. Administrative & Executive Friction
    | 'digital_utility';     // 7. Digital, Power & Utility Failures

export const RISK_GROUP_LABELS: Record<RiskGroup, string> = {
    geopolitical_civil: 'Geopolitical & Civil',
    mobility_infra: 'Mobility & Infrastructure',
    aviation_airspace: 'Aviation & Airspace',
    environmental: 'Environmental & Climate',
    public_health: 'Public Health',
    administrative: 'Administrative',
    digital_utility: 'Digital, Power & Utility',
};

const RISK_GROUP_KEYWORDS: Record<RiskGroup, string[]> = {
    geopolitical_civil: [
        'war', 'conflict', 'military', 'terror', 'terrorist', 'bomb', 'blast', 'ied',
        'sabotage', 'bomb threat', 'hoax', 'strike', 'protest', 'riot', 'bandh', 'agitation',
        'communal', 'unrest', 'clash', 'active shooter', 'shooting', 'workplace violence',
    ],
    mobility_infra: [
        'road closure', 'road closed', 'traffic diversion', 'traffic jam', 'gridlock',
        'metro', 'bridge', 'flyover', 'construction', 'fuel shortage', 'supply chain',
        'rail strike', 'bus strike', 'transport strike', 'train cancelled', 'cargo', 'logistics',
    ],
    aviation_airspace: [
        'airport', 'flight', 'flights', 'grounded', 'notam', 'air traffic control', 'atc',
        'radar', 'runway', 'drone', 'uav', 'airspace', 'dgca', 'aviation',
    ],
    environmental: [
        'flood', 'waterlogging', 'cloudburst', 'cyclone', 'earthquake', 'heatwave', 'wildfire',
        'aqi', 'air quality', 'weather', 'imd', 'rain', 'storm', 'landslide', 'drought',
    ],
    public_health: [
        'epidemic', 'pandemic', 'outbreak', 'dengue', 'cholera', 'disease', 'virus',
        'contamination', 'food poisoning', 'water contamination', 'bio-hazard', 'biohazard',
        'health emergency', 'quarantine',
    ],
    administrative: [
        'vip movement', 'green corridor', 'section 144', 'curfew', 'political rally', 'summit',
        'raid', 'tax raid', 'labour raid', 'regulatory', 'shutdown order',
    ],
    digital_utility: [
        'power cut', 'power outage', 'grid', 'grid collapse', 'load shedding', 'water supply',
        'fiber cut', 'telecom outage', 'internet outage', 'cyber', 'ransomware', 'data breach',
        'hacking', 'phishing', 'cert-in',
    ],
};

/** Classify a headline into the 7-group taxonomy (best single match, or null). */
export function classifyRiskGroup(headline: string): RiskGroup | null {
    const t = headline.toLowerCase();
    let best: RiskGroup | null = null;
    let bestHits = 0;
    (Object.keys(RISK_GROUP_KEYWORDS) as RiskGroup[]).forEach(g => {
        const hits = RISK_GROUP_KEYWORDS[g].filter(k => t.includes(k)).length;
        if (hits > bestHits) { bestHits = hits; best = g; }
    });
    return best;
}

// ---------------------------------------------------------------------------
// Bangalore 18-neighborhood geofence system
// Each neighborhood gets: centre coords, keyword aliases, and grouping zone
// Uses Haversine distance with 5 km radius for geofence membership
// ---------------------------------------------------------------------------
const BANGALORE_NEIGHBORHOODS: { name: string; lat: number; lon: number; keywords: string[] }[] = [
  { name: '150 Outer Ring Road', lat: 12.9352, lon: 77.6910, keywords: ['outer ring road', 'orr', '150 orr', 'ring road', 'marathahalli bridge', 'mahadevapura orr'] },
  { name: 'Bagalur',             lat: 13.1380, lon: 77.6740, keywords: ['bagalur', 'bagaluru', 'bagalur cross'] },
  { name: 'Bellandur',           lat: 12.9242, lon: 77.6765, keywords: ['bellandur', 'bellanduru', 'bellandur lake'] },
  { name: 'Chikkajala',          lat: 13.2350, lon: 77.6350, keywords: ['chikkajala', 'chikkajala cross'] },
  { name: 'Devanahalli',         lat: 13.2460, lon: 77.7100, keywords: ['devanahalli', 'devanahally', 'kial', 'kempegowda airport', 'devanahalli fort'] },
  { name: 'Electronic City',     lat: 12.8456, lon: 77.6603, keywords: ['electronic city', 'electronics city', 'ecity', 'neotown'] },
  { name: 'Hebbal',              lat: 13.0358, lon: 77.5970, keywords: ['hebbal', 'hebbala', 'hebbal flyover', 'hebbal lake'] },
  { name: 'Hennur',              lat: 13.0320, lon: 77.6420, keywords: ['hennur', 'hennuru', 'hennur road', 'hennur cross'] },
  { name: 'Horamavu',            lat: 13.0160, lon: 77.6620, keywords: ['horamavu', 'horamavu agara', 'horamavu cross'] },
  { name: 'HSR Layout',          lat: 12.9121, lon: 77.6426, keywords: ['hsr layout', 'hsr', 'hsr sector'] },
  { name: 'Indiranagar',         lat: 12.9784, lon: 77.6408, keywords: ['indiranagar', 'indira nagar', 'indiranagar 100ft', 'defence colony'] },
  { name: 'Kadubeesanahalli',    lat: 12.9279, lon: 77.6971, keywords: ['kadubeesanahalli', 'kadubeesana halli', 'kadubisanahalli', 'kadubisan halli'] },
  { name: 'Koramangala',         lat: 12.9279, lon: 77.6271, keywords: ['koramangala', 'koramangla', 'kormangala', 'sony world junction', 'koramangala 5th block'] },
  { name: 'KR Puram',            lat: 13.0073, lon: 77.6958, keywords: ['kr puram', 'k r puram', 'k.r. puram', 'kr puram bridge', 'kr puram railway'] },
  { name: 'Mahadevapura',        lat: 12.9956, lon: 77.6994, keywords: ['mahadevapura', 'mahadevpura', 'mahadevapura orr'] },
  { name: 'Marathahalli',        lat: 12.9591, lon: 77.6974, keywords: ['marathahalli', 'marathalli', 'marathahalli bridge', 'marathahalli orr'] },
  { name: 'Thanisandra',         lat: 13.0580, lon: 77.6320, keywords: ['thanisandra', 'thanisandra road', 'thanisandra main road'] },
  { name: 'Whitefield',          lat: 12.9698, lon: 77.7500, keywords: ['whitefield', 'white field', 'whitefield road', 'whitefield railway'] },
  { name: 'Yelahanka',           lat: 13.1007, lon: 77.5963, keywords: ['yelahanka', 'yelahanka new town', 'yelahanka satellite town', 'yelahanka old town'] },
];

/** Haversine distance in kilometres */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const GEOFENCE_RADIUS_KM = 5;

/** Check if a (lat,lon) falls within 5 km of ANY of the 18 neighbourhood centres */
function isWithinGeofence(lat: number, lon: number): boolean {
  return BANGALORE_NEIGHBORHOODS.some(n => haversineKm(lat, lon, n.lat, n.lon) <= GEOFENCE_RADIUS_KM);
}

/**
 * Check if a headline contains ANY neighbourhood keyword.
 * Also catches compound patterns like "Outer Ring Road near Marathahalli".
 */
function containsNeighbourhoodKeyword(headline: string): boolean {
  const text = headline.toLowerCase();
  for (const n of BANGALORE_NEIGHBORHOODS) {
    for (const kw of n.keywords) {
      if (text.includes(kw)) return true;
    }
  }
  return false;
}

/**
 * STRICT locality filter — item MUST pass AT LEAST ONE of:
 *   1. Headline text contains a neighbourhood keyword
 *   2. Lat/Lon falls within 5 km of a neighbourhood centre
 *   3. Groq enrichment has assigned a matching locality tag
 * If none match → drop the item (it's noise from outside the 18 zones).
 */
function passesLocalityFilter(item: NewsItem): boolean {
  // Text-based keyword match
  if (containsNeighbourhoodKeyword(item.headline)) return true;
  // Coordinate-based geofence
  if (typeof item.lat === 'number' && typeof item.lon === 'number' && isWithinGeofence(item.lat, item.lon)) return true;
  // Source or city already tagged as Bangalore local
  if (item.city === 'BANGALORE' || item.city === 'BENGALURU') return true;
  // Groq-assigned locality (set during enrichment)
  if ((item as any)._localityMatched) return true;
  return false;
}

// Legacy lookup (kept for backward compat — maps lower-case locality to coords)
const BANGALORE_LOCALITY_COORDS: Record<string, [number, number]> = Object.fromEntries(
  BANGALORE_NEIGHBORHOODS.flatMap(n => [
    [n.name.toLowerCase(), [n.lat, n.lon] as [number, number]],
    ...n.keywords.map(k => [k.toLowerCase(), [n.lat, n.lon] as [number, number]]),
  ])
);

function geocodeBangaloreLocality(headline: string): [number, number] | null {
  const text = headline.toLowerCase();
  // Check exact keywords first
  for (const n of BANGALORE_NEIGHBORHOODS) {
    for (const kw of n.keywords) {
      if (text.includes(kw)) return [n.lat, n.lon];
    }
  }
  // Fallback to legacy map lookup
  for (const [locality, coords] of Object.entries(BANGALORE_LOCALITY_COORDS)) {
    if (text.includes(locality)) return coords;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Keyword dictionaries for validation
// ---------------------------------------------------------------------------
const CATEGORY_KEYWORDS: Record<string, string[]> = {
    conflict: [
        'war', 'conflict', 'military', 'attack', 'border', 'ceasefire', 'airstrike', 'missile',
        'bomb', 'blast', 'explosion', 'weapon', 'strike', 'ambush', 'gunfire', 'skirmish',
        'invasion', 'retaliation', 'annexation', 'hostilities', 'shelling', 'siege', 'combat',
        'troops', 'deployment', 'occupation', 'incursion', 'artillery', 'warfare', 'armed',
        'killed', 'deaths', 'casualties', 'dead', 'wounded',
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
        'health emergency', 'casualty', 'fatality', 'evacuation', 'rescue', 'missing', 'collapse',
        'fire', 'accident', 'relief', 'rain', 'blizzard', 'dead', 'killed', 'trapped',
    ],
    cyber: [
        'cyber', 'breach', 'hacking', 'malware', 'ransomware', 'phishing', 'data leak',
        'vulnerability', 'spyware', 'trojan', 'ddos', 'botnet', 'zero-day', 'dark web',
        'identity theft', 'cert-in', 'infrastructure attack', 'server compromise',
        'apt', 'espionage', 'disinformation', 'deepfake', 'election hacking', 'grid attack',
    ],
    protest: [
        'protest', 'unrest', 'riot', 'workers strike', 'general strike', 'labour strike',
        'trade union strike', 'agitation', 'demonstration', 'bandh',
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

// Expanded negative keywords — noise elimination
const NEGATIVE_KEYWORDS = [
    // Entertainment / sports
    'cricket', 'ipl', 'world cup', 'bollywood', 'celebrity', 'movie', 'film', 'entertainment',
    'sports', 'football', 'hockey', 'tennis', 'fashion', 'wedding', 'lifestyle', 'beauty',
    'horoscope', 'recipe', 'cooking', 'travel tips', 'box office', 'oscars', 'grammy',
    'batting', 'bowling', 'wicket', 'match result', 'team india', 'squad', 'tournament',
    'champion', 'trophy', 'player', 'coach', 'batting average', 'goals', 'runs', 'innings',
    'ameesha patel', 'airport sighting', 'spotted at', 'flight cancelled for',
    // Gaming / Anime / Tech consumer
    'anime', 'manga', 'rpg', 'mobile rpg', 'gacha', 'esports', 'video game', 'mobile game',
    'game launch', 'game release', 'game update', 'game event', 'collaboration event',
    'characters join', 'join mobile', 'gaming event', 'dlc', 'patch notes', 'season pass',
    'ign india', 'ign.com', 'gamespot', 'kotaku', 'eurogamer', 'polygon.com',
    'new character', 'playable character', 'skin bundle', 'battle pass', 'crossover event',
    'unlock', 'in-game', 'mobile rpg', 'strategy game', 'open world', 'fps game',
    // Fictional / Daily Soap
    'daily soap', 'tv show', 'episode', 'written update', 'plot twist', 'promo', 'cast of',
    'serial update', 'drama series', 'recap of',
    // Pure politics / opinion (not security-related)
    'opinion poll', 'exit poll', 'party manifesto', 'election rally', 'vote bank', 'bjp rally',
    'congress rally', 'aap rally', 'campaign speech', 'political party', 'mla wins', 'mp wins',
    'lok sabha result', 'assembly election result', 'by-election result', 'cabinet reshuffle',
    'minister inauguration', 'inauguration of', 'foundation stone', 'felicitated', 'congratulations',
    'congratulates', 'award ceremony', 'receives award', 'honoured', 'felicitation',
    // Lifestyle / consumer
    'tips for', 'how to', 'best places', 'top 10', 'review:', 'unboxing', 'smartphone launch',
    'product launch', 'new car', 'automobile', 'fashion week', 'reality show',
    // NOTE: retail/vehicle promo detection moved to the shared noise-filter
    // module (bare brand names like 'ducati' wrongly killed legit items such
    // as "Ducati showroom gutted in fire"). See validateNewsItem below.
    // Markets / finance (non-crisis)
    'sensex closes', 'nifty closes', 'quarterly earnings', 'ipo opens', 'merger announcement',
    'profit rises', 'revenue grows', 'annual report',
    // Financial products / REIT / IPO noise
    'ipo subscribed', 'reit ipo', 'reit', 'subscription', 'oversubscribed', 'bagmane',
    'initial public offering', 'nse', 'bse', 'stock exchange listing', 'share price',
    // International / global events (non-India)
    'ukraine war', 'russia ukraine', 'israel gaza', 'hamas attack', 'hezbollah',
    'nato summit', 'us congress', 'white house', 'pentagon briefing', 'eu parliament',
    'federal reserve', 'wall street', 'dow jones', 'nasdaq', 's&p 500',
    'bundesliga', 'premier league', 'la liga', 'champions league', 'nba finals', 'nfl draft',
    'wimbledon', 'french open', 'us open tennis', 'formula 1', 'f1 grand prix',
    // Additional entertainment
    'award show', 'red carpet', 'music video', 'album release', 'concert tour',
    'reality tv', 'bigg boss', 'kbc winner', 'game show',
    // Astrology / pseudo-news
    'horoscope', 'rashifal', 'numerology', 'vastu', 'astrology prediction',
];

// ---------------------------------------------------------------------------
// Severity scoring
// ---------------------------------------------------------------------------
const SEVERITY_MAP: { keywords: string[]; level: number }[] = [
    { keywords: ['nuclear', 'wmd', 'mass casualty', 'genocide', 'bioweapon', 'chemical weapon'], level: 1 },
    { keywords: ['attack', 'bomb', 'terror', 'blast', 'missile strike', 'invasion', 'airstrike', 'killed', 'dead', 'deaths'], level: 1 },
    { keywords: ['warning', 'cyber', 'clash', 'threat', 'riot', 'dam burst', 'radiation', 'explosion', 'ceasefire'], level: 2 },
    { keywords: ['protest', 'flood', 'fire', 'unrest', 'outbreak', 'gas leak', 'collapse', 'landslide', 'arrested'], level: 3 },
    { keywords: ['accident', 'security', 'pollution', 'strike', 'shutdown', 'shortage', 'delay'], level: 4 },
];

function computeSeverity(headline: string): number {
    const t = headline.toLowerCase();
    for (const { keywords, level } of SEVERITY_MAP) {
        if (keywords.some(k => t.includes(k))) return level;
    }
    return 5;
}

// ---------------------------------------------------------------------------
// Validation — STRICT: must match at least 1 category keyword AND 0 negative keywords
// ---------------------------------------------------------------------------
function validateNewsItem(headline: string, category: NewsItem['category']): boolean {
    const text = headline.toLowerCase();
    // Shared consolidated junk filter first (single source of truth —
    // new drop rules belong in noise-filter.ts).
    if (isJunk(headline)) return false;
    // Block pure noise (news-feed-specific extras)
    if (NEGATIVE_KEYWORDS.some(k => text.includes(k))) return false;
    // Must contain at least one category keyword
    const keywords = CATEGORY_KEYWORDS[category] ?? [];
    if (keywords.length > 0 && !keywords.some(k => text.includes(k))) return false;
    // Block headlines that are purely about IPL/cricket even if category matched
    if (/\b(ipl|t20|odi|test match|runs|wickets?|batting|bowling|boundary)\b/i.test(text)) return false;
    return true;
}

// ---------------------------------------------------------------------------
// Deduplication — remove near-identical headlines (first 60 chars match)
// ---------------------------------------------------------------------------
function deduplicateItems(items: NewsItem[]): NewsItem[] {
    const seen = new Set<string>();
    return items.filter(item => {
        const key = item.headline.toLowerCase().slice(0, 60).replace(/\s+/g, ' ').trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// ---------------------------------------------------------------------------
// RSS Parser
// ---------------------------------------------------------------------------
function parseRssItems(
    xml: string,
    category: NewsItem['category'],
    city?: string,
    lang = 'en',
    langLabel?: string,
): NewsItem[] {
    const items: NewsItem[] = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const elements = doc.querySelectorAll('item');
    let count = 0;

    elements.forEach(el => {
        if (count >= 15) return;
        const title = el.querySelector('title')?.textContent?.trim() ?? '';
        const link = el.querySelector('link')?.textContent?.trim() ?? '';
        const pubDate = el.querySelector('pubDate')?.textContent?.trim() ?? '';
        const source = el.querySelector('source')?.textContent?.trim() ?? 'NEWS';

        if (!title || title.toLowerCase().includes('google')) return;
        // For non-English, skip validation (will translate via Gemini)
        if (lang === 'en' && !validateNewsItem(title, category)) return;

        const pubDateTime = pubDate ? new Date(pubDate).getTime() : Date.now();

        // Freshness: keep up to 24h here; fetchIndiaNews prefers the last 6h
        // and only falls back to older items when the fresh set is thin.
        if (Date.now() - pubDateTime > 24 * 60 * 60 * 1000) return;

        // Detect Kannada vernacular source
        const kannadaDetection = detectKannadaSource(source, title);
        
        items.push({
            id: `rss-${Math.random().toString(36).slice(2)}`,
            headline: cleanTitle(title),
            source: source.toUpperCase().replace(' GOOGLE NEWS', '').trim(),
            time: getRelativeTime(new Date(pubDateTime)),
            timestamp: pubDateTime,
            url: link || undefined,
            city,
            lang,
            langLabel,
            category,
            severity: computeSeverity(title),
            // Confirmed = attributed to a known mainstream outlet; anything
            // else stays unconfirmed. (Previously this was Math.random().)
            confidence: CORE_SOURCES.some(s => source.toLowerCase().includes(s.toLowerCase()))
                ? 'confirmed' : 'unconfirmed',
            // Kannada vernacular source tracking
            isKannadaSource: kannadaDetection.isKannada,
            kannadaConfidence: kannadaDetection.confidence,
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
    lang = 'en',
    langLabel?: string,
): Promise<NewsItem[]> {
    try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(20_000) });
        if (!resp.ok) return [];
        const xml = await resp.text();
        // Only reject actual error payloads, not any feed whose content happens
        // to contain the word "Error" in a headline.
        if (!xml || !xml.includes('<item>')) return [];
        return parseRssItems(xml, category, city, lang, langLabel);
    } catch {
        return [];
    }
}

/** Run fetch tasks in batches so ~100 Google News queries don't fire at once
 *  (which triggers 429 rate-limiting and silently empties the dashboard). */
async function fetchInBatches<T>(
    tasks: (() => Promise<T[]>)[],
    batchSize = 12,
): Promise<T[]> {
    const out: T[] = [];
    for (let i = 0; i < tasks.length; i += batchSize) {
        const settled = await Promise.allSettled(tasks.slice(i, i + batchSize).map(t => t()));
        settled.forEach(r => { if (r.status === 'fulfilled') out.push(...r.value); });
    }
    return out;
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

    // English feeds — city feeds only. Global (cityless) feeds are intentionally
    // excluded: the strict 5-city gate below would drop their items anyway, and
    // skipping the fetch saves bandwidth and enrichment cost.
    const allFeeds = [
        ...SUPPORTED_CITIES.flatMap(city =>
            CITY_FEEDS[city].map(f => ({ ...f, city })),
        ),
    ];

    // Batched (12 at a time) so Google News doesn't 429 the whole refresh.
    let items: NewsItem[] = await fetchInBatches([
        ...allFeeds.map(f => () => fetchRssFeed(f.url, f.category, f.city)),
        ...VERNACULAR_FEEDS.map(f => () => fetchRssFeed(f.url, f.category, f.city, f.lang, f.langLabel)),
    ]);

    // Deduplicate first (reduces token cost)
    items = deduplicateItems(items);

    // Freshness: prefer the last 6 hours, but only when that still leaves a
    // well-populated dashboard — otherwise keep the full 24-hour window.
    const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
    const fresh = items.filter(i => i.timestamp >= sixHoursAgo);
    if (fresh.length >= 40) items = fresh;

    // ── STRICT 5-CITY GEOFENCE ──────────────────────────────────────────────
    // Re-tag each item's city from its actual headline content and drop anything
    // that cannot be tied to Bangalore / Delhi / Hyderabad / Mumbai / Chennai.
    // This is what removes the "San Francisco"-style foreign leakage.
    const before = items.length;
    items = items.reduce<NewsItem[]>((acc, item) => {
        const city = gateToFiveCities(item);
        if (!city) return acc; // out of scope → drop
        acc.push({
            ...item,
            city,
            riskGroup: classifyRiskGroup(item.headline) ?? item.riskGroup,
        });
        return acc;
    }, []);
    console.log(`[NewsService] Geofence: kept ${items.length}/${before} items (5-city scope)`);

    // Sort by recency before enrichment so we enrich the freshest items first
    items = items.sort((a, b) => b.timestamp - a.timestamp);

    // Groq / Llama-3-70B enrichment — filters noise, translates, scores
    // Without VITE_GROQ_API_KEY: items pass through unchanged
    items = await enrichWithGroq(items);

    console.log(`[NewsService] Raw items fetched: ${items.length}`);
    console.log(`[NewsService] Items after dedupe/enrichment: ${items.length}`);

    if (items.length > 0) {
        cachedIndiaNews = items;
        cacheTs = Date.now();
    }

    return cachedIndiaNews;
}

// ── City-filtered news ─────────────────────────────────────────────────────
let cachedCityNews: Record<string, NewsItem[]> = {};
let cityCache: Record<string, number> = {};

export async function fetchCityNews(city: string): Promise<NewsItem[]> {
    const key = city.toUpperCase();
    if (cachedCityNews[key] && Date.now() - (cityCache[key] || 0) < CACHE_TTL) {
        return cachedCityNews[key];
    }
    const all = await fetchIndiaNews();
    const filtered = all.filter(item =>
        !item.city || item.city.toUpperCase() === key || item.city.toUpperCase() === 'INDIA',
    );
    cachedCityNews[key] = filtered;
    cityCache[key] = Date.now();
    return filtered;
}

// ── Breaking headlines (top critical/high items) ───────────────────────────
export async function fetchBreakingHeadlines(): Promise<NewsItem[]> {
    const all = await fetchIndiaNews();
    return all
        .filter(item => item.category === 'conflict' || item.category === 'terrorism' || item.category === 'disaster')
        .slice(0, 10);
}
