/**
 * Article context enrichment via Serper (serper.dev).
 *
 * For each item we try, in order:
 *   1. Scrape the article URL (scrape.serper.dev) → full page text.
 *   2. If the URL is a Google-News redirect or the scrape is too thin,
 *      fall back to a Serper news search on the headline → snippets.
 *
 * Used at export time to give the summariser real article context instead of
 * just the headline. Gated behind SERPER_API_KEY (returns empty if unset).
 *
 * POST /api/scrape-article  Body: { items: [{ url?, headline }] }
 *   → { results: [{ text }] }   (aligned by index)
 */
import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

const SERPER_KEY = process.env.SERPER_API_KEY || process.env.VITE_SERPER_API_KEY;
const MAX_ITEMS = 10;
const MAX_TEXT = 1800; // chars of context per article (token budget)

function isGoogleNews(url) {
  return !url || /news\.google\.com|google\.com\/rss/i.test(url);
}

async function scrapeUrl(url) {
  try {
    const resp = await fetch('https://scrape.serper.dev', {
      method: 'POST',
      headers: { 'X-API-KEY': SERPER_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) return '';
    const data = await resp.json();
    const text = (data.text || data.markdown || '').replace(/\s+/g, ' ').trim();
    return text;
  } catch {
    return '';
  }
}

async function newsSnippets(headline) {
  try {
    const resp = await fetch('https://google.serper.dev/news', {
      method: 'POST',
      headers: { 'X-API-KEY': SERPER_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: headline, gl: 'in', hl: 'en', num: 4 }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!resp.ok) return '';
    const data = await resp.json();
    const news = Array.isArray(data.news) ? data.news : [];
    return news
      .slice(0, 4)
      .map(n => `${n.title || ''} — ${n.snippet || ''} (${n.source || ''}${n.date ? ', ' + n.date : ''})`)
      .join(' | ')
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return '';
  }
}

async function enrichOne(item) {
  let text = '';
  if (item.url && !isGoogleNews(item.url)) {
    text = await scrapeUrl(item.url);
  }
  if (text.length < 200 && item.headline) {
    const snip = await newsSnippets(item.headline);
    if (snip.length > text.length) text = snip;
  }
  return text.slice(0, MAX_TEXT);
}

export default async function handler(req) {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (isDisallowedOrigin(req)) return new Response('Forbidden', { status: 403 });

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  try {
    const body = await req.json();
    const items = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
    if (!SERPER_KEY) return json({ results: items.map(() => ({ text: '' })), source: 'disabled' });
    if (items.length === 0) return json({ results: [] });

    const settled = await Promise.allSettled(items.map(enrichOne));
    const results = settled.map(r => ({ text: r.status === 'fulfilled' ? r.value : '' }));
    return json({ results, source: 'serper' });
  } catch (err) {
    return json({ results: [], source: 'error', error: err.message });
  }
}
