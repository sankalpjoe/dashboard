import type { NewsItem } from './news-service';
import { fetchIMDWeather, formatWeatherForExportHtml, type IMDWeatherData } from './imd-service';

// Email configuration
const EMAIL_CONFIG = {
  serviceId: 'service_12345',
  templateId: 'template_12345',
  publicKey: 'user_12345',
  // These would be configured via environment variables in production
  recipientEmail: 'intel@example.com', // Default recipient
  senderEmail: 'dashint@example.com',
  senderName: 'DashINT Intelligence System'
};

// Type declarations for external libraries
interface EmailJS {
  send: (serviceId: string, templateId: string, templateParams: Record<string, unknown>, publicKey: string) => Promise<void>;
}

interface WindowWithEmailJS extends Window {
  emailjs?: EmailJS;
}

// LLM calls go through the server-side proxy (/api/groq-chat) so no API key
// ever ships in the browser bundle. Fallbacks fire when the proxy errors.
const GROQ_CHAT_URL = '/api/groq-chat';
const GROQ_MODEL = ((import.meta as ImportMeta).env?.VITE_GROQ_MODEL as string | undefined) ?? 'openai/gpt-oss-120b';

// Generate concise summary using Groq LLM
export async function generateEventSummary(newsItems: NewsItem[]): Promise<string> {
  try {
    // Filter for high-quality, relevant items
    const relevantItems = newsItems
      .filter(item => item.relevanceScore && item.relevanceScore >= 5)
      .filter(item => item.groqVetted !== false) // Keep items that are vetted or not yet vetted
      .slice(0, 10); // Limit to top 10 items for token efficiency

    if (relevantItems.length === 0) {
      return "No significant events detected in the current monitoring period.";
    }

    // Prepare context for Groq
    const context = relevantItems.map(item => {
      const category = item.refinedCategory || item.category;
      const kannadaFlag = item.isKannadaSource ? '[KANNADA SOURCE] ' : '';
      const qualityScore = item.groqQualityScore ? `[Quality: ${item.groqQualityScore}/10] ` : '';
      return `${kannadaFlag}${qualityScore}[${category.toUpperCase()}] ${item.headline} — ${item.source} (${item.city || 'India'}, ${item.time})`;
    }).join('\n');

    const systemPrompt = `You are an intelligence analyst for DashINT World Monitor. Generate a concise executive summary of key events from the following intelligence signals.

IMPORTANT GUIDELINES:
1. Focus on events from refined monitoring categories: War & Armed Conflict, Terrorism, Embassy Security Alerts, Civil Unrest & Logistics, Transit Disruptions, Climate & Natural Disasters, Disease Outbreaks
2. Highlight Kannada vernacular sources when present
3. Prioritize high-quality signals (quality score 7+)
4. Structure summary with:
   - Executive overview (1-2 sentences)
   - Key events by category (bullet points)
   - Regional focus (especially India/Karnataka)
   - Immediate concerns
5. Keep total length under 300 words
6. Use professional intelligence terminology
7. Include timestamps and locations where relevant

INTELLIGENCE SIGNALS:
${context}

Generate the executive summary:`;

    const response = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Generate executive summary of key events' }
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || generateFallbackSummary(newsItems);
  } catch (error) {
    console.error('Error generating summary with Groq:', error);
    return generateFallbackSummary(newsItems);
  }
}

// Fallback summary generation when Groq is unavailable
function generateFallbackSummary(newsItems: NewsItem[]): string {
  const relevantItems = newsItems
    .filter(item => item.relevanceScore && item.relevanceScore >= 5)
    .slice(0, 10);

  if (relevantItems.length === 0) {
    return "No significant events detected in the current monitoring period.";
  }

  // Group by refined category
  const byCategory: Record<string, NewsItem[]> = {};
  relevantItems.forEach(item => {
    const category = item.refinedCategory || item.category;
    if (!byCategory[category]) byCategory[category] = [];
    byCategory[category].push(item);
  });

  const summaryParts: string[] = [];
  summaryParts.push('EXECUTIVE SUMMARY - DASHINT WORLD MONITOR');
  summaryParts.push(`Generated: ${new Date().toLocaleString()}`);
  summaryParts.push(`Total signals processed: ${newsItems.length}`);
  summaryParts.push(`High-relevance signals: ${relevantItems.length}`);
  summaryParts.push('');

  // Add Kannada source count
  const kannadaSources = relevantItems.filter(item => item.isKannadaSource).length;
  if (kannadaSources > 0) {
    summaryParts.push(`Kannada vernacular sources: ${kannadaSources} signals`);
    summaryParts.push('');
  }

  // Add events by category
  Object.entries(byCategory).forEach(([category, items]) => {
    summaryParts.push(`${category.toUpperCase()}:`);
    items.forEach(item => {
      const kannadaFlag = item.isKannadaSource ? '[KN] ' : '';
      const qualityScore = item.groqQualityScore ? ` (Quality: ${item.groqQualityScore}/10)` : '';
      summaryParts.push(`  • ${kannadaFlag}${item.headline} — ${item.source}${qualityScore}`);
    });
    summaryParts.push('');
  });

  // Add immediate concerns
  const highSeverity = relevantItems.filter(item => item.severity <= 2);
  if (highSeverity.length > 0) {
    summaryParts.push('IMMEDIATE CONCERNS:');
    highSeverity.forEach(item => {
      summaryParts.push(`  • ${item.headline} (${item.city || 'Location unknown'})`);
    });
  }

  return summaryParts.join('\n');
}

// Send email via backend API (Resend/SendGrid/SMTP)
export async function sendEmailSummary(
  summary: string,
  recipientEmail?: string,
  subject?: string,
  format: 'markdown' | 'pdf' = 'markdown'
): Promise<boolean> {
  try {
    const response = await fetch('/api/email-report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipientEmail: recipientEmail || EMAIL_CONFIG.recipientEmail,
        summary: summary,
        subject: subject || `DashINT Intelligence Summary - ${new Date().toLocaleDateString()}`,
        format: format
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Email API error:', errorData);
      return false;
    }

    const result = await response.json();
    return result.success === true;
    
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

// Export data in various formats
export function exportToCsv(newsItems: NewsItem[]): string {
  const headers = [
    'ID',
    'Headline',
    'Source',
    'Time',
    'Category',
    'Refined Category',
    'Severity',
    'Confidence',
    'City',
    'Language',
    'Kannada Source',
    'Kannada Confidence',
    'Groq Vetted',
    'Groq Quality Score',
    'Relevance Score',
    'Sentiment',
    'URL'
  ];

  const rows = newsItems.map(item => [
    item.id,
    `"${item.headline.replace(/"/g, '""')}"`,
    item.source,
    item.time,
    item.category,
    item.refinedCategory || '',
    item.severity,
    item.confidence,
    item.city || '',
    item.lang || '',
    item.isKannadaSource ? 'Yes' : 'No',
    item.kannadaConfidence || 0,
    item.groqVetted ? 'Yes' : 'No',
    item.groqQualityScore || '',
    item.relevanceScore || '',
    item.sentiment || '',
    item.url || ''
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');

  return csvContent;
}

export function exportToJson(newsItems: NewsItem[]): string {
  const exportData = newsItems.map(item => ({
    id: item.id,
    headline: item.headline,
    source: item.source,
    time: item.time,
    timestamp: item.timestamp,
    category: item.category,
    refinedCategory: item.refinedCategory,
    severity: item.severity,
    confidence: item.confidence,
    city: item.city,
    lang: item.lang,
    langLabel: item.langLabel,
    isKannadaSource: item.isKannadaSource,
    kannadaConfidence: item.kannadaConfidence,
    groqVetted: item.groqVetted,
    groqQualityScore: item.groqQualityScore,
    groqRejectionReason: item.groqRejectionReason,
    relevanceScore: item.relevanceScore,
    sentiment: item.sentiment,
    summary: item.summary,
    url: item.url,
    lat: item.lat,
    lon: item.lon
  }));

  return JSON.stringify(exportData, null, 2);
}

// ---------------------------------------------------------------------------
// Word / Excel export (client-side, zero dependencies)
//
// Excel: an HTML <table> served with an .xls extension + Excel MIME type opens
//        natively in Microsoft Excel / LibreOffice Calc.
// Word:  an HTML document served with a .doc extension + Word MIME type opens
//        natively in Microsoft Word / LibreOffice Writer.
// Both work fully offline inside the Tauri webview with no npm packages.
// ---------------------------------------------------------------------------

// Structural shape both NewsItem (news feed) and mapped IntelItem (intel feed)
// satisfy, so a single export path serves every feed in the app.
export interface ExportableArticle {
  headline: string;
  source: string;
  time?: string;
  category?: string;
  riskGroup?: string;
  city?: string;
  severity?: number | string;
  confidence?: string;
  sentiment?: number;
  summary?: string[];
  url?: string;
  aiSummary?: string;  // AI-generated crisp summary for exports
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Trigger a browser download for the given content. */
export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob(['﻿', content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type MailProvider = 'mailto' | 'gmail' | 'outlook';

/**
 * Open a pre-filled email compose window in the chosen provider (no SMTP server):
 *  - 'mailto'  → the OS default mail app (Outlook desktop, Mail, Thunderbird…)
 *  - 'gmail'   → Gmail web compose
 *  - 'outlook' → Outlook web compose
 */
export function openEmailCompose(opts: { to?: string; subject?: string; body: string; provider?: MailProvider }): void {
  const { to = '', subject = '', body, provider = 'mailto' } = opts;
  const e = encodeURIComponent;
  if (provider === 'gmail') {
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${e(to)}&su=${e(subject)}&body=${e(body)}`, '_blank', 'noopener');
  } else if (provider === 'outlook') {
    window.open(`https://outlook.office.com/mail/deeplink/compose?to=${e(to)}&subject=${e(subject)}&body=${e(body)}`, '_blank', 'noopener');
  } else {
    // mailto opens the default handler without navigating away from the app
    window.location.href = `mailto:${e(to)}?subject=${e(subject)}&body=${e(body)}`;
  }
}

const EXPORT_COLUMNS: { label: string; get: (i: ExportableArticle) => string }[] = [
  { label: 'Headline', get: i => i.headline },
  { label: 'Category', get: i => i.category ?? '' },
  { label: 'Risk Group', get: i => i.riskGroup ?? '' },
  { label: 'City', get: i => i.city ?? '' },
  { label: 'Source', get: i => i.source },
  { label: 'Time', get: i => i.time ?? '' },
  { label: 'Severity', get: i => String(i.severity ?? '') },
  { label: 'Key Points (AI)', get: i => i.aiSummary ?? (i.summary?.join(' ') ?? '') },
];

export interface ExportOpts { filename?: string; brief?: string; weatherHtml?: string }

/** Export selected articles to an Excel-openable .xls file (no links). */
export function exportToExcel(newsItems: ExportableArticle[], opts: ExportOpts = {}): void {
  const head = EXPORT_COLUMNS.map(c => `<th>${escapeHtml(c.label)}</th>`).join('');
  const body = newsItems
    .map(item => {
      const cells = EXPORT_COLUMNS.map(c => `<td>${escapeHtml(c.get(item))}</td>`).join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  const briefBlock = opts.brief
    ? `<p style="font-family:Calibri;font-size:12px;font-weight:bold;margin:0">EXECUTIVE BRIEF (AI-GENERATED)</p>` +
      `<p style="font-family:Calibri;font-size:11px;white-space:pre-wrap;max-width:900px;margin:4px 0 14px 0">${escapeHtml(opts.brief)}</p>`
    : '';

  const html =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" ` +
    `xmlns:x="urn:schemas-microsoft-com:office:excel" ` +
    `xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8">` +
    `<style>table{border-collapse:collapse}th,td{border:1px solid #999;padding:4px;` +
    `font-family:Calibri,Arial,sans-serif;font-size:11px;vertical-align:top;text-align:left}` +
    `th{background:#1a1b26;color:#fff;font-weight:bold}</style></head><body>` +
    `${briefBlock}<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;

  const name = opts.filename ?? `india-intel-feed-${new Date().toISOString().slice(0, 10)}.xls`;
  downloadFile(name, html, 'application/vnd.ms-excel');
}

/** Export selected articles to a Word-openable .doc file (combined AI brief, no links). */
export function exportToWord(newsItems: ExportableArticle[], opts: ExportOpts = {}): void {
  const generated = new Date().toLocaleString();

  const briefBlock = opts.brief
    ? `<div style="margin:0 0 16pt 0;padding:10pt 12pt;background:#f1f5f9;border-left:4pt solid #1a1b26">` +
      `<div style="font-size:9pt;color:#64748b;letter-spacing:0.5pt;font-weight:bold;margin-bottom:5pt">EXECUTIVE BRIEF (AI-GENERATED)</div>` +
      `<div style="font-size:10.5pt;color:#1e293b;line-height:1.55;white-space:pre-wrap">${escapeHtml(opts.brief)}</div></div>`
    : '';

  const cards = newsItems
    .map((item, idx) => {
      const meta = [
        item.category?.toUpperCase(),
        item.riskGroup ? item.riskGroup.replace(/_/g, ' ').toUpperCase() : null,
        item.city,
        item.source,
        item.time,
      ]
        .filter(Boolean)
        .map(escapeHtml)
        .join(' &middot; ');

      // Per-article AI summary only if explicitly attached (combined brief is primary)
      const summaryBlock = item.aiSummary
        ? `<div style="margin:4pt 0;padding:6pt 10pt;background:#f8fafc;border-left:3pt solid #3b82f6;font-size:10pt;color:#334155;line-height:1.5">${escapeHtml(item.aiSummary)}</div>`
        : '';

      return (
        `<div style="margin:0 0 10pt 0;padding:0 0 8pt 0;border-bottom:1px solid #cccccc">` +
        `<p style="font-size:12pt;font-weight:bold;margin:0 0 3pt 0">${idx + 1}. ${escapeHtml(item.headline)}</p>` +
        `<p style="font-size:9pt;color:#555555;margin:0">${meta}</p>` +
        `${summaryBlock}</div>`
      );
    })
    .join('');

  const html =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" ` +
    `xmlns:w="urn:schemas-microsoft-com:office:word" ` +
    `xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8">` +
    `<style>body{font-family:Calibri,Arial,sans-serif;color:#1a1b26}</style></head><body>` +
    `<h1 style="font-size:18pt">India Intel Feed — Situation Report</h1>` +
    `<p style="font-size:10pt;color:#555555">Generated: ${escapeHtml(generated)} &middot; ${newsItems.length} article(s)</p>` +
    `<hr/>` +
    `${opts.weatherHtml ?? ''}` +
    `${briefBlock}` +
    `<div style="font-size:9pt;color:#64748b;letter-spacing:0.5pt;font-weight:bold;margin:0 0 8pt 0">SOURCE SIGNALS</div>` +
    `${cards}</body></html>`;

  const name = opts.filename ?? `india-intel-report-${new Date().toISOString().slice(0, 10)}.doc`;
  downloadFile(name, html, 'application/msword');
}

/** Plain-text email body: per-article headline + 3-point key summary (no links). */
export function formatArticlesForEmail(items: ExportableArticle[]): string {
  const lines: string[] = [
    `India Intel Brief — ${new Date().toLocaleString('en-IN')} · ${items.length} item(s)`,
    '',
  ];
  items.forEach((it, i) => {
    lines.push(`${i + 1}. ${it.headline}`);
    const meta = [it.category?.toUpperCase(), it.city, it.source, it.time].filter(Boolean).join(' · ');
    if (meta) lines.push(`   (${meta})`);
    if (it.aiSummary) lines.push(`   ${it.aiSummary}`);
    lines.push('');
  });
  return lines.join('\n');
}

/**
 * Generate a single crisp, accurate executive brief over the selected articles
 * using Groq (VITE_GROQ_API_KEY). Falls back to a structured summary if no key.
 */
export async function generateCombinedBrief(items: ExportableArticle[]): Promise<string> {
  if (!items.length) return 'No articles selected.';

  const context = items
    .map((it, i) =>
      `${i + 1}. [${(it.category || 'general').toUpperCase()}${it.city ? ' · ' + it.city : ''}] ` +
      `${it.headline}${it.source ? ` (${it.source}${it.time ? ', ' + it.time : ''})` : ''}`,
    )
    .join('\n');

  try {
    const resp = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You are a crisis-intelligence analyst for an India city-operations team. ' +
              'Write a CRISP, ACCURATE executive brief synthesising the selected signals. ' +
              'Open with a one-line situation overview, then 4-8 tight bullet points grouped by ' +
              'city or theme. Be factual; no speculation, no filler, no source links, no markdown ' +
              'headers. Keep under 220 words.',
          },
          { role: 'user', content: `Selected signals:\n${context}\n\nWrite the executive brief.` },
        ],
        temperature: 0.3,
        max_tokens: 600,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!resp.ok) return fallbackCombinedBrief(items);
    const data = await resp.json();
    return (data.choices?.[0]?.message?.content || '').trim() || fallbackCombinedBrief(items);
  } catch {
    return fallbackCombinedBrief(items);
  }
}

function fallbackCombinedBrief(items: ExportableArticle[]): string {
  const byCat: Record<string, ExportableArticle[]> = {};
  items.forEach(it => { const c = it.category || 'general'; (byCat[c] ||= []).push(it); });
  const lines: string[] = [
    `Executive brief — ${items.length} selected signal(s).`,
    '(AI key not configured; structured summary shown.)',
    '',
  ];
  Object.entries(byCat).forEach(([cat, arr]) => {
    lines.push(`${cat.toUpperCase()}:`);
    arr.forEach(it => lines.push(`• ${it.headline}${it.city ? ` (${it.city})` : ''} — ${it.source}`));
    lines.push('');
  });
  return lines.join('\n').trim();
}

// ---------------------------------------------------------------------------
// COMPREHENSIVE STRUCTURED BRIEF — corporate SITREP format
//
// Replicates the analyst-style daily brief: a dated title bar, a KEY FOCUS
// AREAS table (High Priority / Watchlist / Source Legend) and an INCIDENT
// SUMMARY table (#, Incident Type, City/Sources, Risk Category, Situation
// Snapshot, Business Impact, Short Term Implications) with colour-coded risk.
// Incidents are clustered and written by Groq; source links come ONLY from the
// selected articles (the model cites items by index, so links can't be
// hallucinated). Falls back to a heuristic build when no AI key is set.
// ---------------------------------------------------------------------------

export interface BriefIncident {
  incidentType: string;
  city: string;
  riskCategory: 'HIGH' | 'MEDIUM' | 'LOW';
  /** Indices into the selected-articles array — resolved to real source links. */
  sourceRefs: number[];
  snapshot: string[];
  businessImpact: string[];
  shortTermImplications: string[];
}

export interface StructuredBrief {
  scope: string;              // e.g. "MUMBAI – PUNE" or "BENGALURU · 5-CITY"
  overview: string;           // executive overview paragraph
  highPriority: string[];
  watchlist: string[];
  incidents: BriefIncident[];
}

const RISK_ORDER: Record<BriefIncident['riskCategory'], number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export async function generateStructuredBrief(items: ExportableArticle[]): Promise<StructuredBrief> {
  if (!items.length) return fallbackStructuredBrief(items);

  const context = items
    .map((it, i) =>
      `${i}. [${(it.category || 'general').toUpperCase()}${it.city ? ' · ' + it.city : ''}` +
      `${it.severity ? ' · sev:' + it.severity : ''}] ${it.headline}` +
      ` (source: ${it.source}${it.time ? ', ' + it.time : ''})`)
    .join('\n');

  const SYSTEM = `You are a senior crisis-intelligence analyst producing a comprehensive corporate daily security brief for business operations teams in Indian cities. You receive numbered news signals and must return ONLY a valid JSON object (no markdown) with this exact shape:
{
 "scope": "CITY or CITY – CITY string naming the geography this brief covers, uppercase",
 "overview": "one substantive executive-overview paragraph (4-7 sentences): the day's overall risk picture, the dominant themes, how conditions are trending, and the single most important thing an operations head must know",
 "highPriority": ["4-7 bullet strings — the most operationally significant developments, each specific enough to act on"],
 "watchlist": ["4-7 bullet strings — emerging situations to monitor, each with WHY it could escalate"],
 "incidents": [
   {
     "incidentType": "short label e.g. 'Weather / Flooding / Mobility'",
     "city": "city or corridor name",
     "riskCategory": "HIGH" | "MEDIUM" | "LOW",
     "sourceRefs": [signal index numbers that support this incident],
     "snapshot": ["3-5 factual bullets: what is happening, where exactly, since when, scale/numbers, current status"],
     "businessImpact": ["3-5 bullets covering, where relevant: staff commute & safety, executive travel, logistics/supply chain, facility operations, vendor/field movement"],
     "shortTermImplications": ["3-5 bullets: concrete recommended actions, what to expect in the next 24-48h, thresholds that should trigger escalation"]
   }
 ]
}
Rules: CLUSTER related signals into one incident (e.g. all rain/flood items for one city = one incident). 4-10 incidents total, ordered by risk. sourceRefs MUST only contain indices that exist in the input. Be detailed, factual and specific — always carry over numbers, road/area names, alert levels, timings and casualty figures that appear in the signals. No speculation beyond reasonable operational implication. British-Indian business English.`;

  try {
    const resp = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `Signals:\n${context}\n\nProduce the JSON brief.` },
        ],
        temperature: 0.2,
        max_tokens: 6000,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!resp.ok) return fallbackStructuredBrief(items);
    const data = await resp.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');

    const clean = (a: unknown): string[] =>
      Array.isArray(a) ? a.filter((s): s is string => typeof s === 'string' && s.trim().length > 0) : [];

    const incidents: BriefIncident[] = (Array.isArray(parsed.incidents) ? parsed.incidents : [])
      .map((inc: Record<string, unknown>): BriefIncident => ({
        incidentType: String(inc.incidentType || 'General'),
        city: String(inc.city || ''),
        riskCategory: (['HIGH', 'MEDIUM', 'LOW'].includes(String(inc.riskCategory))
          ? String(inc.riskCategory) : 'MEDIUM') as BriefIncident['riskCategory'],
        sourceRefs: (Array.isArray(inc.sourceRefs) ? inc.sourceRefs : [])
          .map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < items.length),
        snapshot: clean(inc.snapshot),
        businessImpact: clean(inc.businessImpact),
        shortTermImplications: clean(inc.shortTermImplications),
      }))
      .filter((inc: BriefIncident) => inc.snapshot.length > 0)
      .sort((a: BriefIncident, b: BriefIncident) => RISK_ORDER[a.riskCategory] - RISK_ORDER[b.riskCategory])
      .slice(0, 10);

    if (!incidents.length) return fallbackStructuredBrief(items);
    return {
      scope: String(parsed.scope || deriveScope(items)),
      overview: typeof parsed.overview === 'string' ? parsed.overview.trim() : '',
      highPriority: clean(parsed.highPriority),
      watchlist: clean(parsed.watchlist),
      incidents,
    };
  } catch {
    return fallbackStructuredBrief(items);
  }
}

function deriveScope(items: ExportableArticle[]): string {
  const cities = [...new Set(items.map(i => (i.city || '').toUpperCase()).filter(Boolean))];
  if (!cities.length) return 'INDIA — MONITORED CITIES';
  return cities.slice(0, 3).join(' – ') + (cities.length > 3 ? ' +' : '');
}

/** No-AI fallback: cluster by (riskGroup|category)+city, derive fields heuristically. */
function fallbackStructuredBrief(items: ExportableArticle[]): StructuredBrief {
  const groups = new Map<string, number[]>();
  items.forEach((it, i) => {
    const key = `${it.riskGroup || it.category || 'General'}|${it.city || ''}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(i);
  });

  const sevRisk = (idxs: number[]): BriefIncident['riskCategory'] => {
    const sevs = idxs.map(i => String(items[i].severity ?? '').toLowerCase());
    if (sevs.some(s => s === 'critical' || s === '1')) return 'HIGH';
    if (sevs.some(s => s === 'high' || s === '2')) return 'MEDIUM';
    return 'LOW';
  };

  const incidents: BriefIncident[] = [...groups.entries()]
    .map(([key, idxs]) => {
      const [type, city] = key.split('|');
      return {
        incidentType: type,
        city: city || deriveScope(idxs.map(i => items[i])),
        riskCategory: sevRisk(idxs),
        sourceRefs: idxs.slice(0, 4),
        snapshot: idxs.slice(0, 4).map(i => items[i].headline),
        businessImpact: ['Potential disruption to staff movement and local operations.'],
        shortTermImplications: ['Monitor official advisories; review travel plans in affected areas.'],
      };
    })
    .sort((a, b) => RISK_ORDER[a.riskCategory] - RISK_ORDER[b.riskCategory])
    .slice(0, 10);

  const high = incidents.filter(i => i.riskCategory === 'HIGH').flatMap(i => i.snapshot.slice(0, 1));
  const watch = incidents.filter(i => i.riskCategory !== 'HIGH').flatMap(i => i.snapshot.slice(0, 1));

  return {
    scope: deriveScope(items),
    overview: `${items.length} signal(s) reviewed across ${deriveScope(items)}; ` +
      `${incidents.filter(i => i.riskCategory === 'HIGH').length} high-risk cluster(s) identified. ` +
      `(AI unavailable — heuristic brief shown.)`,
    highPriority: high.length ? high : ['No high-priority incidents in the selected signals.'],
    watchlist: watch.slice(0, 6),
    incidents,
  };
}

// ── Word rendering ───────────────────────────────────────────────────────────

const RISK_CELL: Record<BriefIncident['riskCategory'], string> = {
  HIGH: 'background:#f4cccc;color:#990000',
  MEDIUM: 'background:#fff2cc;color:#7f6000',
  LOW: 'background:#d9ead3;color:#38761d',
};

function ul(lines: string[]): string {
  return lines.map(l => `<p style="margin:0 0 3pt 0">• ${escapeHtml(l)}</p>`).join('');
}

/** Export the structured brief as a formatted Word document. */
export function exportComprehensiveBrief(
  items: ExportableArticle[],
  brief: StructuredBrief,
  opts: { filename?: string } = {},
): void {
  const now = new Date();
  const dateLine = now
    .toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })
    .toUpperCase();

  const td = 'border:1px solid #8a8a8a;padding:6pt 7pt;font-size:9.5pt;vertical-align:top';
  const th = `${td};background:#0f172a;color:#ffffff;font-weight:bold;text-align:center`;
  const sectionBar = (label: string) =>
    `<table style="border-collapse:collapse;width:100%;margin:14pt 0 0 0"><tr>` +
    `<td style="background:#b8a04a;color:#1a1a1a;font-weight:bold;text-align:center;padding:4pt;font-size:10.5pt;letter-spacing:1pt;border:1px solid #8a8a8a">${escapeHtml(label)}</td></tr></table>`;

  const sourceLinks = (refs: number[]): string =>
    refs.map(i => {
      const it = items[i];
      if (!it) return '';
      const label = escapeHtml(`${it.source}${it.city ? ' – ' + it.city : ''}`);
      return it.url
        ? `<p style="margin:0 0 3pt 0">↳ <a href="${escapeHtml(it.url)}" style="color:#1155cc">${label}</a></p>`
        : `<p style="margin:0 0 3pt 0">↳ ${label}</p>`;
    }).join('');

  const incidentRows = brief.incidents.map((inc, n) =>
    `<tr>` +
    `<td style="${td};text-align:center;font-weight:bold">${n + 1}</td>` +
    `<td style="${td};font-weight:bold">${escapeHtml(inc.incidentType)}</td>` +
    `<td style="${td}"><p style="margin:0 0 4pt 0;font-weight:bold">${escapeHtml(inc.city)}</p>${sourceLinks(inc.sourceRefs)}</td>` +
    `<td style="${td};${RISK_CELL[inc.riskCategory]};text-align:center;font-weight:bold">${inc.riskCategory}</td>` +
    `<td style="${td}">${ul(inc.snapshot)}</td>` +
    `<td style="${td}">${ul(inc.businessImpact)}</td>` +
    `<td style="${td}">${ul(inc.shortTermImplications)}</td>` +
    `</tr>`).join('');

  const html =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" ` +
    `xmlns:w="urn:schemas-microsoft-com:office:word" ` +
    `xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8">` +
    `<style>body{font-family:Calibri,Arial,sans-serif;color:#1a1a1a}</style></head><body>` +

    // Title bar
    `<table style="border-collapse:collapse;width:100%"><tr>` +
    `<td style="background:#9f1d1d;color:#ffffff;font-weight:bold;text-align:center;padding:5pt;font-size:11.5pt;letter-spacing:1pt">` +
    `${dateLine} | ${escapeHtml(brief.scope)}</td></tr></table>` +

    // EXECUTIVE OVERVIEW
    (brief.overview
      ? sectionBar('EXECUTIVE OVERVIEW') +
        `<table style="border-collapse:collapse;width:100%"><tr>` +
        `<td style="${td};font-size:10pt;line-height:1.55">${escapeHtml(brief.overview)}</td></tr></table>`
      : '') +

    // KEY FOCUS AREAS
    sectionBar('KEY FOCUS AREAS') +
    `<table style="border-collapse:collapse;width:100%">` +
    `<tr><td style="${th};width:90pt">Attributes</td><td style="${th}">Details</td></tr>` +
    `<tr><td style="${td};font-weight:bold">High Priority</td><td style="${td}">${ul(brief.highPriority)}</td></tr>` +
    `<tr><td style="${td};font-weight:bold">Watchlist</td><td style="${td}">${ul(brief.watchlist)}</td></tr>` +
    `<tr><td style="${td};font-weight:bold">Source Legend</td><td style="${td}">` +
    `IMD = India Meteorological Dept. | GOV = Official government sources | OSINT = Open-source intelligence | ` +
    `TRAF = Traffic monitoring feeds | MEDIA = News media | SOCMINT = Social-media intelligence</td></tr>` +
    `</table>` +

    // INCIDENT SUMMARY
    sectionBar('INCIDENT SUMMARY') +
    `<table style="border-collapse:collapse;width:100%">` +
    `<tr><td style="${th};width:18pt">#</td><td style="${th};width:80pt">Incident Type</td>` +
    `<td style="${th};width:110pt">City / Source(s)</td><td style="${th};width:55pt">Risk Category</td>` +
    `<td style="${th}">Situation Snapshot</td><td style="${th}">Business Impact</td>` +
    `<td style="${th}">Short Term Implications</td></tr>` +
    `${incidentRows}</table>` +

    `<p style="font-size:8pt;color:#777777;margin-top:12pt">Generated ${escapeHtml(now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }))} IST · ` +
    `${items.length} source signal(s) · AI-assisted analysis — verify critical items against primary sources.</p>` +
    `</body></html>`;

  const name = opts.filename ?? `intel-brief-${now.toISOString().slice(0, 10)}.doc`;
  downloadFile(name, html, 'application/msword');
}

// Main export function that provides all options
export async function exportIntelligenceData(
  newsItems: NewsItem[],
  format: 'csv' | 'json' | 'email' | 'pdf' = 'csv',
  emailRecipient?: string,
  emailFormat: 'markdown' | 'pdf' = 'markdown'
): Promise<{
  success: boolean;
  data?: string;
  message: string;
}> {
  try {
    if (format === 'csv') {
      const csvData = exportToCsv(newsItems);
      return {
        success: true,
        data: csvData,
        message: `Exported ${newsItems.length} items to CSV format`
      };
    } else if (format === 'json') {
      const jsonData = exportToJson(newsItems);
      return {
        success: true,
        data: jsonData,
        message: `Exported ${newsItems.length} items to JSON format`
      };
    } else if (format === 'email' || format === 'pdf') {
      // Generate summary first
      const summary = await generateEventSummary(newsItems);
      
      // Determine the email format
      const actualEmailFormat = format === 'pdf' ? 'pdf' : emailFormat;
      
      // Send email
      const emailSuccess = await sendEmailSummary(
        summary,
        emailRecipient,
        `DashINT Intelligence ${format === 'pdf' ? 'PDF Report' : 'Summary'} - ${new Date().toLocaleDateString()}`,
        actualEmailFormat
      );

      if (emailSuccess) {
        return {
          success: true,
          data: summary,
          message: `${format === 'pdf' ? 'PDF report' : 'Email summary'} sent successfully to ${emailRecipient || EMAIL_CONFIG.recipientEmail}`
        };
      } else {
        return {
          success: false,
          message: `Failed to send ${format === 'pdf' ? 'PDF report' : 'email summary'}`
        };
      }
    } else {
      return {
        success: false,
        message: `Unsupported export format: ${format}`
      };
    }
  } catch (error) {
    console.error('Export error:', error);
    return {
      success: false,
      message: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

// ---------------------------------------------------------------------------
// AI Summary Generation — crisp per-article summaries via Groq
// ---------------------------------------------------------------------------

/**
 * Generate crisp 2-3 sentence AI summaries for a batch of articles.
 * Uses Groq/Llama-3.3-70B. Falls back to concatenating existing bullet
 * summaries if Groq is unavailable.
 */
export async function generateArticleSummaries(
  items: ExportableArticle[],
  onProgress?: (done: number, total: number) => void,
): Promise<ExportableArticle[]> {
  if (items.length === 0) return items;

  // Enrich each article with real page text / news snippets via Serper, so the
  // summariser works from actual context, not just the headline. Best-effort:
  // empty strings if Serper is disabled or a fetch fails.
  let scraped: string[] = [];
  try {
    const resp = await fetch('/api/scrape-article', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: items.map(it => ({ url: it.url, headline: it.headline })) }),
      signal: AbortSignal.timeout(60_000),
    });
    if (resp.ok) {
      const d = await resp.json();
      scraped = (d.results || []).map((r: { text?: string }) => r.text || '');
    }
  } catch { /* headline-only fallback */ }

  // Batch all headlines into a single Groq call for efficiency
  const BATCH_SIZE = 15;
  const result: ExportableArticle[] = [...items];

  for (let batchStart = 0; batchStart < items.length; batchStart += BATCH_SIZE) {
    const batch = items.slice(batchStart, batchStart + BATCH_SIZE);

    try {
      const articlesContext = batch.map((item, i) => {
        const bullets = item.summary?.join('; ') ?? '';
        const ctx = scraped[batchStart + i] ? ` | ARTICLE: ${scraped[batchStart + i]}` : '';
        return `[${i + 1}] HEADLINE: "${item.headline}" | SOURCE: ${item.source} | CATEGORY: ${item.category ?? 'general'} | CITY: ${item.city ?? 'India'} | TIME: ${item.time ?? 'recent'}${bullets ? ` | DETAILS: ${bullets}` : ''}${ctx}`;
      }).join('\n');

      const response = await fetch(GROQ_CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            {
              role: 'system',
              content:
                `You are an intelligence analyst. Read the context of each numbered article and produce a brief ` +
                `EXECUTIVE summary as up to 3 crisp key points. Cover, where applicable: WHERE (location/area), ` +
                `WHEN (date/time it starts), HOW/WHAT (what is happening), UNTIL WHEN (duration/end), and WHY IT ` +
                `MATTERS (impact). Format each article as a SINGLE line of up to 3 points separated by "  •  ", each ` +
                `prefixed by its facet, e.g. "Where: Bengaluru ORR  •  When: today 5 PM  •  Until: ~3h, lanes diverted". ` +
                `Be factual and specific; infer only from the given context; no URLs, no fluff, no markdown. ` +
                `Return JSON: {"summaries":["…","…"]} with one string per article, in order.`,
            },
            {
              role: 'user',
              content: `Generate crisp summaries for these ${batch.length} articles:\n\n${articlesContext}`,
            },
          ],
          temperature: 0.2,
          max_tokens: 1500,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        throw new Error(`Groq API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        try {
          const parsed = JSON.parse(content);
          const summaries: string[] = parsed.summaries ?? [];
          batch.forEach((_, i) => {
            const globalIdx = batchStart + i;
            if (summaries[i]) {
              result[globalIdx] = { ...result[globalIdx], aiSummary: summaries[i] };
            } else {
              result[globalIdx] = {
                ...result[globalIdx],
                aiSummary: result[globalIdx].summary?.join(' ') || result[globalIdx].headline,
              };
            }
          });
        } catch {
          // JSON parse failed — fallback
          batch.forEach((_, i) => {
            const globalIdx = batchStart + i;
            result[globalIdx] = {
              ...result[globalIdx],
              aiSummary: result[globalIdx].summary?.join(' ') || result[globalIdx].headline,
            };
          });
        }
      }
    } catch (err) {
      console.warn('[ExportService] Groq summary generation failed for batch:', err);
      // Fallback for this batch
      batch.forEach((_, i) => {
        const globalIdx = batchStart + i;
        result[globalIdx] = {
          ...result[globalIdx],
          aiSummary: result[globalIdx].summary?.join(' ') || result[globalIdx].headline,
        };
      });
    }

    onProgress?.(Math.min(batchStart + BATCH_SIZE, items.length), items.length);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Async export wrappers — generate AI summaries + fetch IMD weather, then export
// ---------------------------------------------------------------------------

/** Export to Word with AI-generated summaries and IMD weather header. */
export async function exportToWordWithSummaries(
  newsItems: ExportableArticle[],
  activeCity?: string,
  onProgress?: (stage: string, done: number, total: number) => void,
): Promise<void> {
  onProgress?.('Generating AI summaries...', 0, newsItems.length);

  // Generate AI summaries
  const enriched = await generateArticleSummaries(newsItems, (done, total) => {
    onProgress?.('Generating AI summaries...', done, total);
  });

  // Fetch IMD weather for the active city
  let weatherHtml = '';
  if (activeCity) {
    onProgress?.('Fetching weather data...', newsItems.length, newsItems.length);
    try {
      const weather = await fetchIMDWeather(activeCity);
      if (weather) {
        weatherHtml = formatWeatherForExportHtml(weather);
      }
    } catch (err) {
      console.warn('[ExportService] Failed to fetch IMD weather:', err);
    }
  }

  exportToWord(enriched, { weatherHtml });
}

/** Export to Excel with AI-generated summaries. */
export async function exportToExcelWithSummaries(
  newsItems: ExportableArticle[],
  onProgress?: (stage: string, done: number, total: number) => void,
): Promise<void> {
  onProgress?.('Generating AI summaries...', 0, newsItems.length);

  // Generate AI summaries
  const enriched = await generateArticleSummaries(newsItems, (done, total) => {
    onProgress?.('Generating AI summaries...', done, total);
  });

  exportToExcel(enriched);
}