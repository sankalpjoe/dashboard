import { useLiveIntel } from "@/hooks/useIntel";
import { motion, AnimatePresence } from "framer-motion";
import type { Vessel } from "@/lib/ship-service";
import type { NewsItem } from "@/lib/news-service";
import { CHOKEPOINTS } from "@/config/chokepoints";
import { WorldLeader } from "@/config/world-leaders";
import { X, ExternalLink, Copy, CheckCheck, ChevronRight, Anchor, Crosshair, Zap, User } from "lucide-react";
import { useState, useEffect } from "react";
import { FlightTracker } from "./FlightTracker";
import { ShipTracker } from "./ShipTracker";

// ── Groq AI brief ──────────────────────────────────────────────────────────
const GROQ_KEY   = (import.meta as any).env?.VITE_GROQ_API_KEY as string | undefined;
const BRIEF_MODEL = 'llama-3.3-70b-versatile'; // strong analytical writer, fast on Groq

async function generateBriefGroq(item: NewsItem): Promise<string> {
  if (!GROQ_KEY) return 'Brief unavailable: set VITE_GROQ_API_KEY in .env.local.';

  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_KEY}`,
    },
    body: JSON.stringify({
      model: BRIEF_MODEL,
      messages: [
        {
          role: 'system',
          content:
            `You are a senior military intelligence analyst for India's strategic command.\n` +
            `Produce a concise, factual 3-paragraph intelligence brief:\n` +
            `Para 1 — SITUATION: What is happening, actors, location.\n` +
            `Para 2 — ASSESSMENT: Threat level to India, geopolitical context, supporting intelligence.\n` +
            `Para 3 — IMPLICATIONS: Watch areas, likely next events, Indian strategic interest.\n` +
            `Rules: Crisp military prose. No bullet points. No markdown. Max 200 words. No hallucinations.`,
        },
        {
          role: 'user',
          content:
            `Generate an intelligence brief:\n\nHEADLINE: "${item.headline}"\nSOURCE: ${item.source}\nCATEGORY: ${item.category}\nTIMESTAMP: ${item.time}`,
        },
      ],
      max_tokens: 320,
      temperature: 0.25,
    }),
    signal: AbortSignal.timeout(18_000),
  });

  if (!resp.ok) throw new Error(`Groq ${resp.status}`);
  const data = await resp.json();
  return data.choices?.[0]?.message?.content ?? 'Brief generation failed — empty response.';
}

// Analyst confidence colour based on 1-10 relevance score
function confidenceColor(score: number): string {
  const pct = score * 10;
  if (pct >= 80) return '#7FB069';   // green — high confidence
  if (pct >= 60) return '#FFCC33';   // yellow — moderate
  return '#FF9933';                  // orange — low
}

// Derive tag pills from NewsItem fields
function deriveTags(item: NewsItem): string[] {
  const tags: string[] = [item.category.toUpperCase()];
  if (item.city) tags.push(item.city.toUpperCase());
  tags.push(item.source.replace(/\s+/g, '-').toUpperCase());
  if (item.confidence === 'confirmed') tags.push('CONFIRMED');
  if (item.severity === 1) tags.push('S1-CRITICAL');
  else if (item.severity === 2) tags.push('S2-HIGH');
  if (item.langLabel) tags.push(item.langLabel.toUpperCase());
  return tags;
}

// Generate EVENT TIMELINE entries anchored to the item timestamp
function eventTimeline(ts: number) {
  const fmt = (ms: number) => new Date(ms).toISOString().slice(11, 19) + 'Z';
  return [
    { time: fmt(ts),           icon: '◉', text: 'Signal acquired from source', active: true },
    { time: fmt(ts + 18_000),  icon: '◇', text: 'Cross-referenced w/ historical', active: false },
    { time: fmt(ts + 42_000),  icon: '◇', text: 'Analyst review queued', active: false },
    { time: fmt(ts + 65_000),  icon: '◇', text: 'Severity classification applied', active: false },
  ];
}

// Severity → risk color
const SEV_ACCENT: Record<number, string> = {
  1: '#FF5757',
  2: '#FF9933',
  3: '#FFCC33',
  4: '#7FB069',
  5: '#60B0E0',
};

const TABS = ["INTEL", "FLIGHTS", "SHIPS"] as const;
type Tab = typeof TABS[number];

const RISK_COLORS: Record<string, string> = {
  critical: "text-red-500",
  high: "text-lime-600",
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
  2: "bg-lime-600",
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

const RightPanel = ({ selectedItem, selectedVessel, selectedLeader, onClose }: RightPanelProps) => {
  const [tab, setTab] = useState<Tab>("INTEL");
  const { intel, loading } = useLiveIntel();
  const [copied, setCopied] = useState(false);
  const [brief, setBrief] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);

  // Auto-generate AI brief when item changes (Groq / Llama-3.3-70B)
  useEffect(() => {
    if (!selectedItem) { setBrief(null); return; }
    setBrief(null);
    setBriefLoading(true);

    generateBriefGroq(selectedItem)
      .then(text => setBrief(text))
      .catch(() => setBrief('Brief unavailable: Groq connection failed. Check VITE_GROQ_API_KEY.'))
      .finally(() => setBriefLoading(false));
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
    <div className="h-full bg-bg-mid flex flex-col border-l border-border-light" style={{ width: 360 }}>

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
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-light flex-shrink-0 bg-blue-950/10">
              <div className="flex items-center gap-2">
                <User size={12} className="text-blue-500 flex-shrink-0" />
                <span className="mono-label text-blue-500 text-[10px]">INTEL PROFILE // LEADER</span>
              </div>
              <button onClick={onClose} className="text-text-light/40 hover:text-text-light transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Leader portrait + name */}
              <div className="px-4 py-8 border-b border-border-light flex flex-col items-center text-center bg-gradient-to-b from-blue-500/5 to-transparent">
                <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-white shadow-xl mb-4">
                  <img src={selectedLeader.photoUrl} alt={selectedLeader.name} className="w-full h-full object-cover" />
                </div>
                <h2 className="text-text-light text-xl font-bold font-display leading-tight">{selectedLeader.name}</h2>
                <p className="text-text-light/60 font-mono text-xs uppercase mt-1 tracking-wider">{selectedLeader.role} of {selectedLeader.country}</p>
                <div className={`mt-4 px-3 py-1 rounded-full text-[10px] font-bold tracking-tighter uppercase ${selectedLeader.status === 'active' ? 'bg-green-100 text-green-700' :
                    selectedLeader.status === 'traveling' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                  STATUS: {selectedLeader.status}
                </div>
              </div>

              {/* Bio / Intel Summary */}
              <div className="px-4 py-6">
                <span className="mono-label text-[10px] text-text-light/40 mb-4 block">BIOGRAPHICAL RECONNAISSANCE</span>
                <p className="text-text-light text-sm leading-relaxed font-body">
                  {selectedLeader.bioSummary}
                </p>

                <div className="mt-8 space-y-4 pt-6 border-t border-border-light/50">
                  <div className="flex justify-between items-center text-[11px] font-mono">
                    <span className="text-text-light/40">LAST KNOWN LOC</span>
                    <span className="text-text-light font-bold uppercase">{selectedLeader.lastKnownLocation}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] font-mono">
                    <span className="text-text-light/40">RISK ASSESSMENT</span>
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
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-light flex-shrink-0 bg-lime-950/30">
              <div className="flex items-center gap-2">
                <Anchor size={12} className="text-lime-600 flex-shrink-0" />
                <span className="mono-label text-lime-600 text-[10px]">
                  {selectedVessel.isMilitary ? 'MILITARY VESSEL' : 'VESSEL'}
                </span>
              </div>
              <button onClick={onClose} className="text-text-light/40 hover:text-text-light transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Vessel name + class */}
              <div className="px-4 py-4 border-b border-border-light">
                <h2 className="text-text-light text-sm font-bold font-body leading-snug mb-1">{selectedVessel.name}</h2>
                <span className={`px-2 py-0.5 text-[9px] font-mono uppercase rounded inline-block ${selectedVessel.isMilitary ? 'bg-lime-100 text-lime-700' : 'bg-gray-100 text-gray-600'}`}>
                  {selectedVessel.shipClass ?? 'VESSEL'}
                </span>
              </div>

              {/* Posture / Status */}
              <div className="px-4 py-3 border-b border-border-light flex flex-col gap-2">
                <span className="mono-label text-[9px] text-text-light/40">OPERATIONAL STATUS</span>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="mono-label text-[8px] text-text-light/30">DISTRESS</span>
                    <span className={`mono-label text-[11px] font-bold ${selectedVessel.isDistress ? 'text-red-500 animate-pulse' : 'text-green-600'}`}>
                      {selectedVessel.isDistress ? '⚠ DISTRESS' : '● NOMINAL'}
                    </span>
                  </div>
                  {selectedVessel.destination && (
                    <div className="flex flex-col gap-0.5">
                      <span className="mono-label text-[8px] text-text-light/30">DESTINATION</span>
                      <span className="mono-label text-[11px] text-text-light">{selectedVessel.destination}</span>
                    </div>
                  )}
                  {selectedVessel.speedKnots != null && (
                    <div className="flex flex-col gap-0.5">
                      <span className="mono-label text-[8px] text-text-light/30">SPEED</span>
                      <span className="mono-label text-[11px] text-text-light">{selectedVessel.speedKnots} kts</span>
                    </div>
                  )}
                  <div className="flex flex-col gap-0.5">
                    <span className="mono-label text-[8px] text-text-light/30">COORDS</span>
                    <span className="mono-label text-[10px] text-text-light">
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
                  <div className="px-4 py-3 border-b border-border-light">
                    <span className="mono-label text-[9px] text-text-light/40 block mb-2">NEARBY CHOKEPOINT</span>
                    <div className="p-3 bg-lime-50 border border-lime-200">
                      <div className="flex items-center gap-2 mb-1">
                        <Crosshair size={11} className="text-lime-600 flex-shrink-0" />
                        <span className="mono-label text-[10px] text-lime-700 font-bold">{cp.name}</span>
                        <span className={`ml-auto text-[8px] font-mono px-1.5 py-0.5 rounded ${cp.status === 'ACTIVE_CONFLICT' ? 'bg-red-100 text-red-700' :
                          cp.status === 'ELEVATED' ? 'bg-lime-100 text-lime-700' : 'bg-yellow-100 text-yellow-700'
                          }`}>{cp.status.replace('_', ' ')}</span>
                      </div>
                      <p className="text-[10px] text-lime-700 font-body leading-snug">{cp.description}</p>
                      <p className="text-[9px] text-lime-500 mono-label mt-1">{cp.traffic}</p>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Bottom close */}
            <div className="flex-shrink-0 px-4 py-3 border-t border-border-light">
              <button onClick={onClose} className="w-full py-2.5 mono-label text-[10px] border border-border-light hover:border-signal text-text-light/60 hover:text-signal transition-colors">
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
            {/* Header — severity-colored left border, risk badge */}
            <div
              className="flex items-start justify-between px-4 py-3 border-b border-border-light flex-shrink-0 bg-bg-mid"
              style={{ borderLeft: `3px solid ${SEV_ACCENT[selectedItem.severity] ?? SEV_ACCENT[5]}` }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="mono-label text-[9px] text-text-light/40 tracking-widest">
                    SIGNAL · {selectedItem.source}
                  </span>
                  <span
                    className="font-mono text-[9px] font-bold tracking-widest ml-auto"
                    style={{ color: SEV_ACCENT[selectedItem.severity] ?? '#cfc9c2' }}
                  >
                    ● {SEV_LABEL[selectedItem.severity] ?? 'UNKNOWN'}
                  </span>
                </div>
                <p className="text-text-light text-sm font-semibold font-body leading-snug pr-2">
                  {selectedItem.headline}
                  {selectedItem.confidence === 'confirmed' && (
                    <span className="ml-2 inline-flex items-center gap-1 text-[9px] font-mono text-signal align-middle">
                      <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse inline-block" />
                      CONFIRMED
                    </span>
                  )}
                </p>
              </div>
              <button onClick={onClose} className="text-text-light/40 hover:text-text-light transition-colors ml-2 flex-shrink-0">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">

              {/* 2×2 stat grid */}
              <div className="grid grid-cols-2 border-b border-border-light">
                {[
                  { label: 'SOURCE',    value: selectedItem.source },
                  { label: 'CATEGORY',  value: selectedItem.category.toUpperCase() },
                  { label: 'TIMESTAMP', value: selectedItem.time },
                  { label: 'LOCATION',  value: selectedItem.city ? `◉ ${selectedItem.city}` : '—' },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="px-4 py-2.5 border-r border-b border-border-light last:border-r-0"
                  >
                    <div className="font-mono text-[8px] text-text-light/30 tracking-widest mb-1">{label}</div>
                    <div className="font-mono text-[10px] text-text-light font-bold">{value}</div>
                  </div>
                ))}
              </div>

              {/* Analyst Confidence bar */}
              {typeof selectedItem.relevanceScore === 'number' && (
                <div className="px-4 py-3 border-b border-border-light">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="mono-label text-[9px] text-text-light/40">ANALYST CONFIDENCE</span>
                    <span className="font-mono text-[11px] font-bold" style={{ color: confidenceColor(selectedItem.relevanceScore) }}>
                      {Math.round(selectedItem.relevanceScore * 10)}%
                    </span>
                  </div>
                  <div className="h-1 w-full border border-border-light overflow-hidden" style={{ background: 'rgba(0,240,255,0.08)' }}>
                    <div
                      className="h-full transition-all duration-600"
                      style={{
                        width: `${selectedItem.relevanceScore * 10}%`,
                        background: confidenceColor(selectedItem.relevanceScore),
                        boxShadow: `0 0 6px ${confidenceColor(selectedItem.relevanceScore)}`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* RAW SIGNAL INTERCEPT */}
              <div className="px-4 py-4 border-b border-border-light">
                <span className="mono-label text-[9px] text-text-light/40 block mb-2.5 tracking-widest">
                  RAW SIGNAL INTERCEPT
                </span>
                {selectedItem.summary && selectedItem.summary.length > 0 ? (
                  <div className="space-y-1.5 border-l-2 border-signal/20 pl-3">
                    {selectedItem.summary.map((bullet, bi) => (
                      <div key={bi} className="flex items-start gap-1.5">
                        <span className="text-signal/50 text-[8px] mt-0.5 shrink-0">▸</span>
                        <span className="font-body text-[12px] text-text-light/80 leading-relaxed">{bullet}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="font-body text-[12px] text-text-light/80 leading-relaxed">{selectedItem.headline}</p>
                )}
              </div>

              {/* TAGS */}
              <div className="px-4 py-3 border-b border-border-light">
                <span className="mono-label text-[9px] text-text-light/40 block mb-2 tracking-widest">TAGS</span>
                <div className="flex flex-wrap gap-1.5">
                  {deriveTags(selectedItem).map(tag => (
                    <span
                      key={tag}
                      className="font-mono text-[9px] px-2 py-0.5 border border-border-light bg-bg-mid/60 text-text-light/60 tracking-wide"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* AI Intelligence Brief */}
              <div className="px-4 py-4 border-b border-border-light bg-bg-mid/40">
                <div className="flex items-center gap-2 mb-3">
                  <Zap size={11} className="text-signal flex-shrink-0" />
                  <span className="mono-label text-[9px] text-signal font-bold tracking-wider">AI INTELLIGENCE BRIEF</span>
                  {briefLoading && (
                    <span className="ml-auto flex h-1.5 w-1.5">
                      <span className="animate-ping absolute h-1.5 w-1.5 rounded-full bg-signal opacity-75" />
                      <span className="relative rounded-full h-1.5 w-1.5 bg-signal" />
                    </span>
                  )}
                </div>
                {briefLoading && (
                  <div className="space-y-2">
                    {[100, 85, 92, 70, 88].map((w, i) => (
                      <div key={i} className="h-2.5 bg-bg-mid rounded animate-pulse" style={{ width: `${w}%` }} />
                    ))}
                  </div>
                )}
                {!briefLoading && brief && (
                  <p className="text-text-light/85 text-[12px] font-body leading-relaxed whitespace-pre-wrap">{brief}</p>
                )}
                {!briefLoading && !brief && (
                  <p className="text-text-light/30 text-[11px] font-mono italic">Awaiting brief generation...</p>
                )}
              </div>

              {/* EVENT TIMELINE */}
              <div className="px-4 py-4 border-b border-border-light">
                <span className="mono-label text-[9px] text-text-light/40 block mb-3 tracking-widest">EVENT TIMELINE</span>
                <div className="flex flex-col gap-2">
                  {eventTimeline(selectedItem.timestamp).map((e, i) => (
                    <div key={i} className="flex items-start gap-2.5 font-mono text-[10px]">
                      <span style={{ color: e.active ? 'var(--signal)' : 'rgba(207,201,194,0.35)' }}>{e.icon}</span>
                      <span className="text-text-light/35 shrink-0 tabular-nums">{e.time}</span>
                      <span style={{ color: e.active ? 'rgba(207,201,194,0.85)' : 'rgba(207,201,194,0.40)' }}>{e.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Related signals */}
              {related.length > 0 && (
                <div className="px-4 py-3 border-b border-border-light">
                  <span className="mono-label text-[9px] text-text-light/40 block mb-2 tracking-widest">RELATED SIGNALS</span>
                  <div className="flex flex-col gap-2">
                    {related.map(r => (
                      <div
                        key={r.id}
                        className="flex items-start gap-2 p-2 bg-bg-mid/40 border border-border-light hover:border-signal/30 transition-colors cursor-pointer group"
                      >
                        <ChevronRight size={12} className="text-signal mt-0.5 flex-shrink-0" />
                        <div>
                          <span className="mono-label text-[8px] text-text-light/40">{r.source} · {r.time}</span>
                          <p className="text-[11px] text-text-light font-body leading-snug group-hover:text-signal transition-colors">{r.headline}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Source link */}
              <div className="px-4 py-3 border-b border-border-light">
                <span className="mono-label text-[9px] text-text-light/40 block mb-2 tracking-widest">PRIMARY SOURCE</span>
                <a
                  href={selectedItem.url ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-2.5 bg-bg-mid/40 hover:bg-signal/10 border border-border-light hover:border-signal/30 transition-colors group"
                >
                  <span className="mono-label text-[10px] text-text-light font-bold group-hover:text-signal transition-colors">
                    {selectedItem.source} ↗
                  </span>
                  <ExternalLink size={11} className="text-text-light/30 group-hover:text-signal transition-colors flex-shrink-0 ml-2" />
                </a>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex-shrink-0 px-4 py-3 border-t border-border-light flex flex-col gap-1.5">
              <button
                onClick={handleCopy}
                className="w-full py-2.5 mono-label text-[10px] font-bold tracking-widest text-bg-dark transition-colors"
                style={{ background: 'var(--signal)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,240,255,0.80)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--signal)')}
              >
                {copied ? '✓ COPIED TO CLIPBOARD' : '⊕ DISPATCH TO COMMAND'}
              </button>
              <div className="flex gap-1.5">
                <a
                  href={selectedItem.url ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2 text-center mono-label text-[10px] border border-border-light hover:border-signal text-text-light/60 hover:text-signal transition-colors"
                >
                  ⌖ PIN TO MAP
                </a>
                <button
                  onClick={handleCopy}
                  className="flex-1 py-2 mono-label text-[10px] border border-border-light hover:border-signal text-text-light/60 hover:text-signal transition-colors flex items-center justify-center gap-1"
                >
                  <Copy size={11} />
                  ⤓ EXPORT
                </button>
              </div>
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
            <div className="flex border-b flex-shrink-0" style={{ borderColor: "rgba(207,201,194,0.10)" }}>
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 py-2.5 mono-label text-center cursor-pointer transition-none ${tab === t
                    ? "text-text-light border-b-2 border-signal"
                    : "text-text-light/40 hover:text-text-light/70"
                    }`}
                  style={{ borderBottomWidth: tab === t ? 2 : 0, borderBottomColor: tab === t ? 'var(--signal)' : 'transparent' }}
                >
                  {t}
                </button>
              ))}
            </div>

            {tab === "INTEL" && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto px-4 pb-2">
                  {loading && (
                    <div className="py-8 text-center mono-label text-text-light/40 animate-pulse">
                      AGGREGATING SIGNALS...
                    </div>
                  )}
                  {!loading && intel.length === 0 && (
                    <div className="py-8 text-center mono-label text-text-light/40">
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
                      style={{ borderBottom: i < intel.length - 1 ? "1px solid rgba(207,201,194,0.10)" : "none" }}
                    >
                      <div className="border-l-2 pl-3 transition-none border-transparent group-hover:border-signal relative pr-2">
                        {/* right-edge indicator on hover */}
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[3px] h-4 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'var(--signal)' }} />
                        <div className="flex items-center gap-2 mb-1">
                          {item.riskLevel === 'critical' && <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />}
                          <span className={`mono-label text-[10px] ${RISK_COLORS[item.riskLevel]}`}>
                            {item.source} · {item.type.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-text-light text-[13px] font-body font-medium leading-snug mb-1.5">
                          {item.headline}
                        </p>
                        <div className="flex items-center justify-between">
                          <span className="mono-label text-text-light/40">{item.time}</span>
                        </div>
                      </div>
                    </a>
                  ))}
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
