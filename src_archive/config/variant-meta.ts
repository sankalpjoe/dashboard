export interface VariantMeta {
  title: string;
  description: string;
  keywords: string;
  url: string;
  siteName: string;
  shortName: string;
  subject: string;
  classification: string;
  categories: string[];
  features: string[];
}

export const VARIANT_META: { full: VariantMeta;[k: string]: VariantMeta } = {
  full: {
    title: 'India Monitor - Real-Time Crisis Intelligence Dashboard',
    description: 'India-focused real-time crisis intelligence dashboard with live news, conflict tracking, military monitoring, disaster alerts, and geopolitical data. OSINT for India and South Asia.',
    keywords: 'india intelligence, crisis dashboard, india news, conflict tracking, disaster alerts, military tracking, kashmir, south asia, OSINT, india defence, india security, earthquake monitor, protest tracker, geopolitical intelligence',
    url: 'https://worldmonitor.app/',
    siteName: 'India Monitor',
    shortName: 'IndiaMonitor',
    subject: 'India-Focused Crisis Intelligence and Situation Awareness',
    classification: 'Crisis Intelligence Dashboard, OSINT Tool, India News Aggregator',
    categories: ['news', 'productivity'],
    features: [
      'India-focused news aggregation',
      'Conflict and crisis tracking',
      'Military flight monitoring',
      'Earthquake and disaster alerts',
      'Protest tracking',
      'Country instability index',
      'Infrastructure monitoring',
      'Geopolitical intelligence',
    ],
  },
  tech: {
    title: 'Tech Monitor - Real-Time AI & Tech Industry Dashboard',
    description: 'Real-time AI and tech industry dashboard tracking tech giants, AI labs, startup ecosystems, funding rounds, and tech events worldwide.',
    keywords: 'tech dashboard, AI industry, startup ecosystem, tech companies, AI labs, venture capital, tech events, tech conferences, cloud infrastructure, datacenters, tech layoffs, funding rounds, unicorns, FAANG, tech HQ, accelerators, Y Combinator, tech news',
    url: 'https://tech.worldmonitor.app/',
    siteName: 'Tech Monitor',
    shortName: 'TechMonitor',
    subject: 'AI, Tech Industry, and Startup Ecosystem Intelligence',
    classification: 'Tech Dashboard, AI Tracker, Startup Intelligence',
    categories: ['news', 'business'],
    features: [
      'Tech news aggregation',
      'AI lab tracking',
      'Startup ecosystem mapping',
      'Tech HQ locations',
      'Conference & event calendar',
      'Cloud infrastructure monitoring',
      'Datacenter mapping',
      'Tech layoff tracking',
      'Funding round analytics',
      'Tech stock tracking',
      'Service status monitoring',
    ],
  },
  happy: {
    title: 'Happy Monitor - Good News & Global Progress',
    description: 'Curated positive news, progress data, and uplifting stories from around the world.',
    keywords: 'good news, positive news, global progress, happy news, uplifting stories, human achievement, science breakthroughs, conservation wins',
    url: 'https://happy.worldmonitor.app/',
    siteName: 'Happy Monitor',
    shortName: 'HappyMonitor',
    subject: 'Good News, Global Progress, and Human Achievement',
    classification: 'Positive News Dashboard, Progress Tracker',
    categories: ['news', 'lifestyle'],
    features: [
      'Curated positive news',
      'Global progress tracking',
      'Live humanity counters',
      'Science breakthrough feed',
      'Conservation tracker',
      'Renewable energy dashboard',
    ],
  },
  finance: {
    title: 'Finance Monitor - Real-Time Markets & Trading Dashboard',
    description: 'Real-time finance and trading dashboard tracking global markets, stock exchanges, central banks, commodities, forex, crypto, and economic indicators worldwide.',
    keywords: 'finance dashboard, trading dashboard, stock market, forex, commodities, central banks, crypto, economic indicators, market news, financial centers, stock exchanges, bonds, derivatives, fintech, hedge funds, IPO tracker, market analysis',
    url: 'https://finance.worldmonitor.app/',
    siteName: 'Finance Monitor',
    shortName: 'FinanceMonitor',
    subject: 'Global Markets, Trading, and Financial Intelligence',
    classification: 'Finance Dashboard, Market Tracker, Trading Intelligence',
    categories: ['finance', 'news'],
    features: [
      'Real-time market data',
      'Stock exchange mapping',
      'Central bank monitoring',
      'Commodity price tracking',
      'Forex & currency news',
      'Crypto & digital assets',
      'Economic indicator alerts',
      'IPO & earnings tracking',
      'Financial center mapping',
      'Sector heatmap',
      'Market radar signals',
    ],
  },
};
