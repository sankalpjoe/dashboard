import { useState, useEffect, useRef } from "react";
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
      <span className={`font-mono text-sm font-bold ${alert && target > 0 ? "text-red-400" : "text-signal"}`}>
        {count}
      </span>
      <span className="mono-label text-text-light">{label}</span>
    </div>
  );
};

const BottomBar = () => {
  const { civFlights, milAssets, ships, alerts, dark } = useTrackingStatus();
  const [lastUpdate, setLastUpdate] = useState("--");

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
    <div className="w-full bg-bg-dark flex items-center justify-between" style={{ height: "var(--bottom-h)" }}>
      <div className="flex items-center divide-x divide-text-light/15">
        <AnimatedCounter target={civFlights} label="CIV FLIGHTS" />
        <AnimatedCounter target={milAssets} label="MIL ASSETS" />
        <AnimatedCounter target={ships} label="SHIPS" />
        <AnimatedCounter target={dark} label="DARK" />
        <AnimatedCounter target={alerts} label="ALERTS" alert />
      </div>
      <div className="flex items-center gap-4 px-4">
        <span className="mono-label text-text-light/40">SRC: ADSB.LOL · AISSTREAM.IO</span>
        <span className="mono-label text-text-light/40">UPD: {lastUpdate} IST</span>
        {alerts > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
            <span className="mono-label text-red-400">EMERGENCY ACTIVE</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default BottomBar;
