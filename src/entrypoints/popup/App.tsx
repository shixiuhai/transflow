import { useEffect, useMemo, useState } from 'react';
import { LANGUAGES } from '../../core/lang';
import type { RuntimeMessage, RuntimeResponse, TranslateSuccess } from '../../core/messages';
import type { Settings } from '../../core/settings/schema';

const send = <T,>(message: RuntimeMessage) =>
  chrome.runtime.sendMessage(message) as Promise<RuntimeResponse<T>>;

function providerLabel(id: string): string {
  if (id === 'volc') return '火山引擎';
  if (id === 'openai') return 'AI 模型';
  if (id === 'mock') return '模拟渠道';
  return id;
}

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [text, setText] = useState('');
  const [from, setFrom] = useState('auto');
  const [to, setTo] = useState('zh');
  const [result, setResult] = useState('');
  const [meta, setMeta] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      const response = await send<Settings>({ type: 'get-settings' });
      if (response.ok) {
        setSettings(response.data);
        setFrom(response.data.language.source);
        setTo(response.data.language.target);
      }
      const selection = await chrome.tabs
        .query({ active: true, currentWindow: true })
        .then(([tab]) => (tab?.id ? chrome.tabs.sendMessage(tab.id, { type: 'get-selection' }).catch(() => null) : null))
        .catch(() => null);
      const selectionResponse = selection as RuntimeResponse<{ text: string }> | null;
      const selected = selectionResponse?.ok ? selectionResponse.data.text : '';
      if (selected) setText(selected);
    })();
  }, []);

  const canTranslate = useMemo(() => text.trim().length > 0 && !loading && from !== to, [text, loading, from, to]);

  const translate = async () => {
    if (!canTranslate) return;
    setLoading(true);
    setError('');
    setResult('');
    try {
      const response = await send<TranslateSuccess>({
        type: 'translate',
        segments: [{ id: 'popup', text: text.trim() }],
        from,
        to,
      });
      if (!response.ok) {
        setError(response.error.message);
        return;
      }
      setResult(response.data.results[0]?.text ?? '');
      setMeta(`${providerLabel(response.data.provider)} · ${response.data.latencyMs} ms`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const swap = () => {
    if (from === 'auto') return;
    setFrom(to);
    setTo(from);
    if (result) {
      setText(result);
      setResult(text);
    }
  };

  const copy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setMeta('已复制');
  };

  const translatePage = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, { type: 'page-translate' }).catch(() => null);
    }
    window.close();
  };

  return (
    <div className="pop">
      <div className="top">
        <div className="brand">
          <span className="mark">译</span>
          <div>
            <b>译流</b>
            <small>TRANSFLOW</small>
          </div>
        </div>
        <div className="status">
          <i className="dot" />
          {settings ? providerLabel(settings.provider.active) : '加载中'}
        </div>
      </div>

      <div className="langrow">
        <select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="源语言">
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>
        <button className="swap" onClick={swap} title="交换语言" aria-label="交换语言">
          ⇄
        </button>
        <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="目标语言">
          {LANGUAGES.filter((lang) => lang.code !== 'auto').map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>
      </div>

      <div className="editor">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void translate();
          }}
          placeholder="输入或选中要翻译的文本…"
          autoFocus
        />
        <div className="count">{text.length} / 5000</div>
      </div>

      <button className="primary" onClick={() => void translate()} disabled={!canTranslate}>
        {loading ? '翻译中…' : '翻译'} <kbd>⌘ ↵</kbd>
      </button>

      {error && <div className="error">{error}</div>}

      <div className="result">
        <div className="label">
          <span>译文</span>
          <span>{meta}</span>
        </div>
        <div className="text">{result || '译文会显示在这里'}</div>
        <div className="acts">
          <button onClick={() => void copy()} disabled={!result}>
            复制
          </button>
          <button
            onClick={() => {
              if (!result) return;
              const utterance = new SpeechSynthesisUtterance(result);
              utterance.lang = to === 'zh' ? 'zh-CN' : to;
              speechSynthesis.speak(utterance);
            }}
            disabled={!result}
          >
            朗读
          </button>
          <span className="grow" />
          <button onClick={() => chrome.runtime.openOptionsPage()}>设置</button>
        </div>
      </div>

      {settings?.provider.active === 'mock' && (
        <div className="hint">
          当前是模拟渠道，仅用于演示。<a onClick={() => chrome.runtime.openOptionsPage()}>配置火山引擎</a>
        </div>
      )}

      <div className="tabs">
        <button className="on">划词</button>
        <button onClick={() => void translatePage()}>整页</button>
        <button onClick={() => chrome.runtime.openOptionsPage()}>设置</button>
      </div>
    </div>
  );
}
