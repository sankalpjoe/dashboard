/**
 * Twitter/X Handle Intel — free-first, cached, diagnosable pipeline.
 *
 * Strategy:
 *  Phase A (fast + free, ~8s):  Nitter RSS (2026-verified instances) |
 *                               X syndication | Google News RSS
 *  Phase B (backup, ~12s):      Apify scraper | Twitter API v2 |
 *                               Groq web search | RSS-Bridge | RSSHub
 *  Phase B only runs if Phase A found nothing. Results are cached server-side
 *  for 10 minutes per handle-set, with a 2-hour stale fallback on total failure.
 *
 * POST /api/twitter-intel
 *   Body: { handles: string[], raw?: boolean } → handle timeline mode
 *   Body: { searchQuery: string }              → manual news search
 *   Response: { items, source, sources: [{name,status,count,ms}] }
 * GET /api/twitter-intel
 *   → health report: which keys are configured, which instances are used.
 */
import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

const GROQ_KEY = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
// Groq renamed `compound-beta` → `groq/compound` (the old ID now errors).
const GROQ_SEARCH_MODEL = process.env.GROQ_SEARCH_MODEL || 'groq/compound';

// ── Twitter API v2 credentials ────────────────────────────────────────────────
const TW_BEARER        = process.env.TWITTER_BEARER_TOKEN;
const TW_CONSUMER_KEY  = process.env.TWITTER_CONSUMER_KEY;
const TW_CONSUMER_SEC  = process.env.TWITTER_CONSUMER_SECRET;
const TW_ACCESS_TOKEN  = process.env.TWITTER_ACCESS_TOKEN;
const TW_ACCESS_SEC    = process.env.TWITTER_ACCESS_TOKEN_SECRET;

// Nitter instances verified to serve RSS as of 2026-07 (status.d420.de).
// Most instances run with RSS disabled — only list ones with the RSS ✅ flag.
const NITTER_INSTANCES = (process.env.NITTER_INSTANCES
  ? process.env.NITTER_INSTANCES.split(',').map(s => s.trim()).filter(Boolean)
  : [
      'xcancel.com',
      'nitter.poast.org',
      'nitter.privacyredirect.com',
      'nt.vern.cc',
    ]);

// RSSHub public instance — Twitter user timeline RSS
const RSSHUB_INSTANCES = [
  'rsshub.app',
  'rsshub.rssforever.com',
];

// RSS-Bridge public instances — TwitterBridge turns a public X profile into RSS.
const RSSBRIDGE_INSTANCES = (process.env.RSSBRIDGE_INSTANCES
  ? process.env.RSSBRIDGE_INSTANCES.split(',').map(s => s.trim()).filter(Boolean)
  : [
      'https://rssbridge.flossboxin.org.in',
    ]);

// Max tweet age (days) for handle timelines. Older posts are dropped as stale.
const TWITTER_MAX_AGE_DAYS = Number(process.env.TWITTER_MAX_AGE_DAYS || 2);
const TWITTER_MAX_AGE_MS = TWITTER_MAX_AGE_DAYS * 24 * 3600 * 1000;

// Apify cloud scraper (backup tier). Set APIFY_TOKEN in env to enable.
const APIFY_TOKEN = process.env.APIFY_TOKEN;
const APIFY_ACTOR = process.env.APIFY_TWITTER_ACTOR || 'nfp1fpt5gUlBwPcor';

const RSS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';

// ── Server-side result cache ─────────────────────────────────────────────────
// Fresh for 10 min (repeat panel clicks are instant and burn no credits);
// stale entries are kept 2 h and served only when every source fails.
const RESULT_CACHE = new Map(); // key → { ts, items, source }
const RESULT_TTL_MS = 10 * 60 * 1000;
const STALE_TTL_MS  = 2 * 60 * 60 * 1000;

// Cache for X profile syndication to avoid hitting rate limits (10 minutes)
const SYNDICATION_CACHE = new Map();
const CACHE_TTL = 10 * 60 * 1000;

// Cache for Twitter v2 user-ID lookups (they cost a rate-limited request each).
const TW_USERID_CACHE = new Map(); // handle → id

// ── Junk / noise terms — hard-drop any tweet containing these ────────────────
// Checked BEFORE the advisory filter, so a birthday wish mentioning "health"
// or a car ad mentioning "route"/"mileage" is dropped despite incidental
// advisory-keyword matches.
const JUNK_PATTERNS = [
  // Entertainment
  /\b(cricket|ipl|t20|odi|bollywood|film|movie|celebrity|match|tournament|world cup)\b/i,
  // Gaming / Anime
  /\b(anime|manga|gaming|esports|mobile game|game (launch|update|event))\b/i,
  // Consumer tech noise
  /\b(smartphone (launch|sale|price)|unboxing|review:|tips for|top \d+|how to)\b/i,
  // Finance noise
  /\b(sensex closes|nifty closes|ipo subscribed|quarterly earnings|share price|stock market)\b/i,
  // Generic promotions / ceremony
  /\b(congratulations?|felicitat|inaugurat|award ceremony|foundation stone)\b/i,
  // Greetings: birthdays, anniversaries, festivals, condolences, motivation
  /\b(happy (birthday|anniversary|new year|diwali|holi|eid|dussehra|navratri|pongal|onam|christmas|republic day|independence day)|birthday (wishes|greetings)|warm (wishes|greetings)|best wishes|heartiest|wishing (you|him|her|them)|many many happy returns|condolences?|heartfelt tribute|pays? (rich )?tribute|deepest sympathy|rest in peace|\brip\b|jayanti|punyatithi|martyrs?'? day greet|good morning|thought (of|for) the day|motivational quote)\b/i,
  // Automotive / vehicle sales & catalog
  /\b((car|bike|suv|sedan|scooter|ev|vehicle) (sale|deal|offer|launch|price|booking)|buy (a |your )?(car|bike|suv|scooter)|on-?road price|ex-?showroom|test drive|\bemi\b|down payment|mileage of|variants? (of|and price)|showroom|dealership|pre-?owned|used cars?|exchange (offer|bonus))\b/i,
  // Retail promos / offers / giveaways
  /\b(discount|% off|flat \d+|cashback|coupon|promo code|limited (time|period) offer|giveaway|contest alert|lucky draw|free gift|sale (is )?live|grab (the|your)|shop now|order now|book now|download (the|our) app)\b/i,
  // Horoscope / recruitment / exams
  /\b(horoscope|rashifal|zodiac|recruitment|vacanc(y|ies)|apply (now|online|before)|admit card|hall ticket|results? (declared|announced|out)|exam date|notification (out|released))\b/i,
  // Real-estate ads
  /\b(\d+\s?bhk|flats? for sale|plots? for sale|property (for sale|expo)|real estate (offer|investment)|book your (flat|plot|home))\b/i,
];

export function isJunkTweet(text) {
  const t = text.toLowerCase();
  return JUNK_PATTERNS.some(p => p.test(t));
}

// RSS-Bridge / Nitter / instance error pages that masquerade as a tweet.
const BRIDGE_ERROR_RE = /bridge returned error|returned error \d|error \d{3}|page not found|account.*(suspend|not found)|rate.?limit|instance is (down|offline)|no items|unable to (fetch|parse)/i;

// Operational ADVISORY filter for handle timelines — keep only actionable civic
// advisories (traffic, power, water, weather, health, emergencies, public
// safety). Drops everyday PR, greetings, achievements, generic announcements.
const ADVISORY_RE = /traffic|diversion|road (closed|closure|block)|\bjam\b|congestion|signal|parking|tow(ed|ing)?|\bpower\b|outage|shutdown|load.?shedding|water (supply|cut|logging)|waterlog|no water|disruption|\bdelay|suspend|metro|\bbus\b|\broute\b|service affected|flood|inundat|\brain|downpour|cyclone|storm|weather|\bimd\b|heatwave|\baqi\b|air quality|pollution|smog|\balert\b|warning|advisory|emergency|helpline|evacuat|rescue|\bfire\b|gas leak|smoke|dengue|malaria|cholera|outbreak|\bfever\b|health|hospital|accident|crash|collision|overturn|landslide|tree fall|wall collapse|building collapse|\bdrain|sewage|barricade|procession|\brally\b|vip movement|curfew|section 144|restriction|maintenance|breakdown|blockage|\bavoid\b|closed for/i;

export function isAdvisory(text) {
  return ADVISORY_RE.test(text || '');
}

/** Combined relevance check: junk takes precedence over advisory matches. */
export function isRelevantCivic(text) {
  if (!text || isJunkTweet(text) || isUselessTweet(text)) return false;
  return isAdvisory(text);
}

// Drop tweets that carry no real content: bridge errors, or text that is just a
// link (t.co / t.me / any URL) once stripped.
export function isUselessTweet(text) {
  if (!text) return true;
  if (BRIDGE_ERROR_RE.test(text)) return true;
  const stripped = text
    .replace(/https?:\/\/\S+/gi, '')   // strip any URL (t.co, t.me, etc.)
    .replace(/[#@]\S+/g, '')           // strip bare hashtags/mentions
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.length < 8;
}

// ── Parsers ──────────────────────────────────────────────────────────────────

function parseNitterXml(xml, handle) {
  const items = [];
  for (const b of [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 10)) {
    const c = b[1];
    const titleM = c.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || c.match(/<title>([\s\S]*?)<\/title>/);
    const linkM  = c.match(/<link>(https?:\/\/[^<]+)<\/link>/);
    const dateM  = c.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const descM  = c.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/);
    if (!titleM) continue;
    let headline = titleM[1].trim().replace(/^R to @\w+:\s*/, '').replace(/^@\w+:\s*/, '');
    headline = headline.replace(/https?:\/\/(t\.co|t\.me)\/\S+/gi, '').trim(); // drop t.co/t.me media links
    if (isJunkTweet(headline) || isUselessTweet(headline)) continue;
    const desc = descM ? descM[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 280) : '';
    items.push({
      headline,
      description: desc || undefined,
      source: handle,
      url: linkM ? linkM[1].replace(/nitter\.[^/]+/, 'x.com') : `https://x.com/${handle}`,
      time: dateM ? dateM[1].trim() : new Date().toUTCString(),
      riskLevel: 'info',
      category: 'general',
    });
  }
  return items;
}

function parseGnewsXml(xml, handle) {
  const items = [];
  for (const b of [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 8)) {
    const c = b[1];
    const titleM = c.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || c.match(/<title>([\s\S]*?)<\/title>/);
    const linkM  = c.match(/<link>(https?:\/\/[^<]+)<\/link>/);
    const dateM  = c.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    if (!titleM) continue;
    const headline = titleM[1].replace(/\s+-\s+[^-]{2,60}$/, '').trim();
    if (isJunkTweet(headline) || isUselessTweet(headline)) continue;
    items.push({
      headline,
      source: handle,
      url: linkM ? linkM[1] : `https://x.com/${handle}`,
      time: dateM ? dateM[1].trim() : new Date().toUTCString(),
      riskLevel: 'info',
      category: 'general',
    });
  }
  return items;
}

// ── Twitter API v2 (backup — free tier cannot read timelines) ────────────────
// (OAuth 1.0a signing removed: it was dead code — only Bearer auth is used —
//  and its node:crypto import broke the Vercel edge runtime.)

/**
 * Fetch recent tweets from a single Twitter user timeline via v2 API.
 * User-ID lookups are cached (they cost a rate-limited request each).
 */
async function fetchUserTweetsV2(handle) {
  if (!TW_BEARER) return [];
  try {
    let userId = TW_USERID_CACHE.get(handle.toLowerCase());
    if (!userId) {
      const userUrl = `https://api.twitter.com/2/users/by/username/${handle}?user.fields=id,name,username`;
      const userResp = await fetch(userUrl, {
        headers: { Authorization: `Bearer ${decodeURIComponent(TW_BEARER)}` },
        signal: AbortSignal.timeout(6000),
      });
      if (!userResp.ok) return [];
      const userData = await userResp.json();
      userId = userData?.data?.id;
      if (!userId) return [];
      TW_USERID_CACHE.set(handle.toLowerCase(), userId);
    }

    const tweetUrl = `https://api.twitter.com/2/users/${userId}/tweets` +
      `?max_results=20` +
      `&tweet.fields=created_at,text,author_id` +
      `&exclude=retweets,replies`;

    const tweetResp = await fetch(tweetUrl, {
      headers: { Authorization: `Bearer ${decodeURIComponent(TW_BEARER)}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!tweetResp.ok) return [];
    const tweetData = await tweetResp.json();
    const tweets = tweetData?.data ?? [];

    return tweets
      .filter(t => t.text && t.text.length > 10 && !isJunkTweet(t.text))
      .map(t => ({
        headline: t.text.replace(/https?:\/\/t\.co\/\S+/g, '').trim(),
        source: handle,
        url: `https://x.com/${handle}/status/${t.id}`,
        time: t.created_at ?? new Date().toISOString(),
        riskLevel: 'info',
        category: 'general',
      }))
      .filter(i => i.headline.length > 5);
  } catch (err) {
    console.warn(`[twitter-intel] v2 API error for @${handle}:`, err.message);
    return [];
  }
}

async function fetchViaTwitterAPIv2(handles) {
  if (!TW_BEARER) return [];
  try {
    const settled = await Promise.allSettled(handles.map(h => fetchUserTweetsV2(h)));
    const items = [];
    settled.forEach(r => { if (r.status === 'fulfilled') items.push(...r.value); });
    return items;
  } catch (err) {
    console.warn('[twitter-intel] v2 batch error:', err.message);
    return [];
  }
}

// ── Groq web search (backup) ─────────────────────────────────────────────────

async function fetchViaGroqWebSearch(handles) {
  if (!GROQ_KEY) return [];
  try {
    const handleStr = handles.map(h => `@${h}`).join(', ');
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_SEARCH_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are a social media intelligence aggregator focused on Indian civic infrastructure. Search X/Twitter for recent posts from official accounts and return ONLY a valid JSON object. Never return markdown. EXCLUDE: sports scores, entertainment, gaming, celebrity news, IPL, Bollywood. INCLUDE ONLY: traffic updates, power outages, water supply, metro/bus alerts, emergency alerts, weather warnings, civic advisories, law enforcement alerts.`,
          },
          {
            role: 'user',
            content: `Search X.com for the most recent posts (last 72 hours) from these official Indian government/civic Twitter accounts: ${handleStr}.

Include ONLY operational posts: traffic alerts, road closures, power outages, water supply updates, metro/BMTC updates, emergency alerts, weather warnings, advisories, general civic announcements.
SKIP: retweets, likes/congratulations, sports commentary, entertainment, promotional content.

Return ONLY this JSON (no markdown, no explanation):
{"items":[{"headline":"full post text","source":"handle_without_@","url":"https://x.com/handle/status/id_if_known","time":"ISO8601_or_relative"}]}

If you cannot find posts for a handle, skip it. Return as many relevant items as you find.`,
          },
        ],
        temperature: 0.1,
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!resp.ok) return [];
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Extract JSON from response (the model may wrap it in text)
    const jsonMatch = content.match(/\{[\s\S]*"items"[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    const items = Array.isArray(parsed.items) ? parsed.items : [];

    return items
      .map(item => ({
        headline:    (item.headline || item.text || item.content || '').trim(),
        description: item.description || undefined,
        source:      (item.source || item.handle || 'X').replace(/^@/, ''),
        url:         item.url || `https://x.com/${(item.source || '').replace(/^@/, '')}`,
        time:        item.time || new Date().toISOString(),
        riskLevel:   'info',
        category:    'general',
      }))
      .filter(i => i.headline.length > 5 && !isJunkTweet(i.headline));

  } catch (err) {
    console.warn('[twitter-intel] groq search error:', err.message);
    return [];
  }
}

// ── Nitter RSS (primary) ─────────────────────────────────────────────────────

async function fetchViaNitter(handle) {
  for (const inst of NITTER_INSTANCES) {
    try {
      const r = await fetch(`https://${inst}/${handle}/rss`, {
        headers: { 'User-Agent': RSS_UA, 'Accept': 'application/rss+xml, text/xml' },
        signal: AbortSignal.timeout(5000),
      });
      if (r.ok) {
        const xml = await r.text();
        if (xml.includes('<item>')) {
          const items = parseNitterXml(xml, handle);
          if (items.length > 0) return items;
        }
      }
    } catch { /* try next */ }
  }
  return [];
}

// ── RSSHub (backup) ──────────────────────────────────────────────────────────

async function fetchViaRssHub(handle) {
  for (const inst of RSSHUB_INSTANCES) {
    try {
      const r = await fetch(`https://${inst}/twitter/user/${handle}`, {
        headers: { 'User-Agent': RSS_UA, 'Accept': 'application/rss+xml, text/xml, */*' },
        signal: AbortSignal.timeout(6000),
      });
      if (r.ok) {
        const xml = await r.text();
        if (xml.includes('<item>')) {
          const items = parseNitterXml(xml, handle);
          if (items.length > 0) return items;
        }
      }
    } catch { /* try next */ }
  }
  return [];
}

// ── X Syndication Timeline (primary) ─────────────────────────────────────────
// Fetches the Next.js SSR page of the timeline, extracts __NEXT_DATA__, and
// parses tweet nodes. Rate-limited (429) at times — cached 10 min per handle.
async function fetchViaSyndication(handle) {
  const cacheKey = handle.toLowerCase();
  const cached = SYNDICATION_CACHE.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.items;
  }

  try {
    const url = `https://syndication.twitter.com/srv/timeline-profile/screen-name/${handle}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      throw new Error(`Syndication responded with ${res.status}`);
    }

    const html = await res.text();
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!match) {
      throw new Error('Failed to find __NEXT_DATA__ script tag');
    }

    const data = JSON.parse(match[1]);
    const entries = data.props?.pageProps?.timeline?.entries || [];
    const items = entries
      .map(entry => {
        const tweet = entry.content?.tweet;
        if (!tweet) return null;
        return {
          headline: (tweet.text || '').replace(/https?:\/\/t\.co\/\S+/g, '').trim(),
          time: tweet.created_at || new Date().toISOString(),
          url: `https://twitter.com/${handle}/status/${tweet.id_str}`,
          source: handle,
          category: 'advisory',
        };
      })
      .filter(Boolean);

    SYNDICATION_CACHE.set(cacheKey, { timestamp: now, items });
    return items;
  } catch (err) {
    console.warn(`[twitter-intel] Syndication fetch failed for @${handle}:`, err.message);
    // If cache exists but expired, return stale cache as a last resort on error
    if (cached) return cached.items;
    return [];
  }
}

// ── Apify cloud scraper (backup) ─────────────────────────────────────────────
// Calls an Apify Twitter/X scraper actor synchronously and reads its dataset.
// Robust against anti-bot; needs APIFY_TOKEN and spends credits per run.

async function fetchViaApify(handles, timeoutMs = 15_000) {
  if (!APIFY_TOKEN) return [];
  try {
    const url = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(APIFY_TOKEN)}`;
    const sinceDate = new Date(Date.now() - TWITTER_MAX_AGE_MS).toISOString().slice(0, 10);
    const input = {
      searchTerms: handles.map(h => `from:${h} since:${sinceDate}`),
      sort: 'Latest',
      maxItems: Math.min(handles.length * 12, 400),
    };
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    const arr = Array.isArray(data) ? data : (data.items || data.results || []);
    return arr
      .map(t => {
        const handle = (
          t.author?.userName || t.author?.username || t.username ||
          t.user?.screen_name || t.handle || ''
        ).replace(/^@/, '');
        const text = (t.text || t.fullText || t.full_text || t.content || t.tweetText || '')
          .replace(/https?:\/\/t\.co\/\S+/g, '')
          .trim();
        return {
          headline: text,
          source: handle || 'X',
          url: t.url || t.twitterUrl || t.tweetUrl || (handle ? `https://x.com/${handle}` : 'https://x.com'),
          time: t.createdAt || t.created_at || t.date || new Date().toISOString(),
          riskLevel: 'info',
          category: 'general',
        };
      })
      .filter(i => i.headline.length > 5 && !isJunkTweet(i.headline));
  } catch (err) {
    console.warn('[twitter-intel] apify error:', err.message);
    return [];
  }
}

// ── RSS-Bridge (backup) ──────────────────────────────────────────────────────

async function fetchViaRssBridge(handle) {
  for (const inst of RSSBRIDGE_INSTANCES) {
    try {
      const u = `${inst}/?action=display&bridge=TwitterBridge&context=By+username` +
        `&u=${encodeURIComponent(handle)}&format=Mrss`;
      const r = await fetch(u, {
        headers: { 'User-Agent': RSS_UA, 'Accept': 'application/rss+xml, text/xml, */*' },
        signal: AbortSignal.timeout(7000),
      });
      if (r.ok) {
        const xml = await r.text();
        if (xml.includes('<item>')) {
          const items = parseNitterXml(xml, handle);
          if (items.length > 0) return items;
        }
      }
    } catch { /* try next instance */ }
  }
  return [];
}

// ── Google News RSS (fast, mentions only) ────────────────────────────────────

async function fetchViaGnews(handle) {
  try {
    const q = encodeURIComponent(`"@${handle}" OR "x.com/${handle}" when:3d`);
    const r = await fetch(`https://news.google.com/rss/search?q=${q}&hl=en-IN&gl=IN&ceid=IN:en`, {
      headers: { 'User-Agent': RSS_UA, 'Accept': 'application/rss+xml' },
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) return parseGnewsXml(await r.text(), handle);
  } catch { /* ignore */ }
  return [];
}

// ── Orchestration helpers ────────────────────────────────────────────────────

/** Cap a promise: resolve [] if it takes longer than ms. */
const cap = (p, ms) => Promise.race([
  Promise.resolve(p),
  new Promise((res) => setTimeout(() => res([]), ms)),
]);

/**
 * Run a set of [name, fn, capMs] sources in parallel; each entry records
 * status + count + elapsed ms for the diagnostics the frontend shows.
 */
async function runTier(sources, cleanFn, diag) {
  const runners = sources.map(async ([name, fn, capMs]) => {
    const t0 = Date.now();
    let rawItems = [];
    let errored = false;
    try { rawItems = (await cap(fn(), capMs)) || []; } catch { errored = true; }
    const cleaned = cleanFn(rawItems);
    diag.push({
      name,
      status: errored ? 'error' : cleaned.length > 0 ? 'ok' : rawItems.length > 0 ? 'filtered' : 'empty',
      count: cleaned.length,
      ms: Date.now() - t0,
    });
    return { name, cleaned };
  });
  const settled = await Promise.allSettled(runners);
  const byName = new Map();
  for (const r of settled) {
    if (r.status === 'fulfilled' && r.value.cleaned.length > 0) {
      byName.set(r.value.name, r.value.cleaned);
    }
  }
  return byName;
}

function pickByPriority(byName, priority) {
  for (const name of priority) {
    if (byName.has(name)) return { items: byName.get(name), source: name };
  }
  return null;
}

// ── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req) {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (isDisallowedOrigin(req)) return new Response('Forbidden', { status: 403 });

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  // ── Health mode (GET) — plain-language config report, no external calls ───
  if (req.method === 'GET') {
    return json({
      ok: true,
      sources: {
        nitter:      { configured: true, instances: NITTER_INSTANCES, note: 'Free primary source. No key needed.' },
        syndication: { configured: true, note: 'Free X widget feed. Sometimes rate-limited.' },
        gnews:       { configured: true, note: 'Free Google News mentions. No key needed.' },
        apify:       { configured: !!APIFY_TOKEN, note: APIFY_TOKEN ? 'Backup scraper enabled (uses credits).' : 'Add APIFY_TOKEN to .env.local to enable.' },
        twitterApi:  { configured: !!TW_BEARER, note: TW_BEARER ? 'Configured, but free-tier keys cannot read timelines.' : 'Add TWITTER_BEARER_TOKEN to enable.' },
        groq:        { configured: !!GROQ_KEY, model: GROQ_SEARCH_MODEL, note: GROQ_KEY ? 'Backup web search enabled.' : 'Add GROQ_API_KEY to enable.' },
      },
      cache: { entries: RESULT_CACHE.size, freshMinutes: RESULT_TTL_MS / 60000 },
      maxTweetAgeDays: TWITTER_MAX_AGE_DAYS,
    });
  }

  try {
    const body = await req.json();
    const { handles = [], searchQuery, raw = false } = body;

    // Extended timeline age for raw streaming mode (7 days instead of 2)
    const maxAgeMs = raw ? 7 * 24 * 3600 * 1000 : TWITTER_MAX_AGE_MS;

    // ── Manual search mode ───────────────────────────────────────────────────
    if (searchQuery) {
      if (GROQ_KEY) {
        try {
          const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
            body: JSON.stringify({
              model: GROQ_SEARCH_MODEL,
              messages: [
                { role: 'system', content: 'Search the web for the query and return results as JSON. No markdown. Exclude sports, entertainment, gaming, celebrity gossip.' },
                { role: 'user',   content: `Search for: "${searchQuery}" (focus on India, last 7 days). Return only relevant security/civic/infrastructure news. Return JSON: {"items":[{"headline":"title","source":"publication","url":"link","time":"date"}]}` },
              ],
              temperature: 0.1,
              max_tokens: 2048,
            }),
            signal: AbortSignal.timeout(15_000),
          });
          if (resp.ok) {
            const data = await resp.json();
            const content = data.choices?.[0]?.message?.content || '';
            const match = content.match(/\{[\s\S]*"items"[\s\S]*\}/);
            if (match) {
              const parsed = JSON.parse(match[0]);
              const items = (parsed.items || []).filter(
                i => i.headline && !isJunkTweet(i.headline) && !isUselessTweet(i.headline),
              );
              return json({ items, source: 'groq' });
            }
          }
        } catch { /* fall through to Google News */ }
      }
      // Google News fallback for search
      try {
        const q = encodeURIComponent(`${searchQuery} when:7d`);
        const r = await fetch(`https://news.google.com/rss/search?q=${q}&hl=en-IN&gl=IN&ceid=IN:en`, {
          headers: { 'User-Agent': RSS_UA },
          signal: AbortSignal.timeout(10_000),
        });
        const items = r.ok ? parseGnewsXml(await r.text(), 'SEARCH') : [];
        return json({ items, source: 'gnews' });
      } catch {
        return json({ items: [], source: 'none' });
      }
    }

    // ── Handle timeline mode ─────────────────────────────────────────────────
    if (!handles.length) return json({ items: [] });

    // Serve from cache: repeat clicks are instant and burn no credits.
    const cacheKey = `${raw ? 'raw' : 'adv'}:${handles.map(h => h.toLowerCase()).sort().join(',')}`;
    const cached = RESULT_CACHE.get(cacheKey);
    const nowTs = Date.now();
    if (cached && nowTs - cached.ts < RESULT_TTL_MS) {
      return json({ items: cached.items, source: cached.source, cached: true, sources: cached.diag });
    }

    // Clean a source's output: drop junk / content-free / error / stale, and
    // (for handle timelines) keep only actionable advisories unless raw mode.
    const now = Date.now();
    const cleanHandleItems = (arr) => (arr || []).filter(i => {
      const text = i.headline || '';
      if (isJunkTweet(text) || isUselessTweet(text)) return false;
      if (!raw && !isAdvisory(text)) return false;
      const ts = new Date(i.time).getTime();
      if (!isNaN(ts) && now - ts > maxAgeMs) return false;
      return true;
    });

    // Wrap a per-handle fetcher so it runs across all handles and concatenates.
    const perHandle = (fn) => async () => {
      const out = [];
      const settled = await Promise.allSettled(handles.map(h => fn(h)));
      settled.forEach(r => { if (r.status === 'fulfilled') out.push(...r.value); });
      return out;
    };

    const diag = [];
    let result = null;

    // Phase A — fast + free, all in parallel, ≤8s. Nitter is primary: the
    // 2026 instance list only contains mirrors that actually serve RSS.
    const tierA = await runTier([
      ['nitter',      perHandle(fetchViaNitter),      8000],
      ['syndication', perHandle(fetchViaSyndication), 7000],
      ['gnews',       perHandle(fetchViaGnews),       8000],
    ], cleanHandleItems, diag);
    result = pickByPriority(tierA, ['nitter', 'syndication', 'gnews']);

    // Phase B — backups, only when Phase A found nothing, ≤15s.
    if (!result) {
      const tierB = await runTier([
        ['apify',      () => fetchViaApify(handles, 14_000), 15_000],
        ['twitter-v2', () => fetchViaTwitterAPIv2(handles),  10_000],
        ['groq',       () => fetchViaGroqWebSearch(handles), 13_000],
        ['rss-bridge', perHandle(fetchViaRssBridge),          9_000],
        ['rsshub',     perHandle(fetchViaRssHub),             9_000],
      ], cleanHandleItems, diag);
      result = pickByPriority(tierB, ['apify', 'twitter-v2', 'groq', 'rss-bridge', 'rsshub']);
    }

    // Total failure → serve stale cache (up to 2h old) rather than nothing.
    if (!result && cached && nowTs - cached.ts < STALE_TTL_MS) {
      return json({ items: cached.items, source: cached.source, stale: true, sources: diag });
    }

    const items = (result?.items ?? []).sort((a, b) => {
      try { return new Date(b.time).getTime() - new Date(a.time).getTime(); } catch { return 0; }
    }).slice(0, 60);
    const source = result?.source ?? 'none';

    if (items.length > 0) {
      RESULT_CACHE.set(cacheKey, { ts: nowTs, items, source, diag });
    }

    return json({ items, source, sources: diag });

  } catch (err) {
    return json({ error: err.message, items: [] });
  }
}

// Sources: Phase A (parallel, free): Nitter | Syndication | Google News
//          Phase B (parallel, backup): Apify | Twitter API v2 | Groq | RSS-Bridge | RSSHub
