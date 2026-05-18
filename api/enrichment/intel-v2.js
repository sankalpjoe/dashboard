import { getCorsHeaders, isDisallowedOrigin } from '../_cors.js';

export const config = { runtime: 'edge' };

const GROQ_KEY = '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';
const GROQ_MODEL = 'qwen/qwen3-32b';

const INTEL_SYSTEM = `You are a strict India-only crisis intelligence filter for a city monitoring dashboard.

GOLDEN RULE: If the incident is NOT in India, score it 1 (DROP) unless it directly threatens India. Protests in London, shootings in the US, global elections, international marches — ALL score 1. INDIA ONLY.

KEEP — score 5-10 — INDIA ONLY:
1. Climate/weather IN INDIA: IMD alerts, red/orange/yellow alert, cyclone, heatwave, heavy rain, flood warning, earthquake in India, AQI spike.
2. Disease outbreaks IN INDIA: Nipah, Ebola, dengue deaths, malaria, cholera, ICMR/WHO alert. KEEP ONLY IF THERE ARE ACTIVE CONFIRMED CASES IN INDIA. Drop speculative articles about foreign outbreaks sparking "concern" or "watch" in India.
3. Protests & Public Events: Planned protests, strikes, bandhs, rallies, demonstrations, public gatherings, dharnas, marches, blockades, curfews, section 144, riots, civil unrest, and security threats ANYWHERE in India.
4. Infrastructure incidents: power cuts, building collapses, grid shutdowns, water supply failures, major transport blockages, and accidents ANYWHERE in India.

DISCARD — score 1-2 (DROP):
- ANY event outside India (e.g., London protests, UK, USA, Europe, Congo Ebola, Africa outbreaks).
- Speculative health news: "concern in India", "why Kerala is a watchpoint", etc., when cases are actually outside India.
- Sports matches (e.g., IPL, CSK, SRH, cricket match weather), entertainment, Bollywood.
- Real estate disputes, slum encroachments, property news (unless violent riot).
- General politics, routine speeches, parliament debates, business news, stock market, IPOs.

CATEGORIES: conflict | health | disease | traffic | infra | vip | protest | cyber | military | general
SCORE: 1-10. Use 1-2 for discards only.
SUMMARY: 3 bullets, max 12 words each, factual.
HEADLINE: concise English rewrite, max 20 words, include city or region name.

Return JSON: {"items": [{"score": number, "headline": string, "summary": string[], "category": string, "sentiment": number}]}
Same order as input. No markdown, no extra keys.`;

async function callGroqBatch(headlines) {
  if (!GROQ_KEY) return null;
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
          { role: 'system', content: INTEL_SYSTEM },
          { role: 'user',   content: `Headlines:\n${headlines.map((h,i)=>`${i}:${h}`).join('\n')}` },
        ],
        temperature: 0.6,
        top_p: 0.95,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(20000),
    });
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content);
    return parsed.items || parsed;
  } catch (err) {
    console.error("callGroqBatch error:", err);
    return null;
  }
}

export default async function handler(req) {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (isDisallowedOrigin(req)) return new Response('Forbidden', { status: 403 });

  try {
    const { headlines } = await req.json();
    const BATCH_SIZE = 10;
    const batches = [];
    for (let i = 0; i < headlines.length; i += BATCH_SIZE) {
      batches.push(headlines.slice(i, i + BATCH_SIZE));
    }
    const results = await Promise.all(batches.map(batch => callGroqBatch(batch)));
    return new Response(JSON.stringify({ items: results.flat().filter(Boolean) }), {
      status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}
