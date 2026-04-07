import { useState } from "react";
import { Layers, ChevronRight, ChevronDown } from "lucide-react";
import { LAYER_CATEGORIES } from "@/config/layers";

interface SettingsPanelProps {
    activeLayers: string[];
    setActiveLayers: React.Dispatch<React.SetStateAction<string[]>>;
}

const SettingsPanel = ({ activeLayers, setActiveLayers }: SettingsPanelProps) => {
    const [openCategory, setOpenCategory] = useState<string>("military");

    const toggleLayer = (layer: string) => {
        setActiveLayers(prev =>
            prev.includes(layer) ? prev.filter(l => l !== layer) : [...prev, layer]
        );
    };

    return (
        <div className="h-full bg-bg-light grain-overlay flex flex-col" style={{ width: 360 }}>
            {/* Header */}
            <div className="h-12 border-b border-border-light flex items-center px-4 bg-bg-dark">
                <Layers size={18} className="text-signal mr-3" />
                <span className="mono-label-lg font-bold text-white tracking-widest">DASHBOARD SETTINGS</span>
            </div>

            {/* Layer Controls */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar bg-bg-mid">
                <div className="py-4 px-4 border-b border-border-light/30">
                    <p className="mono-label text-text-light/80 leading-relaxed text-xs">
                        TOGGLE STRATEGIC LAYERS TO FILTER OSINT FEED VISIBILITY ON THE MAIN TACTICAL MAP.
                    </p>
                </div>

                {LAYER_CATEGORIES.map(category => (
                    <div key={category.id} className="border-b border-border-light/50 last:border-0">
                        <button
                            onClick={() => setOpenCategory(openCategory === category.id ? "" : category.id)}
                            className="w-full flex items-center justify-between px-4 py-3 bg-bg-dark/30 hover:bg-bg-dark/60 transition-colors"
                        >
                            <span className="mono-label text-white/90 font-bold">{category.label}</span>
                            {openCategory === category.id ? <ChevronDown size={14} className="text-signal" /> : <ChevronRight size={14} className="text-text-light/50" />}
                        </button>

                        {openCategory === category.id && (
                            <div className="flex flex-col py-1 bg-black/20">
                                {category.items.map(item => {
                                    const isActive = activeLayers.includes(item.id);
                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => toggleLayer(item.id)}
                                            className={`flex items-center gap-3 px-6 py-2 text-left hover:bg-signal/10 transition-colors ${isActive ? 'bg-signal/5' : ''}`}
                                        >
                                            <div className={`w-3 h-3 border ${isActive ? 'bg-signal border-signal' : 'border-text-light/30 bg-transparent'} rounded-sm flex-shrink-0`} />
                                            <span className={`font-mono text-[12px] uppercase tracking-wide ${isActive ? 'text-signal font-bold' : 'text-silver'}`}>
                                                {item.label}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default SettingsPanel;
