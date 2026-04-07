async function testAPIs() {
    console.log('Testing adsb.lol (Flights)...');
    try {
        const lat = 20.59;
        const lon = 78.96;
        const dist = 2000;
        const res = await fetch(`https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${dist}/`, { signal: AbortSignal.timeout(10000) });
        const text = await res.text();
        console.log(`adsb.lol: Status ${res.status}, Body length: ${text.length}`);
        try {
            const parsed = JSON.parse(text);
            console.log(`adsb.lol AC Count: ${parsed.ac ? parsed.ac.length : 0}`);
        } catch (err) {
            console.log('adsb.lol JSON Parse error:', err.message);
            console.log('Body snippet:', text.substring(0, 100));
        }
    } catch (e) { console.error('adsb.lol failed:', e.message); }

    console.log('\nTesting allorigins proxy (Intel - PIB)...');
    try {
        const encoded = encodeURIComponent('https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3');
        const res = await fetch(`https://api.allorigins.win/get?url=${encoded}`, { signal: AbortSignal.timeout(10000) });
        const text = await res.text();
        console.log(`allorigins (PIB): Status ${res.status}, Content length: ${text.length}`);
        try {
            const parsed = JSON.parse(text);
            console.log(`allorigins parsed:`, !!parsed.contents);
        } catch (err) {
            console.log('allorigins JSON Parse error:', err.message);
        }
    } catch (e) { console.error('allorigins failed:', e.message); }

    console.log('\nTesting Google News via allorigins...');
    try {
        const encoded = encodeURIComponent('https://news.google.com/rss/search?q=India+(war+OR+attack+OR+terror)&hl=en-IN&gl=IN&ceid=IN:en');
        const res = await fetch(`https://api.allorigins.win/get?url=${encoded}`, { signal: AbortSignal.timeout(10000) });
        const text = await res.text();
        console.log(`allorigins (Google News): Status ${res.status}, Content length: ${text.length}`);
    } catch (e) { console.error('allorigins failed:', e.message); }
}

testAPIs();
