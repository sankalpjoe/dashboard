const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/(.*\.)?worldmonitor\.app$/,
  /^https:\/\/worldmonitor-[a-z0-9-]+-elie-[a-z0-9]+\.vercel\.app$/,
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https?:\/\/tauri\.localhost(:\d+)?$/,
  /^https?:\/\/[a-z0-9-]+\.tauri\.localhost(:\d+)?$/i,
  /^tauri:\/\/localhost$/,
  /^asset:\/\/localhost$/,
];

// This deployment's own Vercel hosts (set automatically by Vercel at build
// and runtime) — production URL, current deployment URL, and branch URL.
const VERCEL_HOSTS = [
  process.env.VERCEL_PROJECT_PRODUCTION_URL,
  process.env.VERCEL_URL,
  process.env.VERCEL_BRANCH_URL,
].filter(Boolean);

// Extra origins (e.g. a custom domain), comma-separated full origins:
// ALLOWED_ORIGINS=https://mydashboard.example.com,https://intel.example.org
const EXTRA_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin))) return true;
  if (VERCEL_HOSTS.some((h) => origin === `https://${h}`)) return true;
  if (EXTRA_ORIGINS.includes(origin)) return true;
  return false;
}

export function getCorsHeaders(req, methods = 'GET, OPTIONS') {
  const origin = req.headers.get('origin') || '';
  const fallback = VERCEL_HOSTS[0] ? `https://${VERCEL_HOSTS[0]}` : 'https://worldmonitor.app';
  const allowOrigin = isAllowedOrigin(origin) ? origin : fallback;
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-WorldMonitor-Key',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

export function isDisallowedOrigin(req) {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  return !isAllowedOrigin(origin);
}
