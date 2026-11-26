import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9362', defaultViewport: null });
const targets = (await (await fetch('http://127.0.0.1:9362/json/list')).json()).filter((x) => x.type === 'service_worker');
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
if (!extensionId) throw new Error('extension not found');
const popup = await browser.newPage();
await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' });
await sleep(400);
for (const [term, translation, context] of [
  ['serendipity', '意外发现美好事物的能力', 'It was pure serendipity that we met in Kyoto.'],
  ['ephemeral', '短暂的；转瞬即逝的', 'The cherry blossoms are beautiful but ephemeral.'],
]) {
  await popup.evaluate((payload) => chrome.runtime.sendMessage({ type: 'vocab-add', payload }), {
    term, translation, sourceLang: 'en', targetLang: 'zh', context,
  });
}
await popup.close();

const options = await browser.newPage();
await options.setViewport({ width: 454, height: 696 });
await options.goto(`chrome-extension://${extensionId}/options.html`, { waitUntil: 'networkidle0' });
await sleep(500);
await options.evaluate(() => document.querySelector('.vocab-uuid')?.scrollIntoView({ block: 'center' }));
await sleep(300);
await options.screenshot({ path: '/tmp/tf-options-454.png' });
console.log('options errors', await options.evaluate(() => window.__errors ?? []));
await options.close();

const review = await browser.newPage();
await review.setViewport({ width: 1100, height: 820 });
const errors = [];
review.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
review.on('pageerror', (err) => errors.push(String(err)));
await review.goto(`chrome-extension://${extensionId}/review.html`, { waitUntil: 'networkidle0' });
await sleep(500);
await review.screenshot({ path: '/tmp/tf-review-intro.png' });
await review.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('开始复习'))?.click());
await sleep(400);
await review.screenshot({ path: '/tmp/tf-review-card.png' });
await review.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('显示释义'))?.click());
await sleep(300);
await review.screenshot({ path: '/tmp/tf-review-answer.png' });
console.log('review errors', errors);
await review.close();
await browser.disconnect();
