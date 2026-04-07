/**
 * Google Dorking for C-Level Executives
 * OSINT intelligence gathering on company leadership
 */

import { getCorsHeaders, isDisallowedOrigin } from '../_cors.js';
import { checkRateLimit } from '../_rate-limit.js';

export const config = { runtime: 'edge' };

// Google dorking queries for C-level executives
const DORK_QUERIES = {
  linkedin: (name, company) => `site:linkedin.com/in "${name}" "${company}"`,
  twitter: (name, company) => `site:twitter.com "${name}" "${company}" (CEO OR CTO OR CFO OR COO)`,
  news: (name, company) => `"${name}" "${company}" (scandal OR controversy OR lawsuit OR fraud OR investigation)`,
  github: (name) => `site:github.com "${name}"`,
  patents: (name, company) => `site:patents.google.com "${name}" "${company}"`,
  sec: (name, company) => `site:sec.gov "${name}" "${company}"`,
  crunchbase: (company) => `site:crunchbase.com "${company}" (founder OR CEO OR executive)`,
  leaks: (name, company) => `"${name}" "${company}" (leak OR breach OR exposed OR hacked)`,
  social: (name) => `"${name}" (instagram OR facebook OR reddit) profile`,
  education: (name) => `"${name}" (Harvard OR Stanford OR MIT OR Yale OR university) alumni`,
  files: (name, company) => `"${name}" "${company}" (filetype:pdf OR filetype:doc OR filetype:xlsx) (confidential OR internal OR private)`,
};

// Sentiment keywords for quick classification
const NEGATIVE_KEYWORDS = [
  'scandal', 'controversy', 'lawsuit', 'fraud', 'investigation', 'fired', 'resigned',
  'accused', 'alleged', 'criminal', 'arrest', 'indicted', 'guilty', 'convicted',
  'breach', 'hack', 'leak', 'exposed', 'failure', 'bankrupt', 'collapse', 'crisis',
  'misconduct', 'violation', 'penalty', 'fine', 'sued', 'complaint', 'whistleblower',
  'probe', 'subpoena', 'backlash', 'unauthorized', 'settlement', 'scrutiny', 'regulatory',
  'toxic', 'nepotism'
];

const POSITIVE_KEYWORDS = [
  'award', 'achievement', 'success', 'innovation', 'growth', 'expansion', 'funding',
  'promoted', 'appointed', 'hired', 'joined', 'launched', 'partnership', 'acquisition',
  'milestone', 'breakthrough', 'leader', 'pioneer', 'visionary', 'excellence', 'recognition'
];

function analyzeSentiment(text) {
  const lowerText = text.toLowerCase();
  let negativeScore = 0;
  let positiveScore = 0;

  NEGATIVE_KEYWORDS.forEach(keyword => {
    if (lowerText.includes(keyword)) negativeScore++;
  });

  POSITIVE_KEYWORDS.forEach(keyword => {
    if (lowerText.includes(keyword)) positiveScore++;
  });

  if (negativeScore > positiveScore) return 'negative';
  if (positiveScore > negativeScore) return 'positive';
  return 'neutral';
}

/**
 * Fetches real news search results from Google News RSS directly
 */
async function fetchGoogleNewsResults(query) {
  const googleNewsUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const response = await fetch(googleNewsUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      }
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`Google News RSS error: ${response.status} for ${query}`);
      return [];
    }

    const xml = await response.text();
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
      const itemContent = match[1];
      const title = (itemContent.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || 'No Title';
      const link = (itemContent.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '#';
      const pubDate = (itemContent.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
      let description = (itemContent.match(/<description>([\s\S]*?)<\/description>/) || [])[1] || '';
      description = description.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim();

      items.push({
        title: title.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, ''),
        link,
        snippet: description || `Published: ${pubDate}`,
        sentiment: analyzeSentiment(title + ' ' + description)
      });
    }
    return items;
  } catch (err) {
    clearTimeout(timeout);
    console.error('Google News fetch error:', err.message);
    return [];
  }
}

export default async function handler(req) {
  console.log('[osint/dork-cxo] Handler started');
  const cors = getCorsHeaders(req, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    console.log('[osint/dork-cxo] OPTIONS request');
    return new Response(null, { status: 204, headers: cors });
  }

  const origin = req.headers.get('origin');
  console.log('[osint/dork-cxo] Origin:', origin);

  if (isDisallowedOrigin(req)) {
    console.error('[osint/dork-cxo] Forbidden origin:', origin);
    return new Response('Forbidden', { status: 403, headers: cors });
  }

  console.log('[osint/dork-cxo] Checking rate limit');
  const rateLimitResult = await checkRateLimit(req, cors);
  if (rateLimitResult) {
    console.error('[osint/dork-cxo] Rate limited');
    return rateLimitResult;
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  try {
    let body;
    try {
      body = await req.json();
      console.log('[osint/dork-cxo] Body parsed:', JSON.stringify(body));
    } catch (e) {
      console.error('[osint/dork-cxo] JSON parse error:', e);
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const { name, queries = ['linkedin', 'news', 'sec', 'files'] } = body;
    const company = "Goldman Sachs"; // Stictly focused on GS

    if (!name) {
      console.error('[osint/dork-cxo] Missing params:', { name });
      return new Response(JSON.stringify({ error: 'Name required' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // Generate dork queries
    const dorkQueries = {};
    const findings = {};

    console.log('[osint/dork-cxo] Starting queries for:', name, company);
    // Perform actual news searches for relevant types
    const searchPromises = queries.map(async (type) => {
      try {
        if (DORK_QUERIES[type]) {
          const queryStr = DORK_QUERIES[type](name, company);
          dorkQueries[type] = queryStr;

          if (['news', 'files', 'leaks'].includes(type)) {
            console.log(`[osint/dork-cxo] Fetching ${type}: ${queryStr}`);
            const results = await fetchGoogleNewsResults(queryStr);
            console.log(`[osint/dork-cxo] Found ${results.length} results for ${type}`);
            findings[type] = {
              query: queryStr,
              results: results,
              note: results.length > 0 ? `Found ${results.length} recent mentions.` : "No recent direct results found."
            };
          } else {
            findings[type] = {
              query: queryStr,
              results: [],
              note: 'Manual search recommended'
            };
          }
        }
      } catch (e) {
        console.error(`[osint/dork-cxo] Error processing ${type}:`, e);
      }
    });

    await Promise.all(searchPromises);
    console.log('[osint/dork-cxo] All queries finished');

    const totalFindings = Object.values(findings).reduce((acc, f) => acc + (f.results?.length || 0), 0);
    const sentimentCount = { positive: 0, negative: 0, neutral: 0 };
    Object.values(findings).forEach(f => {
      f.results?.forEach(r => {
        if (r.sentiment) sentimentCount[r.sentiment]++;
      });
    });

    let riskLevel = 'low';
    if (sentimentCount.negative > 0) riskLevel = 'medium';
    if (sentimentCount.negative > 2) riskLevel = 'high';

    const results = {
      executive: { name, company },
      queries: dorkQueries,
      findings,
      summary: {
        totalFindings,
        riskLevel,
        sentiment: sentimentCount.negative > sentimentCount.positive ? 'negative' : 'neutral',
        recommendation: riskLevel === 'high' ? 'High risk detected. Conduct immediate deep background check.' : 'Standard monitoring recommended.',
      },
    };

    console.log('[osint/dork-cxo] Sending response, findings count:', totalFindings);
    return new Response(JSON.stringify(results), {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200',
      },
    });
  } catch (error) {
    console.error('[osint/dork-cxo] Fatal Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'OSINT dorking failed' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
}
