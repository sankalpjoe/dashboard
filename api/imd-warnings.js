/**
 * IMD Alerts Agent (Agent 3).
 *
 * Fetches the LATEST active India Meteorological Department (IMD) district-level
 * colour-coded warnings and buckets the affected districts strictly by tier:
 *   Red (Take Action) · Orange (Be Prepared) · Yellow (Be Aware)
 *
 * Strategy:
 *   1. Groq `groq/compound` (built-in web search) reads current IMD bulletins
 *      (mausam.imd.gov.in / RMC) and returns structured district lists.
 *   2. Graceful empty payload if no key / failure.
 *
 * GET/POST /api/imd-warnings  → { red:[], orange:[], yellow:[], asOf, source }
 */
import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

const GROQ_KEY = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;

// States covering the 6 monitored cities.
const STATES = ['Karnataka', 'Maharashtra', 'Telangana', 'Delhi (NCT)', 'Tamil Nadu', 'West Bengal'];

export default async function handler(req) {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (isDisallowedOrigin(req)) return new Response('Forbidden', { status: 403 });

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  const empty = (source, extra = {}) => json({ red: [], orange: [], yellow: [], asOf: null, source, ...extra });

  if (!GROQ_KEY) return empty('none', { note: 'GROQ_API_KEY not configured' });

  const today = new Date().toISOString().slice(0, 10);

  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model: process.env.GROQ_SEARCH_MODEL || 'groq/compound',
        messages: [
          {
            role: 'system',
            content:
              'You are a meteorological data processing agent. Search the web for the LATEST active ' +
              'India Meteorological Department (IMD) district-level colour-coded weather warnings from ' +
              'official sources (mausam.imd.gov.in, Regional Met Centres, IMD daily bulletins, reputable ' +
              'news citing IMD). Classify impacted areas STRICTLY by IMD risk tier: Red, Orange, Yellow. ' +
              'Aggregate the distinct DISTRICT names under each tier; never mix tiers. Return ONLY valid ' +
              'JSON, no markdown, no commentary.',
          },
          {
            role: 'user',
            content:
              `Today is ${today}. Fetch the CURRENT IMD warnings (today / next 24-48h) for these states: ` +
              `${STATES.join(', ')}.\n\n` +
              'For each colour tier, list the distinct affected district names with the state in ' +
              'parentheses, e.g. "Udupi (Karnataka)". Tiers: Red = Take Action, Orange = Be Prepared, ' +
              'Yellow = Be Aware. Include a district only if it has an active warning. ' +
              'Return JSON exactly: {"red":["District (State)"...],"orange":[...],"yellow":[...],"asOf":"<date or bulletin time>"}. ' +
              'If a tier has no districts, use an empty array.',
          },
        ],
        temperature: 0.1,
        max_tokens: 1800,
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!resp.ok) return empty('error', { status: resp.status });

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || '';
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return empty('parse-fail');

    const parsed = JSON.parse(match[0]);
    const arr = (v) => (Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()) : []);

    return json({
      red: arr(parsed.red),
      orange: arr(parsed.orange),
      yellow: arr(parsed.yellow),
      asOf: parsed.asOf || today,
      source: 'IMD (via Groq web-search)',
    });
  } catch (err) {
    return empty('error', { error: err.message });
  }
}
