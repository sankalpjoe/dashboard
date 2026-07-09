import { getCorsHeaders, isDisallowedOrigin } from '../_cors.js';
import { checkRateLimit } from '../_rate-limit.js';

export const config = { runtime: 'edge' };

const GROQ_KEY = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
// llama-3.3-70b-versatile is deprecated on Groq (shutdown 2026-08-16).
const GROQ_MODEL = process.env.VITE_GROQ_MODEL || 'openai/gpt-oss-120b';

const GROQ_SYSTEM = `You are a professional intelligence analyst for a Security Operations Center. 
STRICTLY filter news for tactical relevance (Security, Geopolitics, Infrastructure, Health Emergencies).
DISCARD: Celebrities, Sports (unless riots/security), IPOs, routine politics, lifestyle.

For each headline, provide:
- relevance: 1-10 (high security impact = 10)
- summary: exactly 3 bullets, max 10 words each
- category: one of [conflict, health, disease, traffic, infra, vip, protest, cyber, military, general]
- sentiment: -1.0 to 1.0

Return JSON: { "items": [{ "score": number, "summary": string[], "category": string, "sentiment": number }] }
Maintain input order.`;

async function callGroqBatch(headlines, attempt = 0) {
  if (!GROQ_KEY) return null;
  const numbered = headlines.map((h, i) => `${i}: ${h}`).join('\n');

  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: GROQ_SYSTEM },
          { role: 'user',   content: `Headlines:\n${numbered}` },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(20000),
    });

    // Rate-limit (429) / transient overload (503): back off + retry (Retry-After).
    if ((resp.status === 429 || resp.status === 503) && attempt < 3) {
      const ra = Number(resp.headers.get('retry-after'));
      const waitMs = Number.isFinite(ra) && ra > 0
        ? Math.min(ra * 1000, 15000)
        : Math.min(8000, 500 * 2 ** attempt);
      await new Promise((r) => setTimeout(r, waitMs));
      return callGroqBatch(headlines, attempt + 1);
    }
    if (!resp.ok) return null;
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') return null;
    const parsed = JSON.parse(content);
    return parsed.items || parsed;
  } catch (err) {
    console.error('[Enrichment] Groq batch failed:', err);
    return null;
  }
}

export default async function handler(req) {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  if (isDisallowedOrigin(req)) return new Response('Forbidden', { status: 403 });

  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  try {
    const { headlines } = await req.json();
    if (!headlines || !Array.isArray(headlines)) {
      return new Response(JSON.stringify({ error: 'Invalid headlines array' }), { 
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' } 
      });
    }

    // Parallelize batches of 10
    const BATCH_SIZE = 10;
    const batches = [];
    for (let i = 0; i < headlines.length; i += BATCH_SIZE) {
      batches.push(headlines.slice(i, i + BATCH_SIZE));
    }

    // Sequential (not Promise.all) to stay under Groq's per-minute rate limit;
    // callGroqBatch backs off on 429 internally.
    //
    // IMPORTANT: the frontend matches results to headlines BY INDEX. A failed
    // batch must contribute `null` placeholders (not vanish), otherwise every
    // later headline gets someone else's score/summary.
    const results = [];
    for (const batch of batches) {
      const r = await callGroqBatch(batch);
      const arr = Array.isArray(r) ? r.slice(0, batch.length) : [];
      results.push(...arr);
      for (let i = arr.length; i < batch.length; i++) results.push(null);
    }

    return new Response(JSON.stringify({ items: results }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
}
