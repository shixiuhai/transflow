/**
 * End-to-end smoke. Requires a Chrome for Testing / Chromium instance loaded
 * with .output/chrome-mv3; see scripts/smoke.sh.
 */
import puppeteer from 'puppeteer-core';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DEBUG = process.env.CDP_URL || 'http://127.0.0.1:9333';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const browser = await puppeteer.connect({ browserURL: DEBUG, defaultViewport: null });
const page = (await browser.pages()).find((p) => p.url().includes('8125/article.html'));
if (!page) throw new Error('test page missing');

let extensionId = '';

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
  for (const sw of list.filter((t) => t.type === 'service_worker')) {
    const client = await connectSw(sw);
    const name = await client.eval('chrome.runtime.getManifest().name').catch(() => '');
    if (name && (name.includes('TransFlow') || name.includes('译流'))) {
      extensionId = new URL(sw.url).host;
      return client;
    }
    client.close();
  }
  throw new Error('TransFlow service worker not found');
}

async function patchSettings(expr) {
  await sw.eval(`chrome.storage.local.get('settings').then((s) => {
    const v = s.settings || {};
    ${expr}
    return chrome.storage.local.set({ settings: v });
  })`);
}

async function tabIdFor(urlPart) {
  const ids = await sw.eval(`chrome.tabs.query({}).then((tabs) => tabs.filter((t) => t.url && t.url.includes(${JSON.stringify(urlPart)})).map((t) => t.id))`);
  return ids[0];
}

async function triggerPage(targetPage, tabId, poll = true) {
  const start = Date.now();
  const promise = sw.eval(`chrome.tabs.sendMessage(${tabId}, {type:'page-translate'})`);
  let first = null;
  if (poll) {
    for (let i = 0; i < 240; i++) {
      const n = await targetPage.evaluate(
        () => document.querySelectorAll('.tf-block').length + document.querySelectorAll('[data-tf-original]').length,
      );
      if (n > 0) {
        first = Date.now() - start;
        break;
      }
      await sleep(25);
    }
  }
  await promise;
  return { first, total: Date.now() - start };
}

async function restore(tabId) {
  await sw.eval(`chrome.tabs.sendMessage(${tabId}, {type:'page-restore'})`);
  await sleep(200);
}

await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(800);
const sw = await swClient();
const tabId = await tabIdFor('8125/article.html');

// --- 1. page translation, first paint, palette ---
await patchSettings("v.page = { ...(v.page || {}), mode: 'blend', maxSegments: 2000 }; v.provider = { active: 'mock', fallback: [], configs: {} };");
const first = await triggerPage(page, tabId);
const count = await page.$$eval('.tf-block', (nodes) => nodes.length);
check('page translate inserts blocks', count === 7, `${count} blocks`);
check('first block appears quickly', first.first !== null && first.first < 1000, `${first.first}ms first / ${first.total}ms total`);

const palettes = await page.$$eval('.tf-block', (nodes) =>
  nodes.map((n) => n.style.getPropertyValue('--tf-trans-color')),
);
const darkPalette = palettes.some((c) => {
  const m = c.match(/rgb\((\d+),/);
  return m && Number(m[1]) > 120;
});
check('dark section gets its own palette', darkPalette, palettes.join(' | '));

await page.screenshot({ path: '/tmp/tf_page.png' });

// --- 2. restore ---
await restore(tabId);
const restored = await page.evaluate(() => ({
  blocks: document.querySelectorAll('.tf-block').length,
  text: document.querySelector('article p')?.textContent?.slice(0, 24),
}));
check('restore removes all translations', restored.blocks === 0 && restored.text?.startsWith('We are told'), JSON.stringify(restored));

// --- 3. cache hit ---
const cacheBefore = await sw.eval(`chrome.storage.local.get(null).then((all) => Object.keys(all).filter((k) => k.startsWith('tf:cache:')).length)`);
const cached = await triggerPage(page, tabId);
const cacheAfter = await sw.eval(`chrome.storage.local.get(null).then((all) => Object.keys(all).filter((k) => k.startsWith('tf:cache:')).length)`);
check('translation is cached', cacheAfter > 0, `${cacheBefore} -> ${cacheAfter} keys`);
check('cache hit is faster', cached.total < first.total, `${cached.total}ms vs ${first.total}ms`);
await restore(tabId);

// --- 4. four render modes ---
for (const mode of ['card', 'mask', 'replace']) {
  await patchSettings(`v.page = { ...(v.page || {}), mode: '${mode}' };`);
  await triggerPage(page, tabId, false);
  const state = await page.evaluate(() => ({
    cls: document.documentElement.className,
    blocks: document.querySelectorAll('.tf-block').length,
    replaced: document.querySelectorAll('[data-tf-original]').length,
  }));
  const ok = mode === 'replace' ? state.replaced > 0 : state.blocks > 0 && state.cls.includes(`tf-mode-${mode}`);
  check(`render mode ${mode}`, ok, JSON.stringify(state));
  await restore(tabId);
}

// --- 5. input translation + undo ---
await patchSettings("v.page = { ...(v.page || {}), mode: 'blend' };");
await page.click('#editor');
await page.keyboard.type('hello world');
await page.keyboard.press('Space');
await page.keyboard.press('Space');
await sleep(900);
const inputValue = await page.$eval('#editor', (el) => el.value);
check('input double-space translation', inputValue.includes('〔模拟'), inputValue);
await page.keyboard.down('Control');
await page.keyboard.press('KeyZ');
await page.keyboard.up('Control');
await sleep(250);
const undone = await page.$eval('#editor', (el) => el.value);
check('input undo restores original', undone.startsWith('hello world'), undone);

// --- 6. glossary + usage via extension page ---
await patchSettings("v.glossary = { entries: [{ source: 'hello', target: '你好' }] };");
const popup = await browser.newPage();
await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' });
const glossary = await popup.evaluate(() =>
  chrome.runtime.sendMessage({ type: 'translate', segments: [{ id: 'g', text: 'hello world' }], from: 'en', to: 'zh' }),
);
check('glossary term is applied', Boolean(glossary?.ok) && glossary.data.results[0].text.includes('你好'), JSON.stringify(glossary));
const usage = await sw.eval(`chrome.storage.local.get('tf:usage').then((s) => JSON.stringify(s['tf:usage'] || null))`);
check('usage is recorded', Boolean(usage) && JSON.parse(usage).total > 0, usage);

await patchSettings("v.provider = { active: 'volc', fallback: [], configs: {} };");
const bad = await popup.evaluate(() =>
  chrome.runtime.sendMessage({ type: 'translate', segments: [{ id: 'e', text: 'hello' }], from: 'en', to: 'zh' }),
);
check('missing credentials surfaces an error', bad.ok === false && /密钥|key|credential/i.test(bad.error.message), JSON.stringify(bad));
await patchSettings("v.provider = { active: 'mock', fallback: [], configs: {} };");
await popup.close();

const optionsPage = await browser.newPage();
await optionsPage.goto(`chrome-extension://${extensionId}/options.html`, { waitUntil: 'domcontentloaded' });
await sleep(700);
const hasWizard = await optionsPage.evaluate(() => Boolean(document.querySelector('.wizard')));
check('first-run wizard opens', hasWizard);
await optionsPage.close();

// --- 7. segment cap on a long page ---
await patchSettings("v.page = { ...(v.page || {}), maxSegments: 5 };");
const longPage = await browser.newPage();
await longPage.goto('http://127.0.0.1:8125/long.html', { waitUntil: 'domcontentloaded' });
await sleep(700);
const longTab = await tabIdFor('8125/long.html');
await triggerPage(longPage, longTab, false);
const longCount = await longPage.$$eval('.tf-block', (nodes) => nodes.length);
check('segment cap is enforced', longCount === 5, `${longCount} blocks`);
await restore(longTab);

const perf = await longPage.evaluate(() => {
  const originals = Array.from(document.querySelectorAll('p'));
  const body = document.querySelector('body');
  const rounds = Math.ceil(1000 / originals.length);
  for (let i = 0; i < rounds; i++) for (const p of originals) body.appendChild(p.cloneNode(true));
  const blocks = Array.from(document.querySelectorAll('p')).slice(0, 1000);
  const started = performance.now();
  for (const p of blocks) {
    const node = document.createElement('div');
    node.className = 'tf-block';
    node.textContent = '译文';
    p.insertAdjacentElement('afterend', node);
  }
  void document.body.getBoundingClientRect();
  return { count: blocks.length, ms: Math.round(performance.now() - started) };
});
check('1,000 block insertion under 500ms', perf.ms < 500, `${perf.ms}ms / ${perf.count} blocks`);
await longPage.close();

// --- 18. popup UI translates ---
const popupUi = await browser.newPage();
await popupUi.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' });
await popupUi.waitForSelector('textarea');
await popupUi.evaluate(() => {
  const textarea = document.querySelector('textarea');
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(textarea, 'hello ui');
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
});
await popupUi.click('.primary');
await sleep(700);
const popupResult = await popupUi.$eval('.result .text', (el) => el.textContent ?? '');
check('popup UI translates text', popupResult.includes('模拟'), popupResult);
await popupUi.close();

// --- 19. selection translation records usage ---
await page.evaluate(() => {
  const p = document.querySelector('article p');
  const range = document.createRange();
  range.selectNodeContents(p);
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
});
const usageBefore = JSON.parse(await sw.eval(`chrome.storage.local.get('tf:usage').then((s) => JSON.stringify(s['tf:usage'] || { total: 0 }))`)).total;
await sw.eval(`chrome.tabs.sendMessage(${tabId}, { type: 'selection-translate' })`);
await sleep(700);
const usageAfter = JSON.parse(await sw.eval(`chrome.storage.local.get('tf:usage').then((s) => JSON.stringify(s['tf:usage'] || { total: 0 }))`)).total;
check('selection translation records usage', usageAfter > usageBefore, `${usageBefore} -> ${usageAfter}`);
await page.screenshot({ path: '/tmp/tf_selection.png' });
await page.evaluate(() => getSelection().removeAllRanges());

// --- 20. configurable shortcut opens a floating bubble ---
await page.keyboard.press('Escape');
// Deliberately write the legacy default; content/background should migrate it to t.
await patchSettings("v.selection = { enabled: true, target: 'zh', trigger: 'both', keys: 'alt+s' };");
await sleep(350);
await page.evaluate(() => {
  (document.activeElement instanceof HTMLElement ? document.activeElement : null)?.blur();
  document.body.tabIndex = -1;
  document.body.focus();
  getSelection().removeAllRanges();
  const p = document.querySelectorAll('article p')[1];
  p.scrollIntoView({ block: 'center' });
  const range = document.createRange();
  range.selectNodeContents(p);
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
});
await page.keyboard.press('t');
await sleep(900);
const bubble = await page.evaluate(() => {
  const host = document.getElementById('transflow-root');
  return host ? { open: host.dataset.tfBubble, placement: host.dataset.tfPlacement } : null;
});
check('legacy alt+s migrates to t and opens a bubble', Boolean(bubble) && bubble.open === 'open' && Boolean(bubble.placement), JSON.stringify(bubble));
await page.screenshot({ path: '/tmp/tf_bubble.png' });
await page.keyboard.press('Escape');
await sleep(250);
const bubbleGone = await page.evaluate(() => !document.getElementById('transflow-root')?.dataset.tfBubble);
check('Escape closes the bubble', bubbleGone);

const diag = await sw.eval(`chrome.tabs.sendMessage(${tabId}, {type:'diagnose'})`);
check(
  'diagnose reports page script and settings',
  Boolean(diag?.ok) && Boolean(diag.data?.version) && diag.data.settings?.keys === 't',
  JSON.stringify(diag?.data ?? diag),
);

// IME fallback: key=Process + code=KeyT should still trigger the bubble.
await page.evaluate(() => {
  getSelection().removeAllRanges();
  const p = document.querySelectorAll('article p')[2];
  p.scrollIntoView({ block: 'center' });
  const range = document.createRange();
  range.selectNodeContents(p);
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
});
const cdp = await page.createCDPSession();
await cdp.send('Input.dispatchKeyEvent', {
  type: 'keyDown', key: 'Process', code: 'KeyT', windowsVirtualKeyCode: 84, nativeVirtualKeyCode: 84,
});
await cdp.send('Input.dispatchKeyEvent', {
  type: 'keyUp', key: 'Process', code: 'KeyT', windowsVirtualKeyCode: 84, nativeVirtualKeyCode: 84,
});
await cdp.detach();
await sleep(900);
const imeBubble = await page.evaluate(() => document.getElementById('transflow-root')?.dataset.tfBubble === 'open');
check('IME Process key falls back to physical KeyT', imeBubble);
await page.keyboard.press('Escape');
await patchSettings("v.selection = { enabled: true, target: 'zh', trigger: 'both', keys: 't' };");

// --- 20. cancel stops applying translations ---
await page.evaluate(() => window.scrollTo(0, 0));
const pending = sw.eval(`chrome.tabs.sendMessage(${tabId}, {type:'page-translate'})`);
await sleep(30);
await sw.eval(`chrome.tabs.sendMessage(${tabId}, {type:'page-restore'})`);
await pending.catch(() => null);
await sleep(500);
const afterCancel = await page.evaluate(() => document.querySelectorAll('.tf-block').length);
check('cancel/restore stops translation', afterCancel === 0, `${afterCancel} blocks left`);

// --- 21. 429 error path via OpenAI-compatible mock ---
const aiControl = (body) =>
  fetch('http://127.0.0.1:8126/__control', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

await patchSettings(
  "v.provider = { active: 'openai', fallback: [], configs: { openai: { baseUrl: 'http://127.0.0.1:8126/v1', apiKey: 'test', model: 'mock' } } }; v.page = { ...(v.page || {}), mode: 'blend', maxSegments: 2000 };",
);
await aiControl({ status: 429, delayMs: 0 });
const apiPage = await browser.newPage();
await apiPage.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' });
const res429 = await apiPage.evaluate(() =>
  chrome.runtime.sendMessage({ type: 'translate', segments: [{ id: 'x', text: 'hello' }], from: 'en', to: 'zh' }),
);
check('429 surfaces a readable error', res429.ok === false && /429/.test(res429.error.message), JSON.stringify(res429));
await apiPage.close();

// --- 22. slow request + cancel leaves no partial output ---
await aiControl({ status: 200, delayMs: 1500 });
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(700);
const slow = sw.eval(`chrome.tabs.sendMessage(${tabId}, {type:'page-translate'})`);
await sleep(300);
await sw.eval(`chrome.tabs.sendMessage(${tabId}, {type:'page-restore'})`);
await slow.catch(() => null);
await sleep(1700);
const slowBlocks = await page.evaluate(() => document.querySelectorAll('.tf-block').length);
check('slow request cancel leaves no blocks', slowBlocks === 0, `${slowBlocks} blocks`);

await aiControl({ status: 200, delayMs: 0 });
await patchSettings("v.provider = { active: 'mock', fallback: [], configs: {} };");

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
sw.close();
await browser.disconnect();
if (failed.length > 0) process.exit(1);
