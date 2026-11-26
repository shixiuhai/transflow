import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addVocabItem,
  exportVocabCsv,
  exportVocabJson,
  importVocabJson,
  isVocabUuid,
  loadVocab,
  saveVocab,
  setVocabUuid,
  updateVocabItem,
  deleteVocabItems,
  dueVocabItems,
} from '../../core/vocab/store';
import type { VocabItem, VocabState } from '../../core/vocab/types';
import { DEFAULT_SYNC_URL } from '../../core/vocab/sync';
import './style.css';

type Filter = 'all' | 'due' | 'mastered' | 'new';
type Sort = 'updated' | 'due' | 'alpha';

interface Editor {
  mode: 'add' | 'edit';
  id?: string;
  term: string;
  translation: string;
  context: string;
  note: string;
  tags: string;
  sourceLang: string;
  targetLang: string;
}

const emptyEditor = (): Editor => ({
  mode: 'add',
  term: '',
  translation: '',
  context: '',
  note: '',
  tags: '',
  sourceLang: 'en',
  targetLang: 'zh',
});

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [state, setState] = useState<VocabState | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('updated');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [restoreUuid, setRestoreUuid] = useState('');
  const [showSync, setShowSync] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => setState(await loadVocab());
  useEffect(() => { void refresh(); }, []);

  const notify = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(''), 2600);
  };

  const filtered = useMemo(() => {
    if (!state) return [];
    const q = query.trim().toLowerCase();
    const now = Date.now();
    let list = state.items.filter((item) => {
      if (q && !`${item.term} ${item.translation} ${item.note ?? ''} ${(item.tags ?? []).join(' ')}`.toLowerCase().includes(q)) return false;
      if (filter === 'due') return (item.nextReviewAt ?? 0) <= now;
      if (filter === 'mastered') return (item.mastery ?? 0) >= 4;
      if (filter === 'new') return !item.reviewCount;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === 'alpha') return a.term.localeCompare(b.term);
      if (sort === 'due') return (a.nextReviewAt ?? 0) - (b.nextReviewAt ?? 0);
      return b.updatedAt - a.updatedAt;
    });
    return list;
  }, [state, query, filter, sort]);

  const due = state ? dueVocabItems(state.items).length : 0;
  const mastered = state ? state.items.filter((item) => (item.mastery ?? 0) >= 4).length : 0;
  const newCount = state ? state.items.filter((item) => !item.reviewCount).length : 0;
  const allVisibleSelected = filtered.length > 0 && filtered.every((item) => selected.has(item.id));

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    setSelected(allVisibleSelected ? new Set() : new Set(filtered.map((item) => item.id)));
  };

  const removeMany = async (ids: string[]) => {
    if (!ids.length) return;
    if (!confirm(`删除 ${ids.length} 个单词？删除会同步到其它设备。`)) return;
    setState(await deleteVocabItems(ids));
    setSelected(new Set());
    notify(`已删除 ${ids.length} 个`);
  };

  const saveEditor = async () => {
    if (!editor) return;
    if (!editor.term.trim() || !editor.translation.trim()) {
      notify('原文和译文不能为空');
      return;
    }
    const tags = editor.tags.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 10);
    if (editor.mode === 'add') {
      await addVocabItem({
        term: editor.term,
        translation: editor.translation,
        context: editor.context,
        note: editor.note,
        tags,
        sourceLang: editor.sourceLang,
        targetLang: editor.targetLang,
      });
      notify('已添加');
    } else if (editor.id) {
      await updateVocabItem(editor.id, {
        term: editor.term,
        translation: editor.translation,
        context: editor.context,
        note: editor.note,
        tags,
      });
      notify('已保存');
    }
    setEditor(null);
    await refresh();
  };

  const syncNow = async () => {
    setBusy(true);
    try {
      const response = (await chrome.runtime.sendMessage({ type: 'vocab-sync-now' })) as {
        ok: boolean; data?: { items: number }; error?: { message: string };
      };
      if (!response.ok) throw new Error(response.error?.message ?? '同步失败');
      await refresh();
      notify(`同步成功 · ${response.data?.items ?? 0} 条`);
    } catch (error) {
      notify(`同步失败：${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (!isVocabUuid(restoreUuid)) { notify('UUID 格式不正确'); return; }
    setBusy(true);
    try {
      await setVocabUuid(restoreUuid);
      const response = (await chrome.runtime.sendMessage({ type: 'vocab-sync-now' })) as {
        ok: boolean; data?: { items: number }; error?: { message: string };
      };
      if (!response.ok) throw new Error(response.error?.message ?? '恢复失败');
      await refresh();
      notify(`已恢复并合并 · ${response.data?.items ?? 0} 条`);
    } catch (error) {
      notify(`恢复失败：${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const removeCloud = async () => {
    if (!state || !confirm('删除云端单词本？本地词条保留，此操作不可恢复。')) return;
    setBusy(true);
    try {
      const response = await fetch(`${DEFAULT_SYNC_URL.replace(/\/$/, '')}/vocab`, {
        method: 'DELETE',
        headers: { 'X-Transflow-Id': state.uuid },
      });
      const json = (await response.json().catch(() => null)) as { code?: number; msg?: string } | null;
      if (!response.ok || json?.code !== 200) throw new Error(json?.msg ?? '删除失败');
      const next = await loadVocab();
      next.sync.lastSyncAt = 0;
      await saveVocab(next);
      await refresh();
      notify('云端已删除');
    } catch (error) {
      notify(`删除云端失败：${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const result = await importVocabJson(await file.text());
      await refresh();
      notify(`导入 ${result.imported} 条，更新 ${result.updated} 条，跳过 ${result.skipped} 条`);
    } catch (error) {
      notify(`导入失败：${(error as Error).message}`);
    }
  };

  if (!state) return <div className="loading">加载单词本…</div>;

  return (
    <div className="library">
      <header className="topbar">
        <button className="ghost" onClick={() => { window.location.href = chrome.runtime.getURL('options.html'); }}>← 设置</button>
        <div className="title"><span className="mark">译</span> 单词本</div>
        <div className="top-actions">
          <button className="primary" onClick={() => { window.location.href = chrome.runtime.getURL('review.html'); }}>开始复习{due ? ` · ${due}` : ''}</button>
          <button className="secondary" onClick={() => void syncNow()} disabled={busy}>{busy ? '同步中…' : '同步'}</button>
        </div>
      </header>

      <section className="stats">
        <div><b>{state.items.length}</b><span>全部</span></div>
        <div><b>{due}</b><span>待复习</span></div>
        <div><b>{newCount}</b><span>新词</span></div>
        <div><b>{mastered}</b><span>已掌握</span></div>
      </section>

      <section className="toolbar">
        <input className="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索原文、译文、笔记或标签…" />
        <div className="chips">
          {([['all', '全部'], ['due', '待复习'], ['new', '新词'], ['mastered', '已掌握']] as [Filter, string][]).map(([id, label]) => (
            <button key={id} className={filter === id ? 'on' : ''} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="updated">最近更新</option>
          <option value="due">复习时间</option>
          <option value="alpha">字母顺序</option>
        </select>
        <div className="tools">
          <button onClick={() => setEditor(emptyEditor())}>＋ 添加</button>
          <button onClick={() => fileRef.current?.click()}>导入</button>
          <button onClick={() => download(`transflow-vocab-${Date.now()}.json`, exportVocabJson(state), 'application/json')}>导出 JSON</button>
          <button onClick={() => download(`transflow-vocab-${Date.now()}.csv`, exportVocabCsv(filtered), 'text/csv')}>导出 CSV</button>
          <button onClick={() => setShowSync((v) => !v)}>同步设置</button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => void importFile(e.target.files?.[0])} />
      </section>

      {showSync && (
        <section className="syncbox">
          <div className="uuid"><code>{state.uuid}</code><button onClick={() => { void navigator.clipboard.writeText(state.uuid); notify('UUID 已复制'); }}>复制 UUID</button></div>
          <div className="restore">
            <input value={restoreUuid} onChange={(e) => setRestoreUuid(e.target.value)} placeholder="输入旧 UUID 恢复/合并" />
            <button onClick={() => void restore()} disabled={busy}>恢复</button>
          </div>
          <div className="syncmeta">
            上次同步：{state.sync.lastSyncAt ? new Date(state.sync.lastSyncAt).toLocaleString() : '尚未同步'}
            {state.sync.lastError ? ` · ${state.sync.lastError}` : ''}
            <button className="danger-link" onClick={() => void removeCloud()} disabled={busy}>删除云端</button>
          </div>
        </section>
      )}

      <section className="list-head">
        <label><input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} /> 全选</label>
        <span>{filtered.length} 条{selected.size ? ` · 已选 ${selected.size}` : ''}</span>
        {selected.size > 0 && <button className="danger" onClick={() => void removeMany([...selected])}>删除所选</button>}
      </section>

      <section className="rows">
        {filtered.map((item) => (
          <article className="row" key={item.id}>
            <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
            <div className="word">
              <div className="term">{item.term}</div>
              <div className="translation">{item.translation}</div>
              {item.context && <div className="context">{item.context}</div>}
              <div className="tags">
                {(item.tags ?? []).map((tag) => <span key={tag}>{tag}</span>)}
                <small>{item.sourceLang} → {item.targetLang}</small>
              </div>
            </div>
            <div className="meta">
              <div className="dots">{[0, 1, 2, 3, 4].map((i) => <i key={i} className={(item.mastery ?? 0) > i ? 'on' : ''} />)}</div>
              <small>{item.nextReviewAt ? `复习 ${new Date(item.nextReviewAt).toLocaleDateString()}` : '待复习'}</small>
            </div>
            <div className="row-actions">
              <button onClick={() => setEditor({
                mode: 'edit', id: item.id, term: item.term, translation: item.translation,
                context: item.context ?? '', note: item.note ?? '', tags: (item.tags ?? []).join(', '),
                sourceLang: item.sourceLang, targetLang: item.targetLang,
              })}>编辑</button>
              <button className="danger-link" onClick={() => void removeMany([item.id])}>删除</button>
            </div>
          </article>
        ))}
        {filtered.length === 0 && <div className="empty">没有符合条件的单词。</div>}
      </section>

      {editor && (
        <div className="overlay" onClick={() => setEditor(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editor.mode === 'add' ? '添加单词' : '编辑单词'}</h2>
            <label>原文<textarea value={editor.term} onChange={(e) => setEditor({ ...editor, term: e.target.value })} rows={2} /></label>
            <label>译文<textarea value={editor.translation} onChange={(e) => setEditor({ ...editor, translation: e.target.value })} rows={3} /></label>
            <label>原句/上下文<textarea value={editor.context} onChange={(e) => setEditor({ ...editor, context: e.target.value })} rows={2} /></label>
            <label>笔记<textarea value={editor.note} onChange={(e) => setEditor({ ...editor, note: e.target.value })} rows={2} /></label>
            <div className="two">
              <label>语言<input value={editor.sourceLang} onChange={(e) => setEditor({ ...editor, sourceLang: e.target.value })} /></label>
              <label>目标<input value={editor.targetLang} onChange={(e) => setEditor({ ...editor, targetLang: e.target.value })} /></label>
            </div>
            <label>标签（逗号分隔）<input value={editor.tags} onChange={(e) => setEditor({ ...editor, tags: e.target.value })} /></label>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setEditor(null)}>取消</button>
              <button className="primary" onClick={() => void saveEditor()}>保存</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
