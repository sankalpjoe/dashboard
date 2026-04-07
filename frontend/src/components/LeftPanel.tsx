import { useState, useRef } from "react";
import { useIndiaNews } from "@/hooks/useNews";
import { motion, AnimatePresence } from "framer-motion";
import type { PersonnelRecord } from "@/components/CsvUploader";
import type { NewsItem } from "@/lib/news-service";

const channels = ["TIMES NOW", "WION", "AL JAZEERA"];

const CHANNEL_URLS: Record<string, string> = {
  "TIMES NOW": "https://www.youtube.com/embed/rBIQiwmJ9-o?autoplay=1",
  "WION": "https://www.youtube.com/embed/vfszY1JYbMc?autoplay=1",
  "AL JAZEERA": "https://www.youtube.com/embed/gCNeDWCI0vo?autoplay=1",
};

const LOCATIONS = ["ALL", "BANGALORE", "DELHI", "HYDERABAD", "MUMBAI"];

const CAT_COLORS: Record<string, string> = {
  conflict: 'text-red-400    bg-red-400/10    border-red-400/20',
  terrorism: 'text-rose-500   bg-rose-500/10   border-rose-500/25',
  disaster: 'text-amber-400  bg-amber-400/10  border-amber-400/20',
  cyber: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  military: 'text-signal     bg-signal/10     border-signal/20',
  protest: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
  industrial: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
  humanitarian: 'text-teal-400   bg-teal-400/10   border-teal-400/20',
  economic: 'text-sky-400    bg-sky-400/10    border-sky-400/20',
  general: 'text-text-light bg-text-light/10 border-text-light/20',
};

// ---------------------------------------------------------------------------

const LeftPanel = ({
  onPersonnelUpload,
  onSelectItem,
}: {
  onPersonnelUpload: (data: PersonnelRecord[]) => void;
  onSelectItem?: (item: NewsItem) => void;
}) => {
  const [activeChannel, setActiveChannel] = useState("WION");

  return (
    <div
      className="h-full bg-bg-dark flex flex-col border-r border-border-light relative group"
      style={{ width: 400, minWidth: 320, maxWidth: 800, resize: "horizontal", overflow: "hidden" }}
    >
      {/* Drag handle */}
      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-16 bg-border-light/50 rounded-l flex flex-col justify-center items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
        {[0, 1, 2].map(i => <div key={i} className="w-0.5 h-1 bg-text-light/30" />)}
      </div>

      {/* Live video */}
      <div className="relative w-full aspect-video bg-bg-mid flex-shrink-0">
        <iframe
          src={`${CHANNEL_URLS[activeChannel]}&origin=${typeof window !== "undefined" ? window.location.origin : "http://localhost:5174"}`}
          className="w-full h-full"
          allow="autoplay; encrypted-media"
          allowFullScreen
          title={activeChannel}
          style={{ border: "none" }}
        />
        <div className="absolute top-3 right-3 bg-signal px-2 py-0.5 pointer-events-none">
          <span className="mono-label text-bg-dark font-medium">● LIVE</span>
        </div>
        <a
          href={`https://www.youtube.com/watch?v=${new URL(CHANNEL_URLS[activeChannel]).pathname.split("/").pop()}`}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-3 right-3 bg-bg-dark/80 text-signal border border-signal/50 px-2.5 py-1 text-[10px] font-mono hover:bg-signal hover:text-bg-dark transition-colors cursor-pointer"
        >
          OPEN EXTERNAL ↗
        </a>
      </div>

      {/* Channel switcher */}
      <div className="p-3 flex-shrink-0">
        <div className="mono-label text-text-light/40 mb-3">CHANNELS</div>
        <div className="grid grid-cols-3 gap-1.5">
          {channels.map(ch => (
            <button
              key={ch}
              onClick={() => setActiveChannel(ch)}
              className={`px-1.5 py-2 mono-label text-center cursor-pointer transition-none ${activeChannel === ch
                  ? "bg-signal text-bg-dark"
                  : "bg-bg-mid text-text-light hover:border hover:border-signal"
                }`}
            >
              {ch}
            </button>
          ))}
        </div>
      </div>

      {/* Feed panel */}
      <div className="flex-1 overflow-hidden flex flex-col border-t border-text-light/10">
        <LiveFeedPanel onSelectItem={onSelectItem} />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------

const LiveFeedPanel = ({ onSelectItem }: { onSelectItem?: (item: NewsItem) => void }) => {
  const { news, loading } = useIndiaNews();
  const [activeLoc, setActiveLoc] = useState<string>("ALL");
  const [activeCat, setActiveCat] = useState<string>("ALL");
  const parentRef = useRef<HTMLDivElement>(null);

  const citySlice = news.filter(n =>
    activeLoc === "ALL" || n.city?.toUpperCase() === activeLoc,
  );

  const availableCategories = [
    "ALL",
    ...Array.from(new Set(citySlice.map(n => n.category))).sort(),
  ];

  const filteredNews = citySlice
    .filter(n => activeCat === "ALL" || n.category === activeCat)
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
              className={`px-3 py-1 text-[10px] uppercase font-mono rounded-full whitespace-nowrap transition-colors ${activeLoc === loc
                  ? "bg-signal text-bg-dark font-bold"
                  : "bg-bg-dark text-text-light/70 border border-text-light/20 hover:border-signal/50"
                }`}
            >
              {loc}
            </button>
          ))}
        </div>

        {/* Category filter */}
        <div className="flex px-2 pb-2 pt-1 gap-1.5 overflow-x-auto no-scrollbar">
          {availableCategories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCat(cat)}
              className={`px-2.5 py-0.5 text-[9px] uppercase font-mono rounded whitespace-nowrap transition-colors border ${activeCat === cat
                  ? "bg-signal/20 text-signal border-signal/40 font-bold"
                  : "bg-transparent text-text-light/50 border-text-light/15 hover:border-signal/30"
                }`}
            >
              {cat}
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
            {filteredNews.map(item => (
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
                  onClick={() => onSelectItem?.(item)}
                  onKeyDown={e => e.key === "Enter" && onSelectItem?.(item)}
                  className="block p-4 border border-text-light/5 rounded-lg bg-bg-mid/50 hover:bg-bg-mid hover:border-signal/40 transition-all group cursor-pointer shadow-sm"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 text-[9px] uppercase font-bold tracking-widest rounded border ${CAT_COLORS[item.category] ?? CAT_COLORS.general}`}>
                        {item.category}
                      </span>
                      {item.confidence === "confirmed" && (
                        <span className="text-[9px] font-mono text-signal flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
                          CONFIRMED
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-text-light/40 font-medium shrink-0 ml-2">
                      {item.time}
                    </span>
                  </div>

                  <div className="text-text-light text-sm font-semibold leading-relaxed group-hover:text-white transition-colors mb-3">
                    {item.headline}
                  </div>

                  <div className="flex items-center justify-between mt-auto pt-3 border-t border-text-light/5">
                    <span className="text-[10px] font-mono text-text-light/60 font-bold uppercase tracking-tighter">
                      {item.source}
                    </span>
                    {item.city && (
                      <div className="flex items-center gap-1.5 px-2 py-0.5 bg-signal/10 rounded-full border border-signal/20">
                        <span className="text-signal text-[10px]">📍</span>
                        <span className="text-signal font-mono text-[9px] font-bold uppercase">{item.city}</span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
};

export default LeftPanel;