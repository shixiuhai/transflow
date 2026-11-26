import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9363', defaultViewport: null });
const targets = (await (await fetch('http://127.0.0.1:9363/json/list')).json()).filter((x) => x.type === 'service_worker');
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
await popup.evaluate(() => chrome.storage.local.set({ 'tf:wizardDone': true }));
async function setStyle(style) {
  await popup.evaluate(async (bubbleStyle) => {
    const current = await chrome.runtime.sendMessage({ type: 'get-settings' });
    await chrome.runtime.sendMessage({
      type: 'save-settings',
      patch: { selection: { ...current.data.selection, bubbleStyle } },
    });
  }, style);
}
for (const style of ['paper', 'glass', 'contrast', 'auto']) {
  await setStyle(style);
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 720 });
  await page.goto('http://127.0.0.1:8130/article.html', { waitUntil: 'networkidle0' });
  await sleep(700);
  const box = await page.evaluate(() => {
    const p = [...document.querySelectorAll('article p')].find((el) => el.getBoundingClientRect().width > 200);
    p.scrollIntoView({ block: 'center' });
    const r = p.getBoundingClientRect();
    return { x: r.left + 6, y: r.top + 24, x2: r.left + Math.min(420, r.width - 6) };
  });
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x2, box.y, { steps: 10 });
  await page.mouse.up();
  await sleep(400);
  await page.keyboard.press('t');
  await sleep(900);
  await page.screenshot({ path: `/tmp/tf-bubble-${style}.png` });
  console.log(style, await page.evaluate(() => document.getElementById('transflow-root')?.dataset.tfBubble ?? 'none'));
  await page.close();
}
await popup.close();
await browser.disconnect();
