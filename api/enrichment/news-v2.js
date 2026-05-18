import { getCorsHeaders, isDisallowedOrigin } from '../_cors.js';
import { checkRateLimit } from '../_rate-limit.js';

export const config = { runtime: 'edge' };

const GROQ_KEY = process.env.VITE_GROQ_API_KEY;
const GROQ_MODEL = process.env.VITE_GROQ_MODEL || 'llama-3.3-70b-versatile';

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

async function callGroqBatch(headlines) {
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

    if (!resp.ok) return null;
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
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

    const results = await Promise.all(batches.map(batch => callGroqBatch(batch)));
    const flatResults = results.flat().filter(Boolean);

    return new Response(JSON.stringify({ items: flatResults }), {
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
