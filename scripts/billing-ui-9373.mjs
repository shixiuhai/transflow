import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9373', defaultViewport: null });
const targets = (await (await fetch('http://127.0.0.1:9373/json/list')).json()).filter((x) => x.type === 'service_worker');
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
await popup.evaluate(async ({ accessKey, secretKey }) => {
  const current = await chrome.runtime.sendMessage({ type: 'get-settings' });
  await chrome.runtime.sendMessage({
    type: 'save-settings',
    patch: { provider: { ...current.data.provider, active: 'volc', configs: { ...current.data.provider.configs, volc: { accessKey, secretKey } } } },
  });
  await chrome.storage.local.set({ 'tf:wizardDone': true });
}, { accessKey: process.env.VOLC_AK, secretKey: process.env.VOLC_SK });
const options = await browser.newPage();
await options.setViewport({ width: 454, height: 900 });
await options.goto(`chrome-extension://${id}/options.html`, { waitUntil: 'networkidle0' });
await options.evaluate(() => [...document.querySelectorAll('.sectionnav button')].find((b) => b.textContent === '用量')?.click());
await sleep(400);
await options.evaluate(() => document.querySelector('.billing .btn')?.click());
await sleep(2500);
console.log(await options.evaluate(() => ({
  total: document.querySelector('.billing-total')?.textContent,
  rows: [...document.querySelectorAll('.billing-row')].map((n) => n.textContent),
  error: document.querySelector('.billing .status.err')?.textContent,
})));
await options.screenshot({ path: '/tmp/tf-usage-official.png' });
await browser.disconnect();
