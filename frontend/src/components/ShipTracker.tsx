import { useIndiaShips } from '@/hooks/useTracking';
import type { Vessel, ShipClass } from '@/lib/ship-service';

const CLASS_COLORS: Record<ShipClass, string> = {
    military: 'text-amber-400',
    tanker: 'text-orange-400',
    cargo: 'text-blue-400',
    passenger: 'text-green-400',
    fishing: 'text-teal-400',
    tug: 'text-purple-400',
    unknown: 'text-bg-dark/40',
};

const CLASS_BG: Record<ShipClass, string> = {
    military: 'bg-amber-500/10',
    tanker: 'bg-orange-500/8',
    cargo: 'bg-blue-500/5',
    passenger: '',
    fishing: '',
    tug: '',
    unknown: '',
};

function VesselRow({ vessel }: { vessel: Vessel }) {
    const cls = vessel.shipClass;
    return (
        <div className={`py-2 border-b border-bg-dark/8 flex flex-col gap-0.5 ${vessel.isDistress ? 'bg-red-500/10' : CLASS_BG[cls]}`}>
            <div className="flex items-center justify-between">
                <span className={`font-mono text-xs font-bold ${vessel.isDistress ? 'text-red-400' : CLASS_COLORS[cls]}`}>
                    {vessel.name || `MMSI-${vessel.mmsi}`}
                </span>
                <div className="flex items-center gap-1.5">
                    {vessel.isDistress && <span className="mono-label text-red-500 animate-pulse">SART</span>}
                    {vessel.isMilitary && <span className="mono-label text-amber-400">MIL</span>}
                    {vessel.isDark && <span className="mono-label text-purple-400">DARK</span>}
                    <span className={`mono-label ${CLASS_COLORS[cls]}`}>{cls.toUpperCase()}</span>
                </div>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-mono text-bg-dark/50">
                <span>{vessel.lat.toFixed(2)},{vessel.lon.toFixed(2)}</span>
                {vessel.speedKnots !== undefined && <span>{vessel.speedKnots.toFixed(1)} kt</span>}
                {vessel.navStatusLabel && <span className="ml-auto truncate max-w-[100px]">{vessel.navStatusLabel}</span>}
            </div>
        </div>
    );
}

export function ShipTracker() {
    const { vessels, stats, distress } = useIndiaShips();
    const apiKeySet = Boolean(import.meta.env.VITE_AISSTREAM_API_KEY);

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'rgba(26,26,24,0.1)' }}>
                <h2 className="font-display text-bg-dark text-sm tracking-tight">INDIAN OCEAN — VESSEL TRACKING</h2>
                <div className="flex items-center gap-2">
                    {distress.length > 0 && (
                        <span className="mono-label text-red-500 bg-red-500/10 px-2 py-0.5 rounded animate-pulse">
                            {distress.length} DISTRESS
                        </span>
                    )}
                    <span className="mono-label text-bg-dark/50">{stats.total} VES</span>
                </div>
            </div>

            {/* No key warning */}
            {!apiKeySet && (
                <div className="mx-3 mt-3 p-3 bg-amber-500/10 border border-amber-500/30">
                    <p className="mono-label text-amber-400 leading-relaxed">
                        SET <span className="font-mono">VITE_AISSTREAM_API_KEY</span> IN{' '}
                        <span className="font-mono">frontend/.env.local</span> FOR LIVE SHIP DATA
                    </p>
                    <p className="mono-label text-bg-dark/50 mt-1">
                        FREE KEY: aisstream.io (GitHub login)
                    </p>
                </div>
            )}

            {/* Distress banner */}
            {distress.length > 0 && (
                <div className="mx-3 mt-2 p-3 bg-red-500/10 border border-red-500/30">
                    <div className="mono-label text-red-500 mb-1 flex items-center gap-2">
                        <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse inline-block" />
                        AIS-SART DISTRESS SIGNAL
                    </div>
                    {distress.map(v => (
                        <div key={v.mmsi} className="font-mono text-xs text-red-400">
                            {v.name || `MMSI-${v.mmsi}`} · {v.lat.toFixed(3)},{v.lon.toFixed(3)}
                        </div>
                    ))}
                </div>
            )}

            {/* Stats strip */}
            <div className="flex divide-x divide-bg-dark/10 px-2 py-2">
                {[
                    { label: 'Total', value: stats.total },
                    { label: 'Military', value: stats.military, red: true },
                    { label: 'Dark', value: stats.dark },
                    { label: 'Msgs', value: stats.messages.toLocaleString() },
                ].map(s => (
                    <div key={s.label} className="px-3 text-center">
                        <div className={`font-mono text-sm font-bold ${s.red && s.value > 0 ? 'text-amber-400' : 'text-bg-dark'}`}>{s.value}</div>
                        <div className="mono-label text-bg-dark/40 text-[10px]">{s.label}</div>
                    </div>
                ))}
            </div>

            {/* Vessel list */}
            <div className="flex-1 overflow-y-auto px-3 pb-2">
                {[...vessels]
                    .sort((a, b) => (b.isDistress ? 1 : 0) - (a.isDistress ? 1 : 0) || (b.isMilitary ? 1 : 0) - (a.isMilitary ? 1 : 0))
                    .slice(0, 30)
                    .map(v => <VesselRow key={v.mmsi} vessel={v} />)}
                {vessels.length === 0 && (
                    <div className="text-center py-8 mono-label text-bg-dark/30">
                        {apiKeySet ? 'CONNECTING TO AIS STREAM...' : 'API KEY NOT CONFIGURED'}
                    </div>
                )}
            </div>
        </div>
    );
}
