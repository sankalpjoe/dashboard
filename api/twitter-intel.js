/**
 * Twitter/X Handle Intel
 *
 * Strategy (in order):
 *  1. Groq compound-beta  — built-in web search, finds real X/Twitter posts
 *  2. Nitter RSS          — multiple instances, actual tweet RSS
 *  3. Google News RSS     — mentions of handles as last resort
 *
 * POST /api/twitter-intel
 *   Body: { handles: string[] }             → handle timeline mode
 *   Body: { searchQuery: string }           → manual Google News search
 */
import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

const GROQ_KEY = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;

const NITTER_INSTANCES = [
  'nitter.poast.org',
  'nitter.privacydev.net',
  'nitter.1d4.us',
  'nitter.kavin.rocks',
  'nitter.unixfox.eu',
];

// RSSHub public instance — Twitter user timeline RSS
// Format: https://rsshub.app/twitter/user/{handle}
const RSSHUB_INSTANCES = [
  'rsshub.app',
  'rsshub.rssforever.com',
];

const RSS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36';

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
    const headline = titleM[1].trim().replace(/^R to @\w+:\s*/, '').replace(/^@\w+:\s*/, '');
    const desc = descM ? descM[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 280) : '';
    if (headline.length < 4) continue;
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
    if (headline.length < 8) continue;
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

// ── Source 1: Groq compound-beta web search ──────────────────────────────────

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
        model: 'compound-beta',
        messages: [
          {
            role: 'system',
            content: `You are a social media intelligence aggregator. When asked, search X/Twitter for recent posts from official accounts and return ONLY a valid JSON object. Never return markdown.`,
          },
          {
            role: 'user',
            content: `Search X.com for the most recent posts (last 72 hours) from these official Indian government/civic Twitter accounts: ${handleStr}.

Include ALL posts you find — traffic alerts, road closures, power outages, water supply updates, metro/BMTC updates, emergency alerts, weather warnings, advisories, general announcements. Do not filter by topic.

Return ONLY this JSON (no markdown, no explanation):
{"items":[{"headline":"full post text","source":"handle_without_@","url":"https://x.com/handle/status/id_if_known","time":"ISO8601_or_relative"}]}

If you cannot find posts for a handle, skip it. Return as many items as you find.`,
          },
        ],
        temperature: 0.1,
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!resp.ok) return [];
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Extract JSON from response (compound-beta may wrap it in text)
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
      .filter(i => i.headline.length > 5);

  } catch (err) {
    console.warn('[twitter-intel] compound-beta error:', err.message);
    return [];
  }
}

// ── Source 2: Nitter RSS ─────────────────────────────────────────────────────

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

// ── Source 3: RSSHub ────────────────────────────────────────────────────────

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
          // RSSHub uses same RSS format as Nitter
          const items = parseNitterXml(xml, handle);
          if (items.length > 0) return items;
        }
      }
    } catch { /* try next */ }
  }
  return [];
}

// ── Source 4: Google News RSS fallback ─────────────────────────────────────────

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

// ── Main handler ─────────────────────────────────────────────────────────────

export default async function handler(req) {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (isDisallowedOrigin(req)) return new Response('Forbidden', { status: 403 });

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  try {
    const body = await req.json();
    const { handles = [], searchQuery } = body;

    // ── Manual search mode ───────────────────────────────────────────────────
    if (searchQuery) {
      // Try Groq compound-beta first
      if (GROQ_KEY) {
        try {
          const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
            body: JSON.stringify({
              model: 'compound-beta',
              messages: [
                { role: 'system', content: 'Search the web for the query and return results as JSON. No markdown.' },
                { role: 'user',   content: `Search for: "${searchQuery}" (focus on India, last 7 days). Return JSON: {"items":[{"headline":"title","source":"publication","url":"link","time":"date"}]}` },
              ],
              temperature: 0.1,
              max_tokens: 2048,
            }),
            signal: AbortSignal.timeout(30_000),
          });
          if (resp.ok) {
            const data = await resp.json();
            const content = data.choices?.[0]?.message?.content || '';
            const match = content.match(/\{[\s\S]*"items"[\s\S]*\}/);
            if (match) {
              const parsed = JSON.parse(match[0]);
              return json({ items: parsed.items || [], source: 'groq' });
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

    // Step 1: Try Groq compound-beta (searches all handles in one call)
    let items = await fetchViaGroqWebSearch(handles);

    // Step 2: Nitter per-handle
    if (items.length === 0) {
      const settled = await Promise.allSettled(handles.map(h => fetchViaNitter(h)));
      settled.forEach(r => { if (r.status === 'fulfilled') items.push(...r.value); });
    }

    // Step 3: RSSHub per-handle
    if (items.length === 0) {
      const settled = await Promise.allSettled(handles.map(h => fetchViaRssHub(h)));
      settled.forEach(r => { if (r.status === 'fulfilled') items.push(...r.value); });
    }

    // Step 4: Google News per handle (last resort)
    if (items.length === 0) {
      const settled = await Promise.allSettled(handles.map(h => fetchViaGnews(h)));
      settled.forEach(r => { if (r.status === 'fulfilled') items.push(...r.value); });
    }

    // Sort newest first
    items.sort((a, b) => {
      try { return new Date(b.time).getTime() - new Date(a.time).getTime(); } catch { return 0; }
    });

    return json({ items: items.slice(0, 60) });

  } catch (err) {
    return json({ error: err.message, items: [] });
  }
}
