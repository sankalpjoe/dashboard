import { useState, useEffect } from 'react';

interface PolymarketPrediction {
  id: string;
  title: string;
  yesPercentage: number;
  noPercentage: number;
  volume: string;
  lastUpdated: string;
  url: string;
  trend: 'up' | 'down' | 'stable';
}

const DEFAULT_PREDICTIONS: PolymarketPrediction[] = [
  {
    id: 'geo-ref-1',
    title: 'Geopolitical markets unavailable — showing reference placeholder',
    yesPercentage: 50,
    noPercentage: 50,
    volume: '—',
    lastUpdated: 'offline',
    url: 'https://polymarket.com/markets/geopolitics',
    trend: 'stable'
  }
];

interface PolymarketPanelProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

const PolymarketPanel = ({ collapsed, onToggle }: PolymarketPanelProps) => {
  const [predictions, setPredictions] = useState<PolymarketPrediction[]>(DEFAULT_PREDICTIONS);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<string>('Just now');
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Tokyo Night Professional theme colors
  const theme = {
    bgDark: '#1a1b26', // Deep Royal Blue / Midnight Navy
    bgPanel: 'rgba(26, 27, 38, 0.95)',
    bgRaised: '#2a2b3a',
    border: 'rgba(207, 201, 194, 0.15)', // Crisp White with low opacity
    borderStrong: 'rgba(207, 201, 194, 0.3)',
    text: '#cfc9c2', // Crisp White
    textBright: '#ffffff',
    textDim: 'rgba(207, 201, 194, 0.6)',
    textMuted: 'rgba(207, 201, 194, 0.4)',
    accentCyan: '#00f0ff',
    accentMagenta: '#ff00ff',
    critical: '#ff5757',
    high: '#ff9933',
    medium: '#ffcc33',
    low: '#7fb069',
    yesGreen: '#00ff88',
    noRed: '#ff3366',
  };

  // ── Real Polymarket data fetching ──────────────────────────────────
  // Geo-political keywords to filter out sports/entertainment/crypto markets
  const GEO_KEYWORDS = [
    'war', 'conflict', 'invasion', 'military', 'strike', 'attack', 'ceasefire',
    'nuclear', 'weapon', 'missile', 'sanctions', 'tariff', 'trade war',
    'coup', 'regime', 'border', 'territory', 'occupation', 'annex',
    'nato', 'united nations', 'security council', 'deterrence',
    'russia', 'ukraine', 'china', 'taiwan', 'iran', 'israel', 'palestine',
    'north korea', 'south china sea', 'middle east', 'gaza', 'west bank',
    'putin', 'zelensky', 'xi', 'trump', 'biden', 'modi', 'netanyahu',
    'geopolitic', 'diplomatic', 'embassy', 'alliance', 'treaty', 'defense',
    'intelligence', 'cyber attack', 'assassination', 'insurgency', 'rebellion',
    'oil price', 'energy crisis', 'grain deal', 'black sea', 'red sea',
    'houthi', 'hezbollah', 'hamas', 'islamic state', 'al-qaeda', 'taliban',
    'election interference', 'coup attempt', 'martial law', 'civil war',
    'refugee', 'humanitarian crisis', 'famine', 'blockade',
  ];

  const fetchPolymarketData = async () => {
    const transformEvents = (data: any[]): PolymarketPrediction[] => {
      // Filter to geopolitical markets only
      const geoFiltered = data.filter((m: any) => {
        const title = (m.title || m.question || '').toLowerCase();
        if (!title) return false;
        // Must match at least one geopolitical keyword
        return GEO_KEYWORDS.some(kw => title.includes(kw));
      });

      return geoFiltered.slice(0, 6).map((m: any) => {
        // Robust YES-price extraction from Gamma API response
        let yesPrice: number | undefined;
        try {
          const markets = Array.isArray(m.markets) ? m.markets : null;
          if (markets && markets.length > 0) {
            // Find the market with both outcomes (Yes/No pair)
            for (const mk of markets) {
              const outcomes = mk.outcomes;
              const pricesStr = mk.outcomePrices;
              if (pricesStr && outcomes) {
                const prices: number[] = typeof pricesStr === 'string'
                  ? JSON.parse(pricesStr).map(parseFloat)
                  : pricesStr;
                // Find the "Yes" outcome — usually first, but verify by name
                const yesIdx = outcomes.findIndex((o: any) =>
                  o.title?.toLowerCase() === 'yes' || o.outcome?.toLowerCase() === 'yes');
                yesPrice = yesIdx >= 0 ? prices[yesIdx] : prices[0];
                break;
              }
            }
            // Fallback: first market's first price
            if (yesPrice === undefined && markets[0]?.outcomePrices) {
              const pts = typeof markets[0].outcomePrices === 'string'
                ? JSON.parse(markets[0].outcomePrices)
                : markets[0].outcomePrices;
              yesPrice = parseFloat(pts[0]);
            }
          }
        } catch { /* ignore parse errors */ }

        const yesPct = yesPrice !== undefined ? Math.round(yesPrice * 1000) / 10 : 50;
        // Clamp to valid range
        const clampedYes = Math.min(100, Math.max(0, yesPct));

        return {
          id: m.id || m.slug || `pm-${Math.random().toString(36).slice(2)}`,
          title: m.title || m.question || m.name || 'Unknown Market',
          yesPercentage: clampedYes,
          noPercentage: Math.round((100 - clampedYes) * 10) / 10,
          volume: typeof m.volume === 'number'
            ? m.volume >= 1_000_000 ? `$${(m.volume / 1_000_000).toFixed(1)}M`
            : m.volume >= 1_000 ? `$${(m.volume / 1_000).toFixed(1)}K`
            : `$${m.volume}`
            : m.volume || '$0',
          lastUpdated: 'Live',
          url: `https://polymarket.com/event/${m.slug || m.id}`,
          trend: clampedYes > 55 ? 'up' : clampedYes < 45 ? 'down' : 'stable',
        };
      });
    };

    try {
      // Fetch active events sorted by volume (no tag filter — we filter client-side)
      const resp = await fetch('/api/polymarket?active=true&limit=30&sort=volume&closed=false', {
        signal: AbortSignal.timeout(12_000),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data) && data.length > 0) {
          const geoEvents = transformEvents(data);
          if (geoEvents.length > 0) {
            setPredictions(geoEvents);
            setFetchError(null);
            return;
          }
        }
      }
    } catch (err) {
      console.warn('[Polymarket] API fetch failed:', err);
    }

    // Fallback — show offline placeholder
    setFetchError('API unavailable — showing reference data');
    setPredictions(DEFAULT_PREDICTIONS);
  };

  // Initial fetch + periodic refresh
  useEffect(() => {
    fetchPolymarketData();
    const interval = setInterval(fetchPolymarketData, 120_000); // every 2 min
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    setIsLoading(true);
    setFetchError(null);
    await fetchPolymarketData();
    setLastRefresh(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    setIsLoading(false);
  };

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up': return '↗';
      case 'down': return '↘';
      case 'stable': return '→';
    }
  };

  const getTrendColor = (trend: 'up' | 'down' | 'stable') => {
    switch (trend) {
      case 'up': return theme.yesGreen;
      case 'down': return theme.noRed;
      case 'stable': return theme.textDim;
    }
  };

  if (collapsed) {
    return (
      <div style={{
        width: '40px',
        background: theme.bgPanel,
        borderRight: `1px solid ${theme.border}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: '14px',
        gap: '14px',
        flexShrink: 0
      }}>
        <button onClick={onToggle} style={{
          background: 'transparent',
          border: 'none',
          color: theme.text,
          cursor: 'pointer',
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: '14px'
        }}>
          ▶
        </button>
        <div style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: '10px',
          color: theme.textDim,
          writingMode: 'vertical-rl',
          letterSpacing: '0.2em',
          marginTop: '8px'
        }}>
          MARKET SENTIMENT
        </div>
      </div>
    );
  }

  return (
    <div style={{
      width: '380px',
      background: theme.bgPanel,
      backdropFilter: 'blur(20px)',
      borderRight: `1px solid ${theme.border}`,
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      height: '100%'
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: `1px solid ${theme.border}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: theme.bgRaised
      }}>
        <div>
          <div style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: '11px',
            letterSpacing: '0.15em',
            color: theme.textBright,
            fontWeight: 600
          }}>
            MARKET SENTIMENT
          </div>
          <div style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: '9px',
            color: theme.textDim,
            letterSpacing: '0.1em',
            marginTop: '2px'
          }}>
            POLYMARKET PREDICTIONS · REAL-TIME
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            style={{
              background: 'transparent',
              border: `1px solid ${theme.border}`,
              color: theme.text,
              padding: '6px 10px',
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '9px',
              fontWeight: 700,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              borderRadius: '2px',
              opacity: isLoading ? 0.6 : 1
            }}
          >
            {isLoading ? '...' : '↻'}
          </button>
          <button onClick={onToggle} style={{
            background: 'transparent',
            border: 'none',
            color: theme.text,
            cursor: 'pointer',
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: '14px'
          }}>
            ◀
          </button>
        </div>
      </div>

      {/* Last Updated */}
      <div style={{
        padding: '8px 16px',
        borderBottom: `1px solid ${theme.border}`,
        background: theme.bgDark,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: '9px',
          color: theme.textDim,
          letterSpacing: '0.1em'
        }}>
          LAST UPDATED: {lastRefresh}
        </div>
        <div style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: '8px',
          color: theme.accentCyan,
          letterSpacing: '0.1em'
        }}>
          LIVE DATA
        </div>
      </div>

      {/* Predictions List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {predictions.map(prediction => (
            <div
              key={prediction.id}
              style={{
                background: theme.bgRaised,
                border: `1px solid ${theme.border}`,
                borderRadius: '4px',
                padding: '14px',
                transition: 'all 0.2s'
              }}
            >
              {/* Title and Trend */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '12px',
                  color: theme.textBright,
                  fontWeight: 600,
                  lineHeight: 1.4,
                  flex: 1
                }}>
                  {prediction.title}
                </div>
                <div style={{
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: '10px',
                  color: getTrendColor(prediction.trend),
                  fontWeight: 700,
                  marginLeft: '8px'
                }}>
                  {getTrendIcon(prediction.trend)}
                </div>
              </div>

              {/* Percentage Bars */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: '10px',
                    color: theme.yesGreen,
                    fontWeight: 700
                  }}>
                    YES: {prediction.yesPercentage.toFixed(1)}%
                  </div>
                  <div style={{
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: '10px',
                    color: theme.noRed,
                    fontWeight: 700
                  }}>
                    NO: {prediction.noPercentage.toFixed(1)}%
                  </div>
                </div>
                <div style={{
                  height: '8px',
                  background: theme.bgDark,
                  borderRadius: '4px',
                  overflow: 'hidden',
                  display: 'flex'
                }}>
                  <div style={{
                    width: `${prediction.yesPercentage}%`,
                    background: theme.yesGreen,
                    transition: 'width 0.5s ease'
                  }} />
                  <div style={{
                    width: `${prediction.noPercentage}%`,
                    background: theme.noRed,
                    transition: 'width 0.5s ease'
                  }} />
                </div>
              </div>

              {/* Stats and Link */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div>
                    <div style={{
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: '8px',
                      color: theme.textDim,
                      letterSpacing: '0.1em',
                      marginBottom: '2px'
                    }}>
                      VOLUME
                    </div>
                    <div style={{
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: '11px',
                      color: theme.textBright,
                      fontWeight: 700
                    }}>
                      {prediction.volume}
                    </div>
                  </div>
                  <div>
                    <div style={{
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: '8px',
                      color: theme.textDim,
                      letterSpacing: '0.1em',
                      marginBottom: '2px'
                    }}>
                      UPDATED
                    </div>
                    <div style={{
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: '10px',
                      color: theme.text
                    }}>
                      {prediction.lastUpdated}
                    </div>
                  </div>
                </div>
                <a
                  href={prediction.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: 'transparent',
                    border: `1px solid ${theme.accentCyan}`,
                    color: theme.accentCyan,
                    padding: '6px 12px',
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: '9px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    borderRadius: '2px',
                    textDecoration: 'none',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = theme.accentCyan;
                    e.currentTarget.style.color = theme.bgDark;
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = theme.accentCyan;
                  }}
                >
                  ↗ TRADE
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: '12px 16px',
        borderTop: `1px solid ${theme.border}`,
        background: theme.bgRaised,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: '9px',
          color: theme.textDim,
          letterSpacing: '0.1em'
        }}>
          SOURCE: {fetchError ? 'REFERENCE DATA (OFFLINE)' : 'POLYMARKET · PREDICTION MARKETS'}
        </div>
        <div style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: '8px',
          color: theme.accentMagenta,
          letterSpacing: '0.1em'
        }}>
          RISK ASSESSMENT: HIGH VOLATILITY
        </div>
      </div>
    </div>
  );
};

export default PolymarketPanel;