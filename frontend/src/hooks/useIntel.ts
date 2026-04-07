import { useState, useEffect } from 'react';
import { fetchLiveIntel, type IntelItem } from '@/lib/intel-service';

const POLL_INTERVAL = 5 * 60_000; // 5 mins

export function useLiveIntel() {
    const [intel, setIntel] = useState<IntelItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        const poll = async () => {
            const data = await fetchLiveIntel();
            if (!active) return;
            setIntel(data);
            setLoading(false);
        };

        void poll();
        const timer = setInterval(poll, POLL_INTERVAL);

        return () => {
            active = false;
            clearInterval(timer);
        };
    }, []);

    return { intel, loading };
}
