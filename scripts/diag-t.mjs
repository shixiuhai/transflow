import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DEBUG = process.env.CDP_URL || 'http://127.0.0.1:9344';
const browser = await puppeteer.connect({ browserURL: DEBUG, defaultViewport: null });
const page = (await browser.pages()).find((p) => p.url().includes('8125/article.html'));
if (!page) throw new Error('page missing');
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(900);

async function connectSw(sw) {
  const ws = new WebSocket(sw.webSocketDebuggerUrl);
  const pending = new Map(); let seq = 0;
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const send = (method, params={}) => { const id=++seq; ws.send(JSON.stringify({id,method,params})); return new Promise(r=>pending.set(id,r)); };
  await send('Runtime.enable');
  return { async eval(expr, timeout=8000){ const r=await Promise.race([send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true}),sleep(timeout).then(()=> 'TIMEOUT')]); if(r==='TIMEOUT') throw new Error('timeout'); return r.result?.result?.value; }, close(){ws.close();} };
}
let sw;
for (const t of (await (await fetch(`${DEBUG}/json/list`)).json()).filter(x=>x.type==='service_worker')) {
  const c = await connectSw(t);
  const name = await c.eval('chrome.runtime.getManifest().name').catch(()=> '');
  if (name.includes('TransFlow') || name.includes('译流')) { sw=c; break; }
  c.close();
}
if (!sw) throw new Error('sw missing');
console.log('settings', await sw.eval("chrome.storage.local.get('settings').then(s=>JSON.stringify(s.settings||null))"));
await page.evaluate(() => {
  (document.activeElement instanceof HTMLElement ? document.activeElement : null)?.blur();
  document.body.tabIndex = -1; document.body.focus();
  getSelection().removeAllRanges();
  const p = document.querySelector('article p');
  const r = document.createRange(); r.selectNodeContents(p);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
});
await page.keyboard.press('t');
await sleep(1000);
console.log('bubble', await page.evaluate(() => {
  const h = document.getElementById('transflow-root');
  return JSON.stringify({ open: h?.dataset.tfBubble, placement: h?.dataset.tfPlacement, sel: getSelection()?.toString().slice(0,30) });
}));
sw.close();
await browser.disconnect();
