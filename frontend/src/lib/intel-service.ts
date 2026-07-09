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
 *
 * GEOFENCE: every item is gated to the 5 monitored cities
 *           (Bangalore · Delhi · Hyderabad · Mumbai · Chennai). National-only
 *           and foreign items (e.g. Kerala monsoon, Italy earthquake) are
 *           dropped via resolveCityFromText() shared with news-service.
 */

import { resolveCityFromText, CITY_COORDS, SUPPORTED_CITIES, type SupportedCity } from './news-service';
import { passesSemanticVet, riskWeight } from './semantic-gate';
import { isJunk } from './noise-filter';

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
    url: gnews('"Bengaluru Traffic Police" OR "Bengaluru traffic" OR "Bangalore traffic" alert advisory diversion accident road block "alternate routes"', '1d'),
    source: 'BLR TRAFFIC POLICE', type: 'traffic',
  },

  // BLR protest advisories — Freedom Park is the city's designated protest venue
  {
    url: gnews('(Bengaluru OR Bangalore) (protest OR rally OR dharna OR morcha OR "Freedom Park") ("traffic advisory" OR diversion OR "alternate routes" OR police OR gathering)', '1d'),
    source: 'BLR PROTEST WATCH', type: 'protest',
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

  // ══ LOCAL & NATIONAL DAILIES (site-scoped, grouped by language) ════════════
  // Each group is pinned to its city/state so the 5-city geofence keeps them.
  // Vernacular headlines are auto-translated to English downstream.

  // Kannada press → Bengaluru / Karnataka
  {
    url: gnews('(site:vijayavani.net OR site:vijaykarnataka.com OR site:prajavani.net OR site:udayavani.com OR site:kannadaprabha.com) (Bengaluru OR Bangalore OR Karnataka)', '2d'),
    source: 'KANNADA PRESS', type: 'general',
  },
  // Marathi press → Mumbai / Maharashtra
  {
    url: gnews('(site:lokmat.com OR site:esakal.com OR site:maharashtratimes.com OR site:pudhari.news OR site:loksatta.com) (Mumbai OR Maharashtra)', '2d'),
    source: 'MARATHI PRESS', type: 'general',
  },
  // Telugu press → Hyderabad / Telangana
  {
    url: gnews('(site:eenadu.net OR site:sakshi.com OR site:andhrajyothy.com OR site:ntnews.com OR site:velugu.v6velugu.com) (Hyderabad OR Telangana)', '2d'),
    source: 'TELUGU PRESS', type: 'general',
  },
  // Urdu press → Hyderabad (Deccan)
  {
    url: gnews('(site:siasat.com OR site:munsifdaily.com OR site:etemaad.com OR site:therahnuma.com) (Hyderabad OR Telangana)', '2d'),
    source: 'URDU PRESS', type: 'general',
  },
  // Hindi press → Delhi / NCR
  {
    url: gnews('(site:bhaskar.com OR site:jagran.com OR site:livehindustan.com OR site:amarujala.com OR site:patrika.com OR site:navbharattimes.indiatimes.com OR site:punjabkesari.in) (Delhi OR NCR OR Noida OR Gurugram)', '2d'),
    source: 'HINDI PRESS', type: 'general',
  },
  // English national dailies → any of the 5 cities (geofence narrows to city items)
  {
    url: gnews('(site:timesofindia.indiatimes.com OR site:thehindu.com OR site:hindustantimes.com OR site:indianexpress.com OR site:economictimes.indiatimes.com) (Bengaluru OR Mumbai OR Delhi OR Hyderabad OR Chennai)', '1d'),
    source: 'NATIONAL PRESS', type: 'general',
  },

  // ══ FOREIGN CONSULATES & DIPLOMATIC MISSIONS (security/closure/protest) ═════
  // Text-gated: city name in the query keeps results inside the 5-city scope.
  {
    url: gnews('(consulate OR "Consulate General" OR "Deputy High Commission" OR embassy OR "diplomatic mission") Mumbai (security OR threat OR protest OR closed OR shut OR alert OR advisory OR evacuat OR bomb OR attack)', '3d'),
    source: 'DIPLOMATIC WATCH', type: 'vip',
  },
  {
    url: gnews('(consulate OR "Consulate General" OR "Deputy High Commission" OR embassy OR "diplomatic mission") (Bengaluru OR Bangalore) (security OR threat OR protest OR closed OR shut OR alert OR advisory OR evacuat OR bomb OR attack)', '3d'),
    source: 'DIPLOMATIC WATCH', type: 'vip',
  },
  {
    url: gnews('(consulate OR "Consulate General" OR "Deputy High Commission" OR embassy OR "diplomatic mission") Hyderabad (security OR threat OR protest OR closed OR shut OR alert OR advisory OR evacuat OR bomb OR attack)', '3d'),
    source: 'DIPLOMATIC WATCH', type: 'vip',
  },
];

// ── City-pinned community / forum feeds ──────────────────────────────────────
// These sources are inherently city-scoped (a subreddit, a city civic portal),
// but their post titles rarely contain the city name — so they would be wrongly
// dropped by the text geofence. We fetch them separately and PIN them to a city.

type PinnedFeed = { url: string; source: string; type: IntelCategory; city: SupportedCity };

// Reddit subreddit, filtered to civic/crisis chatter via search RSS.
function reddit(sub: string): string {
  const q = 'power OR water OR traffic OR flood OR protest OR fire OR accident OR ' +
            'metro OR strike OR outage OR road OR bandh OR curfew OR police OR rain';
  const u = `https://www.reddit.com/r/${sub}/search.rss?restrict_sr=on&sort=new&` +
            `q=${encodeURIComponent(q)}`;
  return `/api/rss-proxy?url=${encodeURIComponent(u)}`;
}

const PINNED_CITY_FEEDS: PinnedFeed[] = [
  // ── Reddit communities ──
  { url: reddit('bangalore'), source: 'r/bangalore', type: 'general', city: 'BANGALORE' },
  { url: reddit('mumbai'),    source: 'r/mumbai',    type: 'general', city: 'MUMBAI'    },
  { url: reddit('hyderabad'), source: 'r/hyderabad', type: 'general', city: 'HYDERABAD' },

  // ── Citizen Matters — civic journalism (Bengaluru & Mumbai) ──
  { url: gnews('site:citizenmatters.in (Bengaluru OR Bangalore)', '4d'), source: 'CITIZEN MATTERS', type: 'infra', city: 'BANGALORE' },
  { url: gnews('site:citizenmatters.in Mumbai', '4d'),                    source: 'CITIZEN MATTERS', type: 'infra', city: 'MUMBAI'    },
  // Team-BHP (car catalog) and LBB (lifestyle) removed — net noise for a risk feed.
];

// ── Relevance gate ───────────────────────────────────────────────────────────
// The intel feed monitors OPERATIONAL RISK only. These patterns drop the noise
// that loose Google-News / handle queries drag in (car catalogs, lifestyle
// listicles, jobs/exam results, ePaper headers, markets, sports, political fluff).
const NOISE_PATTERNS: RegExp[] = [
  // Automotive catalog / reviews (retail promos + vehicle model names now live
  // in the shared noise-filter module — see passesRelevance below)
  /\bprice in\b|on-?road (cost|price)|\bemi\b|\bmileage\b|\bspecs?\b|\bvariants?\b|\bcolou?rs\b|\breview\b|test drive|driving impressions|\blaunch(ed|es)?\b.*\b(bike|car|scooter|suv|ev)\b/i,
  // Lifestyle / discovery
  /\bbest (places|recommendations|brands)|things to do|top places|discover |\bcafe|restaurant|antiques|apparel|shopping|where to (eat|shop)|pop-?up|hidden gems|weekend (guide|getaway)/i,
  // Jobs / exams / results / admissions
  /recruitment|vacanc|job mela|jobs in|govt jobs|notification out|admit card|results? (announced|out)|first rank|cet result|colleges?|school holiday|private school|deo posts|tg?psc|exam date|hall ticket|free bus pass|scheme for students/i,
  // ePaper / galleries / section headers
  /epaper|e-paper|district edition|\bnewspaper\b|video galler|photo galler|news video|\b(business|entertainment|world|national|sports|top|latest) news\b/i,
  // Political fluff / ceremony
  /congratulat|felicitat|seasoned politician|nomination papers|cabinet portfolio|takes? oath|allocates? .*portfolio|happy birthday|warm wishes|birthday wishes|meets? cm|pays? tribute|inaugurat|foundation stone|World Environment Day|tree drive|green pledge/i,
  // Markets / finance
  /sensex|nifty|\bbse\b|\bnse\b|equities|foreign institutional|stock market|share price|market cap|ipo\b/i,
  // Sports / celebrity / fuel-consumer / misc
  /\bipl\b|\bt20\b|captaincy|suryakumar|\bcricket\b|bollywood|\bactor\b|\bactress\b|box office|\be85\b|\be20\b|petrol price|diesel price|fuel (price|launched|introduced)|medical tourism|yatra|pilgrimage/i,
];

// At least one operational-risk term must be present (broad civic + crisis vocab).
const RISK_KEYWORDS: string[] = [
  'traffic', 'jam', 'gridlock', 'diversion', 'road closure', 'road closed', 'roadblock',
  'accident', 'crash', 'collision', 'derail', 'pothole', 'waterlog', 'flood', 'inundat',
  'submerg', 'rain', 'downpour', 'cloudburst', 'storm', 'cyclone', 'landslide', 'earthquake',
  'tremor', 'heatwave', 'heat wave', 'aqi', 'air quality', 'pollution', 'smog', 'fire',
  'blaze', 'gas leak', 'chemical', 'blast', 'bomb', 'explosion', 'ied', 'terror', 'attack',
  'encounter', 'naxal', 'shot', 'shoot', 'murder', 'killed', 'dead', 'body', 'assault',
  'rape', 'kidnap', 'robbery', 'theft', 'crime', 'arrest', 'detained', 'fir', 'fir lodged',
  'protest', 'strike', 'bandh', 'dharna', 'rally', 'agitation', 'riot', 'clash', 'curfew',
  'section 144', 'lockdown', 'power cut', 'power outage', 'outage', 'grid', 'load shedding',
  'water supply', 'water cut', 'sewer', 'drainage', 'desilt', 'nalla', 'leak', 'metro', 'bmtc',
  'ksrtc', 'best bus', 'local train', 'rail', 'dmrc', 'disruption', 'delay', 'suspended',
  'evacuat', 'rescue', 'ndrf', 'disaster', 'emergency', 'alert', 'warning', 'advisory',
  'dengue', 'malaria', 'cholera', 'covid', 'outbreak', 'epidemic', 'disease', 'hospital',
  'casualty', 'injured', 'missing', 'collapse', 'flyover', 'bridge', 'drunk driving', 'snatch',
  'molest', 'firing', 'hooch', 'stampede', 'drown', 'electrocut',
  // vehicle / road mishaps (avoid bare "bus" → matches "business")
  'overturn', 'rams', 'ran over', 'run over', 'out of control', 'mishap', 'truck', 'lorry',
  'tanker', 'ploughed', 'hit-and-run', 'hit and run',
];

function passesRelevance(headline: string): boolean {
  const t = (headline || '').toLowerCase();
  if (!t) return false;
  // Shared consolidated junk filter first (single source of truth — new drop
  // rules belong in noise-filter.ts, not in the local patterns above).
  if (isJunk(headline)) return false;
  if (NOISE_PATTERNS.some(re => re.test(t))) return false;
  if (!RISK_KEYWORDS.some(k => t.includes(k))) return false;
  // Task 1 — semantic vetting ("bunkum" filter): drop isolated viral /
  // sensational / single-victim incidents that merely name a monitored city,
  // while letting collective-action and macro/systemic events through.
  // Runs on the original-case headline (patterns are case-insensitive).
  return passesSemanticVet(headline);
}

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


// ── Geo-coordinates — restricted to the 5 monitored cities ──────────────────
// Uses the shared resolveCityFromText() so map plotting stays inside the 5-city
// scope and never drops a pin on Kolkata / Pakistan / Kashmir etc.

function extractCoords(title: string, city?: SupportedCity | null): { lat?: number; lon?: number } {
  const resolved = city ?? resolveCityFromText(title);
  if (resolved && CITY_COORDS[resolved]) {
    const [lat, lon] = CITY_COORDS[resolved];
    return { lat, lon };
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

// Heuristic 0–10 relevance score. Ranks the brief and, crucially, acts as the
// fallback when the LLM enrichment is unavailable (Groq 429 / no key) — without
// it the brief showed unranked, loosely-relevant items.
function heuristicScore(item: IntelItem): number {
  let s = 2 + riskWeight(item.headline || '');
  const src = (item.source || '').toLowerCase();
  if ((item as IntelItem & { _pin?: boolean })._pin ||
      /pib|imd|cert|ndma|ndrf|police|bescom|bmc|ghmc|dmrc|bbmp|traffic|metro/.test(src)) s += 1;
  const ts = new Date(item.time).getTime();
  if (!isNaN(ts) && Date.now() - ts < 6 * 3600_000) s += 1;
  if (item.riskLevel === 'critical') s += 1;
  return Math.min(10, s);
}

async function enrichWithGroq(items: IntelItem[]): Promise<IntelItem[]> {
  if (items.length === 0) return items;

  // Try the LLM enrichment; on any failure `enriched` stays null and we fall
  // back to the heuristic score so the feed is still relevance-ranked.
  let enriched: Array<{ score?: number; headline?: string; sentiment?: number; summary?: string[]; category?: string }> | null = null;
  try {
    const resp = await fetch('/api/enrichment/intel-v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headlines: items.map((n) => n.headline) }),
      signal: AbortSignal.timeout(45_000),
    });
    if (resp.ok) {
      const data = await resp.json();
      enriched = Array.isArray(data?.items) ? data.items : null;
    }
  } catch { enriched = null; }

  const HEURISTIC_MIN = 4;
  const scored = items
    .map((item, i) => {
      const e = enriched?.[i];
      if (e && typeof e.score === 'number') {
        if (e.score < 4) return null; // LLM says noise
        return {
          ...item,
          headline:      e.headline || item.headline,
          relevanceScore: e.score,
          sentiment:     e.sentiment,
          summary:       e.summary,
          type:          (e.category || item.type) as IntelCategory,
        } as IntelItem;
      }
      // No LLM score for this item → heuristic relevance fallback.
      const h = heuristicScore(item);
      if (h < HEURISTIC_MIN) return null;
      return { ...item, relevanceScore: h } as IntelItem;
    })
    .filter(Boolean) as IntelItem[];

  // Most relevant first.
  scored.sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));

  // Never blank the brief just because scoring was strict.
  return scored.length > 0 ? scored : items;
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
      // Freshness: keep news published within the last 14 hours — a morning
      // advisory for an all-day event (e.g. protest till 6pm) must survive.
      if (isNaN(pubTs) || Date.now() - pubTs > 14 * 3_600_000) return;

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

// ── Monitored X / Twitter handles → city ─────────────────────────────────────
// EDIT THIS MAP to add/remove handles. Each handle is pinned to one of the 5
// cities, so its tweets are geofenced by handle (not by text) and always kept.
// Backend (/api/twitter-intel) resolves them via Twitter API → Apify →
// Groq → Nitter → RSS-Bridge → RSSHub → Google News.
// Institutional civic / utility / police / transport handles ONLY.
// (Prominent-figure / political handles deliberately excluded — we only want
//  actionable advisories, not personal political posts.)
const HANDLE_CITY: Record<string, SupportedCity> = {
  // ── Bengaluru ──
  NammaBESCOM: 'BANGALORE', BlrCityPolice: 'BANGALORE', blrcitytraffic: 'BANGALORE',
  // ── Mumbai ──
  MumbaiPolice: 'MUMBAI', mybmc: 'MUMBAI', MTPHereToHelp: 'MUMBAI', myBESTBus: 'MUMBAI',
  // ── Hyderabad ──
  hydcitypolice: 'HYDERABAD', HYDTP: 'HYDERABAD', Ghmconline: 'HYDERABAD', tgspdcl: 'HYDERABAD',
  // ── Delhi ──
  DelhiPolice: 'DELHI', dtptraffic: 'DELHI', OfficialDMRC: 'DELHI',
  // ── Chennai ── (no handles supplied yet — add here when available)
};

const SCOUT_HANDLES = Object.keys(HANDLE_CITY);

// Lower-cased lookup so we can resolve a handle regardless of returned casing.
const HANDLE_CITY_LC: Record<string, SupportedCity> = Object.fromEntries(
  Object.entries(HANDLE_CITY).map(([h, c]) => [h.toLowerCase(), c]),
);

/** Resolve the city for a handle-sourced item: handle map first, then text. */
function resolveHandleCity(source: string, headline: string): SupportedCity | null {
  const h = source.replace(/^@/, '').toLowerCase();
  return HANDLE_CITY_LC[h] ?? resolveCityFromText(`${headline} ${source}`);
}

type RawHandleTweet = { headline: string; category?: string; riskLevel?: string; source: string; time?: string };

function mapHandleTweet(it: RawHandleTweet): (IntelItem & { _pin: true; _city: SupportedCity }) | null {
  const city = resolveHandleCity(it.source, it.headline);
  if (!city) return null; // not tied to a monitored city → drop
  const [lat, lon] = CITY_COORDS[city];
  let time = it.time || 'just now';
  if (it.time) {
    const d = new Date(it.time);
    if (!isNaN(d.getTime())) time = getRelativeTime(d);
  }
  return {
    id:        `scout-${Math.random().toString(36).slice(2, 9)}`,
    headline:  it.headline,
    source:    it.source.startsWith('@') ? it.source : `@${it.source}`,
    time,
    type:      (it.category || 'general') as IntelCategory,
    riskLevel: (it.riskLevel || 'info') as IntelItem['riskLevel'],
    lat, lon,
    _pin: true,
    _city: city,
  };
}

/** Live X-handle tweets via the backend aggregator (/api/twitter-intel). */
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
    return (items as RawHandleTweet[]).map(mapHandleTweet).filter(Boolean) as IntelItem[];
  } catch {
    return [];
  }
}

/**
 * Optional static handle feed produced by the Python route (Scweet/Twikit).
 * The script writes frontend/public/twitter-intel.json as { items:[...] }; we
 * load it at /twitter-intel.json (cache-busted) and ingest it like live tweets.
 */
async function fetchStaticHandleIntel(): Promise<IntelItem[]> {
  try {
    const resp = await fetch(`/twitter-intel.json?t=${Math.floor(Date.now() / 60000)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    const items = (Array.isArray(data) ? data : data.items) as RawHandleTweet[] | undefined;
    if (!items?.length) return [];
    return items.map(mapHandleTweet).filter(Boolean) as IntelItem[];
  } catch {
    return [];
  }
}

// ── Open-Meteo weather alerts (no API key, CORS-enabled) ─────────────────────
// Turns the hourly forecast for each of the 5 cities into operational alerts
// (heavy rain, storm/wind, heatwave). Only emits when a threshold is crossed —
// calm weather produces nothing.

function titleCaseCity(c: string): string {
  return c.charAt(0) + c.slice(1).toLowerCase();
}

async function fetchCityWeatherAlerts(city: SupportedCity): Promise<IntelItem[]> {
  const [lat, lon] = CITY_COORDS[city];
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=rain,showers,wind_gusts_10m,wind_speed_10m` +
    `&forecast_days=2&timezone=auto`;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return [];
    const data = await resp.json();
    const h = data?.hourly;
    if (!h?.time?.length) return [];

    const n = Math.min(24, h.time.length); // next ~24 hours
    let maxRain = 0, maxGust = 0;
    for (let i = 0; i < n; i++) {
      const rain = (h.rain?.[i] ?? 0) + (h.showers?.[i] ?? 0);
      if (rain > maxRain) maxRain = rain;
      const g = h.wind_gusts_10m?.[i] ?? 0;
      if (g > maxGust) maxGust = g;
    }

    const C = titleCaseCity(city);
    const alerts: IntelItem[] = [];
    const push = (headline: string, riskLevel: IntelItem['riskLevel']) => {
      alerts.push({
        id: `wx-${city}-${Math.random().toString(36).slice(2, 7)}`,
        headline,
        source: 'OPEN-METEO',
        time: 'forecast',
        url: `https://open-meteo.com/en/docs#latitude=${lat}&longitude=${lon}`,
        type: 'infra',
        riskLevel,
        lat, lon,
        ...( { _pin: true, _city: city } ),
      } as IntelItem);
    };

    // Rainfall (rain + showers, mm/h)
    if (maxRain >= 15)      push(`Very heavy rain forecast for ${C} — up to ${maxRain.toFixed(1)} mm/h within 24h (flooding risk)`, 'critical');
    else if (maxRain >= 7)  push(`Heavy rain forecast for ${C} — up to ${maxRain.toFixed(1)} mm/h within 24h`, 'high');
    else if (maxRain >= 2.5)push(`Rain showers expected in ${C} — up to ${maxRain.toFixed(1)} mm/h within 24h`, 'medium');

    // Wind gusts (km/h) — storm / squall
    if (maxGust >= 60)      push(`Storm-force winds forecast for ${C} — gusts up to ${Math.round(maxGust)} km/h (weather warning)`, 'high');
    else if (maxGust >= 40) push(`Gusty winds / squall forecast for ${C} — gusts up to ${Math.round(maxGust)} km/h (weather advisory)`, 'medium');

    return alerts;
  } catch {
    return [];
  }
}

async function fetchWeatherAlerts(): Promise<IntelItem[]> {
  const settled = await Promise.allSettled(
    SUPPORTED_CITIES.map(c => fetchCityWeatherAlerts(c as SupportedCity)),
  );
  const out: IntelItem[] = [];
  settled.forEach(r => { if (r.status === 'fulfilled') out.push(...r.value); });
  return out;
}

export async function fetchLiveIntel(): Promise<IntelItem[]> {
  if (_cache && Date.now() - _cacheTs < CACHE_TTL) return _cache;

  const allRaw: IntelItem[] = [];

  // X/Twitter handle tweets: the live backend aggregator (/api/twitter-intel)
  // is back — it now leads with RSS-verified Nitter mirrors, caches results
  // server-side for 10 min, and falls back to Apify/Twitter API/Groq. The
  // optional static Python output (/twitter-intel.json) is still ingested too.
  const handlePromise = Promise.allSettled([fetchHandleIntel(), fetchStaticHandleIntel()])
    .then(results => {
      results.forEach(r => { if (r.status === 'fulfilled') allRaw.push(...r.value); });
    });

  // Live Open-Meteo weather alerts (heavy rain / storm / heatwave per city).
  const weatherPromise = fetchWeatherAlerts()
    .then(items => { allRaw.push(...items); })
    .catch(() => { /* ignore */ });

  // City-pinned community/forum feeds (Reddit, Citizen Matters, Team-BHP, LBB).
  const pinnedPromise = Promise.allSettled(
    PINNED_CITY_FEEDS.map(async (feed) => {
      try {
        const ctrl = new AbortController();
        const tid  = setTimeout(() => ctrl.abort(), 9000);
        const resp = await fetch(feed.url, { signal: ctrl.signal });
        clearTimeout(tid);
        if (!resp.ok) return;
        const xml = await resp.text();
        if (!xml || xml.length < 80) return;
        const [lat, lon] = CITY_COORDS[feed.city];
        for (const it of parseRss(xml, feed.source, feed.type)) {
          (it as IntelItem & { _pin?: boolean; _city?: SupportedCity })._pin = true;
          (it as IntelItem & { _pin?: boolean; _city?: SupportedCity })._city = feed.city;
          it.lat = lat; it.lon = lon;
          allRaw.push(it);
        }
      } catch { /* ignore */ }
    }),
  );

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

  // Ensure handle/static tweets + pinned community feeds + weather have landed.
  await Promise.all([handlePromise, pinnedPromise, weatherPromise]);

  // Deduplicate by headline prefix. (Topic caps are applied LATER, after the
  // relevance gate + geofence — otherwise out-of-scope national items consume
  // the per-topic slots and squeeze out monitored-city news.)
  const seen = new Set<string>();

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
    return true;
  });

  // Sort: critical first, then high
  deduped.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, info: 3 };
    return order[a.riskLevel] - order[b.riskLevel];
  });

  // Step 1: translate any Indic-script headlines to English
  const translated = await translateItems(deduped);

  // Step 2: STRICT 5-CITY GEOFENCE — keep only items whose (translated) headline
  // is attributable to Bangalore / Delhi / Hyderabad / Mumbai / Chennai. This
  // drops national-only items (Kerala monsoon, "World News", UPSC editorials)
  // and foreign items (Italy / Christmas Island earthquakes) at the source.
  const gatedBefore = translated.length;
  const gated = translated.reduce<IntelItem[]>((acc, item) => {
    // Relevance gate first — drop catalog/lifestyle/jobs/markets/political noise.
    if (!passesRelevance(item.headline)) return acc;
    // Handle-sourced tweets are already pinned to a city — keep unconditionally.
    const pin = (item as IntelItem & { _pin?: boolean; _city?: SupportedCity });
    if (pin._pin && pin._city) {
      acc.push({ ...item, ...extractCoords(item.headline, pin._city), _city: pin._city } as IntelItem);
      return acc;
    }
    const hay = `${item.headline} ${item.source ?? ''}`;
    const city = resolveCityFromText(hay);
    if (!city) return acc; // not tied to a monitored city → drop
    acc.push({ ...item, ...extractCoords(item.headline, city), _city: city } as IntelItem);
    return acc;
  }, []);
  console.log(`[IntelService] Geofence: kept ${gated.length}/${gatedBefore} items (5-city scope)`);

  // Step 2b: topic caps — applied AFTER gating so only in-scope items consume
  // slots, and scoped per topic+city (severity-sorted, so the worst 3 survive).
  const topicCounts: Record<string, number> = {};
  const capped = gated.filter((item) => {
    const topic = getTopicKey(item.headline);
    if (!topic) return true;
    const cityKey = (item as IntelItem & { _city?: string })._city ?? 'NATIONAL';
    const key = `${topic}:${cityKey}`;
    const count = topicCounts[key] || 0;
    if (count >= 3) return false;
    topicCounts[key] = count + 1;
    return true;
  });

  // Step 3: Groq location filter + enrichment (top 40)
  const toEnrich = capped.slice(0, 40);
  const enriched = await enrichWithGroq(toEnrich);
  const rest     = capped.slice(40);

  _cache   = [...enriched, ...rest];
  _cacheTs = Date.now();
  return _cache;
}
