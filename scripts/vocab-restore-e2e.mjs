import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UUID = process.env.VOCAB_UUID;
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9361', defaultViewport: null });
const targets = (await (await fetch('http://127.0.0.1:9361/json/list')).json()).filter((x) => x.type === 'service_worker');
let extensionId = '';
for (const t of targets) {
  const ws = new WebSocket(t.webSocketDebuggerUrl); const pending = new Map(); let seq = 0;
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const send = (method, params = {}) => { const id = ++seq; ws.send(JSON.stringify({ id, method, params })); return new Promise((r) => pending.set(id, r)); };
  await send('Runtime.enable');
  const r = await send('Runtime.evaluate', { expression: 'chrome.runtime.getManifest().name', returnByValue: true });
  if ((r.result?.result?.value ?? '').includes('TransFlow')) { extensionId = new URL(t.url).host; ws.close(); break; }
  ws.close();
}
const page = await browser.newPage();
await page.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' });
await sleep(500);
const result = await page.evaluate(async (uuid) => {
  const key = 'tf:vocab:v1';
  const state = (await chrome.storage.local.get(key))[key];
  state.uuid = uuid;
  state.items = [];
  state.deleted = {};
  state.sync.lastSyncAt = 0;
  await chrome.storage.local.set({ [key]: state });
  const sync = await chrome.runtime.sendMessage({ type: 'vocab-sync-now' });
  const after = await chrome.runtime.sendMessage({ type: 'vocab-get' });
  return { sync, items: after.data.items.map((i) => i.term), uuid: after.data.uuid };
}, UUID);
console.log(JSON.stringify(result));
await page.close();
await browser.disconnect();
