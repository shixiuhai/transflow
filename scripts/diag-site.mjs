import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DEBUG = process.env.CDP_URL || 'http://127.0.0.1:9345';
const browser = await puppeteer.connect({ browserURL: DEBUG, defaultViewport: null });
const page = (await browser.pages()).find((p) => p.url().includes('canberratimes')) ?? (await browser.pages())[0];
console.log('page', page.url());
await sleep(3000);

async function connectSw(sw) {
  const ws = new WebSocket(sw.webSocketDebuggerUrl);
  const pending = new Map(); let seq = 0;
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const send = (method, params = {}) => { const id = ++seq; ws.send(JSON.stringify({ id, method, params })); return new Promise((r) => pending.set(id, r)); };
  await send('Runtime.enable');
  return { async eval(expr) { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result?.result?.value; }, close() { ws.close(); } };
}
let sw;
for (const t of (await (await fetch(`${DEBUG}/json/list`)).json()).filter((x) => x.type === 'service_worker')) {
  const c = await connectSw(t);
  const name = await c.eval('chrome.runtime.getManifest().name').catch(() => '');
  if (name.includes('TransFlow') || name.includes('译流')) { sw = c; break; }
  c.close();
}
console.log('sw', Boolean(sw));

const paragraphs = await page.evaluate(() => {
  const ps = [...document.querySelectorAll('p')].filter((p) => (p.innerText || '').trim().length > 80);
  return ps.slice(0, 5).map((p, i) => {
    const r = p.getBoundingClientRect();
    return { i, len: p.innerText.trim().length, top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), text: p.innerText.trim().slice(0, 60) };
  });
});
console.log('paragraphs', JSON.stringify(paragraphs));
const iframes = await page.evaluate(() => document.querySelectorAll('iframe').length);
console.log('iframes', iframes);

const target = await page.evaluate(() => {
  const ps = [...document.querySelectorAll('p')].filter((p) => (p.innerText || '').trim().length > 80);
  const p = ps.find((el) => el.getBoundingClientRect().width > 100) ?? ps[0];
  if (!p) return null;
  p.scrollIntoView({ block: 'center' });
  const r = p.getBoundingClientRect();
  return { x: r.left + 8, y: r.top + Math.min(30, r.height / 2), x2: r.left + Math.min(420, r.width - 8) };
});
console.log('target', JSON.stringify(target));
if (target) {
  await page.mouse.move(target.x, target.y);
  await page.mouse.down();
  await page.mouse.move(target.x2, target.y, { steps: 12 });
  await page.mouse.up();
  await sleep(400);
  const sel = await page.evaluate(() => ({ text: getSelection()?.toString().slice(0, 80), len: getSelection()?.toString().trim().length, anchor: getSelection()?.anchorNode?.parentElement?.tagName }));
  console.log('selection', JSON.stringify(sel));
  await page.keyboard.press('t');
  await sleep(1200);
  const diag = await sw?.eval("chrome.tabs.query({}).then(t=>chrome.tabs.sendMessage(t.find(x=>x.url&&x.url.includes('canberratimes')).id,{type:'diagnose'}))");
  console.log('diagnoseAfter', JSON.stringify(diag));
  console.log('mainWorld', JSON.stringify(await page.evaluate(() => ({ seen: window.__transflowKeySeen, attr: document.documentElement.getAttribute('data-tf-key-press') }))));
  console.log('bubble', await page.evaluate(() => document.getElementById('transflow-root')?.dataset.tfBubble ?? 'none'));
  await page.screenshot({ path: '/tmp/tf_site.png' });
}
sw?.close();
await browser.disconnect();
