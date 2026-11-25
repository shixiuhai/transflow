import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9360', defaultViewport: null });

async function connectSw(sw) {
  const ws = new WebSocket(sw.webSocketDebuggerUrl);
  const pending = new Map(); let seq = 0;
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const send = (method, params = {}) => { const id = ++seq; ws.send(JSON.stringify({ id, method, params })); return new Promise((r) => pending.set(id, r)); };
  await send('Runtime.enable');
  return { async eval(expr) { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result?.result?.value; } };
}
let extensionId = '';
for (const t of (await (await fetch('http://127.0.0.1:9360/json/list')).json()).filter((x) => x.type === 'service_worker')) {
  const c = await connectSw(t);
  const name = await c.eval('chrome.runtime.getManifest().name').catch(() => '');
  if (name.includes('TransFlow') || name.includes('译流')) { extensionId = new URL(t.url).host; break; }
}
if (!extensionId) throw new Error('extension not found');
const page = await browser.newPage();
await page.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' });
await sleep(500);
console.log('add', JSON.stringify(await page.evaluate(() => chrome.runtime.sendMessage({ type: 'vocab-add', payload: { term: 'ephemeral', translation: '短暂的', sourceLang: 'en', targetLang: 'zh' } }))));
console.log('sync', JSON.stringify(await page.evaluate(() => chrome.runtime.sendMessage({ type: 'vocab-sync-now' }))));
const state = await page.evaluate(() => chrome.runtime.sendMessage({ type: 'vocab-get' }));
console.log('uuid', state.data.uuid, 'items', state.data.items.length, 'lastSyncAt', state.data.sync.lastSyncAt);
await page.close();
await browser.disconnect();
