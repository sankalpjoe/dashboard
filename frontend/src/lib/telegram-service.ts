import { type IntelItem } from './intel-service';

const CHANNELS = ['WallStreetJournal', 'BloombergNews', 'FinancialTimes', 'reuters'];

export async function fetchTelegramIntel(): Promise<IntelItem[]> {
    const results: IntelItem[] = [];

    const channelPromises = CHANNELS.map(async (channel) => {
        try {
            // Use proxy to avoid CORS
            const res = await fetch(`/api/telegram/s/${channel}`);
            const html = await res.text();

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            const messages: IntelItem[] = [];
            doc.querySelectorAll('.tgme_widget_message').forEach(el => {
                const text = el.querySelector('.tgme_widget_message_text')?.textContent?.trim();
                if (!text) return;

                // Only keep if it mentions Goldman Sachs or its executives
                const t = text.toLowerCase();
                if (t.includes('goldman') || t.includes('david solomon') || t.includes('john waldron') || t.includes('denis coleman')) {
                    const date = el.querySelector('time')?.getAttribute('datetime');
                    const link = el.querySelector('.tgme_widget_message_date a')?.getAttribute('href') || undefined;

                    messages.push({
                        id: `tg-${channel}-${Math.random().toString(36).substring(2)}`,
                        headline: text.length > 200 ? text.substring(0, 197) + '...' : text,
                        source: `${channel} (TG)`,
                        time: date ? getRelativeTime(new Date(date)) : 'recently',
                        url: link,
                        type: 'cyber',
                        riskLevel: getRiskLevel(text),
                    });
                }
            });
            return messages;
        } catch (err) {
            console.warn(`Failed to fetch Telegram channel ${channel}`, err);
            return [];
        }
    });

    const allResults = await Promise.all(channelPromises);
    return allResults.flat();
}

function getRiskLevel(text: string): IntelItem['riskLevel'] {
    const t = text.toLowerCase();
    if (t.includes('scandal') || t.includes('fraud') || t.includes('indicted')) return 'critical';
    if (t.includes('lawsuit') || t.includes('investigation') || t.includes('penalty')) return 'high';
    if (t.includes('backlash') || t.includes('criticism') || t.includes('regulatory') || t.includes('fine')) return 'medium';
    return 'info';
}

function getRelativeTime(date: Date): string {
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}
