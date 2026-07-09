import { useState, useEffect } from "react";
import { useLiveIntel } from "@/hooks/useIntel";
import type { IntelItem } from "@/lib/intel-service";
import { exportToWord, exportToExcel, generateArticleSummaries, formatArticlesForEmail, openEmailCompose, generateStructuredBrief, exportComprehensiveBrief, type MailProvider, type ExportableArticle } from "@/lib/export-service";
import { T } from "@/lib/theme";

// ── Category system ──────────────────────────────────────────────────────────
type DisplayCategory = 'INFRASTRUCTURE' | 'PROTESTS_EVENTS' | 'LAW_ORDER' | 'PUBLIC_HEALTH' | 'ENVIRONMENT' | 'TRANSPORT';

const CAT_LABELS: Record<DisplayCategory, string> = {
  INFRASTRUCTURE: 'Infrastructure',
  PROTESTS_EVENTS: 'Protests & Events',
  LAW_ORDER: 'Law & Order',
  PUBLIC_HEALTH: 'Public Health',
  ENVIRONMENT: 'Environment',
  TRANSPORT: 'Transport',
};

const CAT_ORDER: DisplayCategory[] = ['INFRASTRUCTURE', 'PROTESTS_EVENTS', 'LAW_ORDER', 'ENVIRONMENT', 'PUBLIC_HEALTH', 'TRANSPORT'];

function categorise(item: IntelItem): DisplayCategory {
  const t = item.type;
  const h = item.headline.toLowerCase();
  const src = (item.source || '').toUpperCase();

  const envSource = /IMD|CYCLONE|CPCB|STORM|SEISMIC|CHEMICAL|AQI|OPEN-METEO/.test(src);
  const envKeyword = /aqi|air quality|heatwave|heat wave|cold wave|pollution|cyclone|landfall|chemical leak|gas leak|toxic|wildfire|earthquake|tremor|seismic|landslide|hailstorm|thunderstorm|lightning|heavy rain|rainfall|rain warning|flood warning|rain predicted|red alert|orange alert|yellow alert|imd alert|imd forecast|imd predict|urban flood|waterlogged|storm warning|weather alert|temperature record|severe aqi|hazardous aqi|smog|smoke|dust storm|cloudbursts?|monsoon warning/.test(h);
  if (envSource || envKeyword) return 'ENVIRONMENT';

  if (['health', 'disease'].includes(t) ||
      /nipah|ebola|marburg|hanta|hantavirus|lassa|monkeypox|mpox|swine flu|h1n1|h3n2|h5n1|bird flu|avian flu|dengue|covid|outbreak|epidemic|disease|hospital|health|oxygen|blood bank|malaria|cholera|typhoid|leptospirosis|encephalitis|meningitis|rabies|plague|death toll|casualt|who alert|icmr|ncdc|icu|mass casualty|food poison|contamination/.test(h))
    return 'PUBLIC_HEALTH';

  if (['protest'].includes(t) ||
      /protest|bandh|strike|rally|dharna|march|demonstration|blockade|morcha|gherao|unrest|hartaal|agitat|sena action|shiv sena|mns action|signboard|language row|curfew|section 144|planned protest|ongoing event/.test(h))
    return 'PROTESTS_EVENTS';

  if (['traffic'].includes(t) ||
      /ksrtc|bmtc|bus strike|bus bandh|auto strike|cab strike|metro strike|rail strike|transport strike|train strike|airline strike|airport strike|driver strike|metro|traffic jam|road block|highway|airport|flight cancel|train delay|bus delay|congestion|diversion|route diverted/.test(h))
    return 'TRANSPORT';

  if (['conflict', 'vip', 'military', 'cyber'].includes(t) ||
      /riot|clash|lathi|crackdown|mob|crime|police|arrested|detained|terror|threat|warning issued|security alert|cyber|ddos|hack|breach/.test(h))
    return 'LAW_ORDER';

  if (['infra'].includes(t) ||
      /building collapse|power grid|power cut|power fail|road cave|bridge collapse|dam|pipeline|grid fail|outage|water supply|sewage|blackout|power restored/.test(h))
    return 'INFRASTRUCTURE';

  if (/accident|delay|flight|train|bus|road/.test(h)) return 'TRANSPORT';
  return 'INFRASTRUCTURE';
}

function toExportable(i: IntelItem): ExportableArticle {
  return {
    headline: i.headline, source: i.source, time: i.time,
    category: i.type, riskGroup: CAT_LABELS[categorise(i)],
    city: extractCity(i.headline) ?? '', severity: i.riskLevel,
    sentiment: i.sentiment, summary: i.summary, url: i.url,
  };
}

// ── City extraction ──────────────────────────────────────────────────────────
const CITY_KEYWORDS: Record<string, string> = {
  bangalore: 'Bengaluru', bengaluru: 'Bengaluru', hyderabad: 'Hyderabad',
  mumbai: 'Mumbai', bombay: 'Mumbai', delhi: 'Delhi', 'new delhi': 'Delhi',
  chennai: 'Chennai', kolkata: 'Kolkata', noida: 'Noida', kochi: 'Kochi',
};
function extractCity(h: string): string | null {
  const lh = h.toLowerCase();
  for (const [kw, city] of Object.entries(CITY_KEYWORDS)) if (lh.includes(kw)) return city;
  return null;
}

// ── Severity badge ───────────────────────────────────────────────────────────
function sevBadge(level: string): { label: string; bg: string; color: string } {
  if (level === 'critical') return { label: 'CRITICAL', bg: T.critical, color: '#fff' };
  if (level === 'high')     return { label: 'HIGH', bg: '#f59e0b', color: '#fff' };
  return { label: 'STANDARD', bg: T.bgSelected, color: T.textMid };
}

function nowIST(): string {
  return new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });
}

const STAT_DARK = '#0f172a';
const ACCENT = '#2563eb';

// ── LIVE STREAM rail ─────────────────────────────────────────────────────────
function LiveStream({ items }: { items: IntelItem[] }) {
  const [clock, setClock] = useState(nowIST());
  useEffect(() => { const t = setInterval(() => setClock(nowIST()), 1000); return () => clearInterval(t); }, []);
  return (
    <div style={{ width: 290, flexShrink: 0, borderRight: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', height: '100%', background: T.bg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: `1px solid ${T.border}` }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: T.fontMono, fontSize: 11, fontWeight: 700, color: T.text, letterSpacing: '0.08em' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.critical }} className="pulse-dot" /> LIVE STREAM
        </span>
        <span style={{ fontFamily: T.fontMono, fontSize: 10, color: T.textDim }}>{clock} IST</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {items.map(it => {
          const crit = it.riskLevel === 'critical';
          const city = extractCity(it.headline);
          return (
            <div key={it.id} style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, background: crit ? '#fef2f2' : 'transparent' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <span style={{ fontFamily: T.fontMono, fontSize: 11, color: crit ? T.critical : T.textDim, fontWeight: crit ? 700 : 400 }}>{it.time}</span>
                {city
                  ? <span style={{ fontFamily: T.fontMono, fontSize: 9, fontWeight: 700, color: T.textMid, background: T.bgPanel, border: `1px solid ${T.border}`, padding: '1px 6px', borderRadius: 3, letterSpacing: '0.04em' }}>{city.toUpperCase()}</span>
                  : crit ? <span style={{ fontFamily: T.fontMono, fontSize: 9, fontWeight: 700, color: '#fff', background: T.critical, padding: '1px 6px', borderRadius: 3 }}>CRITICAL</span> : null}
              </div>
              <div style={{ fontFamily: T.fontBody, fontSize: 13, color: T.text, lineHeight: 1.4 }}>{it.headline}</div>
            </div>
          );
        })}
        {items.length === 0 && (
          <div style={{ padding: 30, textAlign: 'center', fontFamily: T.fontMono, fontSize: 10, color: T.textDim }}>Acquiring signals…</div>
        )}
      </div>
    </div>
  );
}

// ── Signal card ──────────────────────────────────────────────────────────────
function SignalCard({ item, checked, onToggle }: { item: IntelItem; checked: boolean; onToggle: () => void }) {
  const sev = sevBadge(item.riskLevel);
  const desc = item.summary?.[0] ?? '';
  return (
    <div className="card-lift" style={{ background: T.bg, border: `1px solid ${checked ? ACCENT : T.border}`, borderRadius: T.radius, boxShadow: T.shadowSm, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: T.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', background: sev.bg, color: sev.color, padding: '3px 9px', borderRadius: 4 }}>{sev.label}</span>
        <span style={{ fontFamily: T.fontBody, fontSize: 11, fontStyle: 'italic', color: T.textDim }}>Source: {item.source}</span>
      </div>
      <div style={{ fontFamily: T.fontBody, fontSize: 15, fontWeight: 700, color: T.text, lineHeight: 1.3 }}>{item.headline}</div>
      {desc && <div style={{ fontFamily: T.fontBody, fontSize: 12.5, color: T.textDim, lineHeight: 1.5 }}>{desc}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
        {item.url
          ? <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: T.fontMono, fontSize: 10, fontWeight: 700, color: ACCENT, textDecoration: 'none', letterSpacing: '0.04em' }}>SOURCE LINK ↗</a>
          : <span style={{ fontFamily: T.fontMono, fontSize: 10, fontWeight: 700, color: T.textDim, letterSpacing: '0.04em' }}>TRACKING ITEM</span>}
        <button onClick={onToggle} title={checked ? 'Remove from brief' : 'Add to brief'}
          style={{ width: 26, height: 26, borderRadius: T.radiusSm, border: `1px solid ${checked ? ACCENT : T.border}`, background: checked ? ACCENT : T.bg, color: checked ? '#fff' : T.textMid, cursor: 'pointer', fontSize: 15, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {checked ? '✓' : '+'}
        </button>
      </div>
    </div>
  );
}

// ── Compose Brief panel ──────────────────────────────────────────────────────
function ComposePanel({ selected, emailTo, setEmailTo, provider, setProvider, exporting, onSend, onClose }: {
  selected: IntelItem[]; emailTo: string; setEmailTo: (v: string) => void;
  provider: MailProvider; setProvider: (p: MailProvider) => void;
  exporting: boolean; onSend: () => void; onClose: () => void;
}) {
  return (
    <div style={{ position: 'absolute', bottom: 20, right: 20, width: 380, maxHeight: 'calc(100% - 90px)', display: 'flex', flexDirection: 'column', background: T.bg, borderRadius: T.radius, boxShadow: T.shadowMd, border: `1px solid ${T.border}`, overflow: 'hidden', zIndex: 50 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: STAT_DARK }}>
        <span style={{ fontFamily: T.fontBody, fontSize: 14, fontWeight: 700, color: '#fff' }}>New Brief: Morning Intel</span>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: 16 }}>✕</button>
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
        <div style={{ display: 'flex', border: `1px solid ${T.border}`, borderRadius: T.radiusSm, overflow: 'hidden' }}>
          {([['mailto', 'MAIL'], ['gmail', 'GMAIL'], ['outlook', 'OUTLOOK']] as [MailProvider, string][]).map(([p, label]) => (
            <button key={p} onClick={() => setProvider(p)} style={{ flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer', fontFamily: T.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', background: provider === p ? STAT_DARK : T.bg, color: provider === p ? '#fff' : T.textMid }}>{label}</button>
          ))}
        </div>
        <input type="email" value={emailTo} onChange={e => setEmailTo(e.target.value)} placeholder="recipient@email.com"
          style={{ fontFamily: T.fontBody, fontSize: 13, padding: '9px 11px', border: `1px solid ${T.border}`, borderRadius: T.radiusSm, outline: 'none', color: T.text }} />
        <div>
          <div style={{ fontFamily: T.fontBody, fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 8 }}>Selected Signals ({selected.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 160, overflowY: 'auto' }}>
            {selected.length === 0 && <div style={{ fontFamily: T.fontMono, fontSize: 10, color: T.textDim }}>Add signals with the “+” button, or send all visible.</div>}
            {selected.map(it => (
              <div key={it.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: sevBadge(it.riskLevel).bg, flexShrink: 0, marginTop: 4 }} />
                <span style={{ fontFamily: T.fontBody, fontSize: 12, color: T.textMid, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{it.headline}</span>
              </div>
            ))}
          </div>
        </div>
        <button onClick={onSend} disabled={exporting}
          style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: T.radiusSm, padding: '11px', fontFamily: T.fontBody, fontSize: 13, fontWeight: 700, cursor: exporting ? 'not-allowed' : 'pointer', opacity: exporting ? 0.6 : 1 }}>
          {exporting ? 'Generating…' : 'Generate & Send Brief'}
        </button>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
type NavTab = 'BRIEFING' | 'ARCHIVED' | 'ANALYTICS';

export default function Intel() {
  const { intel, loading } = useLiveIntel();
  const [tab, setTab] = useState<NavTab>('ANALYTICS');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailProvider, setEmailProvider] = useState<MailProvider>('gmail');
  const [composeOpen, setComposeOpen] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);

  const toggleCheck = (id: string) => setChecked(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  const selectedItems = intel.filter(i => checked.has(i.id));
  const exportItems = (selectedItems.length > 0 ? selectedItems : intel).map(toExportable);

  const grouped: Record<DisplayCategory, IntelItem[]> = {
    INFRASTRUCTURE: [], PROTESTS_EVENTS: [], LAW_ORDER: [], PUBLIC_HEALTH: [], ENVIRONMENT: [], TRANSPORT: [],
  };
  intel.forEach(i => grouped[categorise(i)].push(i));

  const counts = {
    total: intel.length,
    critical: intel.filter(i => i.riskLevel === 'critical').length,
    high: intel.filter(i => i.riskLevel === 'high').length,
  };
  const pad = (n: number) => String(n).padStart(2, '0');

  const doExport = async (fmt: 'word' | 'excel' | 'brief') => {
    setExportMenu(false);
    if (exportItems.length === 0 || exporting) return;
    setExporting(true);
    try {
      if (fmt === 'brief') {
        // Comprehensive SITREP: clustered incidents, risk table, focus areas.
        const brief = await generateStructuredBrief(exportItems);
        exportComprehensiveBrief(exportItems, brief);
      } else {
        const enriched = await generateArticleSummaries(exportItems);
        if (fmt === 'word') exportToWord(enriched); else exportToExcel(enriched);
      }
    } finally { setExporting(false); }
  };

  const doSend = async () => {
    if (exportItems.length === 0 || exporting) return;
    setExporting(true);
    try {
      const enriched = await generateArticleSummaries(exportItems);
      const subject = `Morning Intel — ${new Date().toLocaleDateString('en-IN')} (${exportItems.length} signals)`;
      openEmailCompose({ to: emailTo.trim(), subject, body: formatArticlesForEmail(enriched), provider: emailProvider });
    } finally { setExporting(false); }
  };

  const navBtn = (id: NavTab, label: string) => (
    <button onClick={() => setTab(id)} style={{
      background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px 10px',
      fontFamily: T.fontMono, fontSize: 12, fontWeight: tab === id ? 700 : 500, letterSpacing: '0.04em',
      color: tab === id ? T.text : T.textDim,
      borderBottom: tab === id ? `2px solid ${T.text}` : '2px solid transparent',
    }}>{label}</button>
  );

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: T.bgPage }}>
      <LiveStream items={intel} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', height: 60, borderBottom: `1px solid ${T.border}`, background: T.bg, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
            <span style={{ fontFamily: T.fontBody, fontSize: 19, fontWeight: 800, letterSpacing: '-0.01em', color: T.text }}>SIGNAL<span style={{ color: ACCENT }}>INTEL</span></span>
            <div style={{ display: 'flex', gap: 4 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
            <button onClick={() => setExportMenu(m => !m)} disabled={exporting}
              style={{ fontFamily: T.fontBody, fontSize: 13, fontWeight: 600, padding: '8px 14px', border: `1px solid ${T.borderStrong}`, borderRadius: T.radiusSm, background: T.bg, color: T.text, cursor: exporting ? 'not-allowed' : 'pointer' }}>
              {exporting ? 'Working…' : 'Export (DOCX/XLS)'}
            </button>
            {exportMenu && (
              <div style={{ position: 'absolute', top: 44, right: 150, background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.radiusSm, boxShadow: T.shadowMd, zIndex: 60, overflow: 'hidden' }}>
                {([['brief', 'Daily Brief (.doc) ★'], ['word', 'Word (.docx)'], ['excel', 'Excel (.xls)']] as ['brief' | 'word' | 'excel', string][]).map(([f, l]) => (
                  <button key={f} onClick={() => doExport(f)} style={{ display: 'block', width: 170, textAlign: 'left', padding: '9px 12px', border: 'none', background: T.bg, color: T.text, cursor: 'pointer', fontFamily: T.fontBody, fontSize: 12 }}
                    onMouseEnter={e => (e.currentTarget.style.background = T.bgHover)} onMouseLeave={e => (e.currentTarget.style.background = T.bg)}>{l}</button>
                ))}
              </div>
            )}
            <button onClick={() => setComposeOpen(true)}
              style={{ fontFamily: T.fontBody, fontSize: 13, fontWeight: 700, padding: '8px 16px', border: 'none', borderRadius: T.radiusSm, background: ACCENT, color: '#fff', cursor: 'pointer' }}>
              Compose Brief
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 26, padding: '12px 24px', background: STAT_DARK, color: '#fff', overflowX: 'auto', flexShrink: 0 }}>
          {[
            ['TOTAL', pad(counts.total), '#fff'],
            ['CRITICAL', pad(counts.critical), T.critical],
            ['HIGH', pad(counts.high), '#f59e0b'],
            ...CAT_ORDER.map(c => [CAT_LABELS[c].toUpperCase(), pad(grouped[c].length), '#fff'] as [string, string, string]),
          ].map(([label, value, color]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 7, whiteSpace: 'nowrap' }}>
              <span style={{ fontFamily: T.fontMono, fontSize: 9, color: '#94a3b8', letterSpacing: '0.06em' }}>{label}</span>
              <span style={{ fontFamily: T.fontMono, fontSize: 15, fontWeight: 700, color }}>{loading ? '—' : value}</span>
            </div>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 22 }} onClick={() => exportMenu && setExportMenu(false)}>
          {loading ? (
            <div style={{ padding: 60, textAlign: 'center', fontFamily: T.fontMono, fontSize: 12, color: T.textDim }}>Loading signals…</div>
          ) : tab === 'ARCHIVED' ? (
            <div style={{ padding: 60, textAlign: 'center', fontFamily: T.fontMono, fontSize: 12, color: T.textDim, border: `1px dashed ${T.border}`, borderRadius: T.radius }}>No archived briefs yet.</div>
          ) : tab === 'BRIEFING' ? (
            <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {intel.map(it => <SignalCard key={it.id} item={it} checked={checked.has(it.id)} onToggle={() => toggleCheck(it.id)} />)}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 20, alignItems: 'start' }}>
              {CAT_ORDER.map(c => (
                <div key={c} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: `1px solid ${T.border}` }}>
                    <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: T.textMid }}>{CAT_LABELS[c].toUpperCase()}</span>
                    <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, color: T.textDim }}>{grouped[c].length}</span>
                  </div>
                  {grouped[c].map(it => <SignalCard key={it.id} item={it} checked={checked.has(it.id)} onToggle={() => toggleCheck(it.id)} />)}
                  {grouped[c].length === 0 && <div style={{ fontFamily: T.fontMono, fontSize: 10, color: T.textDim, padding: '8px 2px' }}>No signals.</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        {composeOpen && (
          <ComposePanel
            selected={selectedItems} emailTo={emailTo} setEmailTo={setEmailTo}
            provider={emailProvider} setProvider={setEmailProvider}
            exporting={exporting} onSend={doSend} onClose={() => setComposeOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
