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
for (const [term, translation, context, tags] of [
  ['resilient', '有韧性的；能恢复的', 'Children are often more resilient than adults.', ['性格']],
  ['serendipity', '意外发现美好事物的能力', 'It was pure serendipity that we met in Kyoto.', ['文学']],
]) {
  await popup.evaluate((payload) => chrome.runtime.sendMessage({ type: 'vocab-add', payload }), { term, translation, context, tags, sourceLang: 'en', targetLang: 'zh' });
}
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.setViewport({ width: 390, height: 780 });
await page.goto(`chrome-extension://${id}/review.html`, { waitUntil: 'networkidle0' });
await sleep(400);
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('开始复习'))?.click());
await sleep(300);
await page.screenshot({ path: '/tmp/tf-v17-review-front.png' });
await page.keyboard.press('Space');
await sleep(300);
await page.screenshot({ path: '/tmp/tf-v17-review-answer.png' });
const before = await page.evaluate(async () => {
  const s = (await chrome.storage.local.get('tf:vocab:v1'))['tf:vocab:v1'];
  return s.items.map((i) => ({ term: i.term, mastery: i.mastery ?? 0, rc: i.reviewCount ?? 0 }));
});
await page.keyboard.press('1');
await sleep(500);
const afterAgain = await page.evaluate(async () => {
  const s = (await chrome.storage.local.get('tf:vocab:v1'))['tf:vocab:v1'];
  return { counter: document.querySelector('.counter')?.textContent, items: s.items.map((i) => ({ term: i.term, mastery: i.mastery ?? 0, rc: i.reviewCount ?? 0 })) };
});
await page.keyboard.press('z');
await sleep(500);
const afterUndo = await page.evaluate(async () => {
  const s = (await chrome.storage.local.get('tf:vocab:v1'))['tf:vocab:v1'];
  return { counter: document.querySelector('.counter')?.textContent, items: s.items.map((i) => ({ term: i.term, mastery: i.mastery ?? 0, rc: i.reviewCount ?? 0 })) };
});
await page.screenshot({ path: '/tmp/tf-v17-review-undo.png' });
console.log(JSON.stringify({ before, afterAgain, afterUndo, errors }, null, 2));
await browser.disconnect();
