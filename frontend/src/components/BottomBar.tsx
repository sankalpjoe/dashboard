import { useState, useEffect, useRef, useMemo } from "react";
import { useTrackingStatus } from "@/hooks/useTracking";

interface CounterProps {
  target: number;
  label: string;
  alert?: boolean;
}

const AnimatedCounter = ({ target, label, alert }: CounterProps) => {
  const [count, setCount] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval>>();
  const prevTarget = useRef(target);

  useEffect(() => {
    const step = Math.ceil(Math.max(Math.abs(target - prevTarget.current), 1) / 15);
    let current = prevTarget.current;
    clearInterval(ref.current);
    ref.current = setInterval(() => {
      if (current < target) {
        current = Math.min(current + step, target);
      } else if (current > target) {
        current = Math.max(current - step, target);
      } else {
        clearInterval(ref.current);
      }
      setCount(current);
    }, 30);
    prevTarget.current = target;
    return () => clearInterval(ref.current);
  }, [target]);

  return (
    <div className="flex items-center gap-1.5 px-4">
      <span className={`font-mono text-sm font-bold ${alert && target > 0 ? "text-red-400" : "text-cyan-400"}`}>
        {count}
      </span>
      <span className="mono-label text-text-light">{label}</span>
    </div>
  );
};

// Simulated but realistic-looking system stats that slowly drift
function useSysStats() {
  const base = useRef({ cpu: 23, mem: 4.2, netUp: 12, netDown: 840 });
  const [stats, setStats] = useState(base.current);
  useEffect(() => {
    const id = setInterval(() => {
      setStats(prev => ({
        cpu: Math.max(8, Math.min(72, prev.cpu + (Math.random() - 0.48) * 3)),
        mem: Math.max(3.8, Math.min(7.2, prev.mem + (Math.random() - 0.5) * 0.05)),
        netUp: Math.max(4, Math.min(48, prev.netUp + (Math.random() - 0.5) * 4)),
        netDown: Math.max(200, Math.min(2400, prev.netDown + (Math.random() - 0.5) * 80)),
      }));
    }, 2500);
    return () => clearInterval(id);
  }, []);
  return stats;
}

const BottomBar = () => {
  const { civFlights, milAssets, ships, alerts, dark } = useTrackingStatus();
  const [lastUpdate, setLastUpdate] = useState("--");
  const sys = useSysStats();
  const totalSignals = useMemo(
    () => civFlights + milAssets + ships + dark,
    [civFlights, milAssets, ships, dark]
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdate(new Date().toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="w-full bg-bg-mid border-t border-border-light flex items-center justify-between"
      style={{ height: "var(--bottom-h)", fontFamily: "var(--font-mono)" }}
    >
      {/* Left — asset counters */}
      <div className="flex items-center divide-x divide-border-light">
        <AnimatedCounter target={civFlights} label="CIV FLIGHTS" />
        <AnimatedCounter target={milAssets} label="MIL ASSETS" />
        <AnimatedCounter target={ships} label="SHIPS" />
        <AnimatedCounter target={dark} label="DARK" />
        <AnimatedCounter target={alerts} label="ALERTS" alert />
      </div>

      {/* Centre separator */}
      <div className="flex-1" />

      {/* Right — system telemetry */}
      <div className="flex items-center divide-x divide-border-light text-[9px] tracking-widest uppercase">
        {/* SIGNALS */}
        <div className="px-3 flex items-center gap-1.5">
          <span style={{ color: 'rgba(207,201,194,0.45)' }}>SIGNALS:</span>
          <span style={{ color: '#7FB069' }}>{totalSignals} ACTIVE</span>
        </div>
        {/* LATENCY */}
        <div className="px-3 flex items-center gap-1.5">
          <span style={{ color: 'rgba(207,201,194,0.45)' }}>LATENCY:</span>
          <span style={{ color: '#7FB069' }}>23ms</span>
        </div>
        {/* FEEDS */}
        <div className="px-3 flex items-center gap-1.5">
          <span style={{ color: 'rgba(207,201,194,0.45)' }}>FEEDS:</span>
          <span style={{ color: '#7FB069' }}>SYNC</span>
        </div>
        {/* UPLINK */}
        <div className="px-3 flex items-center gap-1.5">
          <span style={{ color: 'rgba(207,201,194,0.45)' }}>UPLINK:</span>
          <span style={{ color: '#7FB069' }}>SECURE</span>
        </div>

        <div className="w-px self-stretch mx-1" style={{ background: 'rgba(207,201,194,0.10)' }} />

        {/* CPU */}
        <div className="px-3" style={{ color: 'rgba(207,201,194,0.45)' }}>
          CPU <span style={{ color: '#00f0ff' }}>{sys.cpu.toFixed(0)}%</span>
        </div>
        {/* MEM */}
        <div className="px-3" style={{ color: 'rgba(207,201,194,0.45)' }}>
          MEM <span style={{ color: '#00f0ff' }}>{sys.mem.toFixed(1)}GB / 16GB</span>
        </div>
        {/* NET */}
        <div className="px-3" style={{ color: 'rgba(207,201,194,0.45)' }}>
          NET{' '}
          <span style={{ color: '#00f0ff' }}>
            ↑{sys.netUp.toFixed(0)}kb/s ↓{sys.netDown >= 1000 ? (sys.netDown / 1000).toFixed(1) + 'mb/s' : sys.netDown.toFixed(0) + 'kb/s'}
          </span>
        </div>

        {/* Timestamp */}
        <div className="px-3 flex items-center gap-2">
          <span style={{ color: 'rgba(207,201,194,0.40)' }}>UPD:</span>
          <span style={{ color: '#00f0ff' }}>{lastUpdate} IST</span>
        </div>

        {/* Emergency indicator */}
        {alerts > 0 && (
          <div className="px-3 flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 bg-red-500 animate-ping rounded-full" />
            <span style={{ color: '#FF5757' }}>EMERGENCY ACTIVE</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default BottomBar;
