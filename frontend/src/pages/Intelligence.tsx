import { useState, useEffect, useRef, type ReactNode } from "react";
import { fetchORRIntel, type ORREvent } from "@/lib/orr-intel-service";
import { fetchIMDWeather, fetchIMDDistrictWarnings, WEATHER_CITIES, type IMDWeatherData, type IMDDistrictWarnings } from "@/lib/imd-service";
import { useLiveIntel } from "@/hooks/useIntel";
import { analyzeTrafficBatch, type TrafficImpact } from "@/lib/traffic-service";
import { NEWS_SOURCES, type SourceCity } from "@/config/news-sources";

import { T } from "@/lib/theme";
import XPublishFeed from "@/components/panels/XPublishFeed";

type OsintTab = 'FEEDS' | 'TWITTER' | 'WEATHER' | 'TRAFFIC' | 'PROTESTS';

// ── Severity helpers ─────────────────────────────────────────────────────────
function sevColor(s: number) {
  if (s === 1) return T.critical;
  if (s === 2) return T.high;
  if (s === 3) return T.medium;
  return T.low;
}

// ── Handle registry (institutional civic / police / utility / transport ONLY) ─
// Political / prominent-figure handles excluded — advisory feeds only.
// Colour-coded by city: Bengaluru=blue, Mumbai=red, Hyderabad=purple, Delhi=green.
const C_BLR = '#2563eb', C_MUM = '#dc2626', C_HYD = '#7c3aed', C_DEL = '#16a34a';
const HANDLE_LIST = [
  // ── Bengaluru ──
  { handle: 'NammaBESCOM',   label: 'BESCOM',         color: C_BLR },
  { handle: 'BlrCityPolice', label: 'BLR Police',     color: C_BLR },
  { handle: 'blrcitytraffic',label: 'BLR Traffic',    color: C_BLR },
  // ── Mumbai ──
  { handle: 'MumbaiPolice',  label: 'Mumbai Police',  color: C_MUM },
  { handle: 'mybmc',         label: 'BMC',            color: C_MUM },
  { handle: 'MTPHereToHelp', label: 'Mumbai Traffic', color: C_MUM },
  { handle: 'myBESTBus',     label: 'BEST Bus',       color: C_MUM },
  // ── Hyderabad ──
  { handle: 'hydcitypolice', label: 'HYD Police',     color: C_HYD },
  { handle: 'HYDTP',         label: 'HYD Traffic',    color: C_HYD },
  { handle: 'Ghmconline',    label: 'GHMC',           color: C_HYD },
  { handle: 'tgspdcl',       label: 'TGSPDCL',        color: C_HYD },
  // ── Delhi ──
  { handle: 'DelhiPolice',   label: 'Delhi Police',   color: C_DEL },
  { handle: 'dtptraffic',    label: 'Delhi Traffic',  color: C_DEL },
  { handle: 'OfficialDMRC',  label: 'DMRC',           color: C_DEL },
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

// ── TweetDeck-style Multi-Panel Twitter Dashboard (Free & Reliable) ──────────
// Bypasses browser iframe connection blocks completely by fetching tweets
// through the backend (Nitter/RSS/Bridge/Google News waterfall) and rendering.
interface HandleFeedData {
  handle: string;
  label: string;
  color: string;
  posts: HandlePost[];
}

function TwitterFeed() {
  const [selectedCity, setSelectedCity] = useState('ALL');
  const [colWidth, setColWidth]        = useState(340);
  const gridRef = useRef<HTMLDivElement>(null);

  const CITIES = [
    { key: 'ALL',       label: 'All Cities',  color: '#111' },
    { key: 'BENGALURU', label: 'Bengaluru',   color: C_BLR },
    { key: 'MUMBAI',    label: 'Mumbai',      color: C_MUM },
    { key: 'HYDERABAD', label: 'Hyderabad',   color: C_HYD },
    { key: 'DELHI',     label: 'Delhi',       color: C_DEL },
  ];

  const handleCity = (h: typeof HANDLE_LIST[number]) => {
    if (h.color === C_BLR) return 'BENGALURU';
    if (h.color === C_MUM) return 'MUMBAI';
    if (h.color === C_HYD) return 'HYDERABAD';
    if (h.color === C_DEL) return 'DELHI';
    return 'ALL';
  };

  const visibleHandles = selectedCity === 'ALL'
    ? HANDLE_LIST
    : HANDLE_LIST.filter(h => handleCity(h) === selectedCity);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ── Dashboard Header ── */}
      <div style={{
        padding: '12px 20px 10px',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
      }}>
        {/* Title row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20, lineHeight: 1 }}>𝕏</span>
            <span style={{
              fontFamily: T.fontBody, fontSize: 16, fontWeight: 800, color: '#fff',
              letterSpacing: '-0.3px',
            }}>
              Live Stream Dashboard
            </span>
            <span style={{
              fontFamily: T.fontMono, fontSize: 9, color: '#4ade80',
              background: 'rgba(74,222,128,0.1)', padding: '3px 8px',
              borderRadius: 999, border: '1px solid rgba(74,222,128,0.2)',
            }}>
              FREE FLOW
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Column width control */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontFamily: T.fontMono, fontSize: 8, color: '#64748b' }}>WIDTH</span>
              {[280, 340, 400, 480].map(w => (
                <button key={w} onClick={() => setColWidth(w)} style={{
                  fontFamily: T.fontMono, fontSize: 8, padding: '3px 6px',
                  border: colWidth === w ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 4,
                  background: colWidth === w ? '#3b82f6' : 'transparent',
                  color: colWidth === w ? '#fff' : '#64748b',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}>
                  {w === 280 ? 'S' : w === 340 ? 'M' : w === 400 ? 'L' : 'XL'}
                </button>
              ))}
            </div>
            {/* Live indicator */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontFamily: T.fontMono, fontSize: 9, color: '#4ade80',
            }}>
              <div className="pulse-indicator" style={{
                width: 7, height: 7, borderRadius: '50%',
                background: '#4ade80',
                boxShadow: '0 0 6px #4ade80',
              }} />
              LIVE
            </div>
          </div>
        </div>

        {/* City filter */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {CITIES.map(c => {
            const active = selectedCity === c.key;
            const count = c.key === 'ALL'
              ? HANDLE_LIST.length
              : HANDLE_LIST.filter(h => handleCity(h) === c.key).length;
            return (
              <button key={c.key} onClick={() => setSelectedCity(c.key)} style={{
                fontFamily: T.fontMono, fontSize: 9, fontWeight: 600,
                padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
                border: active ? `1px solid ${c.color}` : '1px solid rgba(255,255,255,0.1)',
                background: active ? c.color : 'rgba(255,255,255,0.04)',
                color: active ? '#fff' : '#94a3b8',
                transition: 'all 0.15s ease',
              }}>
                {c.label}
                <span style={{
                  marginLeft: 4, fontSize: 8, opacity: 0.7,
                  background: active ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)',
                  padding: '1px 4px', borderRadius: 999,
                }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Panel Grid ── */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', background: '#090d16' }}>
        <div
          ref={gridRef}
          style={{
            display: 'flex', gap: 0, height: '100%',
            overflowX: 'auto', overflowY: 'hidden',
            scrollBehavior: 'smooth',
            scrollbarWidth: 'thin',
          }}
        >
          {visibleHandles.map(h => (
            <ReactHandlePanel key={h.handle} handle={h.handle} label={h.label} color={h.color} width={colWidth} />
          ))}

          {visibleHandles.length === 0 && (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: T.fontMono, fontSize: 10, color: '#64748b',
            }}>
              No panels match the city filter.
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Bar ── */}
      <div style={{
        padding: '5px 20px', borderTop: `1px solid ${T.border}`,
        background: T.bgPanel, flexShrink: 0,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontFamily: T.fontMono, fontSize: 8, color: T.textDim }}>
          {visibleHandles.length} panels · client-side REST streaming
        </span>
        <span style={{ fontFamily: T.fontMono, fontSize: 8, color: T.textDim }}>
          Bengaluru · Mumbai · Hyderabad · Delhi
        </span>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .pulse-indicator {
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

// ── Custom React Handle Panel (Self-fetching columns) ────────────────────────
function ReactHandlePanel({ handle, label, color, width }: {
  handle: string; label: string; color: string; width: number;
}) {
  const [posts, setPosts] = useState<HandlePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadPosts = async () => {
    setLoading(true);
    setError(false);
    try {
      const r = await fetch('/api/twitter-intel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          handles: [handle],
          raw: true,
        }),
      });
      if (!r.ok) throw new Error();
      const data = await r.json();
      setPosts(data.items || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
    const timer = setInterval(loadPosts, 90_000); // refresh individual panel every 90 seconds
    return () => clearInterval(timer);
  }, [handle]);

  const hasContent = posts.length > 0;

  return (
    <div style={{
      flex: `0 0 ${width}px`, width, height: '100%',
      display: 'flex', flexDirection: 'column',
      borderRight: '1px solid #1e293b',
      background: '#0b0f19',
    }}>
      {/* Column Header */}
      <div style={{
        padding: '10px 12px',
        background: `linear-gradient(135deg, ${color}15 0%, ${color}05 100%)`,
        borderBottom: `2px solid ${color}`,
        flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        {/* Avatar initial */}
        <div style={{
          width: 30, height: 30, borderRadius: '50%',
          background: `linear-gradient(135deg, ${color}, ${color}bb)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 13, fontWeight: 800,
          fontFamily: T.fontBody,
          boxShadow: `0 2px 8px ${color}40`,
          flexShrink: 0,
        }}>
          {label.charAt(0)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: T.fontBody, fontSize: 12, fontWeight: 700,
            color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {label}
          </div>
          <div style={{ fontFamily: T.fontMono, fontSize: 8, color: '#94a3b8' }}>
            @{handle}
          </div>
        </div>
        {/* Post count */}
        {!loading && !error && (
          <div style={{
            fontFamily: T.fontMono, fontSize: 8, fontWeight: 700,
            color: hasContent ? color : '#475569',
            background: hasContent ? `${color}18` : 'rgba(255,255,255,0.02)',
            padding: '2px 6px', borderRadius: 999,
            border: `1px solid ${hasContent ? `${color}40` : 'rgba(255,255,255,0.05)'}`,
          }}>
            {posts.length}
          </div>
        )}
        {/* External X link */}
        <a href={`https://x.com/${handle}`} target="_blank" rel="noopener noreferrer"
          style={{
            fontFamily: T.fontMono, fontSize: 8, color: '#94a3b8',
            textDecoration: 'none', padding: '3px 6px', borderRadius: 4,
            border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)',
          }}
          title={`Open @${handle} on X`}
        >
          ↗
        </a>
      </div>

      {/* Stream contents */}
      <div style={{
        flex: 1, overflowY: 'auto', overflowX: 'hidden',
        scrollbarWidth: 'thin', padding: '4px 0',
      }}>
        {loading ? (
          <div style={{
            padding: '48px 16px', textAlign: 'center',
            fontFamily: T.fontMono, fontSize: 9, color: '#475569',
          }}>
            <div style={{ fontSize: 20, marginBottom: 8, animation: 'spin 1.5s linear infinite' }}>↻</div>
            Syncing timeline...
          </div>
        ) : error ? (
          <div style={{
            padding: '48px 16px', textAlign: 'center',
            fontFamily: T.fontMono, fontSize: 9, color: '#ef4444',
          }}>
            ⚠️ Sync failed
            <div style={{ marginTop: 8 }}>
              <button onClick={loadPosts} style={{
                fontFamily: T.fontMono, fontSize: 8, padding: '3px 8px', borderRadius: 4,
                border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)', color: '#fff', cursor: 'pointer'
              }}>
                Retry
              </button>
            </div>
          </div>
        ) : !hasContent ? (
          <div style={{
            padding: '48px 16px', textAlign: 'center',
            fontFamily: T.fontMono, fontSize: 9, color: '#475569',
          }}>
            <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.3 }}>📭</div>
            No recent posts found
            <div style={{ marginTop: 8, fontSize: 8 }}>
              <a href={`https://x.com/${handle}`} target="_blank" rel="noopener noreferrer"
                style={{ color: '#38bdf8', textDecoration: 'none' }}>
                Open X timeline directly ↗
              </a>
            </div>
          </div>
        ) : (
          posts.map((post, i) => (
            <div
              key={i}
              style={{
                padding: '12px 14px',
                borderBottom: '1px solid #1e293b',
                background: 'transparent',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {/* Card header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{
                  fontFamily: T.fontBody, fontSize: 11, fontWeight: 600,
                  color: '#f1f5f9',
                }}>
                  {label}
                </span>
                <span style={{ fontFamily: T.fontMono, fontSize: 8, color: '#64748b' }}>
                  @{post.source}
                </span>
                <span style={{ flex: 1 }} />
                <span style={{ fontFamily: T.fontMono, fontSize: 8, color: '#64748b' }}>
                  {formatTime(post.time)}
                </span>
              </div>

              {/* Card body */}
              <div style={{
                fontFamily: T.fontBody, fontSize: 12, color: '#e2e8f0',
                lineHeight: 1.5, wordBreak: 'break-word',
              }}>
                {post.headline}
              </div>

              {/* Action bar */}
              {post.url && (
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-start' }}>
                  <a href={post.url} target="_blank" rel="noopener noreferrer"
                    style={{
                      fontFamily: T.fontMono, fontSize: 8, color: '#38bdf8',
                      textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '2px 6px', borderRadius: 4, background: 'rgba(56,189,248,0.08)',
                      border: '1px solid rgba(56,189,248,0.15)',
                    }}>
                    View on 𝕏 ↗
                  </a>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}





// ── Source directory panel (TweetDeck-style side-by-side columns) ────────────
function RssFeedsPanel() {
  const [cityFilter, setCityFilter] = useState('ALL');
  const [colWidth, setColWidth]     = useState(340);
  const gridRef = useRef<HTMLDivElement>(null);

  const CITIES = ['ALL', 'BANGALORE', 'HYDERABAD', 'MUMBAI', 'DELHI', 'CHENNAI', 'KOLKATA', 'NATIONAL'];

  // Source websites, filtered by the city selector.
  const sourceLinks = NEWS_SOURCES.filter(s => {
    if (cityFilter === 'ALL') return true;
    if (cityFilter === 'NATIONAL') return s.city === 'NATIONAL' || s.city === 'OFFICIAL';
    return s.city === (cityFilter as SourceCity) || s.city === 'NATIONAL' || s.city === 'OFFICIAL';
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header bar */}
      <div style={{
        padding: '12px 20px 10px',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>📰</span>
            <span style={{
              fontFamily: T.fontBody, fontSize: 16, fontWeight: 800, color: '#fff',
              letterSpacing: '-0.3px',
            }}>
              Live News Stream
            </span>
            <span style={{
              fontFamily: T.fontMono, fontSize: 9, color: '#38bdf8',
              background: 'rgba(56,189,248,0.1)', padding: '3px 8px',
              borderRadius: 999, border: '1px solid rgba(56,189,248,0.2)',
            }}>
              SECURE PROXY
            </span>
          </div>
          {/* Column width control */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontFamily: T.fontMono, fontSize: 8, color: '#64748b' }}>WIDTH</span>
            {[280, 340, 420, 520].map(w => (
              <button key={w} onClick={() => setColWidth(w)} style={{
                fontFamily: T.fontMono, fontSize: 8, padding: '3px 6px',
                border: colWidth === w ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                borderRadius: 4,
                background: colWidth === w ? '#3b82f6' : 'transparent',
                color: colWidth === w ? '#fff' : '#64748b',
                cursor: 'pointer',
                transition: 'all 0.1s ease',
              }}>
                {w === 280 ? 'S' : w === 340 ? 'M' : w === 420 ? 'L' : 'XL'}
              </button>
            ))}
          </div>
        </div>

        {/* City Filter Pills */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {CITIES.map(city => {
            const active = cityFilter === city;
            const count = city === 'ALL'
              ? NEWS_SOURCES.length
              : NEWS_SOURCES.filter(s => {
                  if (city === 'NATIONAL') return s.city === 'NATIONAL' || s.city === 'OFFICIAL';
                  return s.city === (city as SourceCity);
                }).length;

            return (
              <button key={city} onClick={() => setCityFilter(city)} style={{
                fontFamily: T.fontMono, fontSize: 9, fontWeight: 600,
                padding: '4px 12px', borderRadius: 999, cursor: 'pointer',
                border: active ? '1px solid #fff' : '1px solid rgba(255,255,255,0.1)',
                background: active ? '#fff' : 'rgba(255,255,255,0.04)',
                color: active ? '#111' : '#94a3b8',
                transition: 'all 0.15s ease',
              }}>
                {city}
                <span style={{
                  marginLeft: 4, fontSize: 8, opacity: 0.7,
                  background: active ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.08)',
                  padding: '1px 4px', borderRadius: 999,
                }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Columns Grid */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', background: '#090d16' }}>
        <div
          ref={gridRef}
          style={{
            display: 'flex', gap: 0, height: '100%',
            overflowX: 'auto', overflowY: 'hidden',
            scrollBehavior: 'smooth',
            scrollbarWidth: 'thin',
          }}
        >
          {sourceLinks.map((s, idx) => (
            <NewsPanel
              key={s.url + idx}
              name={s.name}
              url={s.url}
              lang={s.lang}
              city={s.city}
              width={colWidth}
            />
          ))}

          {sourceLinks.length === 0 && (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: T.fontMono, fontSize: 10, color: '#64748b',
            }}>
              No sources matched this filter.
            </div>
          )}
        </div>
      </div>

      {/* Bottom Bar */}
      <div style={{
        padding: '5px 20px', borderTop: `1px solid ${T.border}`,
        background: T.bgPanel, flexShrink: 0,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontFamily: T.fontMono, fontSize: 8, color: T.textDim }}>
          {sourceLinks.length} news channels loaded · scroll → to see more
        </span>
        <span style={{ fontFamily: T.fontMono, fontSize: 8, color: T.textDim }}>
          Free news stream (CORS-bypassed proxy)
        </span>
      </div>
    </div>
  );
}

// ── Individual News Column Panel (Proxy Embed) ───────────────────────────────
function NewsPanel({ name, url, lang, city, width }: {
  name: string; url: string; lang: string; city: SourceCity; width: number;
}) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  // We load the target URL via our edge proxy endpoint to bypass CORS/SAMEORIGIN blocks
  const proxiedUrl = `/api/proxy-site?url=${encodeURIComponent(url)}`;

  // Determine a nice city color indicator
  const getCityColor = () => {
    if (city === 'BANGALORE') return C_BLR;
    if (city === 'MUMBAI') return C_MUM;
    if (city === 'HYDERABAD') return C_HYD;
    if (city === 'DELHI') return C_DEL;
    return '#64748b'; // default national
  };

  const cityColor = getCityColor();

  return (
    <div style={{
      flex: `0 0 ${width}px`, width, height: '100%',
      display: 'flex', flexDirection: 'column',
      borderRight: '1px solid #1e293b',
      background: '#0b0f19',
    }}>
      {/* Panel Header */}
      <div style={{
        padding: '8px 10px',
        background: `linear-gradient(135deg, ${cityColor}15 0%, ${cityColor}05 100%)`,
        borderBottom: `2px solid ${cityColor}`,
        flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: T.fontBody, fontSize: 11, fontWeight: 700,
            color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {name}
          </div>
          <div style={{ fontFamily: T.fontMono, fontSize: 8, color: '#94a3b8' }}>
            {lang} · {city}
          </div>
        </div>
        
        {/* Loading status dot */}
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: loaded ? '#4ade80' : errored ? '#f87171' : '#fbbf24',
          boxShadow: loaded ? '0 0 4px #4ade80' : 'none',
          flexShrink: 0,
        }} />

        {/* Direct Link button */}
        <a href={url} target="_blank" rel="noopener noreferrer"
          style={{
            fontFamily: T.fontMono, fontSize: 8, color: '#94a3b8',
            textDecoration: 'none', padding: '2px 5px', borderRadius: 4,
            border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)',
            flexShrink: 0,
          }}
          title="Open landing page in new tab"
        >
          ↗
        </a>
      </div>

      {/* Frame Embed view */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#fafafa' }}>
        {/* Loader overlay */}
        {!loaded && !errored && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 2,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: '#0b0f19',
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.1)', borderTopColor: cityColor,
              animation: 'spin 0.8s linear infinite',
            }} />
            <span style={{ fontFamily: T.fontMono, fontSize: 8, color: '#64748b', marginTop: 8 }}>
              Proxying...
            </span>
          </div>
        )}

        {/* Error overlay */}
        {errored && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 2,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: '#0b0f19', padding: 12, textAlign: 'center',
          }}>
            <div style={{ fontSize: 20, marginBottom: 6, opacity: 0.4 }}>⚠️</div>
            <div style={{ fontFamily: T.fontMono, fontSize: 8, color: '#64748b', marginBottom: 8 }}>
              Connection failed
            </div>
            <a href={url} target="_blank" rel="noopener noreferrer"
              style={{
                fontFamily: T.fontMono, fontSize: 8, color: '#fff',
                textDecoration: 'none', padding: '4px 10px',
                borderRadius: 4, background: cityColor,
              }}>
              Open directly ↗
            </a>
          </div>
        )}

        <iframe
          src={proxiedUrl}
          title={`${name} proxy`}
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          sandbox="allow-scripts allow-same-origin allow-popups"
          style={{
            width: '100%', height: '100%', border: 'none',
            opacity: loaded ? 1 : 0,
            transition: 'opacity 0.2s ease',
          }}
          referrerPolicy="no-referrer"
        />
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

// ── Weather Tab — IMD Mausam / Open-Meteo forecast + nowcast (6 cities) ───────
const WX_WARN_COLOR: Record<string, string> = {
  red: '#dc2626', orange: '#ea580c', yellow: '#ca8a04', green: '#16a34a',
};


function WeatherTab() {
  const [data, setData] = useState<Record<string, IMDWeatherData | null>>({});
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState('');
  const [warns, setWarns] = useState<IMDDistrictWarnings | null>(null);
  const [warnsLoading, setWarnsLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setWarnsLoading(true);
    // Live IMD district warnings (Agent 3) + per-city Open-Meteo forecast, in parallel.
    fetchIMDDistrictWarnings().then(w => { setWarns(w); setWarnsLoading(false); });
    const entries = await Promise.all(
      WEATHER_CITIES.map(async c => [c, await fetchIMDWeather(c)] as const),
    );
    setData(Object.fromEntries(entries));
    setUpdated(new Date().toLocaleTimeString('en-IN'));
    setLoading(false);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30 * 60_000); // refresh every 30 min
    return () => clearInterval(t);
  }, []);

  return (
    <div>
      <div style={{ padding: '12px 0', marginBottom: 12, borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 16, fontWeight: 700, color: T.text }}>Forecast &amp; Nowcast</div>
          <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: T.textDim, marginTop: 2 }}>
            IMD Mausam / Open-Meteo · Bengaluru · Delhi · Hyderabad · Mumbai · Chennai · Kolkata{updated ? ` · updated ${updated}` : ''}
          </div>
        </div>
        <button onClick={load} disabled={loading} style={{
          fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, padding: '5px 10px', cursor: loading ? 'not-allowed' : 'pointer',
          border: `1px solid ${T.border}`, background: T.bg, color: T.textMid, opacity: loading ? 0.5 : 1,
        }}>
          {loading ? 'LOADING…' : '↻ REFRESH'}
        </button>
      </div>

      {/* Agent 3 — live IMD district-level colour-coded warnings */}
      {(() => {
        const rows: [string, string, string[], string][] = [
          ['RED ALERT', 'Take Action', warns?.red ?? [], WX_WARN_COLOR.red],
          ['ORANGE ALERT', 'Be Prepared', warns?.orange ?? [], WX_WARN_COLOR.orange],
          ['YELLOW ALERT', 'Be Aware', warns?.yellow ?? [], WX_WARN_COLOR.yellow],
        ];
        const total = (warns?.red.length ?? 0) + (warns?.orange.length ?? 0) + (warns?.yellow.length ?? 0);
        return (
          <div style={{ marginBottom: 16, border: `1px solid ${T.border}`, padding: '10px 12px', background: T.bgPanel }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, fontWeight: 700, color: T.textMid, letterSpacing: '0.08em' }}>
                IMD DISTRICT WARNINGS
              </span>
              <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: T.textDim }}>
                {warnsLoading ? 'fetching live IMD bulletin…' : warns ? `${warns.source}${warns.asOf ? ' · ' + warns.asOf : ''}` : ''}
              </span>
            </div>
            {rows.map(([label, action, districts, color]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, fontWeight: 700, color, minWidth: 140, flexShrink: 0 }}>
                  {label} <span style={{ color: T.textDim, fontWeight: 400 }}>({action})</span>
                </span>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: districts.length ? T.text : T.textDim, lineHeight: 1.5 }}>
                  {districts.length ? districts.join(', ') : '—'}
                </span>
              </div>
            ))}
            {!warnsLoading && total === 0 && (
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: warns ? T.low : T.medium, marginTop: 4 }}>
                {warns ? 'No active IMD district warnings reported for the monitored states.' : 'IMD warnings unavailable (set GROQ_API_KEY to enable the IMD agent).'}
              </div>
            )}
          </div>
        );
      })()}

      {loading && Object.keys(data).length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: T.textDim }}>
          Fetching forecast &amp; nowcast…
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 12 }}>
          {WEATHER_CITIES.map(city => {
            const w = data[city];
            if (!w) return (
              <div key={city} style={{ border: `1px solid ${T.border}`, padding: 12, background: T.bg }}>
                <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 13, color: T.text }}>{titleCaseW(city)}</div>
                <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: T.textDim, marginTop: 8 }}>Weather data unavailable.</div>
              </div>
            );
            const nc = w.nowcast;
            const warnings = nc.warnings.filter(x => x.level !== 'green');
            return (
              <div key={city} style={{ border: `1px solid ${T.border}`, background: T.bg, display: 'flex', flexDirection: 'column' }}>
                {/* City header + nowcast */}
                <div style={{ padding: '10px 12px', borderBottom: `1px solid ${T.border}`, background: T.bgPanel }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 14, color: T.text }}>{w.city}</span>
                    <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 18 }}>{nc.weatherIcon}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 24, fontWeight: 700, color: T.text }}>{nc.temperature}°C</span>
                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: T.textMid }}>{nc.weather}</span>
                  </div>
                  <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: T.textDim, marginTop: 4 }}>
                    Feels {nc.feelsLike}°C · Humidity {nc.humidity}% · Wind {nc.windSpeed} km/h {nc.windDir} · Vis {nc.visibility} km
                  </div>
                </div>

                {/* Warnings */}
                {warnings.length > 0 && (
                  <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {warnings.map((x, i) => (
                      <div key={i} style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: T.textMid, borderLeft: `3px solid ${WX_WARN_COLOR[x.level]}`, paddingLeft: 8 }}>
                        <span style={{ color: WX_WARN_COLOR[x.level], fontWeight: 700 }}>{x.level.toUpperCase()}</span> {x.message}
                      </div>
                    ))}
                  </div>
                )}

                {/* Forecast row */}
                <div style={{ padding: '10px 12px', display: 'flex', gap: 6, overflowX: 'auto' }}>
                  {w.forecast.slice(0, 5).map((d, i) => (
                    <div key={i} style={{ flex: '1 0 auto', minWidth: 54, textAlign: 'center', border: `1px solid ${T.border}`, padding: '6px 4px', background: T.bgPanel }}>
                      <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: T.textDim }}>{d.dayLabel}</div>
                      <div style={{ fontSize: 16, margin: '2px 0' }}>{d.weatherIcon}</div>
                      <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: T.text, fontWeight: 700 }}>{d.tempMin}°–{d.tempMax}°</div>
                      <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: T.info }}>{d.rainfall}mm</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function titleCaseW(c: string): string { return c.charAt(0) + c.slice(1).toLowerCase(); }

// ── Traffic Tab — News→Route impact (Agents 1 & 2) ───────────────────────────
function TrafficTab() {
  const { intel, loading } = useLiveIntel();
  const [reports, setReports] = useState<TrafficImpact[]>([]);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    let active = true;
    if (loading || intel.length === 0) { setReports([]); return; }
    setAnalyzing(true);
    analyzeTrafficBatch(intel)
      .then(r => { if (active) { setReports(r); setAnalyzing(false); } })
      .catch(() => { if (active) setAnalyzing(false); });
    return () => { active = false; };
  }, [loading, intel]);

  return (
    <div>
      <div style={{ padding: '12px 0', marginBottom: 12, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 16, fontWeight: 700, color: T.text }}>Traffic Impact</div>
        <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: T.textDim, marginTop: 2 }}>
          Auto-analyses protest / VIP / road-event signals → route trajectory · choke points · restrictions
          {analyzing ? ' · analysing routes…' : reports.length ? ` · ${reports.length} event(s)` : ''}
        </div>
      </div>

      {(loading || analyzing) && reports.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: T.textDim }}>
          {loading ? 'Loading signals…' : 'Extracting routes & cross-referencing choke points…'}
        </div>
      )}
      {!loading && !analyzing && reports.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: T.textDim, border: `1px dashed ${T.border}` }}>
          No protest / VIP / road events in the current feed.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {reports.map(r => (
          <div key={r.id} style={{ border: `1px solid ${T.border}`, borderLeft: `4px solid ${T.high}`, background: T.bg, padding: '12px 14px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, fontWeight: 700, color: T.high, letterSpacing: '0.06em' }}>
                {r.eventType.toUpperCase()} · {titleCaseW(r.city)}
              </span>
              <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: r.cityWide ? T.medium : T.textDim }}>
                {r.cityWide ? 'CITYWIDE WATCHLIST' : r.routed ? 'OSRM ROUTE' : r.geocoded ? 'GEO-PROXIMITY' : 'TEXT-MATCH'}
              </span>
            </div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: T.text, fontWeight: 600, lineHeight: 1.4, marginBottom: 8 }}>{r.headline}</div>

            {/* Route trajectory + timing */}
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, color: T.textMid, marginBottom: 8 }}>
              <strong style={{ color: T.text }}>Route:</strong> {r.routeTrajectory}
              {(r.date || r.time || r.duration) && (
                <span style={{ color: T.textDim }}> · {[r.date, r.time, r.duration].filter(Boolean).join(' · ')}</span>
              )}
            </div>

            {/* Intersecting choke points */}
            <Section title={r.cityWide ? 'High-Risk Junctions (citywide)' : 'Intersecting Choke Points'}>
              {r.intersectingChokePoints.length ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {r.intersectingChokePoints.map((c, i) => (
                    <span key={i} title={c.note} style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, background: '#fff7ed', border: `1px solid ${T.high}`, color: T.high, padding: '2px 6px' }}>{c.name}</span>
                  ))}
                </div>
              ) : <Dim>None matched along the corridor.</Dim>}
            </Section>

            {/* Major restrictions */}
            <Section title="Major Restrictions">
              {r.majorRestrictions.length ? (
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {r.majorRestrictions.map((m, i) => (
                    <li key={i} style={{ fontFamily: 'Inter, sans-serif', fontSize: 11.5, color: T.textMid, lineHeight: 1.5 }}>{m}</li>
                  ))}
                </ul>
              ) : <Dim>No specific lane closures identified.</Dim>}
            </Section>

            {/* Congestion prone areas */}
            <Section title="Congestion-Prone Areas">
              {r.congestionProneAreas.length ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {r.congestionProneAreas.map((a, i) => (
                    <span key={i} style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, border: `1px solid ${T.border}`, color: T.textMid, padding: '2px 6px' }}>{a}</span>
                  ))}
                </div>
              ) : <Dim>No adjacent spillover areas flagged.</Dim>}
            </Section>
          </div>
        ))}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: T.textDim, letterSpacing: '0.08em', marginBottom: 4 }}>{title.toUpperCase()}</div>
      {children}
    </div>
  );
}

function Dim({ children }: { children: ReactNode }) {
  return <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: T.textDim }}>{children}</span>;
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Intelligence() {
  const [tab, setTab] = useState<OsintTab>('FEEDS');

  const TABS: { id: OsintTab; label: string }[] = [
    { id: 'FEEDS',    label: 'News Feeds'        },
    { id: 'TWITTER',  label: 'Twitter'           },
    { id: 'WEATHER',  label: 'Weather'           },
    { id: 'TRAFFIC',  label: 'Traffic'           },
    { id: 'PROTESTS', label: 'Protests & Events' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: T.bg }}>
      <div style={{ padding: '16px 28px 0', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 22, fontWeight: 800, color: T.text, marginBottom: 12 }}>ALERTS</div>
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
        {tab === 'TWITTER' && <XPublishFeed />}
        {tab === 'WEATHER' && <WeatherTab />}
        {tab === 'TRAFFIC' && <TrafficTab />}
        {tab === 'PROTESTS' && <ProtestsPanel />}
      </div>
    </div>
  );
}
