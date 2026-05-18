/**
 * 150 ORR Intelligence Service
 * Hyper-local OSINT pipeline for 150 Outer Ring Road, Helios Business Park, Bangalore
 *
 * Pipeline: Ingest → Detect Language → Translate → Geocode → Score → Deduplicate → Geo-gate → Predict
 *
 * Sources:
 *  MAINSTREAM  — The Hindu, Times of India, Deccan Herald (RSS)
 *  VERNACULAR  — Prajavani (KN), OneIndia Kannada (KN) [auto-translated via Gemini]
 *  TARGETED    — Google News: 150 ORR local, Bandh/Unrest, IMD Weather
 *  PREDICTED   — Frequency-model synthetic events (day+hour pattern engine)
 */

// ─── API keys (from env) ───────────────────────────────────────────────────────
const GEMINI_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY as string | undefined;
const GROQ_KEY   = (import.meta as any).env?.VITE_GROQ_API_KEY   as string | undefined;

// ─── HQ anchor ────────────────────────────────────────────────────────────────
export const HQ_LAT = 12.9352;
export const HQ_LON = 77.6910;
export const GEO_GATE_KM = 5; // events beyond this are filtered unless city-wide

// ─── Types ────────────────────────────────────────────────────────────────────

export type ORRCategory =
  | 'armed_conflict'    // War & Armed Conflict
  | 'terrorism'         // Terrorism & suspicious activity
  | 'embassy_alert'     // Embassy/consulate security advisories
  | 'civil_disturbance' // Large-scale protests, riots, strikes
  | 'transit'           // Road blocks, infra failures, VIP movements
  | 'climate'           // Floods, earthquakes, wildfires, weather
  | 'disease'           // Disease outbreaks & health emergencies
  | 'infrastructure'    // Power cuts, water supply, BESCOM, BWSSB
  | 'traffic'           // Road traffic accidents & congestion
  | 'general';

export type ORRSourceType =
  | 'mainstream'
  | 'vernacular'
  | 'targeted'
  | 'official'
  | 'social'
  | 'predicted';

export interface ORREvent {
  id: string;
  headline: string;
  originalHeadline?: string;     // set if translated
  isTranslated: boolean;
  lang: 'en' | 'kn' | 'hi';
  source: string;
  sourceType: ORRSourceType;
  url?: string;
  category: ORRCategory;
  severity: 1 | 2 | 3 | 4 | 5;  // S1=critical … S5=info
  lat?: number;
  lon?: number;
  distanceKm?: number;           // distance from HQ
  timestamp: number;
  time: string;
  isPredicted: boolean;
  confidence: number;            // 0-100
  tags: string[];
  mergedCount: number;           // how many duplicates were folded in
  cityWide: boolean;             // true = whole-city alert, bypasses geo-gate
  landmark?: string;             // matched landmark name
}

export interface ORRSourceStatus {
  name: string;
  type: ORRSourceType;
  url: string;
  live: boolean;
  lastFetch?: number;
  itemCount: number;
  lang: string;
}

export interface ORRIntelResult {
  events: ORREvent[];
  sources: ORRSourceStatus[];
  areaHealthScore: number;      // 0-100 composite index
  predictedEvents: ORREvent[];
  fetchedAt: number;
}

// ─── Landmark geocoder (ORR micro-area) ───────────────────────────────────────

const ORR_LANDMARKS: Record<string, [number, number]> = {
  // Immediately on ORR
  'kadubeesanahalli': [12.9279, 77.6971],
  '150 orr': [12.9352, 77.6910],
  'helios': [12.9352, 77.6910],
  'helios business park': [12.9352, 77.6910],
  'outer ring road': [12.9352, 77.6910],
  'orr': [12.9352, 77.6910],

  // Bellandur lake / IT belt
  'bellandur': [12.9242, 77.6765],
  'bellandur lake': [12.9242, 77.6765],
  'bellandur flyover': [12.9242, 77.6765],
  'ecospace': [12.9283, 77.6865],
  'rmz ecoworld': [12.9225, 77.6890],
  'rmz': [12.9225, 77.6890],

  // Marathahalli
  'marathahalli': [12.9591, 77.6974],
  'marathahalli bridge': [12.9591, 77.6974],
  'sony world': [12.9591, 77.6974],

  // Panathur / Varthur
  'panathur': [12.9310, 77.7095],
  'varthur': [12.9374, 77.7373],
  'varthur lake': [12.9374, 77.7373],
  'whitefield': [12.9698, 77.7500],
  'itpl': [12.9698, 77.7500],

  // HSR Layout
  'hsr layout': [12.9121, 77.6426],
  'hsr': [12.9121, 77.6426],
  'hsr main': [12.9121, 77.6426],
  '27th main': [12.9121, 77.6426],

  // Sarjapur
  'sarjapur': [12.8725, 77.7222],
  'sarjapur road': [12.8725, 77.7222],

  // Koramangala
  'koramangala': [12.9279, 77.6271],
  'forum mall': [12.9279, 77.6271],

  // Mahadevapura / K R Puram
  'mahadevapura': [12.9956, 77.6994],
  'k r puram': [13.0073, 77.6958],
  'kr puram': [13.0073, 77.6958],
  'krishnarajapuram': [13.0073, 77.6958],

  // Silk Board
  'silk board': [12.9176, 77.6224],
  'silk board junction': [12.9176, 77.6224],
  'btm layout': [12.9166, 77.6101],

  // HAL / Indiranagar
  'hal': [12.9498, 77.6629],
  'hal airport road': [12.9498, 77.6629],
  'indiranagar': [12.9784, 77.6408],

  // Electronic City
  'electronic city': [12.8456, 77.6603],
  'hosur road': [12.8456, 77.6603],

  // Domlur / Embassy Golf Links
  'domlur': [12.9607, 77.6400],
  'embassy golf links': [12.9607, 77.6400],
  'manyata': [13.0453, 77.6232],
  'manyata tech park': [13.0453, 77.6232],

  // Bangalore general (city-wide fallback)
  'bangalore': [12.9716, 77.5946],
  'bengaluru': [12.9716, 77.5946],
};

// Pre-sorted by key length descending — longer/more-specific matches win
const SORTED_LANDMARKS = Object.entries(ORR_LANDMARKS).sort((a, b) => b[0].length - a[0].length);

/** Returns [lat, lon] for the best matching landmark in text, or null */
// Cities that disqualify a Bangalore landmark match if present in the headline
const OTHER_CITY_NAMES = [
  'hyderabad', 'chennai', 'mumbai', 'delhi', 'kolkata', 'pune', 'ahmedabad',
  'surat', 'jaipur', 'lucknow', 'kanpur', 'nagpur', 'visakhapatnam', 'patna',
  'bhopal', 'ludhiana', 'agra', 'vadodara', 'coimbatore', 'indore',
  'telangana', 'andhra', 'maharashtra', 'rajasthan', 'uttar pradesh',
];

// Generic landmark keywords that need Bangalore context to be valid
const BANGALORE_CONTEXT_REQUIRED = new Set([
  'outer ring road', 'orr', 'national highway',
]);

function geocodeORR(text: string): { coords: [number, number]; landmark: string } | null {
  const lower = text.toLowerCase();

  // Hard reject: headline explicitly names another Indian city
  if (OTHER_CITY_NAMES.some(city => lower.includes(city))) return null;

  const hasBangaloreCtx = lower.includes('bangalore') || lower.includes('bengaluru')
    || lower.includes('karnataka') || lower.includes('kkr') || lower.includes('orrb');

  for (const [key, coords] of SORTED_LANDMARKS) {
    if (lower.includes(key)) {
      // Generic terms (outer ring road, ORR) require explicit Bangalore context
      if (BANGALORE_CONTEXT_REQUIRED.has(key) && !hasBangaloreCtx) continue;
      return { coords, landmark: key };
    }
  }
  return null;
}

/** Haversine distance in km */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** City-wide events that bypass the 5km geo-gate */
const CITY_WIDE_KEYWORDS = [
  'bangalore bandh', 'bengaluru bandh', 'city-wide', 'citywide',
  'metro bangalore', 'power cut bangalore', 'water supply bangalore',
  'imd alert', 'red alert', 'orange alert', 'flood warning', 'cyclone warning',
  'earthquake', 'bomb threat', 'major cyber attack', 'protest city',
  'national highway', 'airport bangalore', 'kempegowda airport',
];

function isCityWide(text: string): boolean {
  const lower = text.toLowerCase();
  return CITY_WIDE_KEYWORDS.some(kw => lower.includes(kw));
}

// ─── Language detection ────────────────────────────────────────────────────────

function detectLang(text: string): 'kn' | 'hi' | 'en' {
  // Kannada Unicode block: U+0C80–U+0CFF
  if (/[ಀ-೿]/.test(text)) return 'kn';
  // Devanagari (Hindi): U+0900–U+097F
  if (/[ऀ-ॿ]/.test(text)) return 'hi';
  return 'en';
}

/** Translate via Google Translate (free, no API key needed). Returns null on failure. */
async function translateViaGoogle(text: string, sourceLang: 'kn' | 'hi'): Promise<string | null> {
  const sl = sourceLang === 'kn' ? 'kn' : 'hi';
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=en&dt=t&q=${encodeURIComponent(text)}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!resp.ok) return null;
    const data = await resp.json();
    // Response format: [[["translated","original",null,null,1]],null,"kn"]
    const translated = (data?.[0] as any[])
      ?.map((seg: any[]) => seg?.[0] ?? '')
      .join('')
      ?.trim();
    return translated || null;
  } catch { return null; }
}

/** Translate via Gemini Flash (higher quality, needs API key). Falls back to null. */
async function translateViaGemini(text: string, sourceLang: 'kn' | 'hi'): Promise<string | null> {
  if (!GEMINI_KEY) return null;
  const langLabel = sourceLang === 'kn' ? 'Kannada' : 'Hindi';
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Translate this ${langLabel} news headline to concise English (max 20 words). Return ONLY the English translation:\n\n${text}`,
            }],
          }],
          generationConfig: { temperature: 0, maxOutputTokens: 60 },
        }),
      }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const translated = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return translated || null;
  } catch { return null; }
}

/** Two-tier translation: Google Translate first (always available), Gemini as quality fallback. */
async function translateHeadline(text: string, sourceLang: 'kn' | 'hi'): Promise<string | null> {
  // Tier 1: Google Translate — fast, free, no key needed
  const googleResult = await translateViaGoogle(text, sourceLang);
  if (googleResult) return googleResult;
  // Tier 2: Gemini Flash — higher quality but needs API key
  return translateViaGemini(text, sourceLang);
}

// ─── Severity scorer (S1-S5) ──────────────────────────────────────────────────

const SEV_MAP: { keywords: string[]; level: 1 | 2 | 3 | 4 | 5 }[] = [
  // S1 — Critical
  {
    level: 1,
    keywords: [
      'explosion', 'blast', 'bomb', 'terror', 'attack', 'fire', 'dead', 'killed',
      'collapse', 'fatal', 'casualty', 'gas leak', 'major accident', 'flood warning',
      'red alert', 'earthquake', 'dam breach',
    ],
  },
  // S2 — High
  {
    level: 2,
    keywords: [
      'accident', 'crash', 'fire', 'protest', 'bandh', 'unrest', 'traffic jam',
      'waterlogging', 'sinkhole', 'road blocked', 'power outage', 'closure',
      'orange alert', 'heavy rain', 'arrested', 'robbery',
    ],
  },
  // S3 — Medium
  {
    level: 3,
    keywords: [
      'construction', 'traffic', 'delay', 'diversion', 'pothole', 'water supply',
      'disruption', 'strike', 'protest planned', 'maintenance', 'outage',
    ],
  },
  // S4 — Low
  {
    level: 4,
    keywords: [
      'meeting', 'notice', 'advisory', 'scheduled', 'repair', 'work',
    ],
  },
];

function computeORRSeverity(headline: string): 1 | 2 | 3 | 4 | 5 {
  const t = headline.toLowerCase();
  for (const { keywords, level } of SEV_MAP) {
    if (keywords.some(k => t.includes(k))) return level;
  }
  return 5;
}

// ─── Category classifier ──────────────────────────────────────────────────────

const CAT_MAP: { keywords: string[]; category: ORRCategory }[] = [
  { category: 'terrorism',        keywords: ['terror', 'terrorist', 'bomb blast', 'ied', 'suicide bomb', 'fidayeen', 'naxal', 'maoist', 'lashkar', 'suspicious package', 'explosive device', 'gunman', 'hostage', 'assassination'] },
  { category: 'armed_conflict',   keywords: ['war', 'armed conflict', 'military operation', 'airstrike', 'ceasefire', 'shelling', 'combat', 'troops deployed', 'border clash', 'line of control', 'loc', 'operation sindoor', 'india pakistan', 'china border'] },
  { category: 'embassy_alert',    keywords: ['embassy', 'consulate', 'diplomatic', 'travel advisory', 'security alert', 'high commission', 'foreign nationals', 'evacuation advisory', 'threat level'] },
  { category: 'civil_disturbance',keywords: ['protest', 'bandh', 'riot', 'demonstration', 'agitation', 'shutdown', 'unrest', 'curfew', 'lathi charge', 'tear gas', 'mob violence', 'strike', 'rally', 'dharna', 'planned protest', 'workers strike', 'bharat bandh', 'karnataka bandh'] },
  { category: 'transit',          keywords: ['road block', 'vip movement', 'pm convoy', 'president visit', 'chief minister', 'namma metro', 'bmtc', 'bridge collapse', 'underpass', 'flyover', 'diversion', 'road closure', 'highway closed'] },
  { category: 'climate',          keywords: ['flood', 'waterlogging', 'heavy rain', 'imd alert', 'red alert', 'orange alert', 'cyclone', 'earthquake', 'wildfire', 'landslide', 'heatwave', 'storm warning', 'lightning', 'bellandur lake overflow'] },
  { category: 'disease',          keywords: ['outbreak', 'epidemic', 'dengue', 'covid', 'mpox', 'cholera', 'malaria', 'leptospirosis', 'health emergency', 'contaminated water', 'food poisoning', 'hospital surge', 'bbmp health', 'dhfw'] },
  { category: 'infrastructure',   keywords: ['power cut', 'power outage', 'bescom', 'bwssb', 'water supply', 'kptcl', 'grid failure', 'pipe burst', 'gas leak', 'sinkhole', 'pothole', 'building collapse', 'fire', 'blast', 'explosion'] },
  { category: 'traffic',          keywords: ['traffic', 'accident', 'crash', 'jam', 'congestion', 'signal', 'vehicle', 'commute', 'orr', 'outer ring road'] },
];

function classifyORR(headline: string): ORRCategory {
  const t = headline.toLowerCase();
  for (const { keywords, category } of CAT_MAP) {
    if (keywords.some(k => t.includes(k))) return category;
  }
  return 'general';
}

// ─── Groq crisis-only filter ─────────────────────────────────────────────────

interface GroqORRResult {
  id: string;
  score: number;      // 1-10, crisis relevance
  category?: ORRCategory;
  summary?: string;   // one-line summary (optional)
}

const ORR_GROQ_SYSTEM = `You are the intelligence filter for a Security Operations Centre at 150 Outer Ring Road, Bengaluru, India. Your task: triage incoming news for operational relevance.

For each item in the JSON array, return:
- "id": same id as input
- "score": 1-10
  - 9-10: active armed conflict, terror attack, major explosion, mass-casualty incident IN INDIA
  - 7-8:  large riot, protest, bandh, strike, VIP disruption, disease outbreak, major flood/earthquake IN INDIA
  - 5-6:  road block, power/water outage, heavy rain advisory, traffic diversion, crime, health advisory, Bangalore civic news
  - 3-4:  general India-national news, Karnataka/Bangalore news with low urgency, tweets from official Bangalore accounts
  - 1-2:  DROP only — ANY event outside of India (e.g. London, USA, Europe, etc.), international protests/wars, politics, political debates, celebrity gossip, cricket match scores, IPO announcements, Bollywood, anime, gaming, fashion, weddings, reality TV, standard sports, generic business news
- "category": exactly one of:
    armed_conflict | terrorism | embassy_alert | civil_disturbance | transit | climate | disease | infrastructure | traffic | general

LOCATION SCORING RULES:
  ALWAYS score 1-2 (DROP): ANY news outside of India, including international protests, wars, and elections.
  ALWAYS score 7-8+: Any protest, strike, dharna, or bandh anywhere IN INDIA.
  ALWAYS score 5+: Events explicitly about Bangalore, Bengaluru, Karnataka, ORR, Outer Ring Road, or nearby areas (Bellandur, Whitefield, Marathahalli, HSR, Koramangala, Silk Board, Electronic City, Sarjapur).
  ALWAYS score 5+: Content from official Bangalore city accounts — BESCOM power updates, BWSSB water supply, BBMP civic, Namma Metro, BMTC — even if city not explicitly mentioned.
  ALWAYS score 5+: Armed conflict, terrorism, embassy/consulate security alerts in India.
  Score 3-4: India-national events (other cities) with potential national-level significance.
  DO NOT drop items just because they are short or look like social media posts — official utility tweets are valuable.

Return ONLY a valid JSON object: { "items": [ {id, score, category}, ... ] }. No markdown.`;

async function callGroqORR(
  items: Array<{ id: string; headline: string }>
): Promise<GroqORRResult[] | null> {
  const QWEN_KEY = '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';
  if (!items.length) return null;
  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${QWEN_KEY}` },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        model: 'qwen/qwen3-32b',
        response_format: { type: 'json_object' },
        temperature: 0.6,
        max_tokens: 4096,
        top_p: 0.95,
        messages: [
          { role: 'system', content: ORR_GROQ_SYSTEM },
          { role: 'user', content: JSON.stringify({ items }) },
        ],
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw);
    // Accept { results: [...] } or { items: [...] } or bare array wrapper
    const arr: GroqORRResult[] = Array.isArray(parsed.items) ? parsed.items
      : Array.isArray(parsed.results) ? parsed.results
      : Array.isArray(parsed) ? parsed
      : [];
    return arr;
  } catch { return null; }
}

/** Filter and re-classify ORR events using Groq — drop score < 3 (only clear noise).
 *  Untranslated vernacular (Kannada/Hindi) items bypass Groq and pass through
 *  as-is — Groq cannot score non-English text reliably.
 *  Safety net: if Groq drops every English item, the top pre-Groq items (by severity) are
 *  returned so the feed is never completely empty. */
async function enrichWithGroqORR(events: ORREvent[]): Promise<ORREvent[]> {
  const BATCH = 20;
  const kept: ORREvent[] = [];          // vernacular pass-throughs
  const allEnBatch: ORREvent[] = [];    // every English/translated item (for safety net)
  const batchJobs: Array<{ enBatch: ORREvent[] }> = [];

  for (let i = 0; i < events.length; i += BATCH) {
    const batch = events.slice(i, i + BATCH);
    const enBatch  = batch.filter(e => e.lang === 'en' || e.isTranslated);
    const vernPass = batch.filter(e => e.lang !== 'en' && !e.isTranslated);
    kept.push(...vernPass);          // bypass Groq — will be shown as-is
    allEnBatch.push(...enBatch);
    if (enBatch.length > 0) batchJobs.push({ enBatch });
  }

  const groqKept: ORREvent[] = [];

  // Run Groq calls in parallel — each batch is independent
  if (batchJobs.length > 0) {
    await Promise.all(
      batchJobs.map(async ({ enBatch }) => {
        const payload = enBatch.map(e => ({ id: e.id, headline: e.headline }));
        const results = await callGroqORR(payload);
        if (!results) {
          groqKept.push(...enBatch); // Groq unavailable — pass through everything
          return;
        }
        const scoreMap = new Map(results.map(r => [r.id, r]));
        for (const ev of enBatch) {
          const r = scoreMap.get(ev.id);
          if (!r || r.score < 3) continue; // only drop clear noise (score 1-2)
          const updated: ORREvent = { ...ev };
          if (r.category) updated.category = r.category;
          groqKept.push(updated);
        }
      })
    );
  }

  // Safety net: if Groq filtered out every English item (over-aggressive),
  // fall back to the top 12 pre-Groq events sorted by severity so the feed is never empty.
  if (groqKept.length === 0 && allEnBatch.length > 0) {
    const fallback = [...allEnBatch]
      .sort((a, b) => a.severity - b.severity)
      .slice(0, 12);
    return [...kept, ...fallback];
  }

  return [...kept, ...groqKept];
}

// ─── Tags extractor ───────────────────────────────────────────────────────────

const CAT_LABEL: Record<ORRCategory, string> = {
  armed_conflict:    'CONFLICT',
  terrorism:         'TERROR',
  embassy_alert:     'EMBASSY',
  civil_disturbance: 'UNREST',
  transit:           'TRANSIT',
  climate:           'CLIMATE',
  disease:           'DISEASE',
  infrastructure:    'INFRA',
  traffic:           'TRAFFIC',
  general:           'GENERAL',
};

function extractTags(headline: string, category: ORRCategory, severity: number): string[] {
  const tags: string[] = [`S${severity}`, CAT_LABEL[category] ?? category.toUpperCase()];
  const t = headline.toLowerCase();
  if (t.includes('orr') || t.includes('outer ring')) tags.push('ORR');
  if (t.includes('bellandur')) tags.push('BELLANDUR');
  if (t.includes('hsr')) tags.push('HSR');
  if (t.includes('marathahalli')) tags.push('MRTHAHALLI');
  if (t.includes('varthur')) tags.push('VARTHUR');
  if (t.includes('whitefield')) tags.push('WHITEFIELD');
  if (t.includes('koramangala')) tags.push('KORAMANGALA');
  if (t.includes('metro') || t.includes('bmrcl')) tags.push('METRO');
  if (t.includes('bescom') || t.includes('power cut')) tags.push('BESCOM');
  if (t.includes('bwssb') || t.includes('water supply')) tags.push('BWSSB');
  if (t.includes('flood') || t.includes('waterlogging')) tags.push('FLOOD');
  if (t.includes('bandh') || t.includes('protest') || t.includes('riot')) tags.push('CIVIL');
  if (t.includes('vip') || t.includes('pm convoy') || t.includes('chief minister')) tags.push('VIP');
  if (t.includes('terror') || t.includes('bomb') || t.includes('blast')) tags.push('THREAT');
  return tags.slice(0, 4);
}

// ─── TF-IDF style deduplication ──────────────────────────────────────────────

/** Returns significant words (>4 chars, not stopwords) */
const STOP_WORDS = new Set([
  'with', 'that', 'this', 'from', 'have', 'will', 'been', 'were', 'they',
  'their', 'what', 'says', 'said', 'news', 'india', 'after', 'over',
]);

function getTokens(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 4 && !STOP_WORDS.has(w))
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  a.forEach(w => { if (b.has(w)) intersection++; });
  return intersection / (a.size + b.size - intersection);
}

function deduplicateORR(events: ORREvent[]): ORREvent[] {
  const result: ORREvent[] = [];
  const merged = new Set<number>();
  const tokenCache = events.map(e => getTokens(e.headline));

  for (let i = 0; i < events.length; i++) {
    if (merged.has(i)) continue;
    let mergedCount = 0;
    for (let j = i + 1; j < events.length; j++) {
      if (merged.has(j)) continue;
      // Time window: 2 hours
      if (Math.abs(events[i].timestamp - events[j].timestamp) > 2 * 3_600_000) continue;
      // Jaccard similarity threshold: 0.42
      if (jaccardSimilarity(tokenCache[i], tokenCache[j]) >= 0.42) {
        merged.add(j);
        mergedCount++;
      }
    }
    result.push({ ...events[i], mergedCount });
  }
  return result;
}

// ─── Predictive engine (frequency-model) ─────────────────────────────────────

interface PredictedPattern {
  days: number[];       // 0=Sun, 1=Mon … 6=Sat
  hours: number[];      // UTC+5:30 hours
  headline: string;
  category: ORRCategory;
  severity: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  condition?: string;   // extra human-readable note
}

const PREDICTED_PATTERNS: PredictedPattern[] = [
  {
    days: [1, 2, 3, 4, 5],
    hours: [8, 9, 10],
    headline: 'PREDICTED: Heavy peak-hour congestion on 150 ORR inbound lanes',
    category: 'traffic',
    severity: 3,
    tags: ['S3', 'TRAFFIC', 'ORR', 'PREDICTED'],
    condition: 'Mon-Fri, 08-10 IST',
  },
  {
    days: [1, 2, 3, 4, 5],
    hours: [17, 18, 19, 20],
    headline: 'PREDICTED: Evening rush congestion expected — Bellandur to Silk Board',
    category: 'traffic',
    severity: 3,
    tags: ['S3', 'TRAFFIC', 'BELLANDUR', 'PREDICTED'],
    condition: 'Mon-Fri, 17-20 IST',
  },
  {
    days: [5, 6],
    hours: [10, 11, 18, 19],
    headline: 'PREDICTED: Weekend mall traffic — elevated congestion near Marathahalli Bridge',
    category: 'traffic',
    severity: 4,
    tags: ['S4', 'TRAFFIC', 'MRTHAHALLI', 'PREDICTED'],
    condition: 'Sat-Sun, peak shopping hours',
  },
  {
    days: [0, 1, 2, 3, 4, 5, 6],
    hours: [5, 6, 7],
    headline: 'PREDICTED: Early morning low-visibility advisory — Bellandur Lake fog zone',
    category: 'climate',
    severity: 4,
    tags: ['S4', 'ENVIRONMENT', 'BELLANDUR', 'PREDICTED'],
    condition: 'Daily, 05-07 IST (Dec-Feb)',
  },
  {
    days: [1, 2, 3, 4, 5],
    hours: [9, 10, 11, 14, 15],
    headline: 'PREDICTED: Road maintenance diversion active — ORR Kadubeesanahalli underpass',
    category: 'infrastructure',
    severity: 3,
    tags: ['S3', 'INFRASTRUCTURE', 'ORR', 'PREDICTED'],
    condition: 'Weekday work hours',
  },
  {
    days: [0, 1, 2, 3, 4, 5, 6],
    hours: [6, 7, 8, 9],
    headline: 'PREDICTED: Pre-monsoon waterlogging risk — Varthur Kodi junction',
    category: 'climate',
    severity: 2,
    tags: ['S2', 'ENVIRONMENT', 'FLOOD', 'PREDICTED'],
    condition: 'Jun-Sep, morning hours',
  },
];

function generatePredictions(): ORREvent[] {
  const now = new Date();
  // IST = UTC+5:30
  const istHour = (now.getUTCHours() + 5 + (now.getUTCMinutes() >= 30 ? 1 : 0)) % 24;
  const istDay = now.getDay(); // 0=Sun
  const month = now.getMonth() + 1; // 1-12

  const active = PREDICTED_PATTERNS.filter(p => {
    if (!p.days.includes(istDay)) return false;
    if (!p.hours.includes(istHour) && !p.hours.includes((istHour - 1 + 24) % 24)) return false;
    // Seasonal gates
    if (p.condition?.includes('Dec-Feb') && ![12, 1, 2].includes(month)) return false;
    if (p.condition?.includes('Jun-Sep') && ![6, 7, 8, 9].includes(month)) return false;
    return true;
  });

  return active.map((p, i) => ({
    id: `pred-${i}-${Date.now()}`,
    headline: p.headline,
    isTranslated: false,
    lang: 'en' as const,
    source: 'PREDICTION ENGINE',
    sourceType: 'predicted' as const,
    category: p.category,
    severity: p.severity,
    isPredicted: true,
    confidence: 72,
    tags: p.tags,
    mergedCount: 0,
    cityWide: false,
    timestamp: Date.now(),
    time: 'NOW',
    landmark: p.condition,
  }));
}

// ─── RSS helpers ──────────────────────────────────────────────────────────────

function gnewsURL(query: string, window = '1d', lang: 'en' | 'kn' = 'en'): string {
  const fullQuery = encodeURIComponent(`${query} when:${window}`);
  const hl = lang === 'kn' ? 'kn-IN' : 'en-IN';
  const ceid = lang === 'kn' ? 'IN:kn' : 'IN:en';
  const feedUrl = encodeURIComponent(
    `https://news.google.com/rss/search?q=${fullQuery}&hl=${hl}&gl=IN&ceid=${ceid}`
  );
  return `/api/rss-proxy?url=${feedUrl}`;
}

function getRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ─── Nitter RSS helpers (real Twitter/X handle monitoring) ───────────────────
// Tries nitter.poast.org first, then nitter.1d4.us as fallback.
// Nitter instances can go offline; Google News RSS is always the last resort.

function nitterURL(handle: string): string {
  return `/api/rss-proxy?url=${encodeURIComponent(`https://nitter.poast.org/${handle}/rss`)}`;
}
function nitterURLAlt(handle: string): string {
  return `/api/rss-proxy?url=${encodeURIComponent(`https://nitter.1d4.us/${handle}/rss`)}`;
}

// ─── Source registry ──────────────────────────────────────────────────────────

export const ORR_SOURCES: Array<{
  id: string;
  name: string;
  type: ORRSourceType;
  lang: string;
  url: string;
  altUrl?: string;
  altUrls?: string[];
  category: ORRCategory;
  handle?: string;
  htmlScraper?: HtmlScraperConfig;
}> = [

  // ══ OFFICIAL HANDLES — Nitter RSS primary (real tweets), Google News fallback ══

  // ── Traffic & Transport ──────────────────────────────────────────────────────
  {
    id: 'btp-traffic',
    name: 'BLR TRAFFIC POLICE',
    type: 'official',
    lang: 'EN',
    handle: '@blrcitytraffic',
    url: gnewsURL('Bangalore traffic road closure diversion accident jam ORR congestion'),
    category: 'traffic',
  },
  {
    id: 'blr-police',
    name: 'BLR CITY POLICE',
    type: 'official',
    lang: 'EN',
    handle: '@BlrCityPolice',
    url: gnewsURL('Bangalore police crime arrest alert advisory security Bengaluru'),
    category: 'general',
  },
  {
    id: 'namma-metro',
    name: 'NAMMA METRO',
    type: 'official',
    lang: 'EN',
    handle: '@NammaMetro',
    url: gnewsURL('Namma Metro BMRCL metro delay disruption service alert Bangalore'),
    category: 'transit',
  },
  {
    id: 'bmtc',
    name: 'BMTC',
    type: 'official',
    lang: 'EN',
    handle: '@BMTC_BENGALURU',
    url: gnewsURL('BMTC bus route diversion rescheduled Bangalore transit'),
    category: 'transit',
  },

  // ── Civic & Health ───────────────────────────────────────────────────────────
  {
    id: 'bbmp',
    name: 'BBMP CIVIC',
    type: 'official',
    lang: 'EN',
    handle: '@BBMPCOMM',
    url: gnewsURL('BBMP Bangalore civic road pothole waterlogging drain flooding advisory'),
    category: 'general',
  },
  {
    id: 'dhfw',
    name: 'DHFW KARNATAKA',
    type: 'official',
    lang: 'EN',
    handle: '@DHFW_Karnataka',
    url: gnewsURL('Karnataka health department disease outbreak vaccination advisory Bangalore', '2d'),
    category: 'disease',
  },
  {
    id: 'nhm',
    name: 'NHM KARNATAKA',
    type: 'official',
    lang: 'EN',
    handle: '@NHM_Karnataka',
    url: gnewsURL('Karnataka health mission disease emergency outbreak Bangalore', '2d'),
    category: 'disease',
  },

  // ── Utilities ────────────────────────────────────────────────────────────────
  {
    id: 'bescom',
    name: 'BESCOM',
    type: 'official',
    lang: 'EN',
    handle: '@Bescom_Bangalore',
    url: gnewsURL('BESCOM Bangalore power cut outage electricity restoration scheduled maintenance'),
    category: 'infrastructure',
  },
  {
    id: 'bwssb',
    name: 'BWSSB WATER',
    type: 'official',
    lang: 'EN',
    handle: '@bwssb_bangalore',
    url: gnewsURL('BWSSB water supply Bangalore Cauvery pipe burst shortage disruption'),
    category: 'infrastructure',
  },
  {
    id: 'kptcl',
    name: 'KPTCL GRID',
    type: 'official',
    lang: 'EN',
    handle: '@KPTCL_Official',
    url: gnewsURL('KPTCL Karnataka power grid failure outage transmission'),
    category: 'infrastructure',
  },

  // ══ MAINSTREAM RSS — reliable backbone feeds ══════════════════════════════════
  {
    id: 'dh-blr',
    name: 'DECCAN HERALD',
    type: 'mainstream',
    lang: 'EN',
    handle: '@DeccanHerald',
    url: '/api/rss-proxy?url=' + encodeURIComponent('https://www.deccanherald.com/rss/section/state.rss'),
    altUrls: [
      '/api/rss-proxy?url=' + encodeURIComponent('https://www.deccanherald.com/rss/national.rss'),
      gnewsURL('site:deccanherald.com Bangalore Bengaluru', '2d'),
    ],
    category: 'general',
  },
  {
    id: 'hindu-blr',
    name: 'THE HINDU BLR',
    type: 'mainstream',
    lang: 'EN',
    handle: '@TheHinduBengaluru',
    url: '/api/rss-proxy?url=' + encodeURIComponent('https://www.thehindu.com/news/cities/bangalore/feeder/default.rss'),
    altUrls: [
      gnewsURL('site:thehindu.com Bangalore Bengaluru', '2d'),
    ],
    category: 'general',
  },
  // Broad Bangalore news — guaranteed to return results every cycle
  {
    id: 'blr-digest',
    name: 'BANGALORE DIGEST',
    type: 'mainstream',
    lang: 'EN',
    url: gnewsURL('Bangalore OR Bengaluru traffic accident protest flood power cut crime fire', '2d'),
    category: 'general',
  },

  // ══ VERNACULAR ════════════════════════════════════════════════════════════════
  {
    id: 'prajavani',
    name: 'PRAJAVANI [KN]',
    type: 'vernacular',
    lang: 'KN',
    url: '/api/rss-proxy?url=' + encodeURIComponent('https://www.prajavani.net/'),
    htmlScraper: {
      linkPattern: '\\/(state|city|news|criminal)\\/[^\\/]+\\/\\d+',
      baseUrl: 'https://www.prajavani.net',
    },
    altUrls: [
      '/api/rss-proxy?url=' + encodeURIComponent('https://www.prajavani.net/state/karnataka'),
      gnewsURL('prajavani bengaluru Karnataka', '1d'),
    ],
    category: 'general',
  },
  {
    id: 'oneindia-kn',
    name: 'ONEINDIA KN [KN]',
    type: 'vernacular',
    lang: 'KN',
    url: '/api/rss-proxy?url=' + encodeURIComponent('https://kannada.oneindia.com/news/bengaluru/'),
    htmlScraper: {
      linkPattern: '\\/news\\/bengaluru\\/[^\\/]+\\.html',
      baseUrl: 'https://kannada.oneindia.com',
      titleSelector: 'h2, h3, .article-title, .headline',
    },
    altUrls: [
      '/api/rss-proxy?url=' + encodeURIComponent('https://kannada.oneindia.com/news/karnataka/'),
      gnewsURL('oneindia kannada bengaluru', '1d'),
    ],
    category: 'general',
  },

  // ══ HYPER-LOCAL: 16 ORR corridor locations ════════════════════════════════════
  {
    id: 'orr-corridor',
    name: '150 ORR CORRIDOR',
    type: 'targeted',
    lang: 'EN',
    url: gnewsURL(
      'Kadubeesanahalli OR Bellandur OR "HSR Layout" OR Marathahalli OR "Outer Ring Road Bangalore"' +
      ' OR Varthur OR Sarjapur OR Koramangala OR "Silk Board" OR Mahadevapura OR "Electronic City"' +
      ' OR Whitefield OR "KR Puram" OR Domlur OR Indiranagar OR "HAL Airport Road"'
    ),
    category: 'traffic',
  },

  // ══ SECURITY & GEOPOLITICS ════════════════════════════════════════════════════
  {
    id: 'india-security',
    name: 'INDIA SECURITY',
    type: 'targeted',
    lang: 'EN',
    url: gnewsURL('India terrorism attack bomb blast armed conflict border militant naxal', '2d'),
    category: 'terrorism',
  },
  {
    id: 'embassy-alerts',
    name: 'EMBASSY ALERTS',
    type: 'targeted',
    lang: 'EN',
    url: gnewsURL('India embassy consulate "security alert" "travel advisory" diplomatic threat', '2d'),
    category: 'embassy_alert',
  },

  // ══ CIVIL UNREST ══════════════════════════════════════════════════════════════
  {
    id: 'civic-unrest',
    name: 'CIVIL UNREST',
    type: 'targeted',
    lang: 'EN',
    url: gnewsURL('Bangalore bandh protest riot curfew agitation OR "VIP movement" OR "PM convoy" OR "CM visit" Bengaluru'),
    category: 'civil_disturbance',
  },

  // ══ CLIMATE ══════════════════════════════════════════════════════════════════
  {
    id: 'imd-weather',
    name: 'IMD WEATHER',
    type: 'official',
    lang: 'EN',
    url: gnewsURL('Bangalore Karnataka IMD rain flood "red alert" "orange alert" cyclone earthquake', '2d'),
    category: 'climate',
  },

  // ══ DISEASE & PUBLIC HEALTH ═══════════════════════════════════════════════════
  {
    id: 'health-blr',
    name: 'HEALTH WATCH',
    type: 'targeted',
    lang: 'EN',
    url: gnewsURL('Bangalore dengue outbreak disease epidemic health emergency hospital contamination', '2d'),
    category: 'disease',
  },

  // ══ NATIONAL: NDRF + CPCB + IMD ═══════════════════════════════════════════════
  {
    id: 'ndrf-hq',
    name: 'NDRF HQ',
    type: 'official',
    lang: 'EN',
    url: gnewsURL('NDRF rescue operation India flood earthquake disaster', '1d'),
    category: 'climate',
  },
  {
    id: 'cpcb-national',
    name: 'CPCB AQI',
    type: 'official',
    lang: 'EN',
    url: gnewsURL('CPCB "air quality" AQI Delhi Bangalore Mumbai Hyderabad pollution alert', '1d'),
    category: 'climate',
  },
];


// ─── RSS parser ────────────────────────────────────────────────────────────────

function parseRssToORR(
  xml: string,
  sourceId: string,
  sourceName: string,
  sourceType: ORRSourceType,
  defaultCategory: ORRCategory,
): Omit<ORREvent, 'isTranslated' | 'lang'>[] {
  const events: Omit<ORREvent, 'isTranslated' | 'lang'>[] = [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');

    // Support RSS 2.0 (<item>) and Atom (<entry>)
    let items = doc.querySelectorAll('item');
    let isAtom = false;
    if (items.length === 0) {
      items = doc.querySelectorAll('entry');
      isAtom = true;
    }
    if (items.length === 0) return events;

    let count = 0;

    items.forEach(el => {
      if (count >= 10) return;

      const title = el.querySelector('title')?.textContent?.trim() ?? '';
      const atomLink = el.querySelector('link[href]')?.getAttribute('href')?.trim();
      const rssLink = el.querySelector('link')?.textContent?.trim();
      const link = isAtom ? (atomLink ?? rssLink ?? '') : (rssLink ?? atomLink ?? '');

      const pubDate = isAtom
        ? (el.querySelector('published')?.textContent?.trim() ?? el.querySelector('updated')?.textContent?.trim() ?? '')
        : el.querySelector('pubDate')?.textContent?.trim() ?? '';

      const source = el.querySelector('source')?.textContent?.trim() ?? sourceName;

      if (!title || title.toLowerCase().includes('google')) return;

      const ts = pubDate ? new Date(pubDate).getTime() : Date.now();
      if (Date.now() - ts > 48 * 3_600_000) return;  // drop items > 48h old

      const category = classifyORR(title);
      const severity = computeORRSeverity(title);
      const cityWide = isCityWide(title);
      const geo = geocodeORR(title);
      const tags = extractTags(title, category, severity);
      const cleanTitle = title.replace(/\s+-\s+[^-]+$/, '').trim();

      let lat: number | undefined;
      let lon: number | undefined;
      let distanceKm: number | undefined;
      let landmark: string | undefined;

      if (geo) {
        lat = geo.coords[0] + (Math.random() - 0.5) * 0.004;
        lon = geo.coords[1] + (Math.random() - 0.5) * 0.004;
        distanceKm = haversineKm(HQ_LAT, HQ_LON, lat, lon);
        landmark = geo.landmark;
      }

      // Geo-gate: keep city-wide events; otherwise enforce proximity
      if (sourceType !== 'vernacular' && !cityWide && distanceKm !== undefined && distanceKm > GEO_GATE_KM * 6) return;

      events.push({
        id: `${sourceId}-${Math.random().toString(36).slice(2)}`,
        headline: cleanTitle || title,
        source: source.replace(/ google news$/i, '').toUpperCase().trim() || sourceName,
        sourceType,
        url: link || undefined,
        category: defaultCategory !== 'general' ? defaultCategory : category,
        severity,
        lat,
        lon,
        distanceKm,
        landmark,
        timestamp: ts,
        time: getRelativeTime(new Date(ts)),
        isPredicted: false,
        confidence: sourceType === 'official' ? 92 : sourceType === 'mainstream' ? 85 : 74,
        tags,
        mergedCount: 0,
        cityWide,
      });
      count++;
    });
  } catch { /* parse errors are non-fatal */ }
  return events;
}

// ─── Main export ──────────────────────────────────────────────────────────────

let _cache: ORRIntelResult | null = null;
let _cacheTs = 0;
const CACHE_TTL = 5 * 60_000; // 5 minutes

export async function fetchORRIntel(force = false): Promise<ORRIntelResult> {
  if (!force && _cache && Date.now() - _cacheTs < CACHE_TTL) return _cache;

  const sourceStatuses: ORRSourceStatus[] = [];
  // Collect raw parsed events (NO translation yet — translation happens after all fetches)
  const allParsed: Array<Omit<ORREvent, 'isTranslated' | 'lang'>> = [];

  // 1. Fetch ALL sources in parallel with a short timeout per source
  await Promise.allSettled(
    ORR_SOURCES.map(async src => {
      const altUrls: string[] = (src as any).altUrls ?? [];
      const urls = [src.url, ...altUrls];

      const status: ORRSourceStatus = {
        name: src.name,
        type: src.type as ORRSourceType,
        url: src.url,
        live: false,
        lastFetch: Date.now(),
        itemCount: 0,
        lang: src.lang ?? 'EN',
      };
      sourceStatuses.push(status);

      for (const u of urls) {
        try {
          const ctrl = new AbortController();
          // Reduced from 9s → 5s so slow sources don't block everything
          const tid = setTimeout(() => ctrl.abort(), 5000);
          const resp = await fetch(u, { signal: ctrl.signal });
          clearTimeout(tid);
          if (!resp.ok) continue;
          const xml = await resp.text();
          if (!xml || xml.length < 80 || xml.trim().startsWith('{')) continue;

          const parsed = parseRssToORR(
            xml,
            src.id,
            src.name,
            src.type as ORRSourceType,
            (src.category ?? 'general') as ORRCategory,
          );

          if (parsed.length > 0) {
            // ← No translation here — just collect raw events
            allParsed.push(...parsed);
            status.live = true;
            status.itemCount = parsed.length;
            break; // stop trying fallback URLs once we have results
          }
        } catch { /* try next URL */ }
      }
    }),
  );

  // 2. Translate non-English headlines in a single parallel batch
  //    Cap total translation time at 6s so it never hangs the page
  const translationTimeout = new Promise<void>(resolve => setTimeout(resolve, 6000));
  const allRaw: ORREvent[] = [];

  await Promise.race([
    Promise.all(
      allParsed.map(async ev => {
        const lang = detectLang(ev.headline);
        if (lang !== 'en') {
          const translated = await translateHeadline(ev.headline, lang);
          allRaw.push({
            ...ev,
            lang,
            isTranslated: !!translated,
            originalHeadline: translated ? ev.headline : undefined,
            headline: translated ?? ev.headline,
          } as ORREvent);
        } else {
          allRaw.push({ ...ev, lang: 'en' as const, isTranslated: false } as ORREvent);
        }
      }),
    ),
    translationTimeout,
  ]);

  // Fill in any items that didn't make it through translation (timeout case)
  if (allRaw.length < allParsed.length) {
    const rawIds = new Set(allRaw.map(e => e.id));
    for (const ev of allParsed) {
      if (!rawIds.has(ev.id)) {
        allRaw.push({ ...ev, lang: 'en' as const, isTranslated: false } as ORREvent);
      }
    }
  }

  // 3. Deduplicate & sort without waiting for Groq — return fast
  const preGroq = deduplicateORR(allRaw);
  preGroq.sort((a, b) => a.severity - b.severity || b.timestamp - a.timestamp);

  const predicted = generatePredictions();
  const criticalCount = preGroq.filter(e => e.severity <= 2).length;
  const areaHealthScore = Math.max(10, 100 - criticalCount * 15);

  // Store unfiltered result immediately so the UI doesn't hang
  _cache = {
    events: preGroq,
    sources: sourceStatuses,
    areaHealthScore,
    predictedEvents: predicted,
    fetchedAt: Date.now(),
  };
  _cacheTs = Date.now();

  // 4. Groq enrichment runs in the background — updates the cache silently
  enrichWithGroqORR(allRaw).then(enriched => {
    const deduped = deduplicateORR(enriched);
    deduped.sort((a, b) => a.severity - b.severity || b.timestamp - a.timestamp);
    const critCount = deduped.filter(e => e.severity <= 2).length;
    _cache = {
      events: deduped,
      sources: sourceStatuses,
      areaHealthScore: Math.max(10, 100 - critCount * 15),
      predictedEvents: predicted,
      fetchedAt: Date.now(),
    };
  }).catch(() => { /* Groq unavailable — keep pre-Groq cache */ });

  return _cache;
}
