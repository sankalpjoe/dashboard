async function testProxies() {
    const target = encodeURIComponent('https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3');

    const proxies = [
        { name: 'corsproxy.io', url: `https://corsproxy.io/?${target}` },
        { name: 'codetabs.com', url: `https://api.codetabs.com/v1/proxy?quest=${target}` },
        { name: 'thingproxy', url: `https://thingproxy.freeboard.io/fetch/https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3` }
    ];

    for (const proxy of proxies) {
        console.log(`\nTesting ${proxy.name}...`);
        try {
            const start = Date.now();
            const res = await fetch(proxy.url, { signal: AbortSignal.timeout(10000) });
            const text = await res.text();
            console.log(`${proxy.name}: Status ${res.status}, Length: ${text.length}, Time: ${Date.now() - start}ms`);
            if (text.length > 0) {
                console.log('Snippet:', text.substring(0, 100).replace(/\n/g, ' '));
            }
        } catch (e) {
            console.error(`${proxy.name} failed:`, e.message);
        }
    }
}

testProxies();
