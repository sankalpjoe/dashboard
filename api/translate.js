import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

// Free Google Translate endpoint (no API key, same as what the web app uses internally).
// Batches up to 20 strings per request. Falls back gracefully if rate-limited.
const GT_BASE = 'https://translate.googleapis.com/translate_a/single';

async function translateOne(text, target = 'en') {
  const url = `${GT_BASE}?client=gtx&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(6000),
  });
  if (!resp.ok) return text;
  const data = await resp.json();
  // Response: [ [ ["translated", "original", ...], ... ], ..., "detected_lang" ]
  const parts = data?.[0];
  if (!Array.isArray(parts)) return text;
  return parts.map(p => p?.[0] ?? '').join('').trim() || text;
}

export default async function handler(req) {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (isDisallowedOrigin(req)) return new Response('Forbidden', { status: 403 });

  try {
    const url    = new URL(req.url);
    const texts  = url.searchParams.getAll('q');   // multiple &q= values
    const target = url.searchParams.get('target') || 'en';

    if (!texts.length) {
      return new Response(JSON.stringify({ translations: [] }), {
        status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // Translate in parallel (max 20 at a time to stay within free-tier limits)
    const batch  = texts.slice(0, 20);
    const results = await Promise.all(batch.map(t => translateOne(t, target)));

    const translations = results.map(translatedText => ({ translatedText }));

    return new Response(JSON.stringify({ translations }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    // On any failure return originals so the pipeline never breaks
    return new Response(JSON.stringify({ error: err.message, translations: [] }), {
      status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
}
