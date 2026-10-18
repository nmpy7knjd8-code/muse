// Idea 2 — mood A/B ear trainer: hear home → A and home → B, pick the one that sounds more <mood>.
import { useMemo, useState } from 'react';
import { earMoods, makeEarQuestion, parseEarStats, updateEarStats, weakestMoods, EMPTY_EAR_STATS, type EarLevel, type EarQuestion, type EarStats } from '../../core';
import { PlayIcon } from '../icons';
import { Meter, ToolIntro } from './common';
import type { ToolProps } from './types';

const STORE = 'muse.ear';
const loadStats = (): EarStats => { try { return parseEarStats(localStorage.getItem(STORE)); } catch { return EMPTY_EAR_STATS; } };
const saveStats = (s: EarStats) => { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* private mode */ } };

export default function EarTool(p: ToolProps) {
  const [level, setLevel] = useState<EarLevel>('easy');
  const [focus, setFocus] = useState<string>('any');
  const [stats, setStats] = useState<EarStats>(loadStats);
  const [picked, setPicked] = useState<0 | 1 | null>(null);
  const moods = useMemo(() => earMoods(p.engine, p.k, level), [p.engine, p.k, level]);
  const weak = weakestMoods(stats);
  const pickMood = (f = focus) => {
    if (f === 'weak' && weak.length) return weak[Math.floor(Math.random() * weak.length)];
    return f !== 'any' && f !== 'weak' && moods.includes(f) ? f : undefined;
  };
  const fresh = (avoid?: string) => makeEarQuestion(p.engine, p.k, { level, mood: pickMood(), avoid });
  const [q, setQ] = useState<EarQuestion | null>(() => fresh());
  const label = (id: string) => p.lex.label(id);
  const color = (id: string) => p.lex.color(id);
  const step = Math.max(0.55, p.beatSec * 2);

  const hear = (i: 0 | 1, question = q) => { if (question) p.playChords([question.context, question.options[i].chord], step); };
  const hearBoth = (question = q) => { if (question) p.playChords([question.context, question.options[0].chord, question.context, question.options[1].chord], step); };
  const next = () => {
    const nq = fresh(q?.mood);
    setQ(nq); setPicked(null);
    if (nq) hearBoth(nq);
  };
  const choose = (i: 0 | 1) => {
    if (!q || picked !== null) return;
    setPicked(i);
    const s = updateEarStats(stats, q.mood, i === q.answer);
    setStats(s); saveStats(s);
    p.playChord(q.options[i].chord);
  };
  const answered = picked !== null;
  const correct = answered && q && picked === q.answer;
  const pct = stats.asked ? stats.right / stats.asked : 0;
  const tried = Object.entries(stats.byMood).sort((a, b) => b[1].asked - a[1].asked).slice(0, 8);

  return (
    <div className="tool ear-tool">
      <ToolIntro>Each round plays home, then chord A — home, then chord B. Pick the one that carries the mood more. Names stay hidden until you answer, so it's your ear doing the work.</ToolIntro>
      <div className="seg small-seg" role="group" aria-label="Difficulty">
        {(['easy', 'hard'] as const).map((l) => (
          <button key={l} type="button" className={level === l ? 'on' : ''} aria-pressed={level === l}
            onClick={() => { setLevel(l); setPicked(null); setQ(makeEarQuestion(p.engine, p.k, { level: l, mood: pickMood() })); }}>
            {l === 'easy' ? 'Clear contrasts' : 'Close calls'}
          </button>
        ))}
      </div>
      <label className="tool-check">Practise
        <select value={focus} onChange={(e) => { const f = e.target.value; setFocus(f); setPicked(null); setQ(makeEarQuestion(p.engine, p.k, { level, mood: pickMood(f) })); }} aria-label="Mood to practise">
          <option value="any">any mood</option>
          {weak.length > 0 && <option value="weak">my weak spots</option>}
          {moods.map((m) => <option key={m} value={m}>{label(m)}</option>)}
        </select>
      </label>
      {!q ? <p className="tool-warn">No clear pairs in this key for that mood — try “any mood”.</p> : (
        <div className="tool-card ear-card">
          <h4 className="ear-q">Which sounds more <span style={{ color: color(q.mood) }}>{label(q.mood)}</span>?</h4>
          <button type="button" className="tool-hear ear-both" onClick={() => hearBoth()}><PlayIcon size={14} /> Play both</button>
          <div className="ear-opts">
            {([0, 1] as const).map((i) => {
              const o = q.options[i];
              const state = !answered ? '' : i === q.answer ? ' right' : i === picked ? ' wrong' : ' dim';
              return (
                <div key={i} className={'ear-opt' + state}>
                  <button type="button" className="ear-hear" onClick={() => hear(i)} aria-label={`Hear ${i ? 'B' : 'A'}`}>
                    <PlayIcon size={16} /><span>{i ? 'B' : 'A'}</span>
                  </button>
                  {answered ? (
                    <div className="ear-reveal">
                      <b>{o.symbol}</b>
                      <span className="ear-moods">
                        {o.moods.slice(0, 3).map((m) => <i key={m.id} style={{ color: color(m.id) }}>{label(m.id)}</i>)}
                      </span>
                    </div>
                  ) : (
                    <button type="button" className="add ear-pick" onClick={() => choose(i)}>This one</button>
                  )}
                </div>
              );
            })}
          </div>
          {answered && (
            <div className="ear-result" aria-live="polite">
              <p className={correct ? 'ear-good' : 'ear-bad'}>
                {correct ? 'Yes — ' : 'Not quite — '}
                <b>{q.options[q.answer].symbol}</b> leans {label(q.mood).toLowerCase()}; <b>{q.options[1 - q.answer]!.symbol}</b> reads more {label(q.options[1 - q.answer]!.moods[0]!.id).toLowerCase()}.
              </p>
              <button type="button" className="add" onClick={next}>Next</button>
            </div>
          )}
        </div>
      )}
      <div className="tool-card">
        <div className="ear-stats"><span>Streak <b>{stats.streak}</b></span><span>Best <b>{stats.best}</b></span><span>Rounds <b>{stats.asked}</b></span></div>
        {stats.asked > 0 && <Meter value={pct} label="Overall ear" left="guessing" right="spot on" />}
        {tried.map(([id, v]) => (
          <Meter key={id} value={v.right / v.asked} label={label(id)} color={color(id)} />
        ))}
        {stats.asked > 0 && (
          <button type="button" className="pill ear-reset" onClick={() => { setStats(EMPTY_EAR_STATS); saveStats(EMPTY_EAR_STATS); }}>Reset stats</button>
        )}
      </div>
    </div>
  );
}
