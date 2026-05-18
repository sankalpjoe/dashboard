/**
 * Live Intelligence Service — real news feeds, Groq-filtered.
 *
 * Sources: PIB Defence, CERT-IN, Google News (India conflict / VIP-protest /
 *          health-disease / traffic-infra) + Global strategic feeds.
 *
 * Groq (Llama-3.3-70b) enrichment:
 *   • Filters out celebrity gossip, IPO/stock, sports, entertainment
 *   • Re-classifies into intel-relevant categories
 *   • Generates 3-bullet summaries
 *
 * Categories: conflict | health | disease | traffic | infra | vip |
 *             protest  | cyber  | military | general
 */

// ── Types ───────────────────────────────────────────────────────────────────

export type IntelCategory =
  | 'conflict' | 'health' | 'disease' | 'traffic' | 'infra'
  | 'vip' | 'protest' | 'cyber' | 'military' | 'general';

export interface IntelItem {
  id:             string;
  headline:       string;
  source:         string;
  time:           string;
  url?:           string;
  type:           IntelCategory;
  riskLevel:      'critical' | 'high' | 'medium' | 'info';
  lat?:           number;
  lon?:           number;
  // Groq enrichment
  summary?:       string[];   // 3-bullet analysis
  sentiment?:     number;     // -1.0 … +1.0
  relevanceScore?: number;    // 1-10; items < 5 dropped
}

// ── Config ───────────────────────────────────────────────────────────────────

const CACHE_TTL    = 5 * 60_000; // 5-minute cache

// ── RSS proxy helper ─────────────────────────────────────────────────────────

function gnews(query: string, window = '1d'): string {
  const q = encodeURIComponent(`${query} when:${window}`);
  return `/api/rss-proxy?url=${encodeURIComponent(`https://news.google.com/rss/search?q=${q}&hl=en-IN&gl=IN&ceid=IN:en`)}`;
}

function nitter(handle: string): string {
  return `/api/rss-proxy?url=${encodeURIComponent(`https://nitter.poast.org/${handle}/rss`)}`;
}
function nitterAlt(handle: string): string {
  return `/api/rss-proxy?url=${encodeURIComponent(`https://nitter.1d4.us/${handle}/rss`)}`;
}

// ── Feed definitions ─────────────────────────────────────────────────────────

type FeedDef = { url: string; altUrl?: string; source: string; type: IntelCategory };

const INTEL_FEEDS: FeedDef[] = [

  // ══ NATIONAL OFFICIAL ═════════════════════════════════════════════════════

  // PIB Defence
  { url: '/api/pib/RssMain.aspx?ModId=6&Lang=1&Regid=3', source: 'PIB DEFENCE', type: 'military' },

  // CERT-IN cyber advisories
  { url: '/api/cert/RSS.jsp', source: 'CERT-IN', type: 'cyber' },

  // NDMA / SACHET disaster alerts
  {
    url: gnews('NDMA OR SACHET "National Disaster Management Authority" India flood cyclone earthquake warning', '2d'),
    source: 'NDMA ALERTS', type: 'infra',
  },

  // ══ CLIMATE & ENVIRONMENT ALERTS ══════════════════════════════════════════

  // IMD official — colour-coded alerts
  {
    url: gnews('IMD "India Meteorological Department" "red alert" OR "orange alert" OR "yellow alert" India', '1d'),
    source: 'IMD ALERTS', type: 'infra',
  },

  // IMD — rainfall & flood predictions
  {
    url: gnews('IMD India "heavy rainfall" OR "extremely heavy rain" OR "4 days rain" OR "72 hour rain" OR "flood warning" OR "flood alert" Bangalore Hyderabad Mumbai Delhi Chennai', '1d'),
    source: 'IMD RAINFALL', type: 'infra',
  },

  // IMD — heatwave & cold wave
  {
    url: gnews('IMD India heatwave OR "heat wave" OR "heat alert" OR "cold wave" OR "cold alert" OR "severe cold" OR "temperature record" 2025 2026', '2d'),
    source: 'IMD HEATWAVE', type: 'infra',
  },

  // Cyclone / storm tracking
  {
    url: gnews('India cyclone OR "tropical storm" OR "depression in Bay" OR "depression Arabian Sea" OR "cyclonic storm" OR "very severe cyclone" landfall', '3d'),
    source: 'CYCLONE TRACKER', type: 'infra',
  },

  // Hailstorm / thunderstorm / lightning
  {
    url: gnews('India hailstorm OR "hail storm" OR thunderstorm OR lightning deaths OR "squall warning" OR "gusty winds" alert India 2025 2026', '2d'),
    source: 'STORM WATCH', type: 'infra',
  },

  // Urban flooding — city specific
  {
    url: gnews('Bangalore OR Mumbai OR Hyderabad OR Delhi OR Chennai waterlogged OR flooded OR "flooded roads" OR "inundated" OR "submerged" rain 2026', '1d'),
    source: 'URBAN FLOOD', type: 'infra',
  },

  // Earthquake / tremors
  {
    url: gnews('India earthquake OR tremor OR seismic OR richter scale felt India 2025 2026', '3d'),
    source: 'SEISMIC WATCH', type: 'infra',
  },

  // Air quality — AQI spikes
  {
    url: gnews('CPCB AQI "air quality index" "severe" OR "hazardous" OR "very poor" Delhi Bangalore Mumbai Hyderabad 2026', '1d'),
    source: 'CPCB AQI', type: 'health',
  },

  // Chemical / industrial / gas leak
  {
    url: gnews('India "gas leak" OR "chemical leak" OR "toxic gas" OR "ammonia leak" OR "chlorine leak" OR "industrial accident" evacuation', '2d'),
    source: 'CHEMICAL HAZARD', type: 'infra',
  },

  // NDRF operations
  {
    url: gnews('NDRF rescue operation flood earthquake India', '1d'),
    source: 'NDRF HQ', type: 'infra',
  },

  // MEA advisories
  {
    url: gnews('MEA India "Ministry of External Affairs" advisory travel alert evacuation embassy', '2d'),
    source: 'MEA ADVISORY', type: 'vip',
  },

  // ══ BANGALORE ══════════════════════════════════════════════════════════════

  // BLR Traffic Police
  {
    url: gnews('"Bengaluru Traffic Police" OR "Bangalore traffic" alert diversion accident road block', '1d'),
    source: 'BLR TRAFFIC POLICE', type: 'traffic',
  },

  // BLR City Police
  {
    url: gnews('"Bengaluru City Police" OR "Bangalore police" arrest protest security emergency', '1d'),
    source: 'BLR CITY POLICE', type: 'protest',
  },

  // BBMP civic
  {
    url: gnews('BBMP Bangalore civic waterlogging road repair infrastructure flooding pothole', '1d'),
    source: 'BBMP CIVIC', type: 'infra',
  },

  // BESCOM power
  {
    url: gnews('BESCOM power cut outage Bangalore electricity grid failure', '1d'),
    source: 'BESCOM POWER', type: 'infra',
  },

  // BWSSB water
  {
    url: gnews('BWSSB water supply shortage Bangalore contamination', '1d'),
    source: 'BWSSB WATER', type: 'infra',
  },

  // The Hindu Bangalore
  {
    url: 'https://www.thehindu.com/news/cities/bangalore/feeder/default.rss',
    source: 'THE HINDU BLR', type: 'general',
  },

  // Karnataka transport strikes / KSRTC / BMTC labour
  {
    url: gnews('KSRTC OR BMTC OR "Karnataka bus" OR "bus strike" OR "bus bandh" OR "KSRTC strike" Bangalore Karnataka', '2d'),
    source: 'KARNATAKA TRANSPORT', type: 'traffic',
  },

  // Karnataka bandh / civil unrest
  {
    url: gnews('Karnataka bandh OR "Karnataka strike" OR "Bangalore bandh" OR "auto strike" OR "cab strike" Bangalore', '2d'),
    source: 'KA CIVIL UNREST', type: 'protest',
  },

  // Prajavani (Kannada — translated via Groq)
  {
    url: gnews('site:prajavani.net OR Prajavani Bangalore Bengaluru protest flood accident', '1d'),
    source: 'PRAJAVANI', type: 'general',
  },

  // ══ HYDERABAD ══════════════════════════════════════════════════════════════

  // GHMC civic
  {
    url: gnews('GHMC Hyderabad civic flooding road infrastructure utilities', '1d'),
    source: 'GHMC HYDERABAD', type: 'infra',
  },

  // TGSPDCL power
  {
    url: gnews('TGSPDCL OR TSNPDCL power outage Hyderabad Telangana electricity failure', '1d'),
    source: 'TGSPDCL POWER', type: 'infra',
  },

  // HYDRAA disaster
  {
    url: gnews('HYDRAA Hyderabad disaster response flood emergency', '2d'),
    source: 'HYDRAA', type: 'infra',
  },

  // Hyderabad Traffic
  {
    url: gnews('Hyderabad traffic accident road block diversion congestion', '1d'),
    source: 'HYD TRAFFIC', type: 'traffic',
  },

  // The Hindu Hyderabad
  {
    url: 'https://www.thehindu.com/news/cities/Hyderabad/feeder/default.rss',
    source: 'THE HINDU HYD', type: 'general',
  },

  // Eenadu (Telugu)
  {
    url: gnews('site:eenadu.net OR Eenadu Hyderabad Telangana protest accident flood', '1d'),
    source: 'EENADU', type: 'general',
  },

  // ══ MUMBAI ═════════════════════════════════════════════════════════════════

  // BMC / MCGM disaster
  {
    url: gnews('BMC MCGM Mumbai disaster flood waterlogging civic emergency', '1d'),
    source: 'BMC MUMBAI', type: 'infra',
  },

  // Mumbai Police
  {
    url: gnews('Mumbai Police crime arrest protest security emergency', '1d'),
    source: 'MUMBAI POLICE', type: 'protest',
  },

  // Mumbai civic threats / political / Sena actions
  {
    url: gnews('"Shiv Sena" OR "MNS" OR "Sena action" OR "Deputy Mayor Mumbai" OR "Marathi signboard" OR "language row" Mumbai threat warning', '2d'),
    source: 'MUMBAI CIVIC', type: 'protest',
  },

  // TOI Mumbai
  {
    url: 'https://timesofindia.indiatimes.com/rssfeeds/4473036.cms',
    source: 'TOI MUMBAI', type: 'general',
  },

  // Maharashtra Times (Marathi)
  {
    url: gnews('site:maharashtratimes.com OR "Maharashtra Times" Mumbai protest flood accident', '1d'),
    source: 'MAHA TIMES', type: 'general',
  },

  // ══ DELHI ══════════════════════════════════════════════════════════════════

  // Delhi Traffic Police
  {
    url: gnews('"Delhi Traffic Police" OR "DTP traffic" alert diversion accident road block Delhi', '1d'),
    source: 'DELHI TRAFFIC', type: 'traffic',
  },

  // DMRC metro
  {
    url: gnews('DMRC Delhi Metro delay service disruption station closure', '1d'),
    source: 'DMRC METRO', type: 'traffic',
  },

  // MCD civic
  {
    url: gnews('MCD "Municipal Corporation of Delhi" flood waterlogging road collapse civic', '1d'),
    source: 'MCD DELHI', type: 'infra',
  },

  // DPCC pollution
  {
    url: gnews('DPCC Delhi "Delhi Pollution Control Committee" AQI smog haze alert', '1d'),
    source: 'DPCC ENVIRO', type: 'health',
  },

  // Indian Express Delhi
  {
    url: 'https://indianexpress.com/section/cities/delhi/feed/',
    source: 'INDIAN EXPRESS DELHI', type: 'general',
  },

  // Hindustan Times Delhi
  {
    url: gnews('site:hindustantimes.com Delhi protest flood accident crime fire building', '1d'),
    source: 'HINDUSTAN TIMES', type: 'general',
  },

  // Navbharat Times (Hindi)
  {
    url: gnews('site:navbharattimes.com OR "Navbharat Times" Delhi protest accident flood', '1d'),
    source: 'NAVBHARAT TIMES', type: 'general',
  },

  // ══ NATIONAL SECURITY & CRISIS ════════════════════════════════════════════

  {
    url: gnews('India bomb blast IED terrorist attack naxal maoist encounter militant communal violence', '1d'),
    source: 'CONFLICT DESK', type: 'conflict',
  },
  {
    url: gnews('India protest riot bandh curfew agitation hartaal mob violence section 144 lathi farmer student', '1d'),
    source: 'CIVIL UNREST', type: 'protest',
  },
  // ══ DISEASE & EPIDEMIC SURVEILLANCE (nationwide) ══════════════════════════

  // High-priority viral haemorrhagic / zoonotic diseases
  {
    url: gnews('India Nipah virus OR Nipah case OR Nipah Kerala OR Nipah outbreak', '3d'),
    source: 'NIPAH WATCH', type: 'disease',
  },
  {
    url: gnews('India "swine flu" OR "H1N1" OR "H3N2" OR "influenza outbreak" OR "flu deaths" India', '3d'),
    source: 'INFLUENZA DESK', type: 'disease',
  },
  {
    url: gnews('India "bird flu" OR "avian influenza" OR "H5N1" OR "H5N8" poultry cull outbreak India', '3d'),
    source: 'AVIAN FLU WATCH', type: 'disease',
  },
  {
    url: gnews('India Ebola OR Marburg OR "Crimean Congo" OR "Hanta virus" OR Hantavirus OR Lassa OR Monkeypox OR Mpox India case', '7d'),
    source: 'VHF MONITOR', type: 'disease',
  },
  {
    url: gnews('India HMPV OR "Human Metapneumovirus" OR "respiratory outbreak" OR "mystery disease" OR "unknown illness" India 2025 2026', '3d'),
    source: 'EMERGING DISEASE', type: 'disease',
  },

  // Vector-borne diseases with seasonal surge risk
  {
    url: gnews('India dengue deaths OR dengue outbreak OR dengue surge Bangalore Hyderabad Mumbai Delhi Chennai 2025 2026', '2d'),
    source: 'DENGUE DESK', type: 'disease',
  },
  {
    url: gnews('India malaria deaths OR malaria outbreak OR cerebral malaria OR falciparum surge', '3d'),
    source: 'MALARIA WATCH', type: 'disease',
  },
  {
    url: gnews('India cholera OR "water-borne disease" OR leptospirosis OR typhoid deaths outbreak India', '3d'),
    source: 'WATER-BORNE DESK', type: 'disease',
  },

  // Respiratory / COVID variants
  {
    url: gnews('India COVID OR "new variant" OR "XEC variant" OR "KP variant" OR "COVID surge" OR "COVID deaths" India 2025 2026', '3d'),
    source: 'COVID MONITOR', type: 'disease',
  },
  {
    url: gnews('India "tuberculosis outbreak" OR "TB deaths" OR "drug resistant TB" OR XDR-TB India 2026', '7d'),
    source: 'TB WATCH', type: 'disease',
  },

  // WHO / ICMR / NCDC official alerts
  {
    url: gnews('WHO India alert OR ICMR warning OR NCDC India OR "National Centre for Disease Control" outbreak advisory', '3d'),
    source: 'WHO / ICMR', type: 'disease',
  },

  // Hospital system stress signals
  {
    url: gnews('India "hospital beds full" OR "ICU overflow" OR "oxygen shortage hospital" OR "blood bank shortage" OR mass casualty India', '2d'),
    source: 'HOSPITAL STRESS', type: 'health',
  },

  // Broad health sentinel (keep existing, improved query)
  {
    url: gnews('India disease outbreak epidemic health emergency hospital collapse poison food contamination deaths', '2d'),
    source: 'HEALTH SENTINEL', type: 'health',
  },
  {
    url: gnews('India road accident deaths highway train derailment bus truck crash expressway aviation incident', '1d'),
    source: 'TRAFFIC DESK', type: 'traffic',
  },
  {
    url: gnews('India bridge collapse building collapse dam breach power outage grid failure gas pipeline metro shutdown airport', '1d'),
    source: 'INFRA WATCH', type: 'infra',
  },
  {
    url: gnews('Indian Army Navy IAF DRDO LOC LAC border standoff ceasefire Agni missile defence acquisition', '2d'),
    source: 'MILITARY DESK', type: 'military',
  },
  {
    url: gnews('PM Modi President Murmu Home Minister Chief Minister VVIP SPG protection convoy visit India', '1d'),
    source: 'VIP TRACKER', type: 'vip',
  },
  {
    url: gnews('Pakistan military China PLA Bangladesh Myanmar Nepal earthquake Sri Lanka Maldives Afghanistan Taliban', '2d'),
    source: 'NEIGHBOURHOOD WATCH', type: 'conflict',
  },
];

// ── Risk classifier ──────────────────────────────────────────────────────────

function getRiskLevel(title: string, type: IntelCategory): IntelItem['riskLevel'] {
  const t = title.toLowerCase();
  // Disease-specific critical signals
  if (type === 'disease' && /nipah|ebola|marburg|hanta|lassa|crimean|outbreak|deaths|spread|confirmed case/.test(t))
    return 'critical';
  if (/attack|blast|killed|terror|explosion|collapse|outbreak|critical|fire|bomb|nipah|ebola|marburg|hanta/.test(t))
    return 'critical';
  // IMD red alert / extreme weather → critical
  if (/red alert|cyclone landfall|extremely heavy rain|very severe cyclone|extremely severe|earthquake above|gas leak|chemical leak|toxic gas|evacuation ordered/.test(t))
    return 'critical';
  if (/warning|alert|breach|riot|protest|arrest|injured|emergency|flood|accident|bandh|strike|action|threat|sena|face action|ultimatum|deadline|surge|swine flu|bird flu|dengue deaths|malaria deaths|cholera/.test(t))
    return 'high';
  // IMD orange alert / severe weather → high
  if (/orange alert|heavy rain warning|flood warning|cyclone warning|heatwave warning|severe cyclone|storm warning|hailstorm|thunderstorm kills|severe aqi|hazardous aqi|cold wave warning|heat wave warning/.test(t))
    return 'high';
  // IMD yellow alert / weather advisory → medium
  if (/yellow alert|imd forecast|imd predict|rain expected|heat advisory|weather advisory|air quality index|moderate aqi|tremor|earthquake|aqi spike/.test(t))
    return 'medium';
  if (/update|advisory|probe|delay|outage|disruption|shortage|blocked|diverted|case detected|monitoring/.test(t))
    return 'medium';
  return 'info';
}

// ── Time formatter ───────────────────────────────────────────────────────────

function getRelativeTime(date: Date): string {
  if (isNaN(date.getTime())) return 'recently';
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 60)  return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}


// ── Geo-coordinates by city keyword ─────────────────────────────────────────

const REGION_COORDS: { keys: string[]; lat: number; lon: number }[] = [
  { keys: ['bangalore', 'bengaluru', 'bbmp', 'bescom', 'bwssb', 'bmtc', 'blr'], lat: 12.9716, lon: 77.5946 },
  { keys: ['hyderabad', 'ghmc', 'tgspdcl', 'secunderabad', 'telangana'],         lat: 17.3850, lon: 78.4867 },
  { keys: ['mumbai', 'bombay', 'bmc', 'mcgm', 'dharavi', 'thane'],               lat: 19.0760, lon: 72.8777 },
  { keys: ['delhi', 'dmrc', 'mcd', 'dpcc', 'ncr', 'noida', 'gurgaon'],           lat: 28.6139, lon: 77.2090 },
  { keys: ['chennai', 'madras'],                                                   lat: 13.0827, lon: 80.2707 },
  { keys: ['kolkata', 'calcutta'],                                                 lat: 22.5726, lon: 88.3639 },
  { keys: ['pune'],                                                                lat: 18.5204, lon: 73.8567 },
  { keys: ['bhopal', 'indore', 'madhya pradesh'],                                 lat: 23.2599, lon: 77.4126 },
  { keys: ['jaipur', 'rajasthan'],                                                 lat: 26.9124, lon: 75.7873 },
  { keys: ['ahmedabad', 'gujarat', 'surat'],                                       lat: 23.0225, lon: 72.5714 },
  { keys: ['pakistan', 'islamabad', 'karachi', 'lahore'],                         lat: 33.6844, lon: 73.0479 },
  { keys: ['loc', 'kashmir', 'srinagar'],                                         lat: 34.0837, lon: 74.7973 },
];

function extractCoords(title: string): { lat?: number; lon?: number } {
  const t = title.toLowerCase();
  for (const r of REGION_COORDS) {
    if (r.keys.some(k => t.includes(k))) return { lat: r.lat, lon: r.lon };
  }
  return {};
}

// ── Translation — detects Indic scripts by Unicode range, no API key needed ──
// Covers: Devanagari (Hindi/Marathi), Gujarati, Kannada, Telugu, Tamil,
//         Malayalam, Bengali, Gurmukhi, Oriya, Arabic (Urdu).

function needsTranslation(headline: string): boolean {
  let count = 0;
  for (let i = 0; i < headline.length; i++) {
    const cp = headline.charCodeAt(i);
    // Devanagari 0x0900-0x097F, Bengali 0x0980-0x09FF, Gurmukhi 0x0A00-0x0A7F,
    // Gujarati 0x0A80-0x0AFF, Oriya 0x0B00-0x0B7F, Tamil 0x0B80-0x0BFF,
    // Telugu 0x0C00-0x0C7F, Kannada 0x0C80-0x0CFF, Malayalam 0x0D00-0x0D7F,
    // Arabic 0x0600-0x06FF (Urdu)
    if ((cp >= 0x0600 && cp <= 0x06FF) || (cp >= 0x0900 && cp <= 0x0D7F)) {
      count++;
      if (count >= 3) return true;
    }
  }
  return false;
}

async function translateOne(text: string): Promise<string> {
  try {
    const url =
      'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=' +
      encodeURIComponent(text);
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(6000),
    });
    if (!resp.ok) return text;
    const data = await resp.json();
    const parts: string = (data?.[0] as any[])
      ?.map((seg: any[]) => seg?.[0] ?? '')
      .join('')
      .trim();
    return parts || text;
  } catch {
    return text;
  }
}

async function translateItems(items: IntelItem[]): Promise<IntelItem[]> {
  const jobs = items.map((item) =>
    needsTranslation(item.headline)
      ? translateOne(item.headline)
      : Promise.resolve(item.headline)
  );
  const translated = await Promise.all(jobs);
  return items.map((item, i) =>
    translated[i] !== item.headline ? { ...item, headline: translated[i] } : item
  );
}

// ── Groq enrichment ───────────────────────────────────────────────────────────
// System prompt lives in api/enrichment/intel-v2.js.
// Keeps climate/disease (any location) + monitored-city incidents; drops the rest.

async function enrichWithGroq(items: IntelItem[]): Promise<IntelItem[]> {
  if (items.length === 0) return items;
  try {
    const resp = await fetch('/api/enrichment/intel-v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headlines: items.map((n) => n.headline) }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!resp.ok) return items;
    const { items: enriched } = await resp.json();

    if (!enriched || enriched.length === 0) return items;

    const result = items
      .map((item, i) => {
        const e = enriched?.[i];
        if (!e) return item;
        if (e.score < 4) return null; // drop non-city, non-climate noise
        return {
          ...item,
          headline:      e.headline   || item.headline,
          relevanceScore: e.score,
          sentiment:     e.sentiment,
          summary:       e.summary,
          type:          (e.category  || item.type) as IntelCategory,
        };
      })
      .filter(Boolean) as IntelItem[];

    return result.length > 0 ? result : items;
  } catch {
    return items;
  }
}

// ── RSS parser ────────────────────────────────────────────────────────────────

function parseRss(xml: string, source: string, type: IntelCategory): IntelItem[] {
  const items: IntelItem[] = [];
  try {
    const parser = new DOMParser();
    const doc    = parser.parseFromString(xml, 'text/xml');

    let els    = doc.querySelectorAll('item');
    let isAtom = false;
    if (els.length === 0) { els = doc.querySelectorAll('entry'); isAtom = true; }
    if (els.length === 0) return items;

    let count = 0;
    els.forEach((el) => {
      if (count >= 8) return;

      let title      = el.querySelector('title')?.textContent?.trim() ?? '';
      const atomLink = el.querySelector('link[href]')?.getAttribute('href')?.trim();
      const rssLink  = el.querySelector('link')?.textContent?.trim();
      const link     = isAtom ? (atomLink ?? rssLink ?? '') : (rssLink ?? atomLink ?? '');
      const pubDate  = isAtom
        ? (el.querySelector('published')?.textContent?.trim() ??
           el.querySelector('updated')?.textContent?.trim() ?? '')
        : (el.querySelector('pubDate')?.textContent?.trim() ?? '');

      if (!title || title.length < 8) return;

      // Strip Google News publisher suffix
      title = title.replace(/\s+-\s+[^-]{2,60}$/, '').trim();

      const pubTs = pubDate ? new Date(pubDate).getTime() : Date.now();
      if (isNaN(pubTs) || Date.now() - pubTs > 48 * 3_600_000) return;

      const risk   = getRiskLevel(title, type);
      const time   = pubDate ? getRelativeTime(new Date(pubDate)) : 'recently';
      const coords = extractCoords(title);

      items.push({
        id:        `intel-${Math.random().toString(36).slice(2, 9)}`,
        headline:  title,
        source,
        time,
        url:       link || undefined,
        type,
        riskLevel: risk,
        ...coords,
      });
      count++;
    });
  } catch { /* non-fatal */ }
  return items;
}

// ── Cache + main export ───────────────────────────────────────────────────────

let _cache:   IntelItem[] | null = null;
let _cacheTs  = 0;

// ── Handles monitored via Groq Scout ─────────────────────────────────────────
const SCOUT_HANDLES = [
  'blrcitytraffic', 'BlrCityPolice', 'BBMPCOMM', 'Bescom_Bangalore', 'bwssb_bangalore',
  'NammaMetro', 'BMTC_BENGALURU', 'GHMCOnline', 'mybmc', 'MumbaiPolice',
  'dtptraffic', 'OfficialDMRC', 'NDRFHQ', 'CPCB_OFFICIAL', 'Indiametdept',
  'NHM_Karnataka', 'KPTCL_Official',
];

async function fetchHandleIntel(): Promise<IntelItem[]> {
  try {
    const resp = await fetch('/api/twitter-intel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handles: SCOUT_HANDLES }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!resp.ok) return [];
    const { items } = await resp.json();
    if (!items?.length) return [];
    return items.map((it: { headline: string; category: string; riskLevel: string; source: string }) => ({
      id:        `scout-${Math.random().toString(36).slice(2, 9)}`,
      headline:  it.headline,
      source:    `@${it.source}`,
      time:      'just now',
      type:      (it.category || 'general') as IntelCategory,
      riskLevel: (it.riskLevel || 'info') as IntelItem['riskLevel'],
    }));
  } catch {
    return [];
  }
}

export async function fetchLiveIntel(): Promise<IntelItem[]> {
  if (_cache && Date.now() - _cacheTs < CACHE_TTL) return _cache;

  const allRaw: IntelItem[] = [];

  // Run RSS feeds
  await Promise.allSettled(
    INTEL_FEEDS.map(async (feed) => {
      const urls = [feed.url, ...(feed.altUrl ? [feed.altUrl] : [])];
      for (const u of urls) {
        try {
          const ctrl = new AbortController();
          const tid  = setTimeout(() => ctrl.abort(), 9000);
          const resp = await fetch(u, { signal: ctrl.signal });
          clearTimeout(tid);
          if (!resp.ok) continue;
          const xml = await resp.text();
          if (!xml || xml.length < 80 || xml.trim().startsWith('{')) continue;
          const parsed = parseRss(xml, feed.source, feed.type);
          if (parsed.length > 0) { allRaw.push(...parsed); break; }
        } catch { /* try next url */ }
      }
    }),
  );

  // Deduplicate by headline prefix and cap major topics to prevent flooding (max 3 per topic)
  const seen = new Set<string>();
  const topicCounts: Record<string, number> = {};

  const getTopicKey = (h: string): string | null => {
    const lh = h.toLowerCase();
    if (/ebola/.test(lh)) return 'ebola';
    if (/nipah/.test(lh)) return 'nipah';
    if (/mpox|monkeypox/.test(lh)) return 'mpox';
    if (/dengue/.test(lh)) return 'dengue';
    if (/cholera|malaria|typhoid/.test(lh)) return 'other_disease';
    if (/flood|waterlog|inundat|submerg/.test(lh)) return 'flooding';
    if (/cyclone|storm|landfall|typhoon/.test(lh)) return 'cyclone';
    if (/heatwave|heat wave/.test(lh)) return 'heatwave';
    if (/protest|strike|bandh|dharna|rally|march|agitat/.test(lh)) return 'protest';
    if (/earthquake|tremor|seismic/.test(lh)) return 'earthquake';
    return null;
  };

  const deduped = allRaw.filter((item) => {
    const key = item.headline.toLowerCase().replace(/\s+/g, ' ').slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);

    const topic = getTopicKey(item.headline);
    if (topic) {
      const count = topicCounts[topic] || 0;
      if (count >= 3) return false;
      topicCounts[topic] = count + 1;
    }
    return true;
  });

  // Sort: critical first, then high
  deduped.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, info: 3 };
    return order[a.riskLevel] - order[b.riskLevel];
  });

  // Step 1: translate any Indic-script headlines to English
  const translated = await translateItems(deduped);

  // Step 2: Groq location filter + enrichment (top 40)
  const toEnrich = translated.slice(0, 40);
  const enriched = await enrichWithGroq(toEnrich);
  const rest     = translated.slice(40);

  _cache   = [...enriched, ...rest];
  _cacheTs = Date.now();
  return _cache;
}
