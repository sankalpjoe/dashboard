async function testAdsbProxy() {
    const target = encodeURIComponent('https://api.adsb.lol/v2/lat/20.59/lon/78.96/dist/2000/');
    const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${target}`;

    console.log(`Testing adsb proxy: ${proxyUrl}`);
    try {
        const res = await fetch(proxyUrl);
        const text = await res.text();
        console.log(`Status ${res.status}, Length: ${text.length}`);
        try {
            const parsed = JSON.parse(text);
            console.log(`AC Count: ${parsed.ac ? parsed.ac.length : 0}`);
        } catch (e) {
            console.log('JSON Parse failed', e.message);
        }
    } catch (e) { console.error('Failed:', e.message); }
}

testAdsbProxy();
