import { useEffect, useState } from 'react';
import type { ProviderConfig } from '../../core/provider/types';
import type { Settings } from '../../core/settings/schema';
import type { RuntimeMessage, RuntimeResponse } from '../../core/messages';
import { LANGUAGES } from '../../core/lang';
import { formatGlossary, parseGlossary } from '../../core/glossary';
import { estimateCost, getUsage } from '../../core/usage';
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

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [active, setActive] = useState('volc');
  const [target, setTarget] = useState('zh');
  const [mode, setMode] = useState<PageMode>('blend');
  const [glossaryText, setGlossaryText] = useState('');
  const [usage, setUsage] = useState<{ total: number; byProvider: Record<string, number> } | null>(null);
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
        setGlossaryText(formatGlossary(response.data.glossary.entries));
      }
      const current = await getUsage();
      setUsage({ total: current.total, byProvider: current.byProvider });

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
    <div className="wrap">
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

      <div className="card">
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

      <div className="card">
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

      <div className="card">
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

      <div className="card">
        <h2>本月用量</h2>
        <p className="desc">只在本机统计，不上传。费用为按公开单价的粗略估算。</p>
        {usage ? (
          <div className="usage">
            <div className="usage-total">{usage.total.toLocaleString()} 字符</div>
            {Object.entries(usage.byProvider).map(([id, chars]) => (
              <div className="usage-row" key={id}>
                <span>{PROVIDERS.find((p) => p.id === id)?.name ?? id}</span>
                <span>{chars.toLocaleString()} 字符</span>
                <span>{estimateCost(id, chars) > 0 ? `约 ¥${estimateCost(id, chars).toFixed(2)}` : '免费额度内'}</span>
              </div>
            ))}
            {Object.keys(usage.byProvider).length === 0 && <div className="hint">本月还没有翻译记录</div>}
          </div>
        ) : (
          <div className="hint">加载中…</div>
        )}
      </div>

      <div className="card">
        <h2>关于</h2>
        <p className="desc">
          TransFlow v0.3.0 · MIT · 开源地址待发布。开发预览：整页双语、划词、输入框、术语表、用量统计与多渠道已可用。
        </p>
        {settings && <div className="hint">当前渠道：{settings.provider.active}</div>}
      </div>

      <div className="footer">译流 TransFlow · 一个快速、开源的双语阅读层</div>
    </div>
  );
}
