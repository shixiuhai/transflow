import { useEffect, useMemo, useState } from 'react';
import { dueVocabItems, gradeVocabItem, loadVocab, type ReviewGrade } from '../../core/vocab/store';
import type { VocabItem, VocabState } from '../../core/vocab/types';
import './style.css';

const GRADES: { id: ReviewGrade; label: string; hint: string; cls: string }[] = [
  { id: 'again', label: '不认识', hint: '1', cls: 'again' },
  { id: 'hard', label: '模糊', hint: '2', cls: 'hard' },
  { id: 'good', label: '认识', hint: '3', cls: 'good' },
  { id: 'easy', label: '很简单', hint: '4', cls: 'easy' },
];

export default function App() {
  const [state, setState] = useState<VocabState | null>(null);
  const [queue, setQueue] = useState<VocabItem[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(0);
  const [allMode, setAllMode] = useState(false);

  useEffect(() => {
    void loadVocab().then((loaded) => {
      setState(loaded);
      setQueue(dueVocabItems(loaded.items));
    });
  }, []);

  const current = queue[index];
  const total = queue.length;
  const dueCount = useMemo(() => (state ? dueVocabItems(state.items).length : 0), [state]);
  const progress = total ? Math.round((index / total) * 100) : 0;

  const goOptions = () => {
    window.location.href = chrome.runtime.getURL('options.html');
  };

  const start = (all = false) => {
    if (!state) return;
    setAllMode(all);
    setQueue(all ? state.items : dueVocabItems(state.items));
    setIndex(0);
    setDone(0);
    setRevealed(false);
    setStarted(true);
  };

  const grade = async (value: ReviewGrade) => {
    if (!current) return;
    const next = await gradeVocabItem(current.id, value);
    setState(next);
    setDone((n) => n + 1);
    setRevealed(false);
    setIndex((i) => i + 1);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!started || !current) return;
      if (event.key === 'Escape') {
        window.location.href = chrome.runtime.getURL('options.html');
        return;
      }
      if (event.code === 'Space' || event.key === 'Enter') {
        event.preventDefault();
        setRevealed((r) => !r);
        return;
      }
      if (!revealed) return;
      const map: Record<string, ReviewGrade> = { '1': 'again', '2': 'hard', '3': 'good', '4': 'easy' };
      const value = map[event.key];
      if (value) void grade(value);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!state) return <div className="loading">加载单词本…</div>;

  const finished = started && index >= total;
  const empty = !started && dueCount === 0;

  return (
    <div className="review-shell">
      <header className="review-head">
        <button className="ghost" onClick={goOptions}>← 返回设置</button>
        <div className="brand"><span>译</span> 译流 · 复习</div>
        <div className="due">{dueCount} 个待复习 / {state.items.length} 个词</div>
      </header>

      {!started && (
        <section className="intro">
          <p className="eyebrow">VOCABULARY REVIEW</p>
          <h1>把今天查过的词，<br />变成明天还记得的词。</h1>
          <p className="sub">
            {empty
              ? '今天没有到期单词。可以复习全部，或去阅读页划词添加。'
              : `有 ${dueCount} 个单词到期。先回想，再翻面看释义。`}
          </p>
          <div className="intro-actions">
            {empty ? (
              <button className="primary" onClick={() => start(true)} disabled={!state.items.length}>复习全部</button>
            ) : (
              <button className="primary" onClick={() => start(false)}>开始复习 · {dueCount}</button>
            )}
            {!empty && <button className="secondary" onClick={() => start(true)}>复习全部 {state.items.length}</button>}
            <button className="ghost" onClick={goOptions}>回设置</button>
          </div>
        </section>
      )}

      {started && !finished && current && (
        <section className="stage">
          <div className="progress"><i style={{ width: `${progress}%` }} /></div>
          <div className="counter">{index + 1} / {total}{allMode ? ' · 全部' : ''}</div>

          <article className={`flash ${revealed ? 'revealed' : ''}`} onClick={() => setRevealed((r) => !r)}>
            <div className="flash-top">
              <span className="tag">{current.sourceLang} → {current.targetLang}</span>
              <span className="mastery">掌握度 {current.mastery ?? 0}/5</span>
            </div>
            <h2>{current.term}</h2>
            {current.context && <p className="context">{current.context}</p>}
            <div className="divider" />
            {revealed ? (
              <div className="answer">
                <p className="translation">{current.translation}</p>
                {current.note && <p className="note">{current.note}</p>}
                {current.url && <a className="source" href={current.url} target="_blank" rel="noreferrer">{current.title || current.url}</a>}
              </div>
            ) : (
              <p className="prompt">先在心里回想释义，按空格或点击翻面</p>
            )}
          </article>

          {revealed ? (
            <div className="grades">
              {GRADES.map((g) => (
                <button key={g.id} className={g.cls} onClick={() => void grade(g.id)}>
                  <b>{g.label}</b><small>{g.hint}</small>
                </button>
              ))}
            </div>
          ) : (
            <div className="reveal-row">
              <button className="primary" onClick={() => setRevealed(true)}>显示释义 <kbd>Space</kbd></button>
              <button className="ghost" onClick={goOptions}>结束复习</button>
            </div>
          )}
        </section>
      )}

      {finished && (
        <section className="intro">
          <p className="eyebrow">SESSION COMPLETE</p>
          <h1>复习完成。</h1>
          <p className="sub">本轮 {done} 个词。记住的会间隔更久再出现，不认识的 10 分钟后回到队列。</p>
          <div className="intro-actions">
            <button className="primary" onClick={() => start(dueVocabItems(state.items).length === 0)}>再复习一轮</button>
            <button className="secondary" onClick={goOptions}>返回设置</button>
          </div>
        </section>
      )}
    </div>
  );
}
