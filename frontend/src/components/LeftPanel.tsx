import { useState, useRef } from "react";
import { useIndiaNews } from "@/hooks/useNews";
import { motion, AnimatePresence } from "framer-motion";
import type { PersonnelRecord } from "@/components/CsvUploader";
import type { NewsItem } from "@/lib/news-service";

const LOCATIONS = ["ALL", "BANGALORE", "DELHI", "HYDERABAD", "MUMBAI", "CHENNAI", "KOLKATA"];

const CAT_COLORS: Record<string, string> = {
  conflict: 'text-red-400    bg-red-400/10    border-red-400/20',
  terrorism: 'text-rose-500   bg-rose-500/10   border-rose-500/25',
  disaster: 'text-amber-400  bg-amber-400/10  border-amber-400/20',
  cyber: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  military: 'text-signal     bg-signal/10     border-signal/20',
  protest: 'text-lime-500 bg-lime-500/10 border-lime-500/20',
  industrial: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
  humanitarian: 'text-teal-400   bg-teal-400/10   border-teal-400/20',
  economic: 'text-sky-400    bg-sky-400/10    border-sky-400/20',
  general: 'text-text-light bg-text-light/10 border-text-light/20',
};

// Left-border severity accent color per category
const CAT_ACCENT: Record<string, string> = {
  conflict:     '#FF5757',  // critical — red
  terrorism:    '#FF5757',  // critical — red
  military:     '#FF9933',  // high — orange
  cyber:        '#C084FC',  // high — purple
  disaster:     '#FFCC33',  // medium — yellow
  industrial:   '#FFCC33',  // medium — yellow
  protest:      '#7FB069',  // low — green
  humanitarian: '#5EC4C4',  // low — teal
  economic:     '#60B0E0',  // low — sky
  general:      '#FFB84D',  // default — signal amber
};

// ---------------------------------------------------------------------------

const LeftPanel = ({
  onPersonnelUpload,
  onSelectItem,
}: {
  onPersonnelUpload: (data: PersonnelRecord[]) => void;
  onSelectItem?: (item: NewsItem) => void;
}) => {
  return (
    <div
      className="h-full bg-bg-dark flex flex-col border-r border-border-light relative group"
      style={{ width: 400, minWidth: 320, maxWidth: 800, resize: "horizontal", overflow: "hidden" }}
    >
      {/* Drag handle */}
      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-16 bg-border-light/50 rounded-l flex flex-col justify-center items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
        {[0, 1, 2].map(i => <div key={i} className="w-0.5 h-1 bg-text-light/30" />)}
      </div>

      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-text-light/10 flex-shrink-0 bg-bg-mid">
        <div>
          <div className="font-mono text-[11px] font-bold text-signal tracking-widest">📍 INDIA INTEL FEED</div>
          <div className="font-mono text-[8px] text-text-light/35 tracking-wider mt-0.5">LIVE · CRISIS · WEATHER · TRAFFIC · PROTEST · DISEASE · SECURITY</div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse" />
          <span className="font-mono text-[8px] text-signal tracking-widest">LIVE</span>
        </div>
      </div>

      {/* Feed panel */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <LiveFeedPanel onSelectItem={onSelectItem} />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------

// Simplified category chips — maps user-facing labels to underlying category values
const BLR_CATS: { label: string; icon: string; match: string[] }[] = [
  { label: 'ALL',     icon: '◉', match: [] },
  { label: 'TRAFFIC', icon: '🚦', match: ['traffic', 'transport', 'road', 'accident'] },
  { label: 'CRISIS',  icon: '🔴', match: ['conflict', 'military', 'infra', 'infrastructure', 'disaster', 'industrial', 'cyber'] },
  { label: 'PROTEST', icon: '✊', match: ['protest', 'civil_disturbance', 'unrest'] },
  { label: 'TERROR',  icon: '💥', match: ['terrorism', 'terror', 'bomb', 'security'] },
  { label: 'DISEASE', icon: '⚕', match: ['health', 'disease', 'epidemic'] },
  { label: 'VIP',     icon: '◈', match: ['vip', 'transit'] },
];

const LiveFeedPanel = ({ onSelectItem }: { onSelectItem?: (item: NewsItem) => void }) => {
  const { news, loading } = useIndiaNews();
  const [activeLoc, setActiveLoc] = useState<string>("BANGALORE");
  const [activeCat, setActiveCat] = useState<string>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const handleSelect = (item: NewsItem) => {
    setSelectedId(item.id);
    onSelectItem?.(item);
  };

  const citySlice = news.filter(n =>
    activeLoc === "ALL" || n.city?.toUpperCase() === activeLoc,
  );

  const filteredNews = citySlice
    .filter(n => {
      if (activeCat === "ALL") return true;
      const catDef = BLR_CATS.find(c => c.label === activeCat);
      if (!catDef || catDef.match.length === 0) return true;
      const cat = (n.category ?? '').toLowerCase();
      const hl  = (n.headline ?? '').toLowerCase();
      return catDef.match.some(m => cat.includes(m) || hl.includes(m));
    })
    .sort((a, b) => b.timestamp - a.timestamp);

  return (
    <>
      <div className="flex flex-col flex-shrink-0 border-b border-text-light/10 bg-bg-mid">
        {/* City filter */}
        <div className="flex px-2 pt-2 pb-1 gap-2 overflow-x-auto no-scrollbar">
          {LOCATIONS.map(loc => (
            <button
              key={loc}
              onClick={() => { setActiveLoc(loc); setActiveCat("ALL"); }}
              className={`px-3 py-1 text-[12px] uppercase font-mono whitespace-nowrap transition-colors ${activeLoc === loc
                  ? "bg-signal text-text-light font-bold"
                  : "bg-bg-dark text-text-light/70 border border-text-light/20 hover:border-signal/50"
                }`}
            >
              {loc}
            </button>
          ))}
        </div>

        {/* Category filter chips */}
        <div className="flex px-2 pb-2 pt-1 gap-1.5 overflow-x-auto no-scrollbar">
          {BLR_CATS.map(cat => (
            <button
              key={cat.label}
              onClick={() => setActiveCat(cat.label)}
              className={`px-2.5 py-0.5 text-[10px] uppercase font-mono whitespace-nowrap transition-colors border flex items-center gap-1 ${activeCat === cat.label
                  ? "bg-signal/20 text-signal border-signal/40 font-bold"
                  : "bg-transparent text-text-light/50 border-text-light/15 hover:border-signal/30"
                }`}
            >
              <span>{cat.icon}</span>{cat.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={parentRef} className="flex-1 overflow-y-auto px-2 relative py-4 scroll-smooth">
        {loading && (
          <div className="py-4 text-center mono-label text-text-light/30 animate-pulse">
            ACQUIRING FEEDS...
          </div>
        )}
        {!loading && filteredNews.length === 0 && (
          <div className="py-4 text-center mono-label text-text-light/30">NO MATCHING SIGNALS</div>
        )}

        <div className="flex flex-col gap-3">
          <AnimatePresence mode="popLayout">
            {filteredNews.map(item => {
              const isSelected = selectedId === item.id;
              return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                layout
                className="w-full"
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelect(item)}
                  onKeyDown={e => e.key === "Enter" && handleSelect(item)}
                  className="block p-4 border border-text-light/5 bg-bg-mid/50 hover:bg-bg-light hover:border-signal/30 transition-all group cursor-pointer shadow-sm relative overflow-hidden"
                  style={{
                    borderLeft: `3px solid ${CAT_ACCENT[item.category] ?? CAT_ACCENT.general}`,
                    // Selected state: right edge amber bar + slightly raised background
                    borderRight: isSelected ? '3px solid var(--signal)' : '3px solid transparent',
                    background: isSelected ? 'var(--bg-light)' : undefined,
                  }}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 text-[10px] uppercase font-bold tracking-widest border ${CAT_COLORS[item.category] ?? CAT_COLORS.general}`}>
                        {item.category}
                      </span>
                      {item.confidence === "confirmed" && (
                        <span className="text-[10px] font-mono text-signal flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 bg-signal animate-pulse" />
                          CONFIRMED
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-text-light/40 font-medium shrink-0 ml-2">
                      {item.time}
                    </span>
                  </div>

                  <div className="text-text-light text-base font-semibold leading-relaxed group-hover:text-white transition-colors mb-3">
                    {item.headline}
                    {item.langLabel && (
                      <span className="ml-2 font-mono text-[10px] text-signal/50 align-middle">{item.langLabel}</span>
                    )}
                  </div>

                  {/* Sentiment bar — only shown when Gemini enriched */}
                  {typeof item.sentiment === 'number' && (
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="font-mono text-[9px] text-text-light/30 tracking-widest w-14 shrink-0">SENTIMENT</span>
                      <div className="flex-1 relative h-1.5 bg-bg-dark rounded-none overflow-hidden">
                        {/* Center divider */}
                        <div className="absolute inset-y-0 left-1/2 w-px bg-text-light/15 -translate-x-1/2" />
                        {/* Filled region */}
                        <div
                          className="absolute inset-y-0 rounded-none transition-all duration-500"
                          style={{
                            left: item.sentiment >= 0 ? '50%' : `${50 + item.sentiment * 50}%`,
                            right: item.sentiment <= 0 ? '50%' : `${50 - item.sentiment * 50}%`,
                            background:
                              item.sentiment < -0.4 ? '#ef4444'
                              : item.sentiment < -0.1 ? '#f59e0b'
                              : item.sentiment > 0.3 ? '#00f0ff'
                              : '#a3a3a3',
                          }}
                        />
                      </div>
                      <span
                        className={`font-mono text-[10px] w-9 text-right tabular-nums shrink-0 ${
                          item.sentiment < -0.4 ? 'text-red-400'
                          : item.sentiment < -0.1 ? 'text-amber-400'
                          : item.sentiment > 0.3 ? 'text-signal'
                          : 'text-text-light/40'
                        }`}
                      >
                        {item.sentiment > 0 ? '+' : ''}{item.sentiment.toFixed(2)}
                      </span>
                    </div>
                  )}

                  {/* 3-bullet Gemini summary */}
                  {item.summary && item.summary.length > 0 && (
                    <div className="mb-3 space-y-1 border-l-2 border-signal/20 pl-2.5">
                      {item.summary.map((bullet, bi) => (
                        <div key={bi} className="flex items-start gap-1.5">
                          <span className="text-signal/50 text-[10px] mt-0.5 shrink-0">▸</span>
                          <span className="font-mono text-[11px] text-text-light/55 leading-snug">{bullet}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-auto pt-3 border-t border-text-light/5">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-text-light/60 font-bold uppercase tracking-tighter">
                        {item.source}
                      </span>
                      {typeof item.relevanceScore === 'number' && (
                        <span className="font-mono text-[10px] text-text-light/25 tabular-nums">
                          R{item.relevanceScore}
                        </span>
                      )}
                    </div>
                    {item.city && (
                      <div className="flex items-center gap-1.5 px-2 py-0.5 bg-signal/10 border border-signal/20">
                        <span className="text-signal text-[11px]">📍</span>
                        <span className="text-signal font-mono text-[10px] font-bold uppercase">{item.city}</span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )})}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
};

export default LeftPanel;