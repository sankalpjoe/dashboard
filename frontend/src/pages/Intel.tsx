import { useLiveIntel } from "@/hooks/useIntel";
import { ShieldAlert, Globe, Radio } from "lucide-react";

export default function Intel() {
    const { intel, loading } = useLiveIntel();

    return (
        <div className="flex-1 flex flex-col bg-bg-dark h-full overflow-hidden relative">
            <div className="absolute inset-0 bg-bg-light grain-overlay opacity-50 pointer-events-none" />

            <div className="h-14 border-b border-border-light flex items-center px-6 bg-bg-mid relative z-10 shrink-0">
                <ShieldAlert size={20} className="text-signal mr-3" />
                <span className="mono-label-lg font-bold text-white tracking-widest">INTELLIGENCE BRIEFING</span>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 relative z-10">
                <div className="max-w-4xl mx-auto flex flex-col gap-4">
                    <div className="border border-signal/20 bg-bg-dark/80 p-4 mb-4">
                        <h2 className="font-mono text-signal font-bold tracking-widest mb-2">RAW SIGNAL INTERCEPTS</h2>
                        <p className="font-mono text-text-light/80 text-xs leading-relaxed">
                            UNFILTERED OSINT STREAM AGGREGATED FROM REGIONAL AND GLOBAL SOURCES.
                            DATA MAY BE UNVERIFIED.
                        </p>
                    </div>

                    {loading ? (
                        <div className="py-12 text-center mono-label text-bg-dark/40 animate-pulse">
                            ACQUIRING TARGET SIGNALS...
                        </div>
                    ) : intel.length === 0 ? (
                        <div className="py-12 text-center mono-label text-text-light/50 border border-dashed border-text-light/20">
                            NO SIGNALS INTERCEPTED. AWAITING TRANSMISSIONS.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {intel.map((item, id) => (
                                <div key={id} className={`flex flex-col bg-bg-mid/50 border p-4 transition-all hover:bg-white/5
                    ${item.riskLevel === 'critical' ? 'border-red-500/50 hover:border-red-500' :
                                        item.riskLevel === 'high' ? 'border-orange-500/50 hover:border-orange-500' :
                                            item.riskLevel === 'medium' ? 'border-amber-500/50 hover:border-amber-500' :
                                                'border-signal/20 hover:border-signal/80'}`}>

                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-center gap-2">
                                            {item.type === 'military' ? (
                                                <ShieldAlert size={16} className="text-red-500" />
                                            ) : item.type === 'cyber' ? (
                                                <Globe size={16} className="text-blue-500" />
                                            ) : (
                                                <Radio size={16} className="text-amber-500" />
                                            )}
                                            <span className="text-[10px] font-mono font-bold tracking-widest text-signal bg-signal/10 px-1.5 py-0.5 border border-signal/20">
                                                {item.source}
                                            </span>
                                        </div>
                                        <span className={`text-[10px] font-mono px-1.5 border border-current ${item.riskLevel === 'critical' ? 'text-red-500' :
                                                item.riskLevel === 'high' ? 'text-orange-500' :
                                                    item.riskLevel === 'medium' ? 'text-amber-500' :
                                                        'text-signal'
                                            }`}>
                                            {item.riskLevel.toUpperCase()}
                                        </span>
                                    </div>

                                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-[13px] font-mono leading-relaxed text-white mb-2 line-clamp-3 flex-1 hover:text-signal transition-colors">
                                        {item.headline}
                                    </a>

                                    <div className="flex justify-between items-center mt-auto pt-3 border-t border-border-light/30">
                                        <span className="text-[10px] font-mono text-text-light/60">{item.time}</span>
                                        {(item.lat && item.lon) ? (
                                            <span className="text-[10px] font-mono text-signal/80">
                                                GEO: {item.lat.toFixed(2)}, {item.lon.toFixed(2)}
                                            </span>
                                        ) : (
                                            <span className="text-[10px] font-mono text-text-light/30">
                                                NO COORDS
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
