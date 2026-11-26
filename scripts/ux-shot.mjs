import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9366', defaultViewport: null });
const targets = (await (await fetch('http://127.0.0.1:9366/json/list')).json()).filter((x) => x.type === 'service_worker');
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
const page = await browser.newPage();
await page.goto('http://127.0.0.1:8130/article.html', { waitUntil: 'networkidle0' });
await sleep(500);
const popup = await browser.newPage();
await popup.setViewport({ width: 380, height: 640 });
await popup.goto(`chrome-extension://${id}/popup.html`, { waitUntil: 'networkidle0' });
await sleep(700);
await popup.screenshot({ path: '/tmp/tf-ux-popup.png' });

const options = await browser.newPage();
await options.setViewport({ width: 454, height: 696 });
await options.goto(`chrome-extension://${id}/options.html`, { waitUntil: 'networkidle0' });
await options.evaluate(() => chrome.storage.local.set({ 'tf:wizardDone': true }));
await options.reload({ waitUntil: 'networkidle0' });
await sleep(500);
await options.screenshot({ path: '/tmp/tf-ux-options-provider.png' });
await options.evaluate(() => [...document.querySelectorAll('.sectionnav button')].find((b) => b.textContent === '单词本')?.click());
await sleep(300);
await options.screenshot({ path: '/tmp/tf-ux-options-vocab.png' });

const library = await browser.newPage();
await library.setViewport({ width: 390, height: 780 });
await library.goto(`chrome-extension://${id}/vocab.html`, { waitUntil: 'networkidle0' });
await sleep(500);
await library.screenshot({ path: '/tmp/tf-ux-library-390.png' });

const review = await browser.newPage();
await review.setViewport({ width: 390, height: 780 });
await review.goto(`chrome-extension://${id}/review.html`, { waitUntil: 'networkidle0' });
await sleep(500);
await review.screenshot({ path: '/tmp/tf-ux-review-390.png' });
console.log('done');
await browser.disconnect();
