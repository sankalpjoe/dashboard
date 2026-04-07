import { useLiveIntel } from "@/hooks/useIntel";
import { motion, AnimatePresence } from "framer-motion";
import type { Vessel } from "@/lib/ship-service";
import { CHOKEPOINTS } from "@/config/chokepoints";
import { WorldLeader } from "@/config/world-leaders";
import { X, ExternalLink, Copy, CheckCheck, ChevronRight, Anchor, Crosshair, Zap, User } from "lucide-react";
import { useState, useEffect } from "react";
import { HfInference } from "@huggingface/inference";
import CrosshairSVG from "./CrosshairSVG";
import { FlightTracker } from "./FlightTracker";
import { ShipTracker } from "./ShipTracker";

const TABS = ["INTEL", "FLIGHTS", "SHIPS"] as const;
type Tab = typeof TABS[number];

const RISK_COLORS: Record<string, string> = {
  critical: "text-red-500",
  high: "text-orange-500",
  medium: "text-amber-500",
  info: "text-signal",
};

const SEV_LABEL: Record<number, string> = {
  1: "CRITICAL",
  2: "HIGH",
  3: "ELEVATED",
  4: "MODERATE",
  5: "LOW",
};

const SEV_BAR_COLORS: Record<number, string> = {
  1: "bg-red-500",
  2: "bg-orange-500",
  3: "bg-amber-500",
  4: "bg-yellow-400",
  5: "bg-green-500",
};

interface RightPanelProps {
  selectedItem?: NewsItem | null;
  selectedVessel?: Vessel | null;
  selectedLeader?: WorldLeader | null;
  onClose?: () => void;
}

// Find the closest named chokepoint to a vessel
function nearestChokepoint(lat: number, lon: number) {
  let best = null, bestDist = Infinity;
  for (const c of CHOKEPOINTS) {
    const d = Math.hypot(c.lat - lat, c.lon - lon);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return bestDist < 8 ? best : null;
}

const hf = new HfInference(import.meta.env.VITE_HF_TOKEN || '');
const BRIEF_MODEL = 'Qwen/Qwen2.5-72B-Instruct';

const RightPanel = ({ selectedItem, selectedVessel, selectedLeader, onClose }: RightPanelProps) => {
  const [tab, setTab] = useState<Tab>("INTEL");
  const { intel, loading } = useLiveIntel();
  const [copied, setCopied] = useState(false);
  const [brief, setBrief] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);

  // Auto-generate AI brief when item changes
  useEffect(() => {
    if (!selectedItem) { setBrief(null); return; }
    setBrief(null);
    setBriefLoading(true);

    const prompt = [
      {
        role: 'system',
        content: `You are a senior military intelligence analyst for India's strategic command. 
Your task: produce a concise, factual 3-paragraph intelligence brief for a given news event headline.

Paragraph 1 — SITUATION: What is happening, who are the actors, what location/geography is involved.
Paragraph 2 — ASSESSMENT: Threat level to India and regional stability, geopolitical context, any supporting intelligence.
Paragraph 3 — IMPLICATIONS: Recommended watch areas, likely next events, and any Indian strategic interest.

Rules: Use crisp military prose. No bullet points. No markdown. Max 200 words total. No hallucinations — stick to what is reasonably inferred from the headline.`
      },
      {
        role: 'user',
        content: `Generate an intelligence brief for this event:\n\nHEADLINE: "${selectedItem.headline}"\nSOURCE: ${selectedItem.source}\nCATEGORY: ${selectedItem.category}\nTIMESTAMP: ${selectedItem.time}`
      }
    ];

    hf.chatCompletion({
      model: BRIEF_MODEL,
      // @ts-ignore
      messages: prompt,
      max_tokens: 280,
      temperature: 0.25,
    }).then(res => {
      setBrief(res.choices[0]?.message?.content ?? 'Unable to generate brief — model unavailable.');
    }).catch(() => {
      setBrief('Brief unavailable: model connection failed. Check VITE_HF_TOKEN.');
    }).finally(() => {
      setBriefLoading(false);
    });
  }, [selectedItem?.id]);

  const handleCopy = () => {
    if (!selectedItem) return;
    navigator.clipboard.writeText(`${selectedItem.headline}\n${selectedItem.url ?? ''}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Related events — same category, different id
  const related = intel
    .filter(i => i.type === selectedItem?.category && i.headline !== selectedItem?.headline)
    .slice(0, 3);

  const hasDetail = !!(selectedItem || selectedVessel || selectedLeader);

  return (
    <div className="h-full bg-bg-light grain-overlay flex flex-col border-l border-border-light" style={{ width: 360 }}>

      <AnimatePresence mode="wait">
        {selectedLeader ? (
          /* World Leader Detail View */
          <motion.div
            key="leader-detail"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="flex flex-col h-full overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-bg-dark/10 flex-shrink-0 bg-blue-950/10">
              <div className="flex items-center gap-2">
                <User size={12} className="text-blue-500 flex-shrink-0" />
                <span className="mono-label text-blue-500 text-[10px]">INTEL PROFILE // LEADER</span>
              </div>
              <button onClick={onClose} className="text-bg-dark/40 hover:text-bg-dark transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Leader portrait + name */}
              <div className="px-4 py-8 border-b border-bg-dark/10 flex flex-col items-center text-center bg-gradient-to-b from-blue-500/5 to-transparent">
                <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-white shadow-xl mb-4">
                  <img src={selectedLeader.photoUrl} alt={selectedLeader.name} className="w-full h-full object-cover" />
                </div>
                <h2 className="text-bg-dark text-xl font-bold font-display leading-tight">{selectedLeader.name}</h2>
                <p className="text-bg-dark/60 font-mono text-xs uppercase mt-1 tracking-wider">{selectedLeader.role} of {selectedLeader.country}</p>
                <div className={`mt-4 px-3 py-1 rounded-full text-[10px] font-bold tracking-tighter uppercase ${selectedLeader.status === 'active' ? 'bg-green-100 text-green-700' :
                    selectedLeader.status === 'traveling' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                  STATUS: {selectedLeader.status}
                </div>
              </div>

              {/* Bio / Intel Summary */}
              <div className="px-4 py-6">
                <span className="mono-label text-[10px] text-bg-dark/40 mb-4 block">BIOGRAPHICAL RECONNAISSANCE</span>
                <p className="text-bg-dark text-sm leading-relaxed font-body">
                  {selectedLeader.bioSummary}
                </p>

                <div className="mt-8 space-y-4 pt-6 border-t border-bg-dark/5">
                  <div className="flex justify-between items-center text-[11px] font-mono">
                    <span className="text-bg-dark/40">LAST KNOWN LOC</span>
                    <span className="text-bg-dark font-bold uppercase">{selectedLeader.lastKnownLocation}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] font-mono">
                    <span className="text-bg-dark/40">RISK ASSESSMENT</span>
                    <span className="text-green-600 font-bold uppercase">SECURE / PROTECTED</span>
                  </div>
                </div>

                <button className="w-full mt-8 bg-bg-mid hover:bg-bg-dark text-white py-2 px-4 rounded font-mono text-xs transition-colors flex items-center justify-center gap-2">
                  <ExternalLink size={12} />
                  DEEP BACKGROUND CHECK
                </button>
              </div>
            </div>
          </motion.div>
        ) : selectedVessel ? (
          /* Vessel Detail View */
          <motion.div
            key="vessel-detail"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="flex flex-col h-full overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-bg-dark/10 flex-shrink-0 bg-orange-950/30">
              <div className="flex items-center gap-2">
                <Anchor size={12} className="text-orange-400 flex-shrink-0" />
                <span className="mono-label text-orange-400 text-[10px]">
                  {selectedVessel.isMilitary ? 'MILITARY VESSEL' : 'VESSEL'}
                </span>
              </div>
              <button onClick={onClose} className="text-bg-dark/40 hover:text-bg-dark transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Vessel name + class */}
              <div className="px-4 py-4 border-b border-bg-dark/10">
                <h2 className="text-bg-dark text-sm font-bold font-body leading-snug mb-1">{selectedVessel.name}</h2>
                <span className={`px-2 py-0.5 text-[9px] font-mono uppercase rounded inline-block ${selectedVessel.isMilitary ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>
                  {selectedVessel.shipClass ?? 'VESSEL'}
                </span>
              </div>

              {/* Posture / Status */}
              <div className="px-4 py-3 border-b border-bg-dark/10 flex flex-col gap-2">
                <span className="mono-label text-[9px] text-bg-dark/40">OPERATIONAL STATUS</span>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="mono-label text-[8px] text-bg-dark/30">DISTRESS</span>
                    <span className={`mono-label text-[11px] font-bold ${selectedVessel.isDistress ? 'text-red-500 animate-pulse' : 'text-green-600'}`}>
                      {selectedVessel.isDistress ? '⚠ DISTRESS' : '● NOMINAL'}
                    </span>
                  </div>
                  {selectedVessel.destination && (
                    <div className="flex flex-col gap-0.5">
                      <span className="mono-label text-[8px] text-bg-dark/30">DESTINATION</span>
                      <span className="mono-label text-[11px] text-bg-dark">{selectedVessel.destination}</span>
                    </div>
                  )}
                  {selectedVessel.speedKnots != null && (
                    <div className="flex flex-col gap-0.5">
                      <span className="mono-label text-[8px] text-bg-dark/30">SPEED</span>
                      <span className="mono-label text-[11px] text-bg-dark">{selectedVessel.speedKnots} kts</span>
                    </div>
                  )}
                  <div className="flex flex-col gap-0.5">
                    <span className="mono-label text-[8px] text-bg-dark/30">COORDS</span>
                    <span className="mono-label text-[10px] text-bg-dark">
                      {selectedVessel.lat.toFixed(3)}°, {selectedVessel.lon.toFixed(3)}°
                    </span>
                  </div>
                </div>
              </div>

              {/* Nearest chokepoint context */}
              {(() => {
                const cp = nearestChokepoint(selectedVessel.lat, selectedVessel.lon);
                if (!cp) return null;
                return (
                  <div className="px-4 py-3 border-b border-bg-dark/10">
                    <span className="mono-label text-[9px] text-bg-dark/40 block mb-2">NEARBY CHOKEPOINT</span>
                    <div className="p-3 bg-orange-50 border border-orange-200">
                      <div className="flex items-center gap-2 mb-1">
                        <Crosshair size={11} className="text-orange-500 flex-shrink-0" />
                        <span className="mono-label text-[10px] text-orange-700 font-bold">{cp.name}</span>
                        <span className={`ml-auto text-[8px] font-mono px-1.5 py-0.5 rounded ${cp.status === 'ACTIVE_CONFLICT' ? 'bg-red-100 text-red-700' :
                          cp.status === 'ELEVATED' ? 'bg-orange-100 text-orange-700' : 'bg-yellow-100 text-yellow-700'
                          }`}>{cp.status.replace('_', ' ')}</span>
                      </div>
                      <p className="text-[10px] text-orange-600 font-body leading-snug">{cp.description}</p>
                      <p className="text-[9px] text-orange-400 mono-label mt-1">{cp.traffic}</p>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Bottom close */}
            <div className="flex-shrink-0 px-4 py-3 border-t border-bg-dark/10">
              <button onClick={onClose} className="w-full py-2.5 mono-label text-[10px] border border-bg-dark/20 hover:border-signal text-bg-dark/60 hover:text-signal transition-colors">
                ← BACK TO FEED
              </button>
            </div>
          </motion.div>
        ) : selectedItem ? (
          <motion.div
            key="detail"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="flex flex-col h-full overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-bg-dark/10 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="mono-label text-signal text-[10px]">EVENT DETAIL</span>
                {selectedItem.confidence === 'confirmed' && (
                  <span className="flex items-center gap-1 text-[9px] font-mono text-signal">
                    <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse" />
                    CONFIRMED
                  </span>
                )}
              </div>
              <button onClick={onClose} className="text-bg-dark/40 hover:text-bg-dark transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Confidence / Severity Bar */}
              <div className="px-4 py-3 border-b border-bg-dark/10">
                <div className="flex justify-between items-center mb-2">
                  <span className="mono-label text-[9px] text-bg-dark/40">SEVERITY</span>
                  <span className="mono-label text-[10px] text-bg-dark font-bold">{SEV_LABEL[selectedItem.severity] ?? 'UNKNOWN'}</span>
                </div>
                <div className="h-1.5 bg-bg-dark/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${SEV_BAR_COLORS[selectedItem.severity] ?? 'bg-gray-400'}`}
                    style={{ width: `${((6 - selectedItem.severity) / 5) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-[9px] font-mono text-bg-dark/30">
                  <span>S1 CRITICAL</span><span>S5 LOW</span>
                </div>
              </div>

              {/* Two-column header row */}
              <div className="flex justify-between items-start px-4 py-3 border-b border-bg-dark/10">
                <div className="flex flex-col gap-0.5">
                  <span className="mono-label text-[8px] text-bg-dark/30">TIMESTAMP</span>
                  <span className="mono-label text-[10px] text-bg-dark font-medium">{selectedItem.time}</span>
                </div>
                {selectedItem.city && (
                  <div className="flex flex-col gap-0.5 text-right">
                    <span className="mono-label text-[8px] text-bg-dark/30">LOCATION</span>
                    <span className="mono-label text-[10px] text-bg-dark font-medium">📍 {selectedItem.city}</span>
                  </div>
                )}
              </div>

              {/* Headline */}
              <div className="px-4 py-4 border-b border-bg-dark/10">
                <p className="text-bg-dark text-sm font-semibold font-body leading-snug">{selectedItem.headline}</p>
              </div>

              {/* AI Intelligence Brief */}
              <div className="px-4 py-4 border-b border-bg-dark/10 bg-bg-dark/3">
                <div className="flex items-center gap-2 mb-3">
                  <Zap size={11} className="text-signal flex-shrink-0" />
                  <span className="mono-label text-[9px] text-signal font-bold tracking-wider">AI INTELLIGENCE BRIEF</span>
                  {briefLoading && (
                    <span className="ml-auto flex h-1.5 w-1.5">
                      <span className="animate-ping absolute h-1.5 w-1.5 rounded-full bg-signal opacity-75"></span>
                      <span className="relative rounded-full h-1.5 w-1.5 bg-signal"></span>
                    </span>
                  )}
                </div>

                {briefLoading && (
                  <div className="space-y-2">
                    {[100, 85, 92, 70, 88].map((w, i) => (
                      <div key={i} className={`h-2.5 bg-bg-dark/15 rounded animate-pulse`} style={{ width: `${w}%` }} />
                    ))}
                  </div>
                )}

                {!briefLoading && brief && (
                  <p className="text-bg-dark/85 text-[12px] font-body leading-relaxed whitespace-pre-wrap">{brief}</p>
                )}

                {!briefLoading && !brief && (
                  <p className="text-bg-dark/30 text-[11px] font-mono italic">Select an event to generate brief.</p>
                )}
              </div>

              {/* Source link (secondary, below brief) */}
              <div className="px-4 py-3 border-b border-bg-dark/10">
                <span className="mono-label text-[9px] text-bg-dark/40 block mb-2">PRIMARY SOURCE</span>
                <a
                  href={selectedItem.url ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-2.5 bg-bg-dark/5 hover:bg-signal/10 border border-bg-dark/10 hover:border-signal/30 transition-colors group"
                >
                  <span className="mono-label text-[10px] text-bg-dark font-bold group-hover:text-signal transition-colors">
                    {selectedItem.source} ↗
                  </span>
                  <ExternalLink size={11} className="text-bg-dark/30 group-hover:text-signal transition-colors flex-shrink-0 ml-2" />
                </a>
              </div>

              {/* Related events */}
              {related.length > 0 && (
                <div className="px-4 py-3">
                  <span className="mono-label text-[9px] text-bg-dark/40 block mb-2">RELATED SIGNALS</span>
                  <div className="flex flex-col gap-2">
                    {related.map(r => (
                      <div
                        key={r.id}
                        className="flex items-start gap-2 p-2 bg-bg-dark/5 border border-bg-dark/10 hover:border-signal/30 transition-colors cursor-pointer group"
                      >
                        <ChevronRight size={12} className="text-signal mt-0.5 flex-shrink-0" />
                        <div>
                          <span className="mono-label text-[8px] text-bg-dark/40">{r.source} · {r.time}</span>
                          <p className="text-[11px] text-bg-dark font-body leading-snug group-hover:text-signal transition-colors">{r.headline}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom actions */}
            <div className="flex-shrink-0 px-4 py-3 border-t border-bg-dark/10 flex gap-3">
              <a
                href={selectedItem.url ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2.5 text-center mono-label text-[10px] bg-signal text-bg-dark hover:bg-signal/80 transition-colors"
              >
                READ ARTICLE ↗
              </a>
              <button
                onClick={handleCopy}
                className="px-4 py-2.5 mono-label text-[10px] border border-bg-dark/20 hover:border-signal text-bg-dark/60 hover:text-signal transition-colors flex items-center gap-1.5"
              >
                {copied ? <CheckCheck size={12} /> : <Copy size={12} />}
                {copied ? 'COPIED' : 'COPY'}
              </button>
            </div>
          </motion.div>
        ) : (
          /* Default list view */
          <motion.div
            key="list"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.18 }}
            className="flex flex-col h-full"
          >
            {/* Tab bar */}
            <div className="flex border-b flex-shrink-0" style={{ borderColor: "rgba(26,26,24,0.1)" }}>
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 py-2.5 mono-label text-center cursor-pointer transition-none ${tab === t
                    ? "text-bg-dark border-b-2 border-signal"
                    : "text-bg-dark/40 hover:text-bg-dark/70"
                    }`}
                  style={{ borderBottomWidth: tab === t ? 2 : 0, borderBottomColor: tab === t ? "#F04C35" : "transparent" }}
                >
                  {t}
                </button>
              ))}
            </div>

            {tab === "INTEL" && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto px-4 pb-2">
                  {loading && (
                    <div className="py-8 text-center mono-label text-bg-dark/40 animate-pulse">
                      AGGREGATING SIGNALS...
                    </div>
                  )}
                  {!loading && intel.length === 0 && (
                    <div className="py-8 text-center mono-label text-bg-dark/40">
                      NO INTEL ITEMS ACQUIRED
                    </div>
                  )}
                  {intel.map((item, i) => (
                    <a
                      key={item.id}
                      href={item.url || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block py-3 group cursor-pointer"
                      style={{ borderBottom: i < intel.length - 1 ? "1px solid rgba(26,26,24,0.1)" : "none" }}
                    >
                      <div className={`border-l-2 pl-3 transition-none border-transparent group-hover:border-signal`}>
                        <div className="flex items-center gap-2 mb-1">
                          {item.riskLevel === 'critical' && <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />}
                          <span className={`mono-label text-[10px] ${RISK_COLORS[item.riskLevel]}`}>
                            {item.source} · {item.type.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-bg-dark text-[13px] font-body font-medium leading-snug mb-1.5">
                          {item.headline}
                        </p>
                        <div className="flex items-center justify-between">
                          <span className="mono-label text-bg-dark/40">{item.time}</span>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>

                {/* Strategic Posture Card */}
                <div className="m-4 bg-signal p-4 relative alert-pulse flex-shrink-0">
                  <CrosshairSVG size={48} className="absolute top-3 right-3 text-bg-dark/25" />
                  <h3 className="font-display text-bg-dark text-base mb-2">STRATEGIC POSTURE</h3>
                  <p className="mono-label text-bg-dark/80 leading-relaxed" style={{ letterSpacing: "0.15em", lineHeight: "1.8" }}>
                    INDIA OSINT FEEDS ACTIVE. REGIONAL MONITORING ONLINE.
                    PIB, CERT-IN, AND GLOBAL CRISIS AGGREGATORS SYNCED.
                  </p>
                </div>
              </div>
            )}

            {tab === "FLIGHTS" && <FlightTracker />}
            {tab === "SHIPS" && <ShipTracker />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default RightPanel;
