import { useIndiaFlights } from '@/hooks/useTracking';
import { EMERGENCY_SQUAWKS } from '@/lib/flight-service';

const SQ_COLORS: Record<string, string> = {
    '7700': 'text-red-400',
    '7600': 'text-amber-400',
    '7500': 'text-red-500',
};

const CAT_LABELS: Record<string, string> = {
    A1: 'Light', A2: 'Light', A3: 'Medium', A4: 'Medium', A5: 'Heavy', A6: 'Heavy',
    B1: 'Glider', B2: 'Heli', B4: 'Gyro', B6: 'UAV', B7: 'Space',
};

export function FlightTracker() {
    const { flights, loading, source, emergencies, military, dark } = useIndiaFlights();

    if (loading) return (
        <div className="flex-1 flex flex-col">
            <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(26,26,24,0.1)' }}>
                <h2 className="font-display text-bg-dark text-sm tracking-tight">LIVE FLIGHTS — INDIA AIRSPACE</h2>
            </div>
            <div className="flex-1 flex items-center justify-center">
                <span className="mono-label text-bg-dark/40 animate-pulse">ACQUIRING . . .</span>
            </div>
        </div>
    );

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'rgba(26,26,24,0.1)' }}>
                <h2 className="font-display text-bg-dark text-sm tracking-tight">LIVE FLIGHTS — INDIA AIRSPACE</h2>
                <div className="flex items-center gap-2">
                    {emergencies.length > 0 && (
                        <span className="mono-label text-red-500 bg-red-500/10 px-2 py-0.5 rounded">
                            {emergencies.length} EMERG
                        </span>
                    )}
                    <span className="mono-label text-bg-dark/50">{flights.length} AC</span>
                </div>
            </div>

            {/* Emergency section */}
            {emergencies.length > 0 && (
                <div className="mx-3 mt-3 p-3 bg-red-500/10 border border-red-500/30">
                    <div className="mono-label text-red-500 mb-2 flex items-center gap-2">
                        <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse inline-block" />
                        EMERGENCY SQUAWK ACTIVE
                    </div>
                    {emergencies.map(f => (
                        <div key={f.id} className="text-xs font-mono text-red-400 mb-1">
                            {f.callsign} · SQ{f.squawk} · {f.emergencyType}
                        </div>
                    ))}
                </div>
            )}

            {/* Stats strip */}
            <div className="flex divide-x divide-bg-dark/10 px-2 py-2">
                <StatChip label="Total" value={flights.length} />
                <StatChip label="Military" value={military.length} red={military.length > 0} />
                <StatChip label="Dark" value={dark.length} />
                <StatChip label="SRC" value={source} mono />
            </div>

            {/* Flight list — show top 20 sorted by interest */}
            <div className="flex-1 overflow-y-auto px-3 pb-2">
                {[...flights]
                    .sort((a, b) => (b.isEmergency ? 1 : 0) - (a.isEmergency ? 1 : 0) || (b.isMilitary ? 1 : 0) - (a.isMilitary ? 1 : 0))
                    .slice(0, 20)
                    .map(f => (
                        <div
                            key={f.id}
                            className={`py-2 border-b border-bg-dark/8 flex flex-col gap-0.5 ${f.isEmergency ? 'bg-red-500/5' : f.isMilitary ? 'bg-amber-500/5' : ''}`}
                        >
                            <div className="flex items-center justify-between">
                                <span className={`font-mono text-xs font-bold ${f.isEmergency ? 'text-red-400' : f.isMilitary ? 'text-amber-400' : 'text-bg-dark'}`}>
                                    {f.callsign}
                                </span>
                                <div className="flex items-center gap-2">
                                    {f.squawk && f.squawk in SQ_COLORS && (
                                        <span className={`mono-label ${SQ_COLORS[f.squawk]}`}>SQ{f.squawk}</span>
                                    )}
                                    {f.category && (
                                        <span className="mono-label text-bg-dark/40">{CAT_LABELS[f.category] ?? f.category}</span>
                                    )}
                                    {f.isDark && <span className="mono-label text-purple-400">DARK</span>}
                                </div>
                            </div>
                            <div className="flex items-center gap-3 text-[11px] font-mono text-bg-dark/50">
                                <span>{f.altitudeFt.toLocaleString()} ft</span>
                                <span>{f.speedKnots} kt</span>
                                <span>{f.heading}°</span>
                                <span className="ml-auto">{f.lat.toFixed(2)},{f.lon.toFixed(2)}</span>
                            </div>
                        </div>
                    ))}
                {flights.length === 0 && (
                    <div className="text-center py-8 mono-label text-bg-dark/30">NO AIRCRAFT DATA</div>
                )}
            </div>
        </div>
    );
}

function StatChip({ label, value, red, mono }: { label: string; value: string | number; red?: boolean; mono?: boolean }) {
    return (
        <div className="px-3 text-center">
            <div className={`font-mono text-sm font-bold ${red && Number(value) > 0 ? 'text-amber-400' : 'text-bg-dark'}`}>
                {mono ? <span className="text-[11px]">{value}</span> : value}
            </div>
            <div className="mono-label text-bg-dark/40 text-[10px]">{label}</div>
        </div>
    );
}
