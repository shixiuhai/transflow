/** Capture Chrome Web Store-sized screenshots (1280×800) from the built extension. */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

let providerConfig = { active: 'mock', configs: {} };
try {
  const env = Object.fromEntries(
    readFileSync(process.env.VOLC_ENV ?? join(homedir(), '.secrets', 'volc.env'), 'utf8')
      .split('\n')
      .filter((line) => line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      }),
  );
  if (env.VOLC_AK && env.VOLC_SK) {
    providerConfig = { active: 'volc', configs: { volc: { accessKey: env.VOLC_AK, secretKey: env.VOLC_SK } } };
  }
} catch {
  // Fall back to mock when no key is available.
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DEBUG = process.env.CDP_URL || 'http://127.0.0.1:9339';

const browser = await puppeteer.connect({ browserURL: DEBUG, defaultViewport: null });
const page = (await browser.pages()).find((p) => p.url().includes('8125/article.html'));
if (!page) throw new Error('fixture page missing');
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(700);

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
      if (result === 'TIMEOUT') throw new Error('SW timeout');
      return result.result?.result?.value;
    },
    close: () => ws.close(),
  };
}

let sw;
let extensionId = '';
for (const target of (await (await fetch(`${DEBUG}/json/list`)).json()).filter((t) => t.type === 'service_worker')) {
  const client = await connectSw(target);
  const name = await client.eval('chrome.runtime.getManifest().name').catch(() => '');
  if (name.includes('TransFlow') || name.includes('译流')) {
    sw = client;
    extensionId = new URL(target.url).host;
    break;
  }
  client.close();
}
if (!sw) throw new Error('TransFlow service worker not found');

await sw.eval(`chrome.storage.local.get('settings').then((s) => {
  const v = s.settings || {};
  v.provider = { active: ${JSON.stringify(providerConfig.active)}, fallback: [], configs: ${JSON.stringify(providerConfig.configs)} };
  v.language = { source: 'auto', target: 'zh' };
  v.page = { ...(v.page || {}), mode: 'blend', maxSegments: 2000 };
  return chrome.storage.local.set({ settings: v });
})`);
await sw.eval(`chrome.storage.local.set({ 'tf:wizardDone': false })`);

const tabs = await sw.eval('chrome.tabs.query({}).then((t) => t.map((tab) => ({ id: tab.id, url: tab.url })))');
const tab = tabs.find((t) => t.url && t.url.includes('8125/article.html'));
const response = await sw.eval(`chrome.tabs.sendMessage(${tab.id}, {type:'page-translate'})`);
const blockCount = await page.evaluate(() => document.querySelectorAll('.tf-block').length);
console.log('translate response:', JSON.stringify(response), 'blocks:', blockCount);
await sleep(400);
await page.screenshot({ path: 'docs/assets/store-page-1280x800.png' });
console.log('saved page screenshot');

const options = await browser.newPage();
await options.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
await options.goto(`chrome-extension://${extensionId}/options.html`, { waitUntil: 'domcontentloaded' });
await sleep(900);
await options.screenshot({ path: 'docs/assets/store-options-1280x800.png' });
console.log('saved options screenshot');

await sw.eval(`chrome.tabs.sendMessage(${tab.id}, {type:'page-restore'})`);
sw.close();
await browser.disconnect();
