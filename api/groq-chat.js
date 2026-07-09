/**
 * Groq chat proxy — keeps the GROQ_API_KEY server-side.
 *
 * The frontend used to call api.groq.com directly with VITE_GROQ_API_KEY,
 * which bakes the key into the public JS bundle. All browser LLM calls now
 * POST here instead; this handler validates, clamps, and forwards.
 *
 * POST /api/groq-chat
 *   Body: { model?, messages, temperature?, max_tokens?, response_format? }
 *   Returns: the raw Groq chat-completions JSON (client parsing unchanged).
 *
 * Abuse guards: origin allowlist (CORS), Upstash rate limit (when configured),
 * model allowlist, message count/size caps, max_tokens clamp.
 */
import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';
import { checkRateLimit } from './_rate-limit.js';

export const config = { runtime: 'edge' };

const GROQ_KEY = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;

// Only models this app actually uses. Anything else is rejected.
const ALLOWED_MODELS = new Set([
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'groq/compound',
  'llama-3.1-8b-instant',
]);
const DEFAULT_MODEL = 'openai/gpt-oss-120b';

const MAX_MESSAGES = 40;
const MAX_TOTAL_CHARS = 80_000;
const MAX_TOKENS_CAP = 6_000;

export default async function handler(req) {
  const cors = getCorsHeaders(req, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (isDisallowedOrigin(req)) return new Response('Forbidden', { status: 403 });

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!GROQ_KEY) return json({ error: 'GROQ_API_KEY not configured on the server' }, 503);

  const rateLimited = await checkRateLimit(req, cors);
  if (rateLimited) return rateLimited;

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }

  const { messages, temperature, max_tokens, response_format } = body || {};
  let { model } = body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: 'messages array required' }, 400);
  }
  if (messages.length > MAX_MESSAGES) {
    return json({ error: `too many messages (max ${MAX_MESSAGES})` }, 400);
  }
  const totalChars = messages.reduce((n, m) => n + String(m?.content ?? '').length, 0);
  if (totalChars > MAX_TOTAL_CHARS) {
    return json({ error: `payload too large (max ${MAX_TOTAL_CHARS} chars)` }, 400);
  }
  if (!messages.every(m => m && typeof m.content === 'string' && ['system', 'user', 'assistant'].includes(m.role))) {
    return json({ error: 'invalid message shape' }, 400);
  }

  // Legacy model IDs are silently upgraded rather than rejected, so stale
  // clients keep working after a Groq deprecation.
  if (!model || !ALLOWED_MODELS.has(model)) model = DEFAULT_MODEL;

  const payload = {
    model,
    messages,
    temperature: Math.min(Math.max(Number(temperature ?? 0.3), 0), 1),
    max_tokens: Math.min(Math.max(Number(max_tokens ?? 1024), 1), MAX_TOKENS_CAP),
    ...(response_format?.type === 'json_object' ? { response_format: { type: 'json_object' } } : {}),
  };

  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(50_000),
    });
    const data = await resp.text();
    return new Response(data, {
      status: resp.status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return json({ error: `Groq upstream error: ${err.message}` }, 502);
  }
}
