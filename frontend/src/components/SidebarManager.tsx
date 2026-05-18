import { useState } from "react";
import LiveNewsPanel from "@/components/LiveNewsPanel";
import PolymarketPanel from "@/components/PolymarketPanel";
import AviationRiskPanel from "@/components/AviationRiskPanel";

type PanelId = "news" | "market" | "aviation" | null;

interface SidebarManagerProps {
  /** All panels collapsed by default */
}

const ICONS: { id: NonNullable<PanelId>; label: string; symbol: string }[] = [
  { id: "news", label: "LIVE NEWS", symbol: "◉" },
  { id: "aviation", label: "AVIATION", symbol: "✈" },
  { id: "market", label: "MARKETS", symbol: "◆" },
];

const T = {
  bgPanel: "rgba(26, 27, 38, 0.95)",
  border: "rgba(207, 201, 194, 0.15)",
  text: "#cfc9c2",
  textBright: "#ffffff",
  textDim: "rgba(207, 201, 194, 0.6)",
  accentCyan: "#00f0ff",
};

const SidebarManager = ({}: SidebarManagerProps) => {
  const [activePanel, setActivePanel] = useState<PanelId>(null);

  const handleToggle = (id: PanelId) => {
    setActivePanel(prev => (prev === id ? null : id));
  };

  return (
    <div style={{ display: "flex", height: "100%", flexShrink: 0 }}>
      {/* Icon strip */}
      <div
        style={{
          width: "40px",
          background: T.bgPanel,
          borderRight: `1px solid ${T.border}`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: "12px",
          gap: "10px",
          flexShrink: 0,
        }}
      >
        {ICONS.map(({ id, label, symbol }) => {
          const isActive = activePanel === id;
          return (
            <button
              key={id}
              onClick={() => handleToggle(id)}
              title={label}
              style={{
                width: "32px",
                height: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: isActive ? "rgba(0,240,255,0.12)" : "transparent",
                border: isActive ? "1px solid rgba(0,240,255,0.35)" : "1px solid transparent",
                color: isActive ? T.accentCyan : T.textDim,
                cursor: "pointer",
                fontFamily: "IBM Plex Mono, monospace",
                fontSize: "15px",
                lineHeight: 1,
                transition: "all 0.15s",
                borderRadius: "3px",
              }}
            >
              {symbol}
            </button>
          );
        })}
        {/* Collapse indicator when a panel is open */}
        {activePanel && (
          <button
            onClick={() => setActivePanel(null)}
            title="Collapse all"
            style={{
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "transparent",
              border: `1px solid ${T.border}`,
              color: T.textDim,
              cursor: "pointer",
              fontFamily: "IBM Plex Mono, monospace",
              fontSize: "12px",
              marginTop: "auto",
              marginBottom: "10px",
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Expanded panel area */}
      {activePanel === "news" && (
        <LiveNewsPanel
          collapsed={false}
          onToggle={() => setActivePanel(null)}
        />
      )}
      {activePanel === "aviation" && (
        <AviationRiskPanel
          collapsed={false}
          onToggle={() => setActivePanel(null)}
        />
      )}
      {activePanel === "market" && (
        <PolymarketPanel
          collapsed={false}
          onToggle={() => setActivePanel(null)}
        />
      )}
    </div>
  );
};

export default SidebarManager;
