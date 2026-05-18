import { useState, useEffect, useRef } from 'react';

interface YouTubeChannel {
  id: string;
  name: string;
  youtubeId: string;
  liveStreamId?: string;
  isLive: boolean;
}

const DEFAULT_CHANNELS: YouTubeChannel[] = [
  {
    id: 'bloomberg',
    name: 'Bloomberg',
    youtubeId: 'iEpJwprxDdk',
    liveStreamId: 'iEpJwprxDdk',
    isLive: true
  },
  {
    id: 'cnbc',
    name: 'CNBC',
    youtubeId: 'US5h-vGrkNk',
    liveStreamId: 'US5h-vGrkNk',
    isLive: true
  },
  {
    id: 'cnn',
    name: 'CNN',
    youtubeId: 'm36jK9yGFoU',
    liveStreamId: 'm36jK9yGFoU',
    isLive: true
  },
  {
    id: 'bbc',
    name: 'BBC News',
    youtubeId: 'lzRMElMrvC0',
    liveStreamId: 'lzRMElMrvC0',
    isLive: true
  },
  {
    id: 'aljazeera',
    name: 'Al Jazeera',
    youtubeId: 'gCNeDWCI0vo',
    liveStreamId: 'gCNeDWCI0vo',
    isLive: true
  }
];

interface LiveNewsPanelProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

const LiveNewsPanel = ({ collapsed, onToggle }: LiveNewsPanelProps) => {
  const [channels, setChannels] = useState<YouTubeChannel[]>(DEFAULT_CHANNELS);
  const [activeChannel, setActiveChannel] = useState<YouTubeChannel>(DEFAULT_CHANNELS[0]);
  const [isMuted, setIsMuted] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

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

  // Check if channels are live (simulated - in production would call YouTube API)
  useEffect(() => {
    const checkLiveStatus = async () => {
      setIsLoading(true);
      try {
        // Simulate API call to check live status
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Update channels with simulated live status
        const updatedChannels = channels.map(channel => ({
          ...channel,
          isLive: Math.random() > 0.3, // 70% chance of being "live"
          liveStreamId: Math.random() > 0.3 ? `live_${channel.id}_${Date.now()}` : undefined
        }));
        
        setChannels(updatedChannels);
        
        // Update active channel if it exists in updated channels
        const currentActive = updatedChannels.find(c => c.id === activeChannel.id);
        if (currentActive) {
          setActiveChannel(currentActive);
        }
        
        setError(null);
      } catch (err) {
        setError('Failed to check live status');
        console.error('Error checking live status:', err);
      } finally {
        setIsLoading(false);
      }
    };

    checkLiveStatus();
    const interval = setInterval(checkLiveStatus, 30000); // Check every 30 seconds
    
    return () => clearInterval(interval);
  }, []);

  const handleChannelSelect = (channel: YouTubeChannel) => {
    setActiveChannel(channel);
    setError(null);
  };

  const handleMuteToggle = () => {
    setIsMuted(!isMuted);
    if (iframeRef.current) {
      // In a real implementation, you would use YouTube IFrame API to control mute
      console.log('Mute toggled:', !isMuted);
    }
  };

  const getYouTubeEmbedUrl = (channel: YouTubeChannel) => {
    if (channel.liveStreamId) {
      return `https://www.youtube.com/embed/${channel.liveStreamId}?autoplay=1&mute=${isMuted ? 1 : 0}&rel=0&modestbranding=1`;
    }
    // Fallback to direct video embed
    return `https://www.youtube.com/embed/${channel.youtubeId}?autoplay=1&mute=${isMuted ? 1 : 0}&rel=0&modestbranding=1`;
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
          LIVE NEWS
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
            LIVE NEWS FEED
          </div>
          <div style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: '9px',
            color: theme.textDim,
            letterSpacing: '0.1em',
            marginTop: '2px'
          }}>
            EMBEDDED YOUTUBE STREAMS
          </div>
        </div>
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

      {/* Channel Switcher */}
      <div style={{
        padding: '10px 16px',
        borderBottom: `1px solid ${theme.border}`,
        background: theme.bgRaised,
        display: 'flex',
        gap: '8px',
        overflowX: 'auto'
      }}>
        {channels.map(channel => (
          <button
            key={channel.id}
            onClick={() => handleChannelSelect(channel)}
            style={{
              background: activeChannel.id === channel.id ? theme.accentCyan : 'transparent',
              border: `1px solid ${activeChannel.id === channel.id ? theme.accentCyan : theme.border}`,
              color: activeChannel.id === channel.id ? theme.bgDark : theme.text,
              padding: '6px 12px',
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '9px',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              borderRadius: '2px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span style={{
              color: channel.isLive ? theme.critical : theme.textDim,
              fontSize: '8px'
            }}>
              ●
            </span>
            {channel.name}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {isLoading ? (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              border: `2px solid ${theme.accentCyan}`,
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
            <div style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '10px',
              color: theme.textDim,
              letterSpacing: '0.1em'
            }}>
              ACQUIRING LIVE STREAM...
            </div>
          </div>
        ) : error ? (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: '12px',
            padding: '20px'
          }}>
            <div style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '12px',
              color: theme.critical,
              letterSpacing: '0.1em'
            }}>
              ⚠ {error}
            </div>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: theme.bgRaised,
                border: `1px solid ${theme.border}`,
                color: theme.text,
                padding: '8px 16px',
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: '10px',
                fontWeight: 700,
                cursor: 'pointer',
                borderRadius: '2px'
              }}
            >
              RETRY CONNECTION
            </button>
          </div>
        ) : (
          <>
            {/* YouTube Embed */}
            <div style={{
              position: 'relative',
              paddingTop: '56.25%', // 16:9 aspect ratio
              background: theme.bgDark
            }}>
              <iframe
                ref={iframeRef}
                src={getYouTubeEmbedUrl(activeChannel)}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  border: 'none'
                }}
                title={`${activeChannel.name} Live Stream`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>

            {/* Controls */}
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
                fontSize: '10px',
                color: theme.text,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{
                  color: activeChannel.isLive ? theme.accentCyan : theme.textDim,
                  fontSize: '8px'
                }}>
                  ●
                </span>
                {activeChannel.isLive ? 'LIVE NOW' : 'OFFLINE / SCHEDULED'}
              </div>
              
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleMuteToggle}
                  style={{
                    background: isMuted ? theme.bgRaised : theme.accentMagenta,
                    border: `1px solid ${isMuted ? theme.border : theme.accentMagenta}`,
                    color: isMuted ? theme.textDim : theme.bgDark,
                    padding: '6px 12px',
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: '9px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    borderRadius: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {isMuted ? '🔇 MUTED' : '🔊 LIVE AUDIO'}
                </button>
                
                <a
                  href={`https://www.youtube.com/channel/${activeChannel.youtubeId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: 'transparent',
                    border: `1px solid ${theme.border}`,
                    color: theme.text,
                    padding: '6px 12px',
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: '9px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    borderRadius: '2px',
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  ↗ YOUTUBE CHANNEL
                </a>
              </div>
            </div>

            {/* Channel Info */}
            <div style={{
              padding: '16px',
              borderTop: `1px solid ${theme.border}`,
              background: theme.bgPanel
            }}>
              <div style={{
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: '10px',
                color: theme.textDim,
                letterSpacing: '0.1em',
                marginBottom: '8px'
              }}>
                ACTIVE CHANNEL
              </div>
              <div style={{
                fontFamily: 'Inter, sans-serif',
                fontSize: '13px',
                color: theme.textBright,
                fontWeight: 600,
                marginBottom: '4px'
              }}>
                {activeChannel.name}
              </div>
              <div style={{
                fontFamily: 'Inter, sans-serif',
                fontSize: '11px',
                color: theme.text,
                lineHeight: 1.5
              }}>
                {activeChannel.isLive 
                  ? 'Live broadcast in progress. Real-time financial news, market analysis, and breaking news coverage.'
                  : 'Channel is currently offline. Scheduled broadcasts appear here when live.'}
              </div>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default LiveNewsPanel;