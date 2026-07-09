/**
 * Civil Unrest Text Classifier
 *
 * Classifies raw text streams (News API headlines, Twitter fallback items)
 * into real-world civil unrest events: Protest / Strike / Blockade.
 *
 * Pipeline:
 *   1. Regex prescreen  — texts with zero unrest signals skip the LLM (cost guard)
 *   2. Groq LLM batch   — structured extraction via UNREST_SYSTEM prompt
 *   3. Normalization    — schema enforcement, confidence threshold, null rules
 *
 * POST /api/enrichment/unrest-classify
 *   Body: { texts: string[] }
 *   Resp: { items: ClassificationResult[] }   (same order as input)
 *
 * ClassificationResult:
 *   {
 *     is_civil_unrest: boolean,
 *     event_type: "Protest" | "Strike" | "Blockade" | "None",
 *     confidence_score: number,        // P(real physical unrest), 0.0–1.0
 *     extraction: { location, trigger, impact } | null,  // null when negative
 *     filtering_justification: string
 *   }
 */
import { getCorsHeaders, isDisallowedOrigin } from '../_cors.js';
import { checkRateLimit } from '../_rate-limit.js';

export const config = { runtime: 'edge' };

const GROQ_KEY = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
// llama-3.3-70b-versatile is deprecated on Groq (shutdown 2026-08-16).
const GROQ_MODEL = process.env.VITE_GROQ_MODEL || 'openai/gpt-oss-120b';

const CONFIDENCE_THRESHOLD = 0.75;
const VALID_TYPES = new Set(['Protest', 'Strike', 'Blockade', 'None']);

// ── System prompt (v2 — refined for confidence semantics, null rules, precedence) ──

export const UNREST_SYSTEM = `You classify raw text (news headlines, tweets) for a civil unrest monitoring system. Identify REAL, PHYSICAL civil unrest events only.

RULES:
1. PHYSICALITY GATE: Classify as unrest ONLY if there is a physical, real-world gathering OR concrete disruption of labor/infrastructure. REJECT metaphorical/digital expressions: "protesting prices", subscription cancellations, "taking to X", internet outrage, petitions, hashtag activism.
2. IMPLICIT SIGNALS: Look beyond explicit keywords. Behavioral signals count: "refused to work", "didn't show up", "walked out", "blocked the road", "parked across", "gathered outside", "picket line", "clashed with police", "marched on", "sit-in", "occupied", "banners", "tear gas", "bandh", "dharna", "curfew", "section 144".
3. NOISE: Drop hyperbolic/clickbait usage ("fans riot over album", "the line is a literal riot"), spam, rants, marketing hashtags, and "strike" homonyms (military strike, airstrike, lightning strike, sports, "strike a deal").
4. TYPE PRECEDENCE when multiple apply:
   Strike — labor withdrawal is the root action (even if workers also gather/march).
   Blockade — root action is physically obstructing a road, port, rail line, or facility.
   Protest — gathering/march/demonstration otherwise; riots and police clashes are Protest with violence noted in "impact".
5. CONFIDENCE: confidence_score = your estimated probability (0.0-1.0) that the text describes a REAL PHYSICAL unrest event. Clear noise scores near 0.0. It is NOT your certainty in the classification.
6. THRESHOLD: If you would classify as unrest but confidence_score < ${CONFIDENCE_THRESHOLD}, output is_civil_unrest=false and event_type="None".
7. NULL RULE: When is_civil_unrest=false, extraction MUST be JSON null.

OUTPUT — JSON only, no markdown, same order as input:
{"items":[{
  "is_civil_unrest": true/false,
  "event_type": "Protest" | "Strike" | "Blockade" | "None",
  "confidence_score": 0.00,
  "extraction": {"location": "most specific place: venue/road/district/city/country, or 'Unknown'", "trigger": "root cause", "impact": "disruptions caused"} or null,
  "filtering_justification": "one sentence"
}]}`;

// ── Stage 1: regex prescreen (cost guard — skip LLM for signal-free text) ──
// Deliberately broad: includes behavioral synonyms so implicit events still
// reach the LLM. Only texts with ZERO signals are auto-classified negative.

export const SIGNAL_RE = new RegExp(
  [
    'protest', 'strike', 'striking', 'demonstrat', 'riot', 'unrest', 'rally',
    'rallies', 'march', 'picket', 'blockade', 'block(ed|ing)?\\s+(the\\s+)?(road|highway|street|rail|port|entrance|gate)',
    'walk(ed|s)?\\s*out', 'walkout', 'sit-?in', 'occupy', 'occupied', 'boycott',
    'refus(ed|ing)\\s+to\\s+(work|move)', "didn'?t\\s+show\\s+up", 'no-?show',
    'gather(ed|ing)?', 'clash(ed|es)?', 'tear\\s*gas', 'curfew', 'section\\s*144',
    'bandh', 'dharna', 'hartal', 'agitation', 'banners?', 'crowd', 'mob',
    'parked\\s+(their\\s+)?\\w*\\s*(across|on|along)', 'shut\\s*down', 'stoppage',
    'work\\s+stoppage', 'union', 'tailback', 'barricade',
  ].join('|'),
  'i',
);

export function prescreen(text) {
  return SIGNAL_RE.test(text || '');
}

export function negativeResult(justification) {
  return {
    is_civil_unrest: false,
    event_type: 'None',
    confidence_score: 0.0,
    extraction: null,
    filtering_justification: justification,
  };
}

// ── Stage 3: normalization (never trust raw LLM output) ──

export function normalizeResult(raw) {
  if (!raw || typeof raw !== 'object') {
    return negativeResult('Malformed classifier output; dropped for data integrity.');
  }

  let confidence = Number(raw.confidence_score);
  if (!Number.isFinite(confidence)) confidence = 0;
  confidence = Math.min(1, Math.max(0, confidence));

  let eventType = VALID_TYPES.has(raw.event_type) ? raw.event_type : 'None';
  let isUnrest = raw.is_civil_unrest === true && eventType !== 'None';

  // Enforce confidence threshold server-side (rule 6), even if the model forgot
  if (isUnrest && confidence < CONFIDENCE_THRESHOLD) {
    isUnrest = false;
  }
  if (!isUnrest) eventType = 'None';

  // Enforce null rule (rule 7) and extraction shape
  let extraction = null;
  if (isUnrest) {
    const ex = raw.extraction && typeof raw.extraction === 'object' ? raw.extraction : {};
    extraction = {
      location: typeof ex.location === 'string' && ex.location.trim() ? ex.location.trim() : 'Unknown',
      trigger: typeof ex.trigger === 'string' && ex.trigger.trim() ? ex.trigger.trim() : 'Unknown',
      impact: typeof ex.impact === 'string' && ex.impact.trim() ? ex.impact.trim() : 'Unknown',
    };
  }

  return {
    is_civil_unrest: isUnrest,
    event_type: eventType,
    confidence_score: confidence,
    extraction,
    filtering_justification:
      typeof raw.filtering_justification === 'string'
        ? raw.filtering_justification.slice(0, 300)
        : '',
  };
}

// ── Stage 2: Groq batch call ──

async function callGroqBatch(texts, attempt = 0) {
  if (!GROQ_KEY) return null;
  const numbered = texts.map((t, i) => `${i}: ${t}`).join('\n');

  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: UNREST_SYSTEM },
          { role: 'user', content: `Texts:\n${numbered}` },
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
      return callGroqBatch(texts, attempt + 1);
    }
    if (!resp.ok) {
      console.warn(`[unrest-classify] Groq HTTP ${resp.status}`);
      return null;
    }
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') return null;
    const parsed = JSON.parse(content);
    const items = Array.isArray(parsed.items) ? parsed.items : Array.isArray(parsed) ? parsed : null;
    if (!items || items.length !== texts.length) return null; // order/length integrity
    return items;
  } catch (err) {
    console.error('[unrest-classify] Groq batch failed:', err);
    return null;
  }
}

// ── Handler ──

export default async function handler(req) {
  const cors = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (isDisallowedOrigin(req)) return new Response('Forbidden', { status: 403 });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const limited = await checkRateLimit(req, cors);
  if (limited) return limited;

  try {
    const { texts } = await req.json();
    if (!Array.isArray(texts) || texts.some((t) => typeof t !== 'string')) {
      return new Response(JSON.stringify({ error: 'Invalid texts array' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const results = new Array(texts.length);

    // Stage 1: prescreen — auto-negative for signal-free text, saves LLM calls
    const llmIndices = [];
    texts.forEach((t, i) => {
      if (!t.trim()) {
        results[i] = negativeResult('Empty input.');
      } else if (!prescreen(t)) {
        results[i] = negativeResult('No unrest signals detected in text; skipped as noise.');
      } else {
        llmIndices.push(i);
      }
    });

    // Stage 2: batched LLM classification for candidates only
    const BATCH_SIZE = 10;
    const batches = [];
    for (let i = 0; i < llmIndices.length; i += BATCH_SIZE) {
      batches.push(llmIndices.slice(i, i + BATCH_SIZE));
    }

    // Sequential (not Promise.all) to stay under Groq's per-minute rate limit;
    // callGroqBatch backs off on 429 internally.
    for (const idxBatch of batches) {
      const raw = await callGroqBatch(idxBatch.map((i) => texts[i].slice(0, 600)));
      idxBatch.forEach((origIdx, j) => {
        // Stage 3: normalize; fail closed (negative) on LLM failure
        results[origIdx] = raw
          ? normalizeResult(raw[j])
          : negativeResult('Classifier unavailable; failed closed to protect data integrity.');
      });
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
