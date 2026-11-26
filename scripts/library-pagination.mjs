import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9369', defaultViewport: null });
const targets = (await (await fetch('http://127.0.0.1:9369/json/list')).json()).filter((x) => x.type === 'service_worker');
let id = '';
for (const t of targets) {
  const ws = new WebSocket(t.webSocketDebuggerUrl); const pending = new Map(); let seq = 0;
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const send = (method, params = {}) => { const i = ++seq; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((r) => pending.set(i, r)); };
  await send('Runtime.enable');
  const r = await send('Runtime.evaluate', { expression: 'chrome.runtime.getManifest().name', returnByValue: true });
  if ((r.result?.result?.value ?? '').includes('TransFlow')) { id = new URL(t.url).host; ws.close(); break; }
  ws.close();
}
const popup = await browser.newPage();
await popup.goto(`chrome-extension://${id}/popup.html`, { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 60; i++) {
  await popup.evaluate((payload) => chrome.runtime.sendMessage({ type: 'vocab-add', payload }), {
    term: `word${i}`, translation: `释义${i}`, sourceLang: 'en', targetLang: 'zh', tags: i % 2 ? ['奇数'] : ['偶数'],
  });
}
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 780 });
await page.goto(`chrome-extension://${id}/vocab.html`, { waitUntil: 'networkidle0' });
await sleep(500);
console.log(await page.evaluate(() => ({
  rows: document.querySelectorAll('.row').length,
  pager: document.querySelector('.pager')?.textContent,
  stats: document.querySelector('.stats')?.textContent,
})));
await page.screenshot({ path: '/tmp/tf-v17-library-pager.png' });
await browser.disconnect();
