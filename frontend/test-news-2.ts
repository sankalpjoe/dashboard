import { fetchIndiaNews } from './src/lib/news-service';

// Mock global fetch for Node environment
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
    if (typeof url === 'string' && url.startsWith('/api')) {
        url = 'http://localhost:5174' + url;
    }
    return originalFetch(url, options);
};

async function test() {
    console.log("Fetching news via localhost:5174 proxies...");
    const news = await fetchIndiaNews(true);
    console.log(`\nFetched ${news.length} items total.`);

    const bd = news.reduce((acc, n) => {
        acc[n.source] = (acc[n.source] || 0) + 1;
        return acc;
    }, {});
    console.log("\nBreakdown by source:");
    console.log(bd);

    console.log("\nFirst 5 items:");
    console.log(news.slice(0, 5).map(n => `[${n.severity}] ${n.source} - ${n.headline}`));
}

test().catch(console.error);
