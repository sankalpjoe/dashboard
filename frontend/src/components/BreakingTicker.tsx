import { useBreakingHeadlines } from '@/hooks/useNews';
import type { NewsItem } from '@/lib/news-service';

const FALLBACK = [{ source: 'INDIA CRISIS', text: 'LOADING LIVE INTELLIGENCE FEEDS — PLEASE WAIT' }];

const BreakingTicker = () => {
  const { headlines } = useBreakingHeadlines();
  const items = headlines.length > 0 ? headlines : FALLBACK;

  const content = items.map((item, i) => {
    const text = ((item as NewsItem).headline ?? (item as { text?: string }).text ?? '').toUpperCase();
    const source = ((item as NewsItem).source ?? 'NEWS').toUpperCase();

    return (
      <span key={i} className="inline-flex items-center whitespace-nowrap">
        <span className="text-cyan-400 font-bold font-mono">{source}</span>
        <span className="mx-2 text-cyan-400">◆</span>
        <span className="text-text-light font-semibold">{text}</span>
        <span className="mx-6 text-text-light/30">◆</span>
      </span>
    );
  });

  return (
    <div className="w-full bg-bg-dark overflow-hidden flex items-center" style={{ height: 'var(--ticker-h)' }}>
      <div className="ticker-animate flex mono-label text-text-light">
        {content}
        {content}
      </div>
    </div>
  );
};

export default BreakingTicker;