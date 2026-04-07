import { useState, useEffect, useRef } from 'react';
import { fetchIndiaFlights, type IndiaFlight } from '@/lib/flight-service';
import { startShipService, getAllVessels, getShipStats, type Vessel } from '@/lib/ship-service';

const POLL_MS = 30_000;

// ---------------------------------------------------------------------------
// useIndiaFlights — polls adsb.lol every 30s
// ---------------------------------------------------------------------------
export function useIndiaFlights() {
    const [flights, setFlights] = useState<IndiaFlight[]>([]);
    const [loading, setLoading] = useState(true);
    const [source, setSource] = useState<string>('—');

    useEffect(() => {
        let active = true;

        const poll = async () => {
            const data = await fetchIndiaFlights();
            if (!active) return;
            setFlights(data);
            setLoading(false);
            setSource(data.length > 0 ? 'adsb.lol' : 'offline');
        };

        void poll();
        const timer = setInterval(poll, POLL_MS);
        return () => { active = false; clearInterval(timer); };
    }, []);

    const emergencies = flights.filter(f => f.isEmergency);
    const military = flights.filter(f => f.isMilitary);
    const indianReg = flights.filter(f => f.isIndianReg);
    const dark = flights.filter(f => f.isDark);

    return { flights, loading, source, emergencies, military, indianReg, dark };
}

// ---------------------------------------------------------------------------
// useIndiaShips — AIS Stream Disabled
// ---------------------------------------------------------------------------
interface ShipStats { total: number; distress: number; military: number; dark: number; messages: number }

export function useIndiaShips() {
    const [vessels] = useState<Vessel[]>([]);
    const [stats] = useState<ShipStats>({ total: 0, distress: 0, military: 0, dark: 0, messages: 0 });

    const distress = vessels.filter(v => v.isDistress);
    const military = vessels.filter(v => v.isMilitary);

    return { vessels, stats, distress, military };
}

// ---------------------------------------------------------------------------
// Combined status for BottomBar
// ---------------------------------------------------------------------------
export function useTrackingStatus() {
    const { flights, emergencies, military: milFlights } = useIndiaFlights();
    const { stats, distress, military: milShips } = useIndiaShips();

    return {
        civFlights: flights.filter(f => !f.isMilitary).length,
        milAssets: milFlights.length + milShips.length,
        ships: stats.total,
        alerts: emergencies.length + distress.length,
        dark: stats.dark,
    };
}
