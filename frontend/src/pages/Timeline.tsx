import { useLiveIntel } from "@/hooks/useIntel";
import { Clock, ShieldAlert, Globe, Radio } from "lucide-react";

export default function Timeline() {
    const { intel, loading } = useLiveIntel();

    return (
        <div className="flex-1 flex flex-col bg-bg-dark border-l border-signal/10 h-full overflow-hidden relative">
            <div className="absolute inset-0 bg-bg-mid opacity-50 pointer-events-none" />

            <div className="h-14 border-b border-border-light flex items-center px-6 bg-bg-mid relative z-10 shrink-0">
                <Clock size={20} className="text-signal mr-3" />
                <span className="mono-label-lg font-bold text-white tracking-widest">TACTICAL TIMELINE (24H)</span>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 relative z-10">
                <div className="max-w-4xl mx-auto flex flex-col gap-6 relative">
                    {/* Vertical connecting line */}
                    <div className="absolute top-0 bottom-0 left-[23px] w-px bg-signal/20" />

                    {loading ? (
                        <div className="py-12 text-center mono-label text-text-light/40 animate-pulse">
                            SYNCING PAST 24 HOURS OF TACTICAL FEEDS...
                        </div>
                    ) : intel.length === 0 ? (
                        <div className="py-12 text-center mono-label text-text-light/50">
                            AWAITING FRESH INTEL. NO RECENT EVENTS DETECTED.
                        </div>
                    ) : (
                        intel.map((item, id) => (
                            <div key={id} className="flex gap-6 group hover:bg-white/5 p-4 rounded-sm transition-colors border border-transparent hover:border-signal/10">
                                <div className="w-12 h-12 bg-bg-mid border border-signal flex items-center justify-center shrink-0 z-10 relative">
                                    {item.type === 'military' ? (
                                        <ShieldAlert size={20} className="text-red-500" />
                                    ) : item.type === 'cyber' ? (
                                        <Globe size={20} className="text-blue-500" />
                                    ) : (
                                        <Radio size={20} className="text-amber-500" />
                                    )}
                                </div>

                                <div className="flex-1 flex flex-col">
                                    <div className="flex items-center gap-3 mb-2">
                                        <span className="text-[12px] font-mono font-bold tracking-widest text-signal bg-signal/10 px-2 py-0.5 border border-signal/20">
                                            {item.source}
                                        </span>
                                        <span className="text-[11px] font-mono text-text-light/60">{item.time}</span>
                                        <span className={`text-[10px] font-mono px-1.5 border ${item.riskLevel === 'critical' ? 'border-red-500 text-red-500 bg-red-500/10' :
                                                item.riskLevel === 'high' ? 'border-lime-600 text-lime-600 bg-lime-600/10' :
                                                    item.riskLevel === 'medium' ? 'border-amber-500 text-amber-500 bg-amber-500/10' :
                                                        'border-signal text-signal bg-signal/10'
                                            }`}>
                                            {item.riskLevel.toUpperCase()}
                                        </span>
                                    </div>

                                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-[14px] font-mono leading-relaxed text-silver hover:text-white transition-colors">
                                        {item.headline}
                                    </a>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
