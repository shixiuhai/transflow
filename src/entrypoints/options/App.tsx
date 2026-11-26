import { useEffect, useState } from 'react';
import type { ProviderConfig } from '../../core/provider/types';
import type { Settings } from '../../core/settings/schema';
import type { RuntimeMessage, RuntimeResponse } from '../../core/messages';
import { LANGUAGES } from '../../core/lang';
import { formatGlossary, parseGlossary } from '../../core/glossary';
import { estimateCost, getUsage } from '../../core/usage';
import { fetchVolcBilling, type BillingResult } from '../../core/usage/billing';
import { formatShortcut, normalizeShortcut } from '../../core/shortcut';
import {
  dueVocabItems,
  loadVocab,
  saveVocab,
} from '../../core/vocab/store';
import type { VocabState } from '../../core/vocab/types';
import type { PageMode } from '../../core/settings/schema';

const send = <T,>(message: RuntimeMessage) =>
  chrome.runtime.sendMessage(message) as Promise<RuntimeResponse<T>>;

interface ProviderInfo {
  id: string;
  name: string;
  free: string;
  keyUrl?: string;
  fields: { key: keyof ProviderConfig; label: string; placeholder?: string; secret?: boolean }[];
}

const PROVIDERS: ProviderInfo[] = [
  {
    id: 'volc',
    name: '火山引擎',
    free: '每月前 200 万字符免费 · 超出 49 元/百万',
    keyUrl: 'https://console.volcengine.com/iam/user',
    fields: [
      { key: 'accessKey', label: 'Access Key ID', placeholder: 'AKLT…' },
      { key: 'secretKey', label: 'Secret Access Key', placeholder: '只保存在本机', secret: true },
    ],
  },
  {
    id: 'baidu',
    name: '百度翻译',
    free: '高级版每月 100 万字符免费 · 超出 49 元/百万',
    keyUrl: 'https://fanyi-api.baidu.com/access/0/1',
    fields: [
      { key: 'appId', label: 'APPID', placeholder: '2024…' },
      { key: 'apiKey', label: '密钥', placeholder: '只保存在本机', secret: true },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI 兼容',
    free: 'DeepSeek / GLM / Qwen 等，按 token 计费',
    fields: [
      { key: 'baseUrl', label: 'Base URL', placeholder: 'https://api.deepseek.com/v1' },
      { key: 'apiKey', label: 'API Key', placeholder: 'sk-…', secret: true },
      { key: 'model', label: 'Model', placeholder: 'deepseek-chat' },
    ],
  },
  {
    id: 'mock',
    name: '本地模拟',
    free: '无需密钥，仅用于离线演示',
    fields: [],
  },
];

function ShortcutRecorder({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [recording, setRecording] = useState(false);
  return (
    <input
      className="shortcut-input"
      readOnly
      value={recording ? '按下按键…' : formatShortcut(value)}
      onFocus={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      onKeyDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.key === 'Escape') {
          setRecording(false);
          (event.target as HTMLInputElement).blur();
          return;
        }
        const shortcut = normalizeShortcut(event);
        if (shortcut) {
          onChange(shortcut);
          setRecording(false);
          (event.target as HTMLInputElement).blur();
        }
      }}
      aria-label="划词触发快捷键"
    />
  );
}

type Section = 'provider' | 'reading' | 'vocab' | 'usage' | 'about';

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [active, setActive] = useState('volc');
  const [target, setTarget] = useState('zh');
  const [mode, setMode] = useState<PageMode>('blend');
  const [selectionTrigger, setSelectionTrigger] = useState<'button' | 'shortcut' | 'both'>('both');
  const [selectionKeys, setSelectionKeys] = useState('t');
  const [bubbleStyle, setBubbleStyle] = useState<'auto' | 'paper' | 'glass' | 'contrast'>('paper');
  const [section, setSection] = useState<Section>('provider');
  const [others, setOthers] = useState<{ id: string; name: string; version: string }[]>([]);
  const [manageState, setManageState] = useState<'unknown' | 'ready' | 'denied'>('unknown');
  const [vocab, setVocab] = useState<VocabState | null>(null);
  const [vocabBusy, setVocabBusy] = useState(false);
  const [glossaryText, setGlossaryText] = useState('');
  const [usage, setUsage] = useState<{ total: number; byProvider: Record<string, number> } | null>(null);
  const [billing, setBilling] = useState<BillingResult | null>(null);
  const [billingError, setBillingError] = useState('');
  const [billingBusy, setBillingBusy] = useState(false);
  const [configs, setConfigs] = useState<Record<string, ProviderConfig>>({});
  const [status, setStatus] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [wizardStep, setWizardStep] = useState<number | null>(null);
  const [wizardDone, setWizardDone] = useState(true);

  useEffect(() => {
    void (async () => {
      const response = await send<Settings>({ type: 'get-settings' });
      if (response.ok) {
        setSettings(response.data);
        setActive(response.data.provider.active === 'mock' ? 'volc' : response.data.provider.active);
        setConfigs(response.data.provider.configs);
        setTarget(response.data.language.target);
        setMode(response.data.page.mode);
        setSelectionTrigger(response.data.selection.trigger);
        setSelectionKeys(response.data.selection.keys);
        setBubbleStyle(response.data.selection.bubbleStyle ?? 'paper');
        setGlossaryText(formatGlossary(response.data.glossary.entries));
      }
      const current = await getUsage();
      setUsage({ total: current.total, byProvider: current.byProvider });
      setVocab(await loadVocab());

      const done = await chrome.storage.local.get('tf:wizardDone');
      const isDone = Boolean(done['tf:wizardDone']);
      setWizardDone(isDone);
      if (!isDone) setWizardStep(0);
    })();
  }, []);

  const current = PROVIDERS.find((p) => p.id === active) ?? PROVIDERS[0];
  const config = configs[active] ?? {};

  const update = (key: keyof ProviderConfig, value: string) => {
    setConfigs((prev) => ({ ...prev, [active]: { ...prev[active], [key]: value } }));
  };

  const finishWizard = async () => {
    setBusy(true);
    try {
      const response = await send<Settings>({
        type: 'save-settings',
        patch: {
          provider: { active, fallback: [], configs },
          language: { ...(settings?.language ?? { source: 'auto', target }), target },
        } as unknown as Partial<Settings>,
      });
      if (response.ok) setSettings(response.data);
      await chrome.storage.local.set({ 'tf:wizardDone': true });
      setWizardDone(true);
      setWizardStep(null);
      setStatus({ kind: 'ok', text: '配置完成' });
    } catch (error) {
      setStatus({ kind: 'err', text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const skipWizard = async () => {
    await chrome.storage.local.set({ 'tf:wizardDone': true });
    setWizardDone(true);
    setWizardStep(null);
  };

  const scanOthers = async () => {
    const all = await chrome.management.getAll();
    setOthers(
      all
        .filter((item) => item.id !== chrome.runtime.id && /译流|TransFlow/i.test(item.name))
        .map((item) => ({ id: item.id, name: item.name, version: item.version })),
    );
    setManageState('ready');
  };

  const enableManage = async () => {
    const granted = await chrome.permissions.request({ permissions: ['management'] });
    if (granted) await scanOthers();
    else setManageState('denied');
  };

  const removeOther = async (id: string) => {
    try {
      await chrome.management.uninstall(id, { showConfirmDialog: true });
      await scanOthers();
      setStatus({ kind: 'ok', text: '已移除旧版本' });
    } catch (error) {
      setStatus({ kind: 'err', text: (error as Error).message });
    }
  };

  useEffect(() => {
    void (async () => {
      const granted = await chrome.permissions.contains({ permissions: ['management'] });
      if (granted) await scanOthers();
    })();
  }, []);

  const syncVocabNow = async () => {
    if (vocabBusy) return;
    setVocabBusy(true);
    setStatus({ kind: 'info', text: '正在同步单词本…' });
    try {
      const response = await send<{ items: number; lastSyncAt: number }>({ type: 'vocab-sync-now' });
      if (!response.ok) throw new Error(response.error.message);
      setVocab(await loadVocab());
      setStatus({ kind: 'ok', text: `同步成功 · ${response.data.items} 条` });
    } catch (error) {
      setStatus({ kind: 'err', text: `同步失败：${(error as Error).message}` });
    } finally {
      setVocabBusy(false);
    }
  };

  const updateVocabSchedule = async (auto: boolean, intervalMinutes: number) => {
    const next = await loadVocab();
    next.sync.auto = auto;
    next.sync.intervalMinutes = intervalMinutes;
    await saveVocab(next);
    setVocab(next);
  };

  const queryBilling = async () => {
    setBillingBusy(true);
    setBillingError('');
    try {
      setBilling(await fetchVolcBilling(configs.volc ?? {}));
    } catch (error) {
      setBillingError((error as Error).message);
    } finally {
      setBillingBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const response = await send<Settings>({
        type: 'save-settings',
        patch: {
          provider: { active, fallback: [], configs },
          language: { ...(settings?.language ?? { source: 'auto', target }), target },
          page: { ...(settings?.page ?? { mode, autoTranslate: false, maxSegments: 2000, includeIframes: false, rules: [] }), mode },
          selection: {
            ...(settings?.selection ?? { enabled: true, target, trigger: selectionTrigger, keys: selectionKeys }),
            trigger: selectionTrigger,
            keys: selectionKeys,
            bubbleStyle,
          },
          glossary: { entries: parseGlossary(glossaryText) },
        } as unknown as Partial<Settings>,
      });
      if (!response.ok) throw new Error(response.error.message);
      setSettings(response.data);
      setStatus({ kind: 'ok', text: '已保存' });
    } catch (error) {
      setStatus({ kind: 'err', text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setStatus({ kind: 'info', text: '正在测试…' });
    try {
      const response = await send<{ ok: boolean; latencyMs: number; detail?: string }>({
        type: 'test-provider',
        id: active,
        config,
      });
      if (!response.ok) throw new Error(response.error.message);
      setStatus({
        kind: response.data.ok ? 'ok' : 'err',
        text: response.data.ok
          ? `连接成功 · ${response.data.latencyMs} ms · ${response.data.detail ?? ''}`
          : '连接失败',
      });
    } catch (error) {
      setStatus({ kind: 'err', text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`wrap ${wizardStep !== null ? 'wizard-open' : ''}`} data-section={section}>
      <div className="quickbar">
        <button
          className="quick primary"
          onClick={() => void chrome.tabs.create({ url: chrome.runtime.getURL('review.html') })}
        >
          复习{vocab && dueVocabItems(vocab.items).length ? ` · ${dueVocabItems(vocab.items).length}` : ''}
        </button>
        <button
          className="quick"
          onClick={() => void chrome.tabs.create({ url: chrome.runtime.getURL('vocab.html') })}
        >
          单词本管理{vocab ? ` · ${vocab.items.length}` : ''}
        </button>
        <button className="quick" onClick={() => void syncVocabNow()} disabled={vocabBusy}>同步</button>
      </div>

      <nav className="sectionnav">
        {([
          ['provider', '翻译渠道'],
          ['reading', '阅读与划词'],
          ['vocab', '单词本'],
          ['usage', '用量'],
          ['about', '关于'],
        ] as [Section, string][]).map(([id, label]) => (
          <button
            key={id}
            className={section === id ? 'on' : ''}
            aria-current={section === id ? 'page' : undefined}
            onClick={() => {
              setSection(id);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="head">
        <div>
          <h1>译流设置</h1>
          <p>密钥只保存在本机浏览器，不会上传到任何服务器。</p>
        </div>
        <div className="brand">
          <span className="mark">译</span>
        </div>
      </div>

      {!wizardDone && wizardStep === null && (
        <div className="banner">
          <div>
            <b>还没有配置翻译渠道</b>
            <span>推荐火山引擎：每月前 200 万字符免费，国内直连。</span>
          </div>
          <button className="btn primary" onClick={() => setWizardStep(0)}>3 步完成配置</button>
        </div>
      )}

      {wizardStep !== null && (
        <div className="card wizard">
          <div className="wizard-top">
            <div>
              <b>快速配置</b>
              <span>第 {wizardStep + 1} / 3 步</span>
            </div>
            <div className="wizard-dots">
              {[0, 1, 2].map((step) => (
                <i key={step} className={step <= wizardStep ? 'on' : ''} />
              ))}
            </div>
          </div>

          {wizardStep === 0 && (
            <>
              <p className="desc">选一个翻译渠道。之后可以随时在设置里切换。</p>
              <div className="providers">
                {PROVIDERS.filter((provider) => provider.id !== 'mock').map((provider) => (
                  <div
                    key={provider.id}
                    className={`provider ${active === provider.id ? 'sel' : ''}`}
                    onClick={() => setActive(provider.id)}
                  >
                    <div className="name">
                      {provider.name}
                      <span className="radio" />
                    </div>
                    <div className="free">{provider.free}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {wizardStep === 1 && (
            <>
              <p className="desc">密钥只保存在本机浏览器。可先点「测试连接」验证。</p>
              <div className="grid2">
                {current.fields.map((field) => (
                  <div className="field" key={String(field.key)} style={{ marginTop: 0 }}>
                    <label htmlFor={`wizard-${String(field.key)}`}>{field.label}</label>
                    <input
                      id={`wizard-${String(field.key)}`}
                      type={field.secret ? 'password' : 'text'}
                      placeholder={field.placeholder}
                      value={String(config[field.key] ?? '')}
                      onChange={(e) => update(field.key, e.target.value)}
                    />
                  </div>
                ))}
              </div>
              {current.keyUrl && (
                <div className="hint">
                  获取密钥：<a href={current.keyUrl} target="_blank" rel="noreferrer">{current.keyUrl}</a>
                </div>
              )}
              <div className="wizard-actions">
                <button className="btn" onClick={() => setWizardStep(0)}>上一步</button>
                <button className="btn" onClick={() => void test()} disabled={busy}>测试连接</button>
                {status && <span className={`status ${status.kind}`}>{status.text}</span>}
              </div>
            </>
          )}

          {wizardStep === 2 && (
            <>
              <p className="desc">选择默认目标语言。划词、整页、输入框都会使用它。</p>
              <div className="field" style={{ marginTop: 0, maxWidth: 260 }}>
                <label htmlFor="wizard-target">目标语言</label>
                <select id="wizard-target" value={target} onChange={(e) => setTarget(e.target.value)}>
                  {LANGUAGES.filter((lang) => lang.code !== 'auto').map((lang) => (
                    <option key={lang.code} value={lang.code}>{lang.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="wizard-actions">
            {wizardStep > 0 && <button className="btn" onClick={() => setWizardStep((wizardStep ?? 0) - 1)}>上一步</button>}
            {wizardStep < 2 && (
              <button className="btn primary" onClick={() => setWizardStep((wizardStep ?? 0) + 1)} disabled={busy}>
                下一步
              </button>
            )}
            {wizardStep === 2 && (
              <button className="btn primary" onClick={() => void finishWizard()} disabled={busy}>
                完成并保存
              </button>
            )}
            <button className="skip" onClick={() => void skipWizard()}>稍后配置</button>
          </div>
        </div>
      )}

      <div className="card" data-section="provider">
        <h2>翻译渠道</h2>
        <p className="desc">默认使用火山引擎；没有密钥时可先用本地模拟渠道体验。</p>
        <div className="providers">
          {PROVIDERS.map((provider) => (
            <div
              key={provider.id}
              className={`provider ${active === provider.id ? 'sel' : ''}`}
              onClick={() => {
                setActive(provider.id);
                setStatus(null);
              }}
            >
              <div className="name">
                {provider.name}
                <span className="radio" />
              </div>
              <div className="free">{provider.free}</div>
            </div>
          ))}
        </div>

        {current.fields.length > 0 && (
          <div className={current.fields.length > 1 ? 'grid2' : ''} style={{ marginTop: 6 }}>
            {current.fields.map((field) => (
              <div className="field" key={String(field.key)}>
                <label htmlFor={String(field.key)}>{field.label}</label>
                <input
                  id={String(field.key)}
                  type={field.secret ? 'password' : 'text'}
                  placeholder={field.placeholder}
                  value={String(config[field.key] ?? '')}
                  onChange={(e) => update(field.key, e.target.value)}
                />
              </div>
            ))}
          </div>
        )}

        {current.keyUrl && (
          <div className="hint">
            获取密钥：<a href={current.keyUrl} target="_blank" rel="noreferrer">{current.keyUrl}</a>
          </div>
        )}

        <div className="actions">
          <button className="btn primary" onClick={() => void save()} disabled={busy}>
            保存
          </button>
          <button className="btn" onClick={() => void test()} disabled={busy}>
            测试连接
          </button>
          {status && <span className={`status ${status.kind}`}>{status.text}</span>}
        </div>
      </div>

      <div className="card" data-section="reading">
        <h2>阅读偏好</h2>
        <p className="desc">译文样式立即作用于已翻译页面；目标语言用于划词与整页翻译。</p>
        <div className="grid2">
          <div className="field" style={{ marginTop: 0 }}>
            <label htmlFor="targetLang">目标语言</label>
            <select id="targetLang" value={target} onChange={(e) => setTarget(e.target.value)}>
              {LANGUAGES.filter((lang) => lang.code !== 'auto').map((lang) => (
                <option key={lang.code} value={lang.code}>{lang.name}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginTop: 0 }}>
            <label htmlFor="pageMode">译文样式</label>
            <select id="pageMode" value={mode} onChange={(e) => setMode(e.target.value as PageMode)}>
              <option value="blend">融入 · 左细线（推荐）</option>
              <option value="card">轻卡片 · 彩色底</option>
              <option value="mask">遮罩 · 悬停显形</option>
              <option value="replace">仅译文 · 替换原文</option>
            </select>
          </div>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => void save()} disabled={busy}>保存偏好</button>
          {status && <span className={`status ${status.kind}`}>{status.text}</span>}
        </div>
      </div>


      <div className="card" data-section="reading">
        <h2>划词与快捷键</h2>
        <p className="desc">选中文本后按你设置的键，译文会直接出现在选区旁边；也可以保留「译」浮标。</p>
        <div className="grid2">
          <div className="field" style={{ marginTop: 0 }}>
            <label htmlFor="selectionTrigger">触发方式</label>
            <select
              id="selectionTrigger"
              value={selectionTrigger}
              onChange={(e) => setSelectionTrigger(e.target.value as 'button' | 'shortcut' | 'both')}
            >
              <option value="both">浮标 + 快捷键</option>
              <option value="button">仅浮标按钮</option>
              <option value="shortcut">仅快捷键</option>
            </select>
          </div>
          <div className="field" style={{ marginTop: 0 }}>
            <label htmlFor="selectionKeys">快捷键</label>
            <ShortcutRecorder value={selectionKeys} onChange={setSelectionKeys} />
          </div>
          <div className="field" style={{ marginTop: 0 }}>
            <label htmlFor="bubbleStyle">气泡样式</label>
            <select
              id="bubbleStyle"
              value={bubbleStyle}
              onChange={(e) => setBubbleStyle(e.target.value as typeof bubbleStyle)}
            >
              <option value="paper">暖纸 · 护眼（推荐）</option>
              <option value="auto">跟随页面 · 自动深浅</option>
              <option value="glass">毛玻璃 · 轻透</option>
              <option value="contrast">高对比 · 深色</option>
            </select>
          </div>
        </div>
        <div className="hint">
          点一下输入框再按组合键即可录制。默认是字母 t（直接按小写 t；输入法处于中文组合状态时可能不触发，可先用 Alt+t）。也可以录 r 或组合键。若同时看到 1.1.x 旧版，请在 chrome://extensions 移除旧版（ID 以 dnag 开头）。
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => void save()} disabled={busy}>保存划词设置</button>
          {status && <span className={`status ${status.kind}`}>{status.text}</span>}
        </div>
      </div>

      <div className="card" data-section="reading">
        <h2>术语表</h2>
        <p className="desc">每行一条「原文=译文」，大小写不敏感，长词优先。翻译前会替换为占位符，译后还原。</p>
        <textarea
          className="glossary"
          value={glossaryText}
          onChange={(e) => setGlossaryText(e.target.value)}
          placeholder={"Transformer=变换器\nRAG=检索增强生成"}
          spellCheck={false}
        />
        <div className="actions">
          <button className="btn primary" onClick={() => void save()} disabled={busy}>保存术语表</button>
          {status && <span className={`status ${status.kind}`}>{status.text}</span>}
        </div>
      </div>

      <div className="card" data-section="usage">
        <h2>本月用量</h2>
        <p className="desc">字符数只在本机统计，不上传；官方消费通过火山费用中心接口查询，需要账单只读权限。</p>
        {usage ? (
          <div className="usage">
            <div className="usage-total">{usage.total.toLocaleString()} 字符</div>
            {Object.entries(usage.byProvider).map(([id, chars]) => (
              <div className="usage-row" key={id}>
                <span>{PROVIDERS.find((p) => p.id === id)?.name ?? id}</span>
                <span>{chars.toLocaleString()} 字符</span>
                <span>{estimateCost(id, chars) > 0 ? `本机估算 ¥${estimateCost(id, chars).toFixed(2)}` : '免费额度内（估算）'}</span>
              </div>
            ))}
            {Object.keys(usage.byProvider).length === 0 && <div className="hint">本月还没有翻译记录</div>}
          </div>
        ) : (
          <div className="hint">加载中…</div>
        )}

        <div className="billing">
          <div className="billing-head">
            <div>
              <b>火山引擎官方账单</b>
              <span>{billing?.month ?? new Date().toISOString().slice(0, 7)}</span>
            </div>
            <button
              className="btn"
              onClick={() => void queryBilling()}
              disabled={billingBusy || !configs.volc?.accessKey || !configs.volc?.secretKey}
            >
              {billingBusy ? '查询中…' : billing ? '刷新账单' : '查询官方账单'}
            </button>
          </div>
          {billing ? (
            <div className="billing-body">
              <div className="billing-total">账户本月实付 ¥{billing.total.toFixed(2)}</div>
              <div className="billing-row">
                <span>机器翻译</span>
                <span>{billing.hasTranslationLine ? `¥${billing.translationTotal.toFixed(2)}` : '暂无计费（可能在免费额度内）'}</span>
              </div>
              <div className="billing-row">
                <span>账单产品数</span>
                <span>{billing.lines.length} 个</span>
              </div>
              {billing.lines.length > 0 && (
                <details className="billing-details">
                  <summary>查看账单明细</summary>
                  {billing.lines.map((line) => (
                    <div className="billing-line" key={`${line.product}-${line.productZh}`}>
                      <span>{line.productZh || line.product}</span>
                      <span>¥{line.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </details>
              )}
              <div className="hint">
                官方账单包含账户所有产品；免费额度内的翻译字符不会产生账单，字符数仍以本机统计为准。账单数据延迟 1–4 小时。
              </div>
            </div>
          ) : billingError ? (
            <div className="status err">{billingError}</div>
          ) : (
            <div className="hint">
              需要火山 AK 具备 <code>BillingCenterReadOnlyAccess</code>（费用中心全部只读）；百度翻译暂未开放用量查询接口。
            </div>
          )}
        </div>
      </div>


      <div className="card" data-section="usage">
        <h2>版本检查</h2>
        <p className="desc">Chrome 不会自动合并不同 ID 的旧版本。若同时看到 1.1.x 和 1.2.x，可在这里移除旧版。</p>
        {manageState === 'ready' ? (
          others.length > 0 ? (
            others.map((item) => (
              <div className="ext-row" key={item.id}>
                <div>
                  <b>{item.name}</b>
                  <span>{item.version} · {item.id}</span>
                </div>
                <button className="btn" onClick={() => void removeOther(item.id)}>移除旧版</button>
              </div>
            ))
          ) : (
            <div className="hint">未检测到其它版本的译流扩展。</div>
          )
        ) : (
          <button className="btn" onClick={() => void enableManage()}>检查旧版本</button>
        )}
        {manageState === 'denied' && <div className="status err">未授予权限。也可手动打开 chrome://extensions 移除旧版。</div>}
        <div className="hint">移除后请保留当前 1.2.x（ID 以 hpdl 开头），旧版 ID 以 dnag 开头。</div>
      </div>


      <div className="card" data-section="vocab">
        <h2>单词本</h2>
        <p className="desc">划词气泡或翻译弹窗里的「＋单词本」会保存到这里；UUID 是跨设备恢复的唯一凭证。</p>
        <p className="desc" style={{ color: 'var(--tf-warn)' }}>
          同步会经过作者自建的 <code>transflow.yizhiweb.top</code> 服务，仅用于跨设备恢复；实现较简单，不保证稳定性或永久存储，重要词库请定期导出 JSON。
        </p>

        <div className="vocab-uuid">
          <code>{vocab?.uuid ?? '加载中…'}</code>
          <button
            className="btn"
            onClick={() => {
              if (vocab) {
                void navigator.clipboard.writeText(vocab.uuid);
                setStatus({ kind: 'ok', text: 'UUID 已复制' });
              }
            }}
          >
            复制 UUID
          </button>
        </div>

        <div className="vocab-summary">
          <span><b>{vocab?.items.length ?? 0}</b> 条 · <b>{vocab ? dueVocabItems(vocab.items).length : 0}</b> 待复习</span>
          <label htmlFor="vocabSchedule">自动同步
            <select
              id="vocabSchedule"
              value={vocab?.sync.auto ? String(vocab.sync.intervalMinutes) : 'manual'}
              onChange={(e) => {
                const value = e.target.value;
                if (value === 'manual') void updateVocabSchedule(false, 360);
                else void updateVocabSchedule(true, Number(value));
              }}
            >
              <option value="60">每 1 小时</option>
              <option value="360">每 6 小时（推荐）</option>
              <option value="720">每 12 小时</option>
              <option value="1440">每 24 小时</option>
              <option value="manual">仅手动</option>
            </select>
          </label>
        </div>

        <div className="vocab-actions">
          <button
            className="btn primary"
            onClick={() => void chrome.tabs.create({ url: chrome.runtime.getURL('review.html') })}
            disabled={!vocab?.items.length}
          >
            开始复习{(vocab ? dueVocabItems(vocab.items).length : 0) > 0 ? ` · ${dueVocabItems(vocab!.items).length}` : ''}
          </button>
          <button
            className="btn"
            onClick={() => void chrome.tabs.create({ url: chrome.runtime.getURL('vocab.html') })}
          >
            管理单词本
          </button>
          <button className="btn" onClick={() => void syncVocabNow()} disabled={vocabBusy}>立即同步</button>
        </div>
        <div className="hint">
          {vocab?.sync.lastSyncAt ? `上次同步：${new Date(vocab.sync.lastSyncAt).toLocaleString()}` : '尚未同步'}
          {vocab?.sync.lastError ? ` · ${vocab.sync.lastError}` : ''}
          {' · '}恢复 UUID、导入导出、批量删除、删除云端在「管理单词本」里。
        </div>
      </div>

      <div className="card" data-section="about">
        <h2>关于</h2>
        <p className="desc">
          TransFlow v{chrome.runtime.getManifest().version} · MIT · github.com/shixiuhai/transflow
        </p>
        {settings && <div className="hint">当前渠道：{settings.provider.active}</div>}
      </div>

      <div className="footer">译流 TransFlow · 一个快速、开源的双语阅读层</div>
    </div>
  );
}
