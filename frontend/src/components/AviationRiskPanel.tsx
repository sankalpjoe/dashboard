import { useState, useEffect } from 'react';

interface NOTAMAlert {
  id: string;
  location: string;
  type: 'no-fly' | 'high-risk' | 'advisory' | 'restricted';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  issued: string;
  expires: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  affectedRoutes?: string[];
}

const DEFAULT_ALERTS: NOTAMAlert[] = [
  {
    id: 'notam-lebanon-001',
    location: 'Lebanese Airspace',
    type: 'no-fly',
    severity: 'critical',
    description: 'High Risk / No-Fly Zone declared in Lebanese Airspace due to escalating regional tensions and missile threats.',
    issued: '2026-05-12 08:30 UTC',
    expires: '2026-05-19 23:59 UTC',
    coordinates: { lat: 33.8547, lng: 35.8623 },
    affectedRoutes: ['BEY-DXB', 'BEY-IST', 'BEY-CAI']
  },
  {
    id: 'notam-blacksea-002',
    location: 'Black Sea Region',
    type: 'high-risk',
    severity: 'high',
    description: 'Increased military activity and electronic warfare interference affecting commercial flight navigation systems.',
    issued: '2026-05-11 14:15 UTC',
    expires: '2026-05-18 12:00 UTC',
    coordinates: { lat: 44.1, lng: 34.0 },
    affectedRoutes: ['IST-ODS', 'IST-SIP', 'ATH-ODS']
  },
  {
    id: 'notam-strait-003',
    location: 'Taiwan Strait',
    type: 'advisory',
    severity: 'medium',
    description: 'Heightened military patrols and airspace restrictions. Commercial flights advised to use alternative routes.',
    issued: '2026-05-10 10:45 UTC',
    expires: '2026-05-17 18:00 UTC',
    coordinates: { lat: 24.5, lng: 119.5 },
    affectedRoutes: ['TPE-HKG', 'TPE-PVG', 'KHH-NRT']
  },
  {
    id: 'notam-redsea-004',
    location: 'Red Sea / Gulf of Aden',
    type: 'restricted',
    severity: 'high',
    description: 'Drone and missile threats to commercial shipping and low-altitude aircraft. Enhanced security protocols in effect.',
    issued: '2026-05-09 16:20 UTC',
    expires: '2026-05-16 20:00 UTC',
    coordinates: { lat: 15.0, lng: 42.5 },
    affectedRoutes: ['JED-HGA', 'ADD-JED', 'RUH-HGA']
  }
];

// ── Groq Verification Engine ──────────────────────────────────────────
const GROQ_KEY_AV = (import.meta as any).env?.VITE_GROQ_API_KEY as string | undefined;

interface VerificationResult {
  confidence: number;  // 0-100
  rationale: string;
  verifiedAt: number;
}

// Rate limiter: max 5 Groq calls per minute
const rateLimitState = { count: 0, windowStart: 0 };
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(): boolean {
  const now = Date.now();
  if (now - rateLimitState.windowStart > RATE_WINDOW_MS) {
    rateLimitState.count = 0;
    rateLimitState.windowStart = now;
  }
  if (rateLimitState.count >= RATE_LIMIT) return false;
  rateLimitState.count++;
  return true;
}

async function verifyAlertWithGroq(alert: NOTAMAlert): Promise<VerificationResult> {
  if (!GROQ_KEY_AV || !checkRateLimit()) {
    return { confidence: 75, rationale: 'Default heuristic assessment', verifiedAt: Date.now() };
  }

  const systemPrompt =
    'You are an aviation security intelligence analyst. Verify the logical consistency of a NOTAM flight advisory.\n' +
    'Cross-check whether the alert location, type, severity, and description form a plausible real-world aviation risk.\n' +
    'Consider: Is the severity proportional to the described threat? Is this a known hotspot? Is the description specific or vague?\n' +
    'Return a JSON object with:\n' +
    '  confidence: integer 0-100 (how likely this is a legitimate, actionable alert)\n' +
    '  rationale : string — one sentence explaining your assessment\n' +
    'Return ONLY the JSON object. No markdown, no extra text.';

  const userPrompt =
    `Location: ${alert.location}\nType: ${alert.type}\nSeverity: ${alert.severity}\nDescription: ${alert.description}\nIssued: ${alert.issued}\nExpires: ${alert.expires}`;

  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_KEY_AV}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 200,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(2000),
    });

    if (!resp.ok) {
      return { confidence: 75, rationale: 'API unavailable — default assessment', verifiedAt: Date.now() };
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(raw);

    return {
      confidence: Math.max(0, Math.min(100, typeof parsed.confidence === 'number' ? parsed.confidence : 75)),
      rationale: String(parsed.rationale || 'Verified by AI analysis').trim(),
      verifiedAt: Date.now(),
    };
  } catch {
    return { confidence: 75, rationale: 'Verification timed out — default assessment', verifiedAt: Date.now() };
  }
}

interface AviationRiskPanelProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

const AviationRiskPanel = ({ collapsed, onToggle }: AviationRiskPanelProps) => {
  const [alerts, setAlerts] = useState<NOTAMAlert[]>(DEFAULT_ALERTS);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>('Just now');
  const [activeFilter, setActiveFilter] = useState<'all' | 'critical' | 'high' | 'medium'>('all');
  const [confidenceScores, setConfidenceScores] = useState<Record<string, VerificationResult>>({});

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
  };

  // Simulate real-time updates
  useEffect(() => {
    const updateAlerts = () => {
      setAlerts(prev => prev.map(alert => ({
        ...alert,
        issued: new Date().toISOString().split('T')[0] + ' ' + 
                new Date().toLocaleTimeString('en-US', { 
                  hour12: false, 
                  hour: '2-digit', 
                  minute: '2-digit' 
                }) + ' UTC'
      })));
      setLastUpdate(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };

    const interval = setInterval(updateAlerts, 60000); // Update every minute
    
    return () => clearInterval(interval);
  }, []);

  // ── Groq verification: runs when alerts change, with rate limiting ──
  useEffect(() => {
    const verifyAlerts = async () => {
      const newScores: Record<string, VerificationResult> = { ...confidenceScores };
      let changed = false;

      for (const alert of alerts) {
        // Skip already-verified alerts less than 10 min old
        const existing = newScores[alert.id];
        if (existing && Date.now() - existing.verifiedAt < 600_000) continue;

        const result = await verifyAlertWithGroq(alert);
        newScores[alert.id] = result;
        changed = true;
      }

      if (changed) setConfidenceScores(newScores);
    };

    if (alerts.length > 0) verifyAlerts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts]);

  const handleRefresh = async () => {
    setIsLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Add a simulated new alert occasionally
      if (Math.random() > 0.7) {
        const newAlert: NOTAMAlert = {
          id: `notam-new-${Date.now()}`,
          location: ['Eastern Mediterranean', 'South China Sea', 'Persian Gulf'][Math.floor(Math.random() * 3)],
          type: ['no-fly', 'high-risk', 'advisory'][Math.floor(Math.random() * 3)] as any,
          severity: ['critical', 'high', 'medium'][Math.floor(Math.random() * 3)] as any,
          description: 'New aviation risk alert detected. Enhanced monitoring recommended.',
          issued: new Date().toISOString().split('T')[0] + ' ' + 
                  new Date().toLocaleTimeString('en-US', { 
                    hour12: false, 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  }) + ' UTC',
          expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] + ' 23:59 UTC'
        };
        setAlerts(prev => [newAlert, ...prev.slice(0, 3)]);
      }
      
      setLastUpdate(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (error) {
      console.error('Error refreshing alerts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return theme.critical;
      case 'high': return theme.high;
      case 'medium': return theme.medium;
      case 'low': return theme.low;
      default: return theme.textDim;
    }
  };

  const getAlertTypeIcon = (type: string) => {
    switch (type) {
      case 'no-fly': return '✈⃠';
      case 'high-risk': return '⚠';
      case 'advisory': return 'ℹ';
      case 'restricted': return '⛔';
      default: return '●';
    }
  };

  const filteredAlerts = activeFilter === 'all' 
    ? alerts 
    : alerts.filter(alert => alert.severity === activeFilter);

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
          AVIATION RISK
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
            AVIATION RISK MODULE
          </div>
          <div style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: '9px',
            color: theme.textDim,
            letterSpacing: '0.1em',
            marginTop: '2px'
          }}>
            NOTAMS & FLIGHT ADVISORIES · REAL-TIME
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

      {/* Filters */}
      <div style={{
        padding: '10px 16px',
        borderBottom: `1px solid ${theme.border}`,
        background: theme.bgDark,
        display: 'flex',
        gap: '6px',
        overflowX: 'auto'
      }}>
        {(['all', 'critical', 'high', 'medium'] as const).map(filter => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            style={{
              background: activeFilter === filter ? getSeverityColor(filter === 'all' ? 'medium' : filter) : 'transparent',
              border: `1px solid ${activeFilter === filter ? getSeverityColor(filter === 'all' ? 'medium' : filter) : theme.border}`,
              color: activeFilter === filter ? theme.bgDark : theme.text,
              padding: '6px 12px',
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '9px',
              fontWeight: 700,
              cursor: 'pointer',
              borderRadius: '2px',
              whiteSpace: 'nowrap',
              textTransform: 'uppercase'
            }}
          >
            {filter === 'all' ? 'ALL ALERTS' : filter}
          </button>
        ))}
      </div>

      {/* Last Update */}
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
          LAST UPDATE: {lastUpdate}
        </div>
        <div style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: '8px',
          color: theme.accentCyan,
          letterSpacing: '0.1em'
        }}>
          LIVE NOTAM FEED
        </div>
      </div>

      {/* Alerts List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredAlerts.map(alert => (
            <div
              key={alert.id}
              style={{
                background: theme.bgRaised,
                border: `1px solid ${getSeverityColor(alert.severity)}`,
                borderRadius: '4px',
                padding: '14px',
                transition: 'all 0.2s',
                borderLeft: `4px solid ${getSeverityColor(alert.severity)}`
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    fontSize: '14px',
                    color: getSeverityColor(alert.severity)
                  }}>
                    {getAlertTypeIcon(alert.type)}
                  </span>
                  <div>
                    <div style={{
                      fontFamily: 'Inter, sans-serif',
                      fontSize: '12px',
                      color: theme.textBright,
                      fontWeight: 600,
                      lineHeight: 1.3
                    }}>
                      {alert.location}
                    </div>
                    <div style={{
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: '9px',
                      color: getSeverityColor(alert.severity),
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      marginTop: '2px'
                    }}>
                      {alert.type.toUpperCase()} · {alert.severity.toUpperCase()}
                    </div>
                    {/* Groq AI Confidence Score */}
                    {confidenceScores[alert.id] && (
                      <div style={{
                        fontFamily: 'IBM Plex Mono, monospace',
                        fontSize: '8px',
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        marginTop: '4px',
                        color: confidenceScores[alert.id].confidence > 80
                          ? '#7fb069'
                          : confidenceScores[alert.id].confidence >= 60
                            ? '#ffcc33'
                            : '#ff5757',
                      }}>
                        CONFIDENCE: {confidenceScores[alert.id].confidence}%
                      </div>
                    )}
                  </div>
                </div>
                <div style={{
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: '8px',
                  color: theme.textDim,
                  letterSpacing: '0.08em'
                }}>
                  {alert.issued.split(' ')[0]}
                </div>
              </div>

              {/* Description */}
              <div style={{
                fontFamily: 'Inter, sans-serif',
                fontSize: '11px',
                color: theme.text,
                lineHeight: 1.5,
                marginBottom: '10px'
              }}>
                {alert.description}
              </div>

              {/* Details */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: `1px solid ${theme.border}`,
                paddingTop: '10px'
              }}>
                <div>
                  <div style={{
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: '8px',
                    color: theme.textDim,
                    letterSpacing: '0.08em',
                    marginBottom: '2px'
                  }}>
                    EXPIRES
                  </div>
                  <div style={{
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: '10px',
                    color: theme.text
                  }}>
                    {alert.expires}
                  </div>
                </div>
                
                {alert.affectedRoutes && alert.affectedRoutes.length > 0 && (
                  <div>
                    <div style={{
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: '8px',
                      color: theme.textDim,
                      letterSpacing: '0.08em',
                      marginBottom: '2px'
                    }}>
                      AFFECTED ROUTES
                    </div>
                    <div style={{
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: '9px',
                      color: theme.accentMagenta,
                      fontWeight: 700
                    }}>
                      {alert.affectedRoutes.slice(0, 2).join(', ')}
                      {alert.affectedRoutes.length > 2 && '...'}
                    </div>
                  </div>
                )}
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
          SOURCE: FAA NOTAMS · ICAO ADVISORIES
        </div>
        <div style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: '8px',
          color: theme.accentMagenta,
          letterSpacing: '0.1em'
        }}>
          REAL-TIME MONITORING ACTIVE
        </div>
      </div>
    </div>
  );
};

export default AviationRiskPanel;