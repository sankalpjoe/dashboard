import { useState, useEffect, useRef } from "react";
import { fetchORRIntel, type ORREvent } from "@/lib/orr-intel-service";

// ── Tokens ───────────────────────────────────────────────────────────────────
const T = {
  bg:       '#ffffff',
  bgPanel:  '#f9f9f9',
  bgHover:  '#f3f3f3',
  border:   '#e5e5e5',
  text:     '#000000',
  textMid:  '#333333',
  textDim:  '#666666',
  critical: '#dc2626',
  high:     '#ea580c',
  medium:   '#ca8a04',
  low:      '#16a34a',
  info:     '#2563eb',
};

type OsintTab = 'FEEDS' | 'PROTESTS';

// ── Severity helpers ─────────────────────────────────────────────────────────
function sevColor(s: number) {
  if (s === 1) return T.critical;
  if (s === 2) return T.high;
  if (s === 3) return T.medium;
  return T.low;
}

// ── Category label map ───────────────────────────────────────────────────────
const CAT_LABEL: Record<string, string> = {
  armed_conflict: 'Conflict', terrorism: 'Terror', embassy_alert: 'Embassy',
  civil_disturbance: 'Civil', transit: 'Transit', climate: 'Climate',
  disease: 'Health', infrastructure: 'Infra', traffic: 'Traffic', general: 'General',
};

// ── Handle registry ──────────────────────────────────────────────────────────
const HANDLE_LIST = [
  { handle: 'blrcitytraffic',   label: 'BLR Traffic',    color: '#2563eb' },
  { handle: 'BlrCityPolice',    label: 'BLR Police',     color: '#dc2626' },
  { handle: 'NammaMetro',       label: 'Namma Metro',    color: '#7c3aed' },
  { handle: 'BMTC_BENGALURU',   label: 'BMTC',           color: '#16a34a' },
  { handle: 'BBMPCOMM',         label: 'BBMP',           color: '#ca8a04' },
  { handle: 'Bescom_Bangalore', label: 'BESCOM',         color: '#b45309' },
  { handle: 'NDRFHQ',           label: 'NDRF HQ',        color: '#0891b2' },
  { handle: 'OfficialDMRC',     label: 'DMRC',           color: '#7c3aed' },
  { handle: 'MumbaiPolice',     label: 'Mumbai Police',  color: '#ef4444' },
];

interface HandlePost {
  headline: string;
  description?: string;
  source: string;
  url?: string;
  time: string;
  riskLevel: string;
  category: string;
}

function formatTime(t: string) {
  try {
    const d = new Date(t);
    if (isNaN(d.getTime())) return t;
    const diff = Date.now() - d.getTime();
    const m = Math.floor(diff / 60000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch { return t; }
}

// ── Official Handle Feed ─────────────────────────────────────────────────────
function TwitterFeed() {
  const [posts, setPosts]               = useState<HandlePost[]>([]);
  const [loading, setLoading]           = useState(true);
  const [selectedHandle, setSelected]   = useState('ALL');
  const [searchQuery, setSearchQuery]   = useState('');
  const [searchInput, setSearchInput]   = useState('');
  const [searchResults, setSearchRes]   = useState<HandlePost[]>([]);
  const [searching, setSearching]       = useState(false);
  const [sourceInfo, setSourceInfo]     = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch('/api/twitter-intel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handles: HANDLE_LIST.map(h => h.handle) }),
    })
      .then(r => r.json())
      .then(data => {
        if (!active) return;
        const items: HandlePost[] = data.items || [];
        setPosts(items);
        setSourceInfo(items.length > 0
          ? `${items.length} posts fetched`
          : 'No posts found — Nitter may be offline, try searching manually below');
        setLoading(false);
      })
      .catch(() => {
        if (active) { setPosts([]); setLoading(false); setSourceInfo('Fetch failed'); }
      });
    return () => { active = false; };
  }, []);

  async function doSearch(q: string) {
    if (!q.trim()) return;
    setSearching(true);
    setSearchRes([]);
    try {
      const r = await fetch('/api/twitter-intel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchQuery: q }),
      });
      const data = await r.json();
      setSearchRes(data.items || []);
    } catch {
      setSearchRes([]);
    } finally {
      setSearching(false);
    }
  }

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSearchQuery(searchInput);
    doSearch(searchInput);
  }

  const handleMeta = (src: string) =>
    HANDLE_LIST.find(h => h.handle.toLowerCase() === src.toLowerCase());

  const visible = selectedHandle === 'ALL'
    ? posts
    : posts.filter(p => p.source.toLowerCase() === selectedHandle.toLowerCase());

  return (
    <div>
      {/* Header */}
      <div style={{ padding: '12px 0', marginBottom: 16, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 16, fontWeight: 700, color: T.text }}>
              Official Handle Feed
            </div>
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: T.textDim, marginTop: 3 }}>
              @blrcitytraffic · @BlrCityPolice · @NammaMetro · @BMTC_BENGALURU · @BBMPCOMM · @Bescom_Bangalore · @NDRFHQ · @OfficialDMRC · @MumbaiPolice
            </div>
            {sourceInfo && !loading && (
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: T.textDim, marginTop: 2 }}>
                {sourceInfo}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: loading ? T.medium : T.low }} />
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: loading ? T.medium : T.low }}>
              {loading ? 'LOADING' : 'LIVE'}
            </span>
          </div>
        </div>

        {/* Search bar */}
        <form onSubmit={onSearchSubmit} style={{ marginTop: 12, display: 'flex', gap: 6 }}>
          <input
            ref={inputRef}
            id="handle-search-input"
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search Google News... (e.g. BBMP waterlogging, BMTC strike)"
            style={{
              flex: 1, fontFamily: 'IBM Plex Mono, monospace', fontSize: 10,
              padding: '7px 10px', border: `1px solid ${T.border}`,
              background: T.bgPanel, color: T.text, outline: 'none',
            }}
          />
          <button type="submit" disabled={searching} style={{
            fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, fontWeight: 700,
            padding: '7px 14px', border: `1px solid ${T.text}`,
            background: T.text, color: '#fff', cursor: 'pointer', letterSpacing: '0.05em',
            opacity: searching ? 0.6 : 1,
          }}>
            {searching ? '...' : 'SEARCH'}
          </button>
          {searchQuery && (
            <button type="button" onClick={() => { setSearchQuery(''); setSearchInput(''); setSearchRes([]); }}
              style={{
                fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, padding: '7px 10px',
                border: `1px solid ${T.border}`, background: 'transparent', color: T.textDim, cursor: 'pointer',
              }}>
              CLEAR
            </button>
          )}
        </form>
      </div>

      {/* Search results */}
      {searchQuery && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, fontWeight: 700, color: T.info, marginBottom: 8, letterSpacing: '0.08em' }}>
            SEARCH RESULTS — "{searchQuery}" ({searchResults.length})
          </div>
          {searching && (
            <div style={{ padding: 24, textAlign: 'center', fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: T.textDim }}>
              Searching...
            </div>
          )}
          {!searching && searchResults.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: T.textDim, border: `1px dashed ${T.border}` }}>
              No results found
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
            {searchResults.map((item, i) => (
              <div key={i} style={{ border: `1px solid ${T.border}`, borderLeft: `3px solid ${T.info}`, padding: '9px 12px', background: T.bg }}>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: T.text, lineHeight: 1.45, marginBottom: 4 }}>
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ color: T.text, textDecoration: 'none' }}>
                      {item.headline}
                    </a>
                  ) : item.headline}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: T.textDim }}>{formatTime(item.time)}</span>
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noopener noreferrer"
                      style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: T.info, border: `1px solid ${T.info}`, padding: '1px 5px', textDecoration: 'none' }}>
                      SOURCE ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: `1px dashed ${T.border}`, marginBottom: 16 }} />
        </div>
      )}

      {/* Handle filter pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 16 }}>
        {['ALL', ...HANDLE_LIST.map(h => h.handle)].map(h => {
          const meta = HANDLE_LIST.find(x => x.handle === h);
          const active = selectedHandle === h;
          return (
            <button key={h} onClick={() => setSelected(h)} style={{
              fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, padding: '4px 10px',
              border: `1px solid ${active ? (meta?.color ?? '#000') : T.border}`,
              background: active ? (meta?.color ?? '#000') : 'transparent',
              color: active ? '#fff' : T.textMid,
              cursor: 'pointer', letterSpacing: '0.05em',
            }}>
              {h === 'ALL' ? 'ALL' : (meta?.label ?? h)}
            </button>
          );
        })}
      </div>

      {/* Posts feed */}
      {loading && (
        <div style={{ padding: 40, textAlign: 'center', fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: T.textDim }}>
          Connecting to handle feeds...
        </div>
      )}
      {!loading && visible.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: T.textDim, border: `1px dashed ${T.border}` }}>
          No posts fetched — Nitter instances may be offline.<br />
          Use the search bar above to find posts manually.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {visible.map((post, i) => {
          const meta = handleMeta(post.source);
          return (
            <div key={i} style={{
              border: `1px solid ${T.border}`,
              borderLeft: `4px solid ${meta?.color ?? T.info}`,
              padding: '10px 12px', background: T.bg,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, fontWeight: 700, color: meta?.color ?? T.info }}>
                  @{post.source}
                </span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: T.textDim }}>
                    {formatTime(post.time)}
                  </span>
                  {post.url && (
                    <a href={post.url} target="_blank" rel="noopener noreferrer"
                      style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: T.info, border: `1px solid ${T.info}`, padding: '1px 5px', textDecoration: 'none' }}>
                      ↗
                    </a>
                  )}
                </div>
              </div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: T.text, lineHeight: 1.5 }}>
                {post.headline}
              </div>
              {post.description && post.description !== post.headline && (
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: T.textDim, lineHeight: 1.4, marginTop: 4 }}>
                  {post.description.slice(0, 200)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── RSS Feeds panel ──────────────────────────────────────────────────────────
function RssFeedsPanel() {
  const [events, setEvents] = useState<ORREvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [cityFilter, setCityFilter] = useState('ALL');

  useEffect(() => {
    let active = true;
    fetchORRIntel().then(r => {
      if (active) { setEvents(r.events.filter(e => !e.isPredicted)); setLoading(false); }
    }).catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const CITIES = ['ALL', 'BANGALORE', 'HYDERABAD', 'MUMBAI', 'DELHI', 'NATIONAL'];
  const CITY_KW: Record<string, string[]> = {
    BANGALORE: ['bangalore', 'bengaluru', 'bbmp', 'bescom', 'bwssb', 'namma metro', 'bmtc', 'blr'],
    HYDERABAD: ['hyderabad', 'ghmc', 'tgspdcl', 'secunderabad', 'telangana'],
    MUMBAI:    ['mumbai', 'bombay', 'mcgm', 'bmc', 'best bus', 'maharashtra'],
    DELHI:     ['delhi', 'dmrc', 'mcd', 'dpcc', 'ncr', 'noida', 'gurgaon'],
    NATIONAL:  ['india', 'ndrf', 'ndma', 'imd', 'cpcb', 'national'],
  };

  const visible = cityFilter === 'ALL' ? events : events.filter(ev => {
    const h = ev.headline.toLowerCase() + ' ' + ev.source.toLowerCase();
    return (CITY_KW[cityFilter] ?? []).some(kw => h.includes(kw));
  });

  return (
    <div>
      <div style={{ padding: '12px 0', marginBottom: 12, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 16, fontWeight: 700, color: T.text }}>Live RSS Feeds</div>
        <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: T.textDim, marginTop: 2 }}>
          The Hindu · TOI · Indian Express · Hindustan Times · Prajavani · Eenadu · IMD · CPCB · NDMA
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {CITIES.map(city => (
          <button key={city} onClick={() => setCityFilter(city)} style={{
            fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, padding: '4px 12px',
            border: `1px solid ${cityFilter === city ? '#000' : T.border}`,
            background: cityFilter === city ? '#000' : 'transparent',
            color: cityFilter === city ? '#fff' : T.textMid, cursor: 'pointer',
          }}>{city}</button>
        ))}
      </div>
      {loading && <div style={{ padding: 40, textAlign: 'center', fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: T.textDim }}>Fetching feeds...</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {visible.map(ev => {
          const sc = sevColor(ev.severity);
          const cat = CAT_LABEL[ev.category] ?? ev.category;
          return (
            <div key={ev.id} style={{ border: `1px solid ${T.border}`, borderLeft: `3px solid ${sc}`, padding: '10px 12px', background: T.bg, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: T.text, lineHeight: 1.45, marginBottom: 5, fontWeight: 500 }}>
                  {ev.headline}
                  {ev.isTranslated && <span style={{ marginLeft: 6, fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: T.info, border: `1px solid ${T.info}`, padding: '1px 4px' }}>TRANSLATED</span>}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: T.textDim }}>{ev.source.toUpperCase()}</span>
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: T.textDim }}>·</span>
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, border: `1px solid ${T.border}`, color: T.textMid, padding: '1px 4px' }}>{cat.toUpperCase()}</span>
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: T.textDim }}>·</span>
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: T.textDim }}>{ev.time}</span>
                </div>
              </div>
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: sc, border: `1px solid ${sc}`, padding: '1px 5px', fontWeight: 700 }}>S{ev.severity}</span>
                {ev.url && (
                  <a href={ev.url} target="_blank" rel="noopener noreferrer"
                    style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: T.info, textDecoration: 'none', border: `1px solid ${T.info}`, padding: '1px 5px' }}>↗</a>
                )}
              </div>
            </div>
          );
        })}
        {!loading && visible.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: T.textDim, border: `1px dashed ${T.border}` }}>
            No feeds matching this filter
          </div>
        )}
      </div>
    </div>
  );
}

// ── Protests Panel ─────────────────────────────────────────────────────────────
function ProtestsPanel() {
  const [events, setEvents] = useState<ORREvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchORRIntel().then(r => {
      if (active) {
        // Filter out non-disturbance events, but keep predicted protests if any
        const allProtests = [...r.events, ...r.predictedEvents].filter(
          e => e.category === 'civil_disturbance' || e.headline.toLowerCase().includes('protest') || e.headline.toLowerCase().includes('strike')
        );
        // Sort by severity then by time
        allProtests.sort((a, b) => a.severity - b.severity || b.timestamp - a.timestamp);
        setEvents(allProtests);
        setLoading(false);
      }
    }).catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <div>
      <div style={{ padding: '12px 0', marginBottom: 12, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 16, fontWeight: 700, color: T.text }}>Protests & Unrest Events</div>
        <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: T.textDim, marginTop: 2 }}>
          Planned strikes, bandhs, rallies, and ongoing civil disturbances
        </div>
      </div>
      {loading && <div style={{ padding: 40, textAlign: 'center', fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: T.textDim }}>Scanning intelligence feeds...</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {events.map(ev => {
          const sc = sevColor(ev.severity);
          return (
            <div key={ev.id} style={{ border: `1px solid ${T.border}`, borderLeft: `3px solid ${sc}`, padding: '10px 12px', background: T.bg, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: T.text, lineHeight: 1.45, marginBottom: 5, fontWeight: 500 }}>
                  {ev.headline}
                  {ev.isTranslated && <span style={{ marginLeft: 6, fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: T.info, border: `1px solid ${T.info}`, padding: '1px 4px' }}>TRANSLATED</span>}
                  {ev.isPredicted && <span style={{ marginLeft: 6, fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: '#9333ea', border: `1px solid #9333ea`, padding: '1px 4px' }}>PLANNED</span>}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: T.textDim }}>{ev.source.toUpperCase()}</span>
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: T.textDim }}>·</span>
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: T.textDim }}>{ev.time}</span>
                </div>
              </div>
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: sc, border: `1px solid ${sc}`, padding: '1px 5px', fontWeight: 700 }}>S{ev.severity}</span>
                {ev.url && (
                  <a href={ev.url} target="_blank" rel="noopener noreferrer"
                    style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: T.info, textDecoration: 'none', border: `1px solid ${T.info}`, padding: '1px 5px' }}>↗</a>
                )}
              </div>
            </div>
          );
        })}
        {!loading && events.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: T.textDim, border: `1px dashed ${T.border}` }}>
            No planned protests or ongoing civil unrest detected.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Intelligence() {
  const [tab, setTab] = useState<OsintTab>('FEEDS');

  const TABS: { id: OsintTab; label: string }[] = [
    { id: 'FEEDS',   label: 'News Feeds'      },
    { id: 'PROTESTS', label: 'Protests & Events' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: T.bg }}>
      <div style={{ padding: '16px 28px 0', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 22, fontWeight: 800, color: T.text, marginBottom: 12 }}>OSINT</div>
        <div style={{ display: 'flex', gap: 0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '9px 20px', border: 'none',
              borderBottom: tab === t.id ? '2px solid #000' : '2px solid transparent',
              background: 'transparent', color: T.text,
              fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.08em', cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
              {t.label.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
        {tab === 'FEEDS'   && <RssFeedsPanel />}
        {tab === 'PROTESTS' && <ProtestsPanel />}
      </div>
    </div>
  );
}
