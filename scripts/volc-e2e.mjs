/**
 * Real Volcengine end-to-end: loads the unpacked extension in Chrome for
 * Testing, configures the Volc provider, translates the fixture page and
 * prints first-block / total timings.
 *
 *   bash scripts/volc-e2e.sh
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DEBUG = process.env.CDP_URL || 'http://127.0.0.1:9337';
const env = Object.fromEntries(
  readFileSync(process.env.VOLC_ENV ?? join(homedir(), '.secrets', 'volc.env'), 'utf8')
    .split('\n')
    .filter((line) => line.includes('='))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);

const browser = await puppeteer.connect({ browserURL: DEBUG, defaultViewport: null });
const page = (await browser.pages()).find((p) => p.url().includes('8125/article.html'));
if (!page) throw new Error('fixture page missing');

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
    async eval(expression, timeout = 30000) {
      const result = await Promise.race([
        send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
        sleep(timeout).then(() => 'TIMEOUT'),
      ]);
      if (result === 'TIMEOUT') throw new Error('SW timeout');
      return result.result?.result?.value;
    },
    close: () => ws.close(),
  };
}

let sw;
for (const target of (await (await fetch(`${DEBUG}/json/list`)).json()).filter((t) => t.type === 'service_worker')) {
  const client = await connectSw(target);
  const name = await client.eval('chrome.runtime.getManifest().name').catch(() => '');
  if (name.includes('TransFlow') || name.includes('译流')) {
    sw = client;
    break;
  }
  client.close();
}
if (!sw) throw new Error('TransFlow service worker not found');

const config = JSON.stringify({ accessKey: env.VOLC_AK, secretKey: env.VOLC_SK });
await sw.eval(`chrome.storage.local.get('settings').then((s) => {
  const v = s.settings || {};
  v.provider = { active: 'volc', fallback: [], configs: { volc: ${config} } };
  v.language = { source: 'auto', target: 'zh' };
  v.page = { ...(v.page || {}), mode: 'blend', maxSegments: 2000 };
  return chrome.storage.local.set({ settings: v });
})`);

const tabs = await sw.eval('chrome.tabs.query({}).then((t) => t.map((tab) => ({ id: tab.id, url: tab.url })))');
const tab = tabs.find((t) => t.url && t.url.includes('8125/article.html'));
if (!tab) throw new Error('fixture tab missing');

const started = Date.now();
const pending = sw.eval(`chrome.tabs.sendMessage(${tab.id}, {type:'page-translate'})`);
let first = null;
for (let i = 0; i < 400; i++) {
  const n = await page.evaluate(() => document.querySelectorAll('.tf-block').length);
  if (n > 0) {
    first = Date.now() - started;
    break;
  }
  await sleep(25);
}
await pending;
const total = Date.now() - started;

const result = await page.evaluate(() => ({
  blocks: document.querySelectorAll('.tf-block').length,
  samples: Array.from(document.querySelectorAll('.tf-block')).slice(0, 3).map((n) => n.textContent),
}));
console.log(`first block: ${first ?? 'n/a'} ms`);
console.log(`total: ${total} ms`);
console.log(`blocks: ${result.blocks}`);
result.samples.forEach((text, i) => console.log(`${i + 1}: ${text}`));

await page.screenshot({ path: '/tmp/tf_volc.png' });
await sw.eval(`chrome.tabs.sendMessage(${tab.id}, {type:'page-restore'})`);
const usage = await sw.eval(`chrome.storage.local.get('tf:usage').then((s) => JSON.stringify(s['tf:usage'] || null))`);
console.log('usage:', usage);
sw.close();
await browser.disconnect();
