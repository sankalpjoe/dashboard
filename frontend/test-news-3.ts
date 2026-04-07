import { fetchIndiaNews } from './src/lib/news-service';

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
    if (typeof url === 'string' && url.startsWith('/api')) {
        url = 'http://localhost:5174' + url;
    }
    console.log('[Fetch Req]', url);
    try {
        const r = await originalFetch(url, options);
        console.log('[Fetch Res]', url, r.status);
        if (!r.ok) {
            console.log('Error text:', await r.text());
        }
        return r;
    } catch (e) {
        console.error('[Fetch Err]', url, e.message);
        throw e;
    }
};

async function test() {
    const news = await fetchIndiaNews(true);
    console.log(`\nFetched ${news.length} items total.`);
}

test().catch(console.error);
