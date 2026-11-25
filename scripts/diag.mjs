import puppeteer from 'puppeteer-core';
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: null });
const targets = browser.targets();
console.log('targets', targets.map(t => `${t.type()}:${t.url()}`));
const swTarget = targets.find(t => t.type() === 'service_worker' && t.url().includes('chrome-extension://'));
const id = new URL(swTarget.url()).host;
console.log('id', id);
const worker = await swTarget.worker();
const simple = await Promise.race([
  worker.evaluate(() => 1 + 1),
  new Promise(r => setTimeout(() => r('TIMEOUT'), 5000)),
]);
console.log('worker eval', simple);
const popup = await browser.newPage();
const resp = await popup.goto(`chrome-extension://${id}/popup.html`, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(e => 'ERR ' + e.message);
console.log('popup nav', resp);
console.log('popup url', popup.url());
const info = await popup.evaluate(() => ({ chrome: typeof chrome, tabs: typeof chrome?.tabs, keys: typeof chrome === 'object' ? Object.keys(chrome).slice(0,20) : [] })).catch(e => 'EVALERR ' + e.message);
console.log('popup info', info);
await browser.disconnect();
