import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: null });
const targets = browser.targets();
console.log('targets', targets.map(t => `${t.type()}:${t.url()}`));
const swTarget = targets.find(t => t.type() === 'service_worker' && t.url().includes('chrome-extension://'));
if (!swTarget) { console.log('no sw'); process.exit(1); }
const id = new URL(swTarget.url()).host;
const popup = await browser.newPage();
const resp = await popup.goto(`chrome-extension://${id}/popup.html`, { waitUntil: 'domcontentloaded', timeout: 8000 }).catch(e => 'ERR ' + e.message);
console.log('nav', resp, 'url', popup.url());
const info = await popup.evaluate(() => ({ chrome: typeof chrome, tabs: typeof chrome?.tabs, keys: typeof chrome === 'object' ? Object.keys(chrome).slice(0,25) : [] })).catch(e => 'EVALERR ' + e.message);
console.log('info', info);
const tabs = await popup.evaluate(() => chrome.tabs.query({}).then(ts => ts.map(t => ({id:t.id,url:t.url})))).catch(e => 'TABSERR ' + e.message);
console.log('tabs', tabs);
await browser.disconnect();
