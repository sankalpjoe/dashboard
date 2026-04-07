import { fetchIndiaNews } from './src/lib/news-service.ts';
async function test() {
    const news = await fetchIndiaNews(true);
    console.log(`Fetched ${news.length} items.`);
    console.log(news.map(n => n.headline));
}
test().catch(console.error);
