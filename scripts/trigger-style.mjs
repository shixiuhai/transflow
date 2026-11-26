import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9376', defaultViewport: null });
const p = await b.newPage();
await p.setViewport({ width: 900, height: 500 });
await p.goto('http://127.0.0.1:8130/article.html', { waitUntil: 'networkidle0' });
const box = await p.evaluate(() => {
  const el = [...document.querySelectorAll('article p')].find((x) => x.getBoundingClientRect().width > 100);
  el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect();
  return { x: r.left + 5, y: r.top + 20, x2: r.left + 260 };
});
await p.mouse.move(box.x, box.y); await p.mouse.down(); await p.mouse.move(box.x2, box.y, { steps: 8 }); await p.mouse.up();
await sleep(500);
console.log(await p.evaluate(() => {
  const host = document.getElementById('transflow-root');
  const el = host?.shadowRoot?.querySelector('.trigger');
  if (!el) return { missing: true, shadow: Boolean(host?.shadowRoot) };
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    rect: { x: r.x, y: r.y, w: r.width, h: r.height },
    font: s.font, fontFamily: s.fontFamily, fontSize: s.fontSize, lineHeight: s.lineHeight,
    display: s.display, alignItems: s.alignItems, padding: s.padding, border: s.border, boxSizing: s.boxSizing,
    overflow: s.overflow, outline: s.outline, textContent: el.textContent,
  };
}));
await p.screenshot({ path: '/tmp/trigger-open.png' });
await b.disconnect();
