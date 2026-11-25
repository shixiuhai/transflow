import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9345', defaultViewport: null });
const page = (await browser.pages()).find((p) => p.url().includes('canberratimes'));
await page.evaluate(() => {
  window.__keys = [];
  const rec = (phase) => (e) => window.__keys.push({
    phase, key: e.key, code: e.code, defaultPrevented: e.defaultPrevented,
    target: e.target?.tagName, composing: e.isComposing, repeat: e.repeat,
  });
  window.addEventListener('keydown', rec('win-capture'), true);
  window.addEventListener('keydown', rec('win-bubble'), false);
  document.addEventListener('keydown', rec('doc-capture'), true);
});
const target = await page.evaluate(() => {
  const ps = [...document.querySelectorAll('p')].filter((p) => (p.innerText || '').trim().length > 80);
  const p = ps.find((el) => el.getBoundingClientRect().width > 100) ?? ps[0];
  p.scrollIntoView({ block: 'center' });
  const r = p.getBoundingClientRect();
  return { x: r.left + 8, y: r.top + 30, x2: r.left + 420 };
});
await page.mouse.move(target.x, target.y);
await page.mouse.down();
await page.mouse.move(target.x2, target.y, { steps: 10 });
await page.mouse.up();
await sleep(300);
await page.keyboard.press('t');
await sleep(600);
console.log(JSON.stringify(await page.evaluate(() => ({
  keys: window.__keys,
  active: document.activeElement?.tagName,
  activeType: document.activeElement?.getAttribute?.('type'),
  sel: getSelection()?.toString().slice(0, 40),
})), null, 2));
await browser.disconnect();
