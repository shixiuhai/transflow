import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9362', defaultViewport: null });
const targets = (await (await fetch('http://127.0.0.1:9362/json/list')).json()).filter((x) => x.type === 'service_worker');
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
await page.setViewport({ width: 454, height: 696 });
await page.goto(`chrome-extension://${id}/options.html`, { waitUntil: 'networkidle0' });
await page.evaluate(() => chrome.storage.local.set({ 'tf:wizardDone': true }));
await page.reload({ waitUntil: 'networkidle0' });
await sleep(500);
await page.evaluate(() => document.querySelector('.vocab-uuid')?.scrollIntoView({ block: 'center' }));
await sleep(300);
await page.screenshot({ path: '/tmp/tf-options-vocab-454.png' });
await page.evaluate(() => document.querySelector('.vocab-actions')?.scrollIntoView({ block: 'center' }));
await sleep(200);
await page.screenshot({ path: '/tmp/tf-options-actions-454.png' });
await browser.disconnect();
