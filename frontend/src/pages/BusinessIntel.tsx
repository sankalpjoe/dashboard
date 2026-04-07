import { useBusinessIntel } from "@/hooks/useBusinessIntel";
import { ShieldAlert, Briefcase, AlertTriangle, Share2 } from "lucide-react";
import type { IntelItem } from "@/lib/intel-service";

export default function BusinessIntel() {
    const { cxoIntel, companyIntel, socialMediaIntel, loading } = useBusinessIntel();

    return (
        <div className="flex-1 flex flex-col bg-bg-dark h-full overflow-hidden relative">
            <div className="absolute inset-0 bg-[#00073f]/10 grain-overlay opacity-50 pointer-events-none" />

            <div className="h-14 border-b border-border-light flex items-center px-6 bg-[#00073f] relative z-10 shrink-0 shadow-lg">
                <Briefcase size={20} className="text-signal mr-3" />
                <span className="mono-label-lg font-bold text-white tracking-widest">BUSINESS INTEL & OSINT</span>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 relative z-10">
                <div className="max-w-[1400px] mx-auto flex flex-col xl:flex-row gap-6">

                    {/* Left Column: CXO Watch */}
                    <div className="flex-1 flex flex-col gap-4">
                        <div className="border border-signal/20 bg-[#00073f]/40 p-4 mb-2 backdrop-blur-sm">
                            <h2 className="font-mono text-signal font-bold tracking-widest mb-2 flex items-center gap-2">
                                <ShieldAlert size={16} />
                                EXECUTIVE LEADERSHIP (CXO) WATCH
                            </h2>
                            <p className="font-mono text-text-light/80 text-[10px] leading-relaxed uppercase">
                                TARGETED OSINT SURVEILLANCE OF GOLDMAN SACHS MANAGEMENT COMMITTEE.
                            </p>
                        </div>

                        <Feed items={cxoIntel} loading={loading} emptyMessage="NO NEGATIVE SIGNALS DETECTED FOR CXOS." />
                    </div>

                    {/* Middle Column: Corporate Risk */}
                    <div className="flex-1 flex flex-col gap-4">
                        <div className="border border-orange-500/20 bg-[#00073f]/40 p-4 mb-2 backdrop-blur-sm">
                            <h2 className="font-mono text-orange-400 font-bold tracking-widest mb-2 flex items-center gap-2">
                                <AlertTriangle size={16} />
                                CORPORATE RISK SUMMARY
                            </h2>
                            <p className="font-mono text-text-light/80 text-[10px] leading-relaxed uppercase">
                                GLOBAL AGGREGATION OF LAWSUITS, FRAUD ALLEGATIONS, AND REGULATORY ACTIONS.
                            </p>
                        </div>

                        <Feed items={companyIntel} loading={loading} emptyMessage="NO CORPORATE RISK SIGNALS DETECTED." />
                    </div>

                    {/* Right Column: Social Media */}
                    <div className="flex-1 flex flex-col gap-4">
                        <div className="border border-blue-400/20 bg-[#00073f]/40 p-4 mb-2 backdrop-blur-sm">
                            <h2 className="font-mono text-blue-400 font-bold tracking-widest mb-2 flex items-center gap-2">
                                <Share2 size={16} />
                                SOCIAL MEDIA & DISCOURSE
                            </h2>
                            <p className="font-mono text-text-light/80 text-[10px] leading-relaxed uppercase">
                                REAL-TIME SIGNALS FROM TWITTER, REDDIT, AND TELEGRAM.
                            </p>
                        </div>

                        <Feed items={socialMediaIntel} loading={loading} emptyMessage="NO SOCIAL MEDIA SIGNALS DETECTED." />
                    </div>
                </div>
            </div>
        </div>
    );
}

function Feed({ items, loading, emptyMessage }: { items: IntelItem[], loading: boolean, emptyMessage: string }) {
    if (loading) {
        return (
            <div className="py-12 text-center mono-label text-text-light/20 animate-pulse border border-dashed border-text-light/10">
                ACQUIRING OSINT SIGNALS...
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className="py-12 text-center mono-label text-text-light/50 border border-dashed border-text-light/20 bg-[#00073f]/20">
                {emptyMessage}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3">
            {items.map((item, id) => (
                <div key={id} className={`flex flex-col bg-[#00073f]/30 border p-3 transition-all hover:bg-white/5 backdrop-blur-sm
                    ${item.riskLevel === 'critical' ? 'border-red-500/30 hover:border-red-500' :
                        item.riskLevel === 'high' ? 'border-orange-500/30 hover:border-orange-500' :
                            item.riskLevel === 'medium' ? 'border-amber-500/30 hover:border-amber-500' :
                                'border-signal/10 hover:border-signal/60'}`}>

                    <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                            <span className={`text-[9px] font-mono font-bold tracking-widest px-1.5 py-0.5 border
                                ${item.source.includes('TG') ? 'text-blue-400 bg-blue-400/10 border-blue-400/20' :
                                    item.source.includes('r/') || item.source.includes('REDDIT') ? 'text-orange-400 bg-orange-400/10 border-orange-400/20' :
                                        item.source.includes('X / TWITTER') || item.source.includes('X)') ? 'text-sky-400 bg-sky-400/10 border-sky-400/20' :
                                            'text-signal bg-signal/10 border-signal/20'}`}>
                                {item.source}
                            </span>
                        </div>
                        <span className={`text-[9px] font-mono px-1.5 border border-current ${item.riskLevel === 'critical' ? 'text-red-500' :
                            item.riskLevel === 'high' ? 'text-orange-500' :
                                item.riskLevel === 'medium' ? 'text-amber-500' :
                                    'text-signal'
                            }`}>
                            {item.riskLevel.toUpperCase()}
                        </span>
                    </div>

                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-[12px] font-mono leading-snug text-white/90 mb-1 flex-1 hover:text-signal transition-colors line-clamp-2">
                        {item.headline}
                    </a>

                    <div className="flex justify-between items-center mt-auto pt-2 border-t border-border-light/10">
                        <span className="text-[9px] font-mono text-text-light/40 tracking-tighter">{item.time}</span>
                    </div>
                </div>
            ))}
        </div>
    );
}
