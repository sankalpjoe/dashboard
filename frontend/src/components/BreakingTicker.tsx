import { useBreakingHeadlines } from '@/hooks/useNews';
import type { NewsItem } from '@/lib/news-service';

// ---------------------------------------------------------------------------
// 3-tier crisis styling
// ---------------------------------------------------------------------------
const TIER1: NewsItem['category'][] = ['conflict', 'terrorism', 'military'];
const TIER2: NewsItem['category'][] = ['disaster', 'cyber', 'industrial', 'humanitarian'];
const TIER3: NewsItem['category'][] = ['protest', 'economic'];

function getTierStyles(category?: NewsItem['category']) {
  if (category && (TIER1 as string[]).includes(category)) {
    return { textClass: 'text-red-500 font-bold', bgClass: 'bg-red-500/10 px-2 rounded', separator: '🔴' };
  }
  if (category && (TIER2 as string[]).includes(category)) {
    return { textClass: 'text-amber-400 font-semibold', bgClass: 'bg-amber-400/10 px-2 rounded', separator: '🟡' };
  }
  if (category && (TIER3 as string[]).includes(category)) {
    return { textClass: 'text-orange-400', bgClass: 'bg-orange-400/10 px-2 rounded', separator: '🟠' };
  }
  return { textClass: 'text-signal', bgClass: '', separator: '◆' };
}

// ---------------------------------------------------------------------------

const FALLBACK = [{ source: 'INDIA CRISIS', text: 'LOADING LIVE INTELLIGENCE FEEDS — PLEASE WAIT' }];

const BreakingTicker = () => {
  const { headlines } = useBreakingHeadlines();
  const items = headlines.length > 0 ? headlines : FALLBACK;

  const content = items.map((item, i) => {
    const text = ((item as NewsItem).headline ?? (item as { text?: string }).text ?? '').toUpperCase();
    const source = ((item as NewsItem).source ?? 'NEWS').toUpperCase();
    const category = (item as NewsItem).category;
    const { textClass, bgClass, separator } = getTierStyles(category);

    return (
      <span key={i} className={`inline-flex items-center whitespace-nowrap ${bgClass}`}>
        <span className={`${textClass} font-mono`}>{source}</span>
        <span className={`mx-2 ${textClass}`}>{separator}</span>
        <span className={textClass}>{text}</span>
        <span className="mx-6 text-signal/30">◆</span>
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