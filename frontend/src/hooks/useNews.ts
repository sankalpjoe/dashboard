import { useState, useEffect, useRef } from 'react';
import { fetchIndiaNews, fetchCityNews, fetchBreakingHeadlines, type NewsItem } from '@/lib/news-service';

const POLL_MS = 5 * 60_000; // 5 min

export function useIndiaNews() {
    const [news, setNews] = useState<NewsItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        const poll = async () => {
            console.log('[useIndiaNews] Fetching news...');
            try {
                const data = await fetchIndiaNews();
                if (!active) return;
                console.log('[useIndiaNews] Received news:', data.length);
                setNews(data);
                setLoading(false);
            } catch (err) {
                console.error('[useIndiaNews] Fetch failed:', err);
                if (active) setLoading(false);
            }
        };
        void poll();
        const t = setInterval(poll, POLL_MS);
        return () => { active = false; clearInterval(t); };
    }, []);

    return { news, loading };
}

export function useCityNews(city: string) {
    const [news, setNews] = useState<NewsItem[]>([]);
    const [loading, setLoading] = useState(true);
    const cityRef = useRef(city);
    cityRef.current = city;

    useEffect(() => {
        let active = true;
        setLoading(true);
        setNews([]);
        const poll = async () => {
            const data = await fetchCityNews(cityRef.current);
            if (!active) return;
            setNews(data);
            setLoading(false);
        };
        void poll();
        const t = setInterval(poll, POLL_MS);
        return () => { active = false; clearInterval(t); };
    }, [city]);

    return { news, loading };
}

export function useBreakingHeadlines() {
    const [headlines, setHeadlines] = useState<NewsItem[]>([]);

    useEffect(() => {
        let active = true;
        const poll = async () => {
            const data = await fetchBreakingHeadlines();
            if (!active) return;
            setHeadlines(data);
        };
        void poll();
        const t = setInterval(poll, POLL_MS);
        return () => { active = false; clearInterval(t); };
    }, []);

    return { headlines };
}
