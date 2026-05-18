import { useState, useEffect, useRef } from "react";
import { useLiveIntel } from "@/hooks/useIntel";
import type { IntelItem } from "@/lib/intel-service";

// ── Design tokens — minimal white/black ──────────────────────────────────────
const T = {
  bg:          '#ffffff',
  bgPanel:     '#f9f9f9',
  bgHover:     '#f3f3f3',
  bgSelected:  '#f0f0f0',
  border:      '#e5e5e5',
  borderStrong:'#bbb',
  text:        '#000000',
  textMid:     '#333333',
  textDim:     '#666666',
  critical:    '#dc2626',
  high:        '#ea580c',
  medium:      '#ca8a04',
  low:         '#16a34a',
  info:        '#2563eb',
};

// ── Category system (5 buckets) ──────────────────────────────────────────────
type DisplayCategory = 'ALL' | 'INFRASTRUCTURE' | 'PROTESTS_EVENTS' | 'LAW_ORDER' | 'PUBLIC_HEALTH' | 'ENVIRONMENT' | 'TRANSPORT';

const CAT_LABELS: Record<DisplayCategory, string> = {
  ALL:           'All',
  INFRASTRUCTURE:'Infrastructure',
  PROTESTS_EVENTS:'Protests & Events',
  LAW_ORDER:     'Law & Order',
  PUBLIC_HEALTH: 'Public Health',
  ENVIRONMENT:   'Environment',
  TRANSPORT:     'Transport',
};

const CAT_ICONS: Record<DisplayCategory, string> = {
  ALL:           '◉',
  INFRASTRUCTURE:'⊠',
  PROTESTS_EVENTS:'✊',
  LAW_ORDER:     '🛡️',
  PUBLIC_HEALTH: '✚',
  ENVIRONMENT:   '◈',
  TRANSPORT:     '⇌',
};

function categorise(item: IntelItem): DisplayCategory {
  const t = item.type;
  const h = item.headline.toLowerCase();
  const src = (item.source || '').toUpperCase();

  // ── ENVIRONMENT first — climate/env sources and keywords take priority ────
  const envSource = /IMD|CYCLONE|CPCB|STORM|SEISMIC|CHEMICAL|AQI/.test(src);
  const envKeyword = /aqi|air quality|heatwave|heat wave|cold wave|pollution|cyclone|landfall|chemical leak|gas leak|toxic|wildfire|earthquake|tremor|seismic|landslide|hailstorm|thunderstorm|lightning|heavy rain|rainfall|rain warning|flood warning|rain predicted|red alert|orange alert|yellow alert|imd alert|imd forecast|imd predict|urban flood|waterlogged|storm warning|weather alert|temperature record|severe aqi|hazardous aqi|smog|smoke|dust storm|cloudbursts?|monsoon warning/.test(h);
  if (envSource || envKeyword || ['military', 'cyber'].includes(t))
    return 'ENVIRONMENT';

  // ── PUBLIC HEALTH — disease/epidemic keywords ─────────────────────────────
  if (['health', 'disease'].includes(t) ||
      /nipah|ebola|marburg|hanta|hantavirus|lassa|monkeypox|mpox|swine flu|h1n1|h3n2|h5n1|bird flu|avian flu|dengue|covid|outbreak|epidemic|disease|hospital|health|oxygen|blood bank|malaria|cholera|typhoid|leptospirosis|encephalitis|meningitis|rabies|plague|death toll|casualt|who alert|icmr|ncdc|icu|mass casualty|food poison|contamination/.test(h))
    return 'PUBLIC_HEALTH';

  // ── PROTESTS & EVENTS ──────────────────────────────────────────────────────
  if (['protest'].includes(t) ||
      /protest|bandh|strike|rally|dharna|march|demonstration|blockade|morcha|gherao|unrest|hartaal|agitat|sena action|shiv sena|mns action|signboard|language row|curfew|section 144|planned protest|ongoing event/.test(h))
    return 'PROTESTS_EVENTS';

  // ── TRANSPORT — strikes & movement (before LAW_ORDER so bus strikes stay here) ─
  if (['traffic'].includes(t) ||
      /ksrtc|bmtc|bus strike|bus bandh|auto strike|cab strike|metro strike|rail strike|transport strike|train strike|airline strike|airport strike|driver strike|metro|traffic jam|road block|highway|airport|flight cancel|train delay|bus delay|congestion|diversion|route diverted/.test(h))
    return 'TRANSPORT';

  // ── LAW & ORDER ───────────────────────────────────────────────────────────
  if (['conflict', 'vip'].includes(t) ||
      /riot|clash|lathi|crackdown|mob|crime|police|arrested|detained|terror|threat|warning issued|security alert/.test(h))
    return 'LAW_ORDER';

  // ── INFRASTRUCTURE — physical infra issues (flood routing already caught above) ─
  if (['infra'].includes(t) ||
      /building collapse|power grid|power cut|power fail|road cave|bridge collapse|dam|pipeline|grid fail|outage|water supply|sewage|blackout|power restored/.test(h))
    return 'INFRASTRUCTURE';

  // ── Generic transport fallback ────────────────────────────────────────────
  if (/accident|delay|flight|train|bus|road/.test(h))
    return 'TRANSPORT';

  return 'INFRASTRUCTURE'; // default
}

function filterItems(items: IntelItem[], cat: DisplayCategory): IntelItem[] {
  if (cat === 'ALL') return items;
  return items.filter(i => categorise(i) === cat);
}

function riskColor(level: string) {
  if (level === 'critical') return T.critical;
  if (level === 'high')     return T.high;
  if (level === 'medium')   return T.medium;
  return T.low;
}

function riskLabel(level: string) {
  if (level === 'critical') return 'CRITICAL';
  if (level === 'high')     return 'HIGH';
  if (level === 'medium')   return 'MEDIUM';
  return 'LOW';
}

// ── City tag extraction ──────────────────────────────────────────────────────
const CITY_KEYWORDS: Record<string, string> = {
  bangalore:'Bangalore', bengaluru:'Bangalore',
  hyderabad:'Hyderabad',
  mumbai:'Mumbai', bombay:'Mumbai',
  delhi:'Delhi', 'new delhi':'Delhi',
  chennai:'Chennai',
  kolkata:'Kolkata',
  pune:'Pune',
};

function extractCity(h: string): string | null {
  const lh = h.toLowerCase();
  for (const [kw, city] of Object.entries(CITY_KEYWORDS)) {
    if (lh.includes(kw)) return city;
  }
  return null;
}

function extractAreaTags(h: string): string[] {
  const lh = h.toLowerCase();
  const areas = [
    'koramangala','whitefield','electronic city','marathahalli','hebbal','yelahanka',
    'banjara hills','jubilee hills','gachibowli','hitech city','secunderabad',
    'dharavi','bandra','andheri','kurla','dadar','thane','navi mumbai',
    'connaught place','lajpat nagar','saket','noida','gurgaon','dwarka',
    'outer ring road','orr',
  ];
  return areas.filter(a => lh.includes(a)).map(a => a.replace(/\b\w/g, c => c.toUpperCase()));
}

// ── Feed sidebar ─────────────────────────────────────────────────────────────
function FeedSidebar({ items, selectedId, onSelect }: {
  items: IntelItem[];
  selectedId: string | null;
  onSelect: (i: IntelItem) => void;
}) {
  return (
    <div style={{ width: 240, flexShrink: 0, borderRight: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', height: '100%', background: T.bgPanel }}>
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, fontWeight: 700, color: T.text, letterSpacing: '0.12em' }}>LIVE FEED</div>
        <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: T.textDim, letterSpacing: '0.08em', marginTop: 2 }}>{items.length} signals</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
        {items.map(item => {
          const rc = riskColor(item.riskLevel);
          const sel = selectedId === item.id;
          return (
            <div
              key={item.id}
              onClick={() => onSelect(item)}
              style={{
                borderLeft: `3px solid ${rc}`,
                padding: '7px 9px',
                marginBottom: 3,
                background: sel ? T.bgSelected : 'transparent',
                cursor: 'pointer',
              }}
              onMouseEnter={e => { if (!sel) (e.currentTarget as HTMLDivElement).style.background = T.bgHover; }}
              onMouseLeave={e => { if (!sel) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: T.textDim }}>{item.source.slice(0, 16).toUpperCase()}</span>
                <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: rc, fontWeight: 700 }}>{riskLabel(item.riskLevel)}</span>
              </div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: T.text, lineHeight: 1.35,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {item.headline}
              </div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: T.textDim, marginTop: 3 }}>{item.time}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Event card ───────────────────────────────────────────────────────────────
function EventCard({ item, selected, onClick }: { item: IntelItem; selected: boolean; onClick: () => void }) {
  const rc = riskColor(item.riskLevel);
  const cat = categorise(item);
  const city = extractCity(item.headline);
  const areas = extractAreaTags(item.headline);

  return (
    <div
      onClick={onClick}
      style={{
        border: `1px solid ${selected ? T.borderStrong : T.border}`,
        borderTop: `3px solid ${rc}`,
        padding: '12px 14px',
        background: selected ? T.bgSelected : T.bg,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLDivElement).style.background = T.bgHover; }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLDivElement).style.background = selected ? T.bgSelected : T.bg; }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: T.textDim, letterSpacing: '0.08em' }}>
          {CAT_ICONS[cat]} {CAT_LABELS[cat].toUpperCase()} · {item.source.slice(0, 20).toUpperCase()}
        </span>
        <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: rc, fontWeight: 700, border: `1px solid ${rc}`, padding: '1px 5px', letterSpacing: '0.08em' }}>
          {riskLabel(item.riskLevel)}
        </span>
      </div>

      {/* Headline */}
      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: T.text, fontWeight: 600, lineHeight: 1.4 }}>
        {item.headline}
      </div>

      {/* Summary bullets */}
      {item.summary && item.summary.length > 0 && (
        <div style={{ borderLeft: `2px solid ${T.border}`, paddingLeft: 10, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {item.summary.slice(0, 2).map((b, i) => (
            <div key={i} style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: T.textMid, lineHeight: 1.5 }}>
              · {b}
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTop: `1px solid ${T.border}`, marginTop: 'auto' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {city && (
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, background: '#000', color: '#fff', padding: '1px 5px', letterSpacing: '0.06em' }}>
              {city}
            </span>
          )}
          {areas.slice(0, 2).map(a => (
            <span key={a} style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, border: `1px solid ${T.border}`, color: T.textDim, padding: '1px 5px', letterSpacing: '0.04em' }}>
              {a}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: T.textDim }}>{item.time}</span>
          {item.url && (
            <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
              style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: T.info, textDecoration: 'none', border: `1px solid ${T.info}`, padding: '1px 5px' }}>
              SOURCE ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Detail panel ─────────────────────────────────────────────────────────────
function DetailPanel({ item }: { item: IntelItem | null }) {
  if (!item) return (
    <div style={{ padding: 40, textAlign: 'center', color: T.textDim, fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, letterSpacing: '0.12em' }}>
      SELECT A SIGNAL TO INSPECT
    </div>
  );

  const rc = riskColor(item.riskLevel);
  const cat = categorise(item);
  const city = extractCity(item.headline);

  return (
    <div>
      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}`, borderLeft: `4px solid ${rc}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: T.textDim }}>{CAT_LABELS[cat].toUpperCase()}</span>
          <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: rc, fontWeight: 700 }}>{riskLabel(item.riskLevel)}</span>
        </div>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: T.text, fontWeight: 700, lineHeight: 1.35 }}>{item.headline}</div>
      </div>

      {/* Metadata grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: `1px solid ${T.border}` }}>
        {[
          ['SOURCE',   item.source.toUpperCase()],
          ['CITY',     city ?? 'NATIONAL'],
          ['CATEGORY', CAT_LABELS[cat]],
          ['RISK',     riskLabel(item.riskLevel)],
          ['TIME',     item.time],
          ['TYPE',     item.type.toUpperCase()],
        ].map(([label, value]) => (
          <div key={label} style={{ padding: '10px 14px', borderRight: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}` }}>
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: T.textDim, letterSpacing: '0.10em', marginBottom: 3 }}>{label}</div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: T.text, fontWeight: 500 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Summary */}
      {item.summary && item.summary.length > 0 && (
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: T.textDim, letterSpacing: '0.10em', marginBottom: 8 }}>ANALYSIS</div>
          {item.summary.map((b, i) => (
            <div key={i} style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: T.textMid, lineHeight: 1.6, marginBottom: 4 }}>· {b}</div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {item.url && (
          <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
            <button style={{ width: '100%', background: '#000', color: '#fff', border: 'none', padding: '9px', fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', cursor: 'pointer' }}>
              ↗ OPEN SOURCE
            </button>
          </a>
        )}
      </div>
    </div>
  );
}

// ── AI Copilot ───────────────────────────────────────────────────────────────
const GEMINI_KEY   = import.meta.env.VITE_GEMINI_API_KEY || '';
const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL   || 'gemini-2.0-flash-lite';
const GROQ_KEY     = import.meta.env.VITE_GROQ_API_KEY   || '';
const GROQ_MODEL   = import.meta.env.VITE_GROQ_MODEL     || 'meta-llama/llama-4-scout-17b-16e-instruct';

type AIProvider = 'gemini' | 'groq';

async function callGemini(messages: { role: string; text: string }[], ctx: string): Promise<string> {
  const contents = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] }));
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: `You are a concise India crisis analyst. Answer in plain text, no markdown. Current live signals:\n${ctx}` }] },
        generationConfig: { temperature: 0.2, maxOutputTokens: 600 },
      }),
    }
  );
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message);
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '(no response)';
}

async function callGroq(messages: { role: string; text: string }[], ctx: string): Promise<string> {
  const chatMessages = [
    { role: 'system', content: `You are a concise India crisis analyst. Answer in plain text, no markdown. Current live signals:\n${ctx}` },
    ...messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text })),
  ];
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({ model: GROQ_MODEL, messages: chatMessages, temperature: 0.2, max_tokens: 600 }),
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message);
  return data.choices?.[0]?.message?.content ?? '(no response)';
}

function Copilot({ intel }: { intel: IntelItem[] }) {
  const [provider, setProvider] = useState<AIProvider>('groq');
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([
    { role: 'system', text: 'DashINT Copilot ready. Ask about current signals.' },
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, thinking]);

  const ctx = () =>
    intel.slice(0, 20).map(i => `[${i.type.toUpperCase()}][${i.riskLevel}] ${i.headline} — ${i.source} (${i.time})`).join('\n') || 'No signals loaded.';

  const send = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || thinking) return;
    const userMsg = { role: 'user', text };
    const allMsgs = [...messages, userMsg];
    setMessages(allMsgs);
    setInput('');
    setThinking(true);
    try {
      const reply = provider === 'gemini'
        ? await callGemini(allMsgs, ctx())
        : await callGroq(allMsgs, ctx());
      setMessages(m => [...m, { role: 'assistant', text: reply }]);
    } catch (e: any) {
      setMessages(m => [...m, { role: 'assistant', text: `⚠ ${e.message}` }]);
    } finally { setThinking(false); }
  };

  const SUGGESTIONS = ['Top 3 threats now?', 'Infrastructure alerts?', 'Health risks today?', 'Any protests/bandhs?', 'Environment/AQI status?'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.border}`, background: T.bgPanel, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, color: T.text }}>AI Copilot</div>
          <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: T.textDim, marginTop: 2 }}>{intel.length} signals loaded</div>
        </div>
        {/* Provider toggle */}
        <div style={{ display: 'flex', border: `1px solid ${T.border}`, overflow: 'hidden' }}>
          {(['groq', 'gemini'] as AIProvider[]).map(p => (
            <button key={p} onClick={() => setProvider(p)} style={{
              padding: '4px 10px',
              fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
              background: provider === p ? '#000' : T.bgPanel,
              color: provider === p ? '#fff' : T.textMid,
              border: 'none', cursor: 'pointer', textTransform: 'uppercase',
            }}>{p}</button>
          ))}
        </div>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
        {messages.map((msg, i) => {
          if (msg.role === 'system') return (
            <div key={i} style={{ textAlign: 'center', fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: T.textDim, marginBottom: 10, padding: '6px 0', borderBottom: `1px solid ${T.border}` }}>
              {msg.text}
            </div>
          );
          const isUser = msg.role === 'user';
          return (
            <div key={i} style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start' }}>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: T.textDim, marginBottom: 3 }}>{isUser ? 'YOU' : 'COPILOT'}</div>
              <div style={{ background: isUser ? '#000' : T.bgPanel, border: `1px solid ${T.border}`, padding: '8px 10px', maxWidth: '92%',
                fontFamily: 'Inter, sans-serif', fontSize: 12, color: isUser ? '#fff' : T.text, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                {msg.text}
              </div>
            </div>
          );
        })}
        {thinking && <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: T.textDim }}>thinking...</div>}
      </div>
      <div style={{ padding: '8px 12px', borderTop: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {SUGGESTIONS.map(s => (
            <button key={s} onClick={() => send(s)} style={{ background: T.bgPanel, border: `1px solid ${T.border}`, color: T.textMid, padding: '3px 7px', fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, cursor: 'pointer' }}>{s}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="Ask about current signals..."
            style={{ flex: 1, border: `1px solid ${T.border}`, background: T.bg, color: T.text, padding: '8px 10px', fontFamily: 'Inter, sans-serif', fontSize: 12, outline: 'none' }} />
          <button onClick={() => send()} disabled={thinking}
            style={{ background: '#000', color: '#fff', border: 'none', padding: '8px 14px', fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, fontWeight: 700, cursor: thinking ? 'not-allowed' : 'pointer', opacity: thinking ? 0.5 : 1 }}>
            ⊳
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Intel() {
  const { intel, loading } = useLiveIntel();
  const [selected, setSelected] = useState<IntelItem | null>(null);
  const [cat, setCat] = useState<DisplayCategory>('ALL');
  const [rightPanel, setRightPanel] = useState<'detail' | 'copilot'>('detail');

  const filtered = filterItems(intel, cat);

  const counts: Record<DisplayCategory, number> = {
    ALL: intel.length,
    INFRASTRUCTURE:  filterItems(intel, 'INFRASTRUCTURE').length,
    PROTESTS_EVENTS: filterItems(intel, 'PROTESTS_EVENTS').length,
    LAW_ORDER:       filterItems(intel, 'LAW_ORDER').length,
    PUBLIC_HEALTH:   filterItems(intel, 'PUBLIC_HEALTH').length,
    ENVIRONMENT:     filterItems(intel, 'ENVIRONMENT').length,
    TRANSPORT:       filterItems(intel, 'TRANSPORT').length,
  };

  const critCount = intel.filter(i => i.riskLevel === 'critical').length;
  const highCount = intel.filter(i => i.riskLevel === 'high').length;

  const CATS: DisplayCategory[] = ['ALL', 'INFRASTRUCTURE', 'PROTESTS_EVENTS', 'LAW_ORDER', 'PUBLIC_HEALTH', 'ENVIRONMENT', 'TRANSPORT'];

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: T.bg }}>

      {/* Feed sidebar */}
      <FeedSidebar items={intel} selectedId={selected?.id ?? null} onSelect={i => { setSelected(i); setRightPanel('detail'); }} />

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Page header */}
        <div style={{ padding: '16px 24px 12px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: '-0.01em' }}>Intelligence Brief</div>
          <div style={{ display: 'flex', gap: 20, marginTop: 6 }}>
            {[
              { label: 'Total',    value: intel.length,  color: T.text     },
              { label: 'Critical', value: critCount,     color: T.critical },
              { label: 'High',     value: highCount,     color: T.high     },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
                <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 18, fontWeight: 700, color: s.color }}>{loading ? '—' : s.value}</span>
                <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: T.textDim, letterSpacing: '0.10em' }}>{s.label.toUpperCase()}</span>
              </div>
            ))}
            {!loading && (
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                <div className="pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: T.low }} />
                <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: T.low }}>LIVE · {filtered.length} signals</span>
              </div>
            )}
          </div>
        </div>

        {/* Category tabs */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, flexShrink: 0, overflowX: 'auto' }}>
          {CATS.map(c => (
            <button key={c} onClick={() => setCat(c)} style={{
              padding: '10px 16px',
              border: 'none',
              borderBottom: cat === c ? '2px solid #000' : '2px solid transparent',
              background: 'transparent',
              color: T.text,
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.08em',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}>
              {CAT_ICONS[c]} {CAT_LABELS[c].toUpperCase()}
              {counts[c] > 0 && <span style={{ marginLeft: 5, fontSize: 8, color: T.textMid }}>({counts[c]})</span>}
            </button>
          ))}
        </div>

        {/* Card grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {loading ? (
            <div style={{ padding: 60, textAlign: 'center', fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: T.textDim, letterSpacing: '0.15em' }}>
              Loading signals...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: T.textDim, border: `1px dashed ${T.border}` }}>
              No signals in this category
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
              {filtered.map(item => (
                <EventCard key={item.id} item={item} selected={selected?.id === item.id}
                  onClick={() => { setSelected(item); setRightPanel('detail'); }} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right panel */}
      <div style={{ width: 360, flexShrink: 0, borderLeft: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', background: T.bg }}>
        {/* Tab switcher */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}` }}>
          {(['detail', 'copilot'] as const).map(p => (
            <button key={p} onClick={() => setRightPanel(p)} style={{
              flex: 1, padding: '10px 0', border: 'none',
              borderBottom: rightPanel === p ? '2px solid #000' : '2px solid transparent',
              background: 'transparent', color: rightPanel === p ? T.text : T.textDim,
              fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, fontWeight: rightPanel === p ? 700 : 400,
              letterSpacing: '0.10em', cursor: 'pointer', textTransform: 'uppercase',
            }}>
              {p === 'detail' ? 'Detail' : 'AI Copilot'}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {rightPanel === 'detail' ? <DetailPanel item={selected} /> : <Copilot intel={intel} />}
        </div>
      </div>

    </div>
  );
}
