import { useState, useEffect } from "react";

const NAV_ITEMS = [
  { id: 'INTEL', label: 'Intel Brief' },
  { id: 'OSINT', label: 'OSINT'       },
] as const;

const NavBar = ({
  activeTab,
  setActiveTab,
}: {
  activeTab: string;
  setActiveTab: (t: string) => void;
}) => {
  const [time, setTime] = useState({ ist: '--:--:--', zulu: '--:--:--Z' });

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime({
        ist: now.toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        }),
        zulu: now.toISOString().slice(11, 19) + 'Z',
      });
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{
      height: 'var(--nav-h)',
      background: 'rgba(255,255,255,0.92)',
      backdropFilter: 'blur(8px)',
      borderBottom: '1px solid #e7e7e4',
      boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 20px',
      flexShrink: 0,
      zIndex: 10,
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 14, fontWeight: 700, color: '#000', letterSpacing: '0.06em' }}>
          DASHINT
        </span>
        <div style={{ width: 1, height: 20, background: '#e5e5e5', margin: '0 6px' }} />
        <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: '#666', letterSpacing: '0.08em' }}>
          INDIA CRISIS MONITOR
        </span>
      </div>

      {/* Nav tabs */}
      <div style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>
        {NAV_ITEMS.map(({ id, label }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{
                border: 'none',
                borderBottom: isActive ? '2px solid #000' : '2px solid transparent',
                background: 'transparent',
                color: isActive ? '#000' : '#444',
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: 11,
                fontWeight: isActive ? 700 : 400,
                letterSpacing: '0.10em',
                cursor: 'pointer',
                padding: '0 20px',
                transition: 'color 0.12s',
                whiteSpace: 'nowrap',
              }}
            >
              {label.toUpperCase()}
            </button>
          );
        })}
      </div>

      {/* Right: live + clock */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className="pulse-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }} />
          <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9, color: '#16a34a', letterSpacing: '0.12em' }}>LIVE</span>
        </div>
        <div style={{ width: 1, height: 20, background: '#e5e5e5' }} />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: '#000', letterSpacing: '0.06em' }}>{time.zulu}</div>
          <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 8, color: '#666', letterSpacing: '0.08em' }}>{time.ist} IST</div>
        </div>
      </div>
    </div>
  );
};

export default NavBar;
