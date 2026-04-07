import { fetchIndiaNews } from './src/lib/news-service';

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
    if (typeof url === 'string' && url.startsWith('/api')) {
        url = 'http://localhost:5174' + url;
    }
    const r = await originalFetch(url, options);

    // We will inspect the raw text for the first feed
    if (url.includes('Kashmir')) {
        const cloned = r.clone();
        const text = await cloned.text();
        console.log(`[RAW XML for ${url.substring(0, 50)}...] Length: ${text.length}`);
        console.log(text.substring(0, 500));
    }
    return r;
};

async function test() {
    const news = await fetchIndiaNews(true);
    console.log(`\nFetched ${news.length} items total.`);
}

test().catch(console.error);
