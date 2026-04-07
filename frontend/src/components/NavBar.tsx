import { useState, useEffect } from "react";
import { useIndiaNews } from "@/hooks/useNews";
import { Activity } from "lucide-react";

const navItems = ["LIVE INTEL", "TIMELINE", "ASSETS", "INTEL", "SETTINGS"];

const NavBar = ({ activeTab, setActiveTab }: { activeTab: string; setActiveTab: (t: string) => void }) => {
  const [time, setTime] = useState("");
  const { news } = useIndiaNews();

  // Count critical (S1) and high (S2) alerts
  const criticalCount = news.filter(n => n.severity === 1).length;
  const highCount = news.filter(n => n.severity === 2).length;
  const totalAlerts = criticalCount + highCount;

  useEffect(() => {
    const update = () => {
      const now = new Date().toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      setTime(now);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="w-full flex items-center justify-between px-6 bg-bg-light"
      style={{
        height: "var(--nav-h)",
        borderBottom: "1px solid rgba(26,26,24,0.12)",
      }}
    >
      {/* Left: Logo */}
      <div className="flex items-center gap-4">
        <img src="/icon.ico" alt="DashINT Logo" className="w-10 h-10 object-contain drop-shadow-md" />
        <span className="font-display text-bg-dark text-2xl tracking-tight mt-1">
          DashINT
        </span>
      </div>

      {/* Center: Nav links */}
      <div className="flex items-center gap-8">
        {navItems.map((item) => (
          <button
            key={item}
            onClick={() => setActiveTab(item)}
            className={`nav-link mono-label-lg cursor-pointer transition-none ${activeTab === item ? "text-bg-dark" : "text-bg-dark/50"
              }`}
          >
            {item}
          </button>
        ))}
      </div>

      {/* Right: Clock + Status */}
      <div className="flex items-center gap-5">
        {totalAlerts > 0 ? (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 px-2.5 py-1 rounded">
            <Activity size={12} className="text-red-500 animate-pulse" />
            <span className="mono-label text-red-500 font-bold">{totalAlerts} ACTIVE ALERTS</span>
          </div>
        ) : (
          <span className="mono-label text-bg-dark/60">FEEDS: {news.length || 247}</span>
        )}
        <span className="font-mono text-xs text-bg-dark tracking-wider">
          {time} IST
        </span>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 bg-green-500 alert-pulse" />
          <span className="mono-label text-bg-dark/60">LIVE</span>
        </div>
      </div>
    </div>
  );
};

export default NavBar;
