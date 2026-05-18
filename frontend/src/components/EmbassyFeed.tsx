import { useState, useEffect } from 'react';

// ── Types ──────────────────────────────────────────────────────────────
interface EmbassyPost {
  id: string;
  embassy: string;
  country: string;
  flag: string;
  handle: string;
  content: string;
  timestamp: string;
  url?: string;
  source: 'twitter' | 'rss';
  color: string;
}

// ── Language Detection & Translation ───────────────────────────────────
function isNonEnglish(text: string): boolean {
  // Detect CJK (Chinese/Japanese), Cyrillic (Russian), Devanagari, Arabic, etc.
  return /[\u4e00-\u9fff\u3400-\u4dbf\u0400-\u04ff\u0900-\u097f\u0600-\u06ff\u0c80-\u0cff]/.test(text);
}

async function translateViaGoogle(text: string): Promise<string | null> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return null;
    const data = await resp.json();
    // Extract translated segments from response
    const translated = (data[0] as any[]).map((seg: any) => seg[0]).join('');
    return translated || null;
  } catch {
    return null;
  }
}

interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

// ── Embassy X/Twitter Handles ──────────────────────────────────────────
const EMBASSIES: { country: string; flag: string; handle: string; color: string }[] = [
  { country: 'United States', flag: '🇺🇸', handle: 'USAndIndia', color: '#3b82f6' },
  { country: 'United Kingdom', flag: '🇬🇧', handle: 'UKinIndia', color: '#ef4444' },
  { country: 'France', flag: '🇫🇷', handle: 'FranceInIndia', color: '#2563eb' },
  { country: 'Germany', flag: '🇩🇪', handle: 'GermanyInIndia', color: '#f59e0b' },
  { country: 'European Union', flag: '🇪🇺', handle: 'EU_in_India', color: '#6366f1' },
  { country: 'Russia', flag: '🇷🇺', handle: 'RusEmbIndia', color: '#dc2626' },
  { country: 'China', flag: '🇨🇳', handle: 'ChinaEmbInIndia', color: '#ef4444' },
];

// ── RSS Feeds ──────────────────────────────────────────────────────────
const RSS_FEEDS: { source: string; flag: string; color: string; url: string }[] = [
  {
    source: 'PIB India',
    flag: '🇮🇳',
    color: '#f97316',
    url: '/api/rss-proxy?url=' + encodeURIComponent('https://pib.gov.in/rss'),
  },
  {
    source: 'MEA India',
    flag: '🇮🇳',
    color: '#14b8a6',
    url: '/api/rss-proxy?url=' + encodeURIComponent('https://www.mea.gov.in/rss'),
  },
];

// ── Tokyo Night Theme ──────────────────────────────────────────────────
const T = {
  bgDark: '#1a1b26',
  bgPanel: 'rgba(26, 27, 38, 0.95)',
  bgRaised: '#2a2b3a',
  border: 'rgba(207, 201, 194, 0.15)',
  borderStrong: 'rgba(207, 201, 194, 0.3)',
  text: '#cfc9c2',
  textBright: '#ffffff',
  textDim: 'rgba(207, 201, 194, 0.6)',
  textMuted: 'rgba(207, 201, 194, 0.4)',
  accentCyan: '#00f0ff',
  accentMagenta: '#ff00ff',
  critical: '#ff5757',
  high: '#ff9933',
  medium: '#ffcc33',
  low: '#7fb069',
};

// ── Demo / placeholder posts for embassies (X API requires paid tier) ──
const DEMO_EMBASSY_POSTS: EmbassyPost[] = [
  {
    id: 'us-001',
    embassy: 'U.S. Embassy India',
    country: 'United States',
    flag: '🇺🇸',
    handle: '@USAndIndia',
    content: 'Security Alert: U.S. Embassy New Delhi advises all U.S. citizens to exercise increased caution due to potential large-scale demonstrations in the Delhi NCR region this weekend. Monitor local media and avoid areas with large gatherings.',
    timestamp: '2h ago',
    url: 'https://x.com/USAndIndia',
    source: 'twitter',
    color: '#3b82f6',
  },
  {
    id: 'uk-001',
    embassy: 'UK in India',
    country: 'United Kingdom',
    flag: '🇬🇧',
    handle: '@UKinIndia',
    content: 'Travel Advisory Update: UK visitors to India should remain aware of heightened security measures at major transport hubs. The FCDO advises checking travel insurance coverage and registering with the British High Commission upon arrival.',
    timestamp: '4h ago',
    url: 'https://x.com/UKinIndia',
    source: 'twitter',
    color: '#ef4444',
  },
  {
    id: 'fr-001',
    embassy: 'French Embassy India',
    country: 'France',
    flag: '🇫🇷',
    handle: '@FranceInIndia',
    content: 'Avis aux ressortissants français: Le ministère de l\'Europe et des Affaires étrangères recommande la vigilance renforcée dans les zones frontalières du nord de l\'Inde. Consultez la section Conseils aux voyageurs sur le site du MEAE.',
    timestamp: '6h ago',
    url: 'https://x.com/FranceInIndia',
    source: 'twitter',
    color: '#2563eb',
  },
  {
    id: 'de-001',
    embassy: 'German Embassy India',
    country: 'Germany',
    flag: '🇩🇪',
    handle: '@GermanyInIndia',
    content: 'Sicherheitshinweis: Das Auswärtige Amt rät deutschen Staatsangehörigen in Indien, aktuelle Reise- und Sicherheitshinweise zu beachten. Registrieren Sie sich in der Krisenvorsorgeliste ELEFAND.',
    timestamp: '8h ago',
    url: 'https://x.com/GermanyInIndia',
    source: 'twitter',
    color: '#f59e0b',
  },
  {
    id: 'eu-001',
    embassy: 'EU Delegation India',
    country: 'European Union',
    flag: '🇪🇺',
    handle: '@EU_in_India',
    content: 'The EU Delegation to India announces enhanced cooperation on counter-terrorism intelligence sharing under the EU-India Strategic Partnership. Joint working group to convene in Brussels next month.',
    timestamp: '12h ago',
    url: 'https://x.com/EU_in_India',
    source: 'twitter',
    color: '#6366f1',
  },
  {
    id: 'ru-001',
    embassy: 'Russian Embassy India',
    country: 'Russia',
    flag: '🇷🇺',
    handle: '@RusEmbIndia',
    content: 'Посольство России в Индии информирует: Вниманию российских граждан, находящихся в Индии — рекомендуется следить за обновлениями на официальном сайте Посольства и в социальных сетях.',
    timestamp: '1d ago',
    url: 'https://x.com/RusEmbIndia',
    source: 'twitter',
    color: '#dc2626',
  },
  {
    id: 'cn-001',
    embassy: 'Chinese Embassy India',
    country: 'China',
    flag: '🇨🇳',
    handle: '@ChinaEmbInIndia',
    content: '中国驻印度使馆提醒在印中国公民：请密切关注当地安全形势，避免前往人员密集场所。如遇紧急情况，请及时联系使馆领事保护热线。',
    timestamp: '1d ago',
    url: 'https://x.com/ChinaEmbInIndia',
    source: 'twitter',
    color: '#ef4444',
  },
];

// ── Component ──────────────────────────────────────────────────────────
const EmbassyFeed = () => {
  const [posts, setPosts] = useState<EmbassyPost[]>(DEMO_EMBASSY_POSTS);
  const [rssItems, setRssItems] = useState<EmbassyPost[]>([]);
  const [isLoadingRss, setIsLoadingRss] = useState(true);
  const [showTwitter, setShowTwitter] = useState(true);
  const [showRss, setShowRss] = useState(true);
  const [translations, setTranslations] = useState<Record<string, string>>({});

  // Auto-translate non-English posts
  useEffect(() => {
    const translatePosts = async () => {
      const newTranslations: Record<string, string> = {};
      const allContent = [...posts, ...rssItems];
      
      for (const post of allContent) {
        if (translations[post.id]) continue; // already translated
        if (!isNonEnglish(post.content)) continue; // skip English
        
        const translated = await translateViaGoogle(post.content);
        if (translated) {
          newTranslations[post.id] = translated;
        }
      }
      
      if (Object.keys(newTranslations).length > 0) {
        setTranslations(prev => ({ ...prev, ...newTranslations }));
      }
    };
    
    if (posts.length > 0 || rssItems.length > 0) {
      translatePosts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, rssItems]);

  // Fetch RSS feeds (PIB + MEA)
  useEffect(() => {
    const fetchRss = async () => {
      setIsLoadingRss(true);
      const results: EmbassyPost[] = [];

      for (const feed of RSS_FEEDS) {
        try {
          const resp = await fetch(feed.url, { signal: AbortSignal.timeout(10_000) });
          const xml = await resp.text();
          if (!xml || xml.includes('Error')) continue;

          const parser = new DOMParser();
          const doc = parser.parseFromString(xml, 'text/xml');
          const items = doc.querySelectorAll('item');

          let count = 0;
          items.forEach(el => {
            if (count >= 5) return;
            const title = el.querySelector('title')?.textContent?.trim() ?? '';
            const link = el.querySelector('link')?.textContent?.trim() ?? '';
            const pubDate = el.querySelector('pubDate')?.textContent?.trim() ?? '';
            if (!title) return;

            results.push({
              id: `rss-${feed.source}-${count}`,
              embassy: feed.source,
              country: 'India',
              flag: feed.flag,
              handle: feed.source === 'PIB India' ? '@PIB_India' : '@MEAIndia',
              content: title,
              timestamp: pubDate ? getRelativeRssTime(pubDate) : 'recent',
              url: link || undefined,
              source: 'rss' as const,
              color: feed.color,
            });
            count++;
          });
        } catch {
          // RSS feed unavailable — skip silently
        }
      }

      if (results.length > 0) setRssItems(results);
      setIsLoadingRss(false);
    };

    fetchRss();
    // Refresh RSS every 15 minutes
    const interval = setInterval(fetchRss, 15 * 60_000);
    return () => clearInterval(interval);
  }, []);

  const allPosts = [
    ...(showTwitter ? posts : []),
    ...(showRss ? rssItems : []),
  ].sort(() => Math.random() - 0.5); // interleave for variety

  return (
    <div style={{
      width: '100%',
      background: T.bgDark,
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px',
        borderBottom: `1px solid ${T.border}`,
        background: T.bgRaised,
      }}>
        <div style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: '11px',
          letterSpacing: '0.15em',
          color: T.textBright,
          fontWeight: 600,
          marginBottom: '4px',
        }}>
          GLOBAL EMBASSY ADVISORIES
        </div>
        <div style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: '9px',
          color: T.textDim,
          letterSpacing: '0.1em',
        }}>
          OFFICIAL BULLETINS · TRAVEL ADVISORIES · SECURITY ALERTS
        </div>
      </div>

      {/* Source Toggles */}
      <div style={{
        padding: '10px 18px',
        borderBottom: `1px solid ${T.border}`,
        background: T.bgDark,
        display: 'flex',
        gap: '8px',
        flexWrap: 'wrap',
      }}>
        <ToggleButton
          active={showTwitter}
          onClick={() => setShowTwitter(v => !v)}
          label="EMBASSY X/TWITTER"
          color="#1d9bf0"
        />
        <ToggleButton
          active={showRss}
          onClick={() => setShowRss(v => !v)}
          label="PIB · MEA RSS"
          color={T.accentCyan}
        />
      </div>

      {/* Posts Feed */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '14px 18px',
      }}>
        {isLoadingRss && rssItems.length === 0 && (
          <div style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: '9px',
            color: T.textDim,
            textAlign: 'center',
            padding: '20px 0',
            letterSpacing: '0.1em',
          }}>
            FETCHING OFFICIAL FEEDS...
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {allPosts.map(post => (
            <div
              key={post.id}
              style={{
                background: T.bgRaised,
                border: `1px solid ${T.border}`,
                borderLeft: `4px solid ${post.color}`,
                borderRadius: '4px',
                padding: '12px',
                transition: 'all 0.2s',
              }}
            >
              {/* Source Header */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '16px' }}>{post.flag}</span>
                  <div>
                    <div style={{
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: '10px',
                      color: T.textBright,
                      fontWeight: 600,
                      letterSpacing: '0.06em',
                    }}>
                      {post.embassy}
                    </div>
                    <div style={{
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: '8px',
                      color: post.color,
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      marginTop: '1px',
                    }}>
                      {post.handle} · {post.source === 'twitter' ? 'X/TWITTER' : 'RSS'}
                    </div>
                  </div>
                </div>
                <span style={{
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: '8px',
                  color: T.textDim,
                  letterSpacing: '0.06em',
                }}>
                  {post.timestamp}
                </span>
              </div>

              {/* Content */}
              <div style={{
                fontFamily: 'Inter, sans-serif',
                fontSize: '11px',
                color: T.text,
                lineHeight: 1.6,
              }}>
                {post.content}
              </div>

              {/* Google Translate for non-English posts */}
              {isNonEnglish(post.content) && translations[post.id] && (
                <div style={{
                  marginTop: '6px',
                  padding: '8px 10px',
                  background: 'rgba(0,240,255,0.06)',
                  borderLeft: '2px solid #00f0ff',
                  borderRadius: '2px',
                }}>
                  <div style={{
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: '7px',
                    color: T.accentCyan,
                    letterSpacing: '0.08em',
                    marginBottom: '3px',
                    fontWeight: 700,
                  }}>
                    ⚡ GOOGLE TRANSLATE · ENGLISH
                  </div>
                  <div style={{
                    fontFamily: 'Inter, sans-serif',
                    fontSize: '11px',
                    color: 'rgba(207,201,194,0.85)',
                    lineHeight: 1.6,
                  }}>
                    {translations[post.id]}
                  </div>
                </div>
              )}
              {isNonEnglish(post.content) && !translations[post.id] && (
                <div style={{
                  marginTop: '4px',
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: '7px',
                  color: T.textMuted,
                  letterSpacing: '0.06em',
                  fontStyle: 'italic',
                }}>
                  translating...
                </div>
              )}

              {/* Open Link */}
              {post.url && (
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-block',
                    marginTop: '8px',
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: '8px',
                    color: T.accentCyan,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textDecoration: 'none',
                    borderBottom: `1px solid transparent`,
                    transition: 'border-color 0.2s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderBottomColor = T.accentCyan)}
                  onMouseLeave={e => (e.currentTarget.style.borderBottomColor = 'transparent')}
                >
                  {post.source === 'twitter' ? 'OPEN ON X →' : 'READ FULL BULLETIN →'}
                </a>
              )}
            </div>
          ))}
        </div>

        {allPosts.length === 0 && !isLoadingRss && (
          <div style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: '9px',
            color: T.textMuted,
            textAlign: 'center',
            padding: '30px 0',
            letterSpacing: '0.1em',
            border: `1px dashed ${T.border}`,
          }}>
            NO ADVISORIES AVAILABLE — ENABLE A SOURCE ABOVE
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '10px 18px',
        borderTop: `1px solid ${T.border}`,
        background: T.bgRaised,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: '8px',
          color: T.textDim,
          letterSpacing: '0.08em',
        }}>
          SOURCES: X/TWITTER · PIB.GOV.IN · MEA.GOV.IN
        </div>
        <div style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: '8px',
          color: T.low,
          letterSpacing: '0.08em',
        }}>
          ● LIVE MONITORING
        </div>
      </div>
    </div>
  );
};

// ── Toggle Button ──────────────────────────────────────────────────────
function ToggleButton({ active, onClick, label, color }: {
  active: boolean;
  onClick: () => void;
  label: string;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? `${color}20` : 'transparent',
        border: `1px solid ${active ? color : T.border}`,
        color: active ? color : T.textDim,
        padding: '5px 10px',
        fontFamily: 'IBM Plex Mono, monospace',
        fontSize: '8px',
        fontWeight: 700,
        cursor: 'pointer',
        borderRadius: '2px',
        letterSpacing: '0.06em',
        transition: 'all 0.15s',
      }}
    >
      {active ? '● ' : '○ '}{label}
    </button>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────
function getRelativeRssTime(pubDate: string): string {
  try {
    const diff = Date.now() - new Date(pubDate).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  } catch {
    return 'recent';
  }
}

export default EmbassyFeed;
