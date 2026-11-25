/**
 * End-to-end smoke against a manually started headless Chrome:
 *   google-chrome --headless=new --load-extension=.output/chrome-mv3 \
 *     --remote-debugging-port=9333 http://127.0.0.1:8125/article.html
 * Then: node scripts/smoke-cdp.mjs
 */
import puppeteer from 'puppeteer-core';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DEBUG = process.env.CDP_URL || 'http://127.0.0.1:9333';

const browser = await puppeteer.connect({ browserURL: DEBUG, defaultViewport: null });
const page = (await browser.pages()).find((p) => p.url().includes('8125/article.html'));
if (!page) throw new Error('test page missing');

async function connectSw(sw) {
  const ws = new WebSocket(sw.webSocketDebuggerUrl);
  const pending = new Map();
  let seq = 0;
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  };
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  const send = (method, params = {}) => {
    const id = ++seq;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((r) => pending.set(id, r));
  };
  await send('Runtime.enable');
  return {
    async eval(expression, timeout = 20000) {
      const result = await Promise.race([
        send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
        sleep(timeout).then(() => 'TIMEOUT'),
      ]);
      if (result === 'TIMEOUT') throw new Error('SW evaluate timeout');
      return result.result?.result?.value;
    },
    close: () => ws.close(),
  };
}

async function swClient() {
  const list = await (await fetch(`${DEBUG}/json/list`)).json();
  const sws = list.filter((t) => t.type === 'service_worker');
  for (const sw of sws) {
    const client = await connectSw(sw);
    const name = await client.eval('chrome.runtime.getManifest().name').catch(() => '');
    if (name && (name.includes('TransFlow') || name.includes('译流'))) {
      console.log('using extension', name, sw.url);
      return client;
    }
    client.close();
  }
  throw new Error('TransFlow service worker not found');
}

// Reload first so the content script pings and wakes the service worker.
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(800);
const sw = await swClient();

const mode = process.env.MODE;
if (mode) {
  await sw.eval(`chrome.storage.local.get('settings').then((s) => {
    const v = s.settings || {};
    v.page = { ...(v.page || {}), mode: '${mode}' };
    return chrome.storage.local.set({ settings: v });
  })`);
}

const tabIds = await sw.eval('chrome.tabs.query({}).then((tabs) => tabs.map((t) => t.id))');
console.log('tabs', tabIds);
const tabId = tabIds[0];

const started = Date.now();
const sent = await sw.eval(`chrome.tabs.sendMessage(${tabId}, {type:'page-translate'})`);
console.log('page-translate', sent, Date.now() - started, 'ms');

await sleep(700);
const dom = await page.evaluate(() => ({
  blocks: Array.from(document.querySelectorAll('.tf-block')).map((n) => n.textContent),
  mode: document.documentElement.className,
  color: getComputedStyle(document.documentElement).getPropertyValue('--tf-trans-color').trim(),
  ambient: Boolean(document.getElementById('transflow-root')),
}));
console.log('blocks', dom.blocks.length, dom.mode, dom.color, 'ambient', dom.ambient);
console.log('first', dom.blocks[0]);
await page.screenshot({ path: '/tmp/tf_page.png' });

const restored = await sw.eval(`chrome.tabs.sendMessage(${tabId}, {type:'page-restore'})`);
await sleep(400);
const after = await page.evaluate(() => ({
  blocks: document.querySelectorAll('.tf-block').length,
  first: document.querySelector('article p')?.textContent?.slice(0, 40),
}));
console.log('restored', restored, after);

sw.close();
await browser.disconnect();
