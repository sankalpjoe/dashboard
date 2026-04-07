import { useState, useEffect } from 'react';
import { type IntelItem } from '@/lib/intel-service';
import { fetchBusinessTwitterFeed, fetchBusinessAccountTimelines } from '@/lib/business-twitter-service';
import { fetchRedditIntel } from '@/lib/reddit-service';
import { fetchTelegramIntel } from '@/lib/telegram-service';

const POLL_INTERVAL = 5 * 60_000; // 5 mins

const NEGATIVE_KEYWORDS = [
    'scandal', 'fraud', 'lawsuit', 'investigation', 'backlash', 'criticism',
    'penalty', 'fine', 'regulatory', 'illegal', 'corruption', 'misconduct',
    'unethical', 'breach', 'probe', 'allegation', 'charged', 'indicted',
    'guilty', 'settlement', 'fail', 'loss', 'crisis', 'harm', 'dangerous',
    'threat', 'controversy', 'dispute', 'layoff', 'protest', 'strike',
    'resignation', 'forced', 'ousted', 'fired', 'trouble', 'worst', 'bad',
    'jerk', 'toxic', 'misogyny', 'sex', 'oral', 'bragged', 'private jet',
    'dj', 'd-sol', 'edm', 'arrogant', 'ruthless', 'greedy', 'culture',
    'quit', 'exodus', 'hated', 'unpopular'
];

function isNegative(text: string): boolean {
    const t = text.toLowerCase();
    return NEGATIVE_KEYWORDS.some(k => t.includes(k));
}

export function useBusinessIntel() {
    const [cxoIntel, setCxoIntel] = useState<IntelItem[]>([]);
    const [companyIntel, setCompanyIntel] = useState<IntelItem[]>([]);
    const [socialMediaIntel, setSocialMediaIntel] = useState<IntelItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        const poll = async () => {
            try {
                // Expanded list of CXOs and Board Members for targeted surveillance
                const cxoNames = [
                    'David Solomon', 'John Waldron', 'Denis Coleman', 'Kathryn Ruemmler',
                    'Marco Argenti', 'Sheara Fredman', 'Russell Horwitz', 'Ashok Varadhan',
                    'Carey Halio', 'Michael Paese', 'Michele Burns', 'Jan Tighe',
                    'Lakshmi Mittal', 'Ellen Kullman', 'John Hess', 'Kimberley Harris',
                    'Kevin Johnson', 'Mark Flaherty', 'KC McClure', 'Peter Oppenheimer',
                    'Thomas Montag', 'David Viniar'
                ];

                const namesQuery = cxoNames.map(n => `"${n}"`).join(' OR ');
                const negativeTerms = '(scandal OR lawsuit OR fraud OR investigation OR backlash OR criticism OR penalty OR fine OR misconduct OR unethical OR illegal OR resignation OR ousted OR fired OR controversy OR allegation)';

                // Fetch CXO intel
                const cxoQuery = encodeURIComponent(`(${namesQuery}) AND "Goldman Sachs" ${negativeTerms}`);
                const cxoUrl = `/api/news/rss/search?q=${cxoQuery}&hl=en-US&gl=US&ceid=US:en`;

                // Fetch Company intel
                const companyQuery = encodeURIComponent(`"Goldman Sachs" ${negativeTerms}`);
                const companyUrl = `/api/news/rss/search?q=${companyQuery}&hl=en-US&gl=US&ceid=US:en`;

                const [cxoRes, companyRes, twitterSearch, twitterTimelines, redditIntel, telegramIntel] = await Promise.all([
                    fetch(cxoUrl).then(r => r.text()),
                    fetch(companyUrl).then(r => r.text()),
                    fetchBusinessTwitterFeed(),
                    fetchBusinessAccountTimelines(),
                    fetchRedditIntel(),
                    fetchTelegramIntel()
                ]);

                if (!active) return;

                const parsedCxo = parseRss(cxoRes, 'CXO WATCH').filter(item => isNegative(item.headline));
                const parsedCompany = parseRss(companyRes, 'CORP RISK').filter(item => isNegative(item.headline));

                // Combine RSS sources only for CXO and Company
                setCxoIntel(parsedCxo.sort((a, b) => getRiskWeight(b.riskLevel) - getRiskWeight(a.riskLevel)));
                setCompanyIntel(parsedCompany.sort((a, b) => getRiskWeight(b.riskLevel) - getRiskWeight(a.riskLevel)));

                // Combine all Social Media sources and filter for negativity
                const combinedSocial = [...twitterSearch, ...twitterTimelines, ...redditIntel, ...telegramIntel]
                    .filter(item => isNegative(item.headline))
                    .sort((a, b) => getRiskWeight(b.riskLevel) - getRiskWeight(a.riskLevel));

                setSocialMediaIntel(combinedSocial);
            } catch (err) {
                console.error("Failed to fetch business intel", err);
            } finally {
                if (active) setLoading(false);
            }
        };

        void poll();
        const timer = setInterval(poll, POLL_INTERVAL);

        return () => {
            active = false;
            clearInterval(timer);
        };
    }, []);

    return { cxoIntel, companyIntel, socialMediaIntel, loading };
}

function parseRss(xml: string, sourcePrefix: string): IntelItem[] {
    const items: IntelItem[] = [];
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days in milliseconds
    
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');
        const elements = doc.querySelectorAll('item');

        elements.forEach(el => {
            let title = el.querySelector('title')?.textContent?.trim() ?? '';
            const link = el.querySelector('link')?.textContent?.trim() ?? '';
            const pubDate = el.querySelector('pubDate')?.textContent?.trim() ?? '';

            if (!title) return;

            // Parse and validate date - STRICT 30-DAY FILTER
            const articleDate = pubDate ? new Date(pubDate) : null;
            if (!articleDate || isNaN(articleDate.getTime())) {
                // Skip articles without valid dates
                return;
            }

            // CRITICAL: Only include articles from last 30 days
            if (articleDate.getTime() < thirtyDaysAgo) {
                return; // Skip old articles
            }

            // Clean up Google News suffix
            title = title.replace(/\s+-\s+[^-]+$/, '').trim();

            const timeStr = getRelativeTime(articleDate);

            items.push({
                id: `biz-${Math.random().toString(36).substring(2)}`,
                headline: title,
                source: `${sourcePrefix} OSINT`,
                time: timeStr,
                url: link || undefined,
                type: 'cyber', // repurposing icon
                riskLevel: getRiskLevel(title),
            });
        });
    } catch (e) {
        console.error(`Failed to parse XML`, e);
    }
    return items;
}

function getRiskLevel(title: string): IntelItem['riskLevel'] {
    const t = title.toLowerCase();
    if (t.includes('scandal') || t.includes('fraud') || t.includes('indicted')) return 'critical';
    if (t.includes('lawsuit') || t.includes('investigation') || t.includes('penalty')) return 'high';
    if (t.includes('backlash') || t.includes('criticism') || t.includes('regulatory') || t.includes('fine')) return 'medium';
    return 'info';
}

function getRelativeTime(date: Date): string {
    if (isNaN(date.getTime())) return 'recently';
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

function getRiskWeight(risk: string): number {
    if (risk === 'critical') return 3;
    if (risk === 'high') return 2;
    if (risk === 'medium') return 1;
    return 0;
}
