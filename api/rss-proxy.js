// Non-sebuf: returns XML/HTML, stays as standalone Vercel function.
import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';
import { validateApiKey } from './_api-key.js';
import { checkRateLimit } from './_rate-limit.js';

export const config = { runtime: 'edge' };

// Fetch with timeout
async function fetchWithTimeout(url, options, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function getRelayBaseUrl() {
  const relayUrl = process.env.WS_RELAY_URL || '';
  if (!relayUrl) return '';
  return relayUrl.replace('wss://', 'https://').replace('ws://', 'http://').replace(/\/$/, '');
}

function getRelayHeaders(baseHeaders = {}) {
  const headers = { ...baseHeaders };
  const relaySecret = process.env.RELAY_SHARED_SECRET || '';
  if (relaySecret) {
    const relayHeader = (process.env.RELAY_AUTH_HEADER || 'x-relay-key').toLowerCase();
    headers[relayHeader] = relaySecret;
    headers.Authorization = `Bearer ${relaySecret}`;
  }
  return headers;
}

async function fetchViaRailway(feedUrl, timeoutMs) {
  const relayBaseUrl = getRelayBaseUrl();
  if (!relayBaseUrl) return null;
  const relayUrl = `${relayBaseUrl}/rss?url=${encodeURIComponent(feedUrl)}`;
  return fetchWithTimeout(relayUrl, {
    headers: getRelayHeaders({
      'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      'User-Agent': 'WorldMonitor-RSS-Proxy/1.0',
    }),
  }, timeoutMs);
}

// Allowed RSS feed domains for security
const ALLOWED_DOMAINS = [
  'feeds.bbci.co.uk',
  'www.theguardian.com',
  'feeds.npr.org',
  'news.google.com',
  'www.aljazeera.com',
  'www.aljazeera.net',
  'rss.cnn.com',
  'hnrss.org',
  'feeds.arstechnica.com',
  'www.theverge.com',
  'www.cnbc.com',
  'feeds.marketwatch.com',
  'www.defenseone.com',
  'breakingdefense.com',
  'www.bellingcat.com',
  'techcrunch.com',
  'huggingface.co',
  'www.technologyreview.com',
  'rss.arxiv.org',
  'export.arxiv.org',
  'www.federalreserve.gov',
  'www.sec.gov',
  'www.whitehouse.gov',
  'www.state.gov',
  'www.defense.gov',
  'home.treasury.gov',
  'www.justice.gov',
  'tools.cdc.gov',
  'www.fema.gov',
  'www.dhs.gov',
  'www.thedrive.com',
  'krebsonsecurity.com',
  'finance.yahoo.com',
  'thediplomat.com',
  'venturebeat.com',
  'foreignpolicy.com',
  'www.ft.com',
  'openai.com',
  'www.reutersagency.com',
  'feeds.reuters.com',
  'rsshub.app',
  'asia.nikkei.com',
  'www.cfr.org',
  'www.csis.org',
  'www.politico.com',
  'www.brookings.edu',
  'layoffs.fyi',
  'www.defensenews.com',
  'www.militarytimes.com',
  'taskandpurpose.com',
  'news.usni.org',
  'www.oryxspioenkop.com',
  'www.gov.uk',
  'www.foreignaffairs.com',
  'www.atlanticcouncil.org',
  // Tech variant domains
  'www.zdnet.com',
  'www.techmeme.com',
  'www.darkreading.com',
  'www.schneier.com',
  'www.ransomware.live',
  'rss.politico.com',
  'www.anandtech.com',
  'www.tomshardware.com',
  'www.semianalysis.com',
  'feed.infoq.com',
  'thenewstack.io',
  'devops.com',
  'dev.to',
  'lobste.rs',
  'changelog.com',
  'seekingalpha.com',
  'news.crunchbase.com',
  'www.saastr.com',
  'feeds.feedburner.com',
  // Additional tech variant domains
  'www.producthunt.com',
  'www.axios.com',
  'api.axios.com',
  'github.blog',
  'githubnext.com',
  'mshibanami.github.io',
  'www.engadget.com',
  'news.mit.edu',
  'dev.events',
  // VC blogs
  'www.ycombinator.com',
  'a16z.com',
  'review.firstround.com',
  'www.sequoiacap.com',
  'www.nfx.com',
  'www.aaronsw.com',
  'bothsidesofthetable.com',
  'www.lennysnewsletter.com',
  'stratechery.com',
  // Regional startup news
  'www.eu-startups.com',
  'tech.eu',
  'sifted.eu',
  'www.techinasia.com',
  'kr-asia.com',
  'techcabal.com',
  'disrupt-africa.com',
  'lavca.org',
  'contxto.com',
  'inc42.com',
  'yourstory.com',
  // Funding & VC
  'pitchbook.com',
  'www.cbinsights.com',
  // Accelerators
  'www.techstars.com',
  // Middle East & Regional News
  'asharqbusiness.com',
  'asharq.com',
  'www.omanobserver.om',
  'english.alarabiya.net',
  'www.arabnews.com',
  'www.timesofisrael.com',
  'www.haaretz.com',
  'www.scmp.com',
  'kyivindependent.com',
  'www.themoscowtimes.com',
  'feeds.24.com',
  'feeds.news24.com',  // News24 main feed domain
  'feeds.capi24.com',  // News24 redirect destination
  // International News Sources
  'www.france24.com',
  'www.euronews.com',
  'de.euronews.com',
  'es.euronews.com',
  'fr.euronews.com',
  'it.euronews.com',
  'pt.euronews.com',
  'ru.euronews.com',
  'www.lemonde.fr',
  'rss.dw.com',
  'www.bild.de',
  'www.africanews.com',
  'fr.africanews.com',
  // Nigeria
  'www.premiumtimesng.com',
  'www.vanguardngr.com',
  'www.channelstv.com',
  'dailytrust.com',
  'www.thisdaylive.com',
  // Greek
  'www.naftemporiki.gr',
  'www.in.gr',
  'www.iefimerida.gr',
  'www.lasillavacia.com',
  'www.channelnewsasia.com',
  'japantoday.com',
  'www.thehindu.com',
  'indianexpress.com',
  'www.livemint.com',
  'thewire.in',
  'theprint.in',
  'timesofindia.indiatimes.com',
  'www.hindustantimes.com',
  'www.thehindu.com',
  'ndtv.com',
  // India — city / hyperlocal
  'bangaloremirror.indiatimes.com', 'telanganatoday.com',
  // India — vernacular dailies
  'www.prajavani.net', 'kannada.oneindia.com',
  'vijayakarnataka.com', 'kannadaprabha.com',
  'eenadu.net', 'www.sakshi.com', 'www.ntnews.com',
  'lokmat.com', 'maharashtratimes.com', 'www.esakal.com',
  'navbharattimes.indiatimes.com', 'www.amarujala.com', 'www.jagran.com',
  'www.loksatta.com',
  // India — official government alerts
  'pib.gov.in', 'www.mea.gov.in', 'cert-in.org.in',
  'mausam.imd.gov.in', 'cpcb.nic.in', 'ndma.gov.in',
  // Nitter instances — Twitter/X handle RSS feeds (RSS-verified 2026-07)
  'xcancel.com', 'nitter.poast.org', 'nitter.privacyredirect.com', 'nt.vern.cc',
  'nitter.privacydev.net', 'nitter.net',
  'nitter.1d4.us', 'nitter.kavin.rocks', 'nitter.unixfox.eu',
  'rsshub.app',
  'www.twz.com',
  'gcaptain.com',
  // International Organizations
  'news.un.org',
  'www.iaea.org',
  'www.who.int',
  'www.cisa.gov',
  'www.crisisgroup.org',
  // Think Tanks & Research (Added 2026-01-29)
  'rusi.org',
  'warontherocks.com',
  'www.aei.org',
  'responsiblestatecraft.org',
  'www.fpri.org',
  'jamestown.org',
  'www.chathamhouse.org',
  'ecfr.eu',
  'www.gmfus.org',
  'www.wilsoncenter.org',
  'www.lowyinstitute.org',
  'www.mei.edu',
  'www.stimson.org',
  'www.cnas.org',
  'carnegieendowment.org',
  'www.rand.org',
  'fas.org',
  'www.armscontrol.org',
  'www.nti.org',
  'thebulletin.org',
  'www.iss.europa.eu',
  // Economic & Food Security
  'www.fao.org',
  'worldbank.org',
  'www.imf.org',
  // International news (various languages)
  'www.bbc.com',
  'www.spiegel.de',
  'www.tagesschau.de',
  'newsfeed.zeit.de',
  'feeds.elpais.com',
  'e00-elmundo.uecdn.es',
  'www.repubblica.it',
  'www.ansa.it',
  'xml2.corriereobjects.it',
  'feeds.nos.nl',
  'www.nrc.nl',
  'www.telegraaf.nl',
  'www.dn.se',
  'www.svd.se',
  'www.svt.se',
  'www.asahi.com',
  'www.clarin.com',
  'oglobo.globo.com',
  'feeds.folha.uol.com.br',
  'www.eltiempo.com',
  'www.eluniversal.com.mx',
  'www.jeuneafrique.com',
  'www.lorientlejour.com',
  // Regional locale feeds (tr, pl, ru, th, vi, pt)
  'www.hurriyet.com.tr',
  'tvn24.pl',
  'www.polsatnews.pl',
  'www.rp.pl',
  'meduza.io',
  'novayagazeta.eu',
  'www.bangkokpost.com',
  'vnexpress.net',
  'www.abc.net.au',
  'islandtimes.org',
  'www.brasilparalelo.com.br',
  // Mexico & LatAm Security
  'mexiconewsdaily.com',
  'animalpolitico.com',
  'www.proceso.com.mx',
  'www.milenio.com',
  'insightcrime.org',
  // Additional
  'news.ycombinator.com',
  // Finance variant
  'seekingalpha.com',
  'www.coindesk.com',
  'cointelegraph.com',
  // Security advisories — government travel advisory feeds
  'travel.state.gov',
  'www.smartraveller.gov.au',
  'www.safetravel.govt.nz',
  // US Embassy security alerts
  'th.usembassy.gov',
  'ae.usembassy.gov',
  'de.usembassy.gov',
  'ua.usembassy.gov',
  'mx.usembassy.gov',
  'in.usembassy.gov',
  'pk.usembassy.gov',
  'co.usembassy.gov',
  'pl.usembassy.gov',
  'bd.usembassy.gov',
  'it.usembassy.gov',
  'do.usembassy.gov',
  'mm.usembassy.gov',
  // Health advisories
  'wwwnc.cdc.gov',
  'www.ecdc.europa.eu',
  'www.who.int',
  'www.afro.who.int',
  // Happy variant — positive news sources
  'www.goodnewsnetwork.org',
  'www.positive.news',
  'reasonstobecheerful.world',
  'www.optimistdaily.com',
  'www.upworthy.com',
  'www.dailygood.org',
  'www.goodgoodgood.co',
  'www.good.is',
  'www.sunnyskyz.com',
  'thebetterindia.com',
  'singularityhub.com',
  'humanprogress.org',
  'greatergood.berkeley.edu',
  'www.onlygoodnewsdaily.com',
  'www.sciencedaily.com',
  'feeds.nature.com',
  'www.nature.com',
  'www.livescience.com',
  'www.newscientist.com',
];

// ── In-memory feed cache ─────────────────────────────────────────────────────
// Fresh for 5 min (a dashboard refresh re-uses the last fetch instead of
// re-hitting Google News ~100 times); stale entries are kept for 2 h and
// served when the upstream fails or rate-limits (429).
const FEED_CACHE = new Map(); // url → { ts, body, contentType }
const FEED_FRESH_MS = 5 * 60 * 1000;
const FEED_STALE_MS = 2 * 60 * 60 * 1000;
const FEED_CACHE_MAX = 500;

function cacheGet(url, maxAgeMs) {
  const hit = FEED_CACHE.get(url);
  if (hit && Date.now() - hit.ts < maxAgeMs) return hit;
  return null;
}

function cacheSet(url, body, contentType) {
  if (FEED_CACHE.size >= FEED_CACHE_MAX) {
    // Drop the oldest entry (Map preserves insertion order)
    const oldest = FEED_CACHE.keys().next().value;
    FEED_CACHE.delete(oldest);
  }
  FEED_CACHE.set(url, { ts: Date.now(), body, contentType });
}

function cachedResponse(hit, corsHeaders, stale = false) {
  return new Response(hit.body, {
    status: 200,
    headers: {
      'Content-Type': hit.contentType,
      'Cache-Control': 'public, max-age=180',
      'X-Feed-Cache': stale ? 'stale' : 'hit',
      ...corsHeaders,
    },
  });
}

// ── Google News request budget ───────────────────────────────────────────────
// Google rate-limits by IP and Vercel egress IPs are shared, so we cap our own
// upstream hits per hour. Over budget + stale cache available → serve stale.
// Over budget + nothing cached → still fetch (an empty panel is worse than one
// request). Counter uses Upstash when configured (accurate across instances),
// otherwise falls back to a per-instance in-memory count (soft guard).
const GNEWS_BUDGET_PER_HOUR = Number(process.env.GNEWS_BUDGET_PER_HOUR || 400);
let memCount = { hour: '', n: 0 };

function hourKey() {
  return new Date().toISOString().slice(0, 13); // e.g. 2026-07-09T11
}

async function bumpGnewsCount() {
  const hk = hourKey();
  if (memCount.hour !== hk) memCount = { hour: hk, n: 0 };
  memCount.n++;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return memCount.n;
  try {
    const resp = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['INCR', `gnews:${hk}`],
        ['EXPIRE', `gnews:${hk}`, '7200'],
      ]),
      signal: AbortSignal.timeout(1500),
    });
    if (resp.ok) {
      const data = await resp.json();
      const n = Number(data?.[0]?.result);
      if (Number.isFinite(n)) return n;
    }
  } catch { /* fall back to memory count */ }
  return memCount.n;
}


export default async function handler(req) {
  const corsHeaders = getCorsHeaders(req, 'GET, OPTIONS');

  if (isDisallowedOrigin(req)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const keyCheck = validateApiKey(req);
  if (keyCheck.required && !keyCheck.valid) {
    return new Response(JSON.stringify({ error: keyCheck.error }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const rateLimitResponse = await checkRateLimit(req, corsHeaders);
  if (rateLimitResponse) return rateLimitResponse;

  const requestUrl = new URL(req.url);
  const feedUrl = requestUrl.searchParams.get('url');

  if (!feedUrl) {
    return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    const parsedUrl = new URL(feedUrl);

    // Security: Check if domain is allowed (normalize www prefix)
    const hostname = parsedUrl.hostname;
    const bare = hostname.replace(/^www\./, '');
    const withWww = hostname.startsWith('www.') ? hostname : `www.${hostname}`;
    if (!ALLOWED_DOMAINS.includes(hostname) && !ALLOWED_DOMAINS.includes(bare) && !ALLOWED_DOMAINS.includes(withWww)) {
      return new Response(JSON.stringify({ error: 'Domain not allowed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Serve from cache when fresh — avoids hammering Google News on refresh.
    const freshHit = cacheGet(feedUrl, FEED_FRESH_MS);
    if (freshHit) return cachedResponse(freshHit, corsHeaders);

    // Google News is slow - use longer timeout
    const isGoogleNews = feedUrl.includes('news.google.com');
    const timeout = isGoogleNews ? 20000 : 12000;

    // Budget guard: over the hourly Google News budget AND we have a stale
    // copy → serve stale instead of hitting Google. Never blank a panel:
    // uncached requests still go through even over budget.
    if (isGoogleNews) {
      const n = await bumpGnewsCount();
      if (n > GNEWS_BUDGET_PER_HOUR) {
        const staleHit = cacheGet(feedUrl, FEED_STALE_MS);
        if (staleHit) return cachedResponse(staleHit, corsHeaders, true);
      }
    }

    const fetchDirect = async () => {
      const response = await fetchWithTimeout(feedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'manual',
      }, timeout);

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (location) {
          const redirectUrl = new URL(location, feedUrl);
          if (!ALLOWED_DOMAINS.includes(redirectUrl.hostname)) {
            throw new Error('Redirect to disallowed domain');
          }
          return fetchWithTimeout(redirectUrl.href, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/rss+xml, application/xml, text/xml, */*',
              'Accept-Language': 'en-US,en;q=0.9',
            },
          }, timeout);
        }
      }

      return response;
    };

    let response;
    let usedRelay = false;
    try {
      response = await fetchDirect();
    } catch (directError) {
      response = await fetchViaRailway(feedUrl, timeout);
      usedRelay = !!response;
      if (!response) throw directError;
    }

    if (!response.ok && !usedRelay) {
      const relayResponse = await fetchViaRailway(feedUrl, timeout);
      if (relayResponse && relayResponse.ok) {
        response = relayResponse;
      }
    }

    const data = await response.text();
    const isSuccess = response.status >= 200 && response.status < 300;

    if (isSuccess) {
      cacheSet(feedUrl, data, response.headers.get('content-type') || 'application/xml');
    } else {
      // Upstream failed (usually a Google News 429) — fall back to stale cache.
      const staleHit = cacheGet(feedUrl, FEED_STALE_MS);
      if (staleHit) return cachedResponse(staleHit, corsHeaders, true);
    }

    return new Response(data, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/xml',
        'Cache-Control': isSuccess
          ? 'public, max-age=180, s-maxage=900, stale-while-revalidate=1800, stale-if-error=3600'
          : 'public, max-age=15, s-maxage=60, stale-while-revalidate=120',
        ...(isSuccess && { 'CDN-Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800, stale-if-error=3600' }),
        ...corsHeaders,
      },
    });
  } catch (error) {
    // Network failure / timeout — serve stale cache if we have it.
    const staleHit = cacheGet(feedUrl, FEED_STALE_MS);
    if (staleHit) return cachedResponse(staleHit, corsHeaders, true);

    const isTimeout = error.name === 'AbortError';
    const isGnews = feedUrl.includes('news.google.com');
    // Downgrade Google News failures to warn — they're rate-limited frequently
    (isGnews ? console.warn : console.error)(
      `[RSS Proxy] ${isGnews ? 'Google News blocked/timeout' : 'Critical failure'} for ${feedUrl.slice(0, 80)}...`, error.message
    );
    
    return new Response(JSON.stringify({
      error: isTimeout ? 'Gateway Timeout' : 'Service Unavailable',
      message: error.message,
      url: feedUrl
    }), {
      status: isTimeout ? 504 : 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
