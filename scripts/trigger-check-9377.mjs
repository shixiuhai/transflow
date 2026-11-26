import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9377', defaultViewport: null });
const p = await b.newPage();
await p.setViewport({ width: 900, height: 500 });
await p.goto('http://127.0.0.1:8130/article.html', { waitUntil: 'networkidle0' });
await p.evaluate(() => { document.body.style.background = '#8B7BF7'; document.body.style.color = '#fff'; });
await sleep(300);
const box = await p.evaluate(() => {
  const el = [...document.querySelectorAll('article p')].find((x) => x.getBoundingClientRect().width > 100);
  el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect();
  return { x: r.left + 5, y: r.top + 20, x2: r.left + 260 };
});
await p.mouse.move(box.x, box.y); await p.mouse.down(); await p.mouse.move(box.x2, box.y, { steps: 8 }); await p.mouse.up();
await sleep(500);
const host = await p.evaluate(() => {
  const h = document.getElementById('transflow-root');
  const r = h?.getBoundingClientRect();
  return { rect: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null };
});
console.log(host);
await p.screenshot({ path: '/tmp/trigger-fixed.png' });
await b.disconnect();
