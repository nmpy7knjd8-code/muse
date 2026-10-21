// Theory guide (enhanced web version of the Muse theory PDF): chapters with sound, interactive visuals,
// Try-it deep links, quizzes and per-chapter progress (muse.guide → Your progress).
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BRIGHTNESS, DEGREE_COLORS, GLOSSARY, GUIDE_PEDAGOGY, MODE_BY_ID, STRUMS, chapterDone, chordPcs, chordSymbol, diatonicChords,
  guideChapters, modeStepNote, noteName, parseGuideProgress, progressionTension, scalePcs, stringLabel, tonicPc,
  type Chord, type GuideChapter, type GuideProgress, type GuideSound, type Key,
} from '../../core';
import { ToolIntro } from './common';
import type { ToolId, ToolProps } from './types';

const STORE = 'muse.guide'; const CH_KEY = 'muse.guide.ch';
const TAB_KEY: Record<string, string> = { gym: 'muse.gym.game', lessons: 'muse.lessons.tab', helpers: 'muse.helpers.tab' };
const save = (g: GuideProgress) => { try { localStorage.setItem(STORE, JSON.stringify(g)); } catch { /* */ } };
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

function useSoundPlayer(p: ToolProps) {
  const [playing, setPlaying] = useState<{ s: GuideSound; t0: number } | null>(null);
  const play = (s: GuideSound) => {
    const step = s.step ?? (s.chords ? 0.8 : 0.4);
    if (s.chords?.length) p.playChords(s.chords, step);
    else if (s.notes?.length) { const o = p.audio.origin(); s.notes.forEach((m, i) => p.audio.note(m, i * step, step * 0.9, o)); }
    setPlaying({ s, t0: performance.now() });
    const n = (s.chords?.length ?? s.notes?.length ?? 0);
    window.setTimeout(() => setPlaying((x) => (x?.s === s ? null : x)), n * step * 1000 + 200);
  };
  return { playing, play };
}

function Keyboard({ k, hi, onTap }: { k: Key; hi: number[]; onTap: (m: number) => void }) {
  const whites = [0, 2, 4, 5, 7, 9, 11]; const blacks = [1, 3, 6, 8, 10]; const bx = [1, 2, 4, 5, 6];
  const pcs = scalePcs(k); const t = tonicPc(k);
  const col = (pc: number) => { const i = pcs.indexOf(pc); return hi.includes(pc) && i >= 0 ? DEGREE_COLORS[i] : hi.includes(pc) ? '#ff7aa8' : null; };
  return (
    <svg className="guide-kb" viewBox="0 0 280 90" role="group" aria-label="Keyboard — tap to play">
      {whites.map((pc, i) => <rect key={pc} x={i * 40 + 0.5} y={0.5} width={39} height={89} rx={3} fill={col(pc) ?? '#f4f1ea'} stroke="#555" onClick={() => onTap(60 + pc)} role="button" aria-label={NAMES[pc]} />)}
      {whites.map((pc, i) => pc === t && <circle key={'h' + pc} cx={i * 40 + 20} cy={78} r={4} fill="#222" pointerEvents="none" />)}
      {blacks.map((pc, i) => <rect key={pc} x={bx[i]! * 40 - 12} y={0.5} width={24} height={55} rx={2} fill={col(pc) ?? '#222'} stroke="#111" onClick={() => onTap(60 + pc)} role="button" aria-label={NAMES[pc]} />)}
    </svg>
  );
}

function Fretboard({ p, hi }: { p: ToolProps; hi: number[] }) {
  const strs = [...p.tuning.strings].reverse(); const frets = 7; const pcs = scalePcs(p.k);
  return (
    <svg className="guide-fb" viewBox={`0 0 ${30 + frets * 40} ${strs.length * 16 + 8}`} role="group" aria-label={`Fretboard in ${p.tuning.name}`}>
      {strs.map((m, si) => <g key={si}>
        <text x={2} y={si * 16 + 16} fontSize="10" fill="currentColor">{stringLabel(p.tuning, strs.length - 1 - si).split(' · ')[1]!.replace(/ \(.*\)/, '')}</text>
        <line x1={24} x2={24 + frets * 40} y1={si * 16 + 12} y2={si * 16 + 12} stroke="#888" />
        {Array.from({ length: frets + 1 }, (_, f) => { const pc = (m + f) % 12; const i = pcs.indexOf(pc); const on = hi.includes(pc) && i >= 0;
          return <circle key={f} cx={f === 0 ? 18 : 24 + f * 40 - 20} cy={si * 16 + 12} r={on ? 6 : 5} fill={on ? DEGREE_COLORS[i] : 'transparent'} stroke={on ? 'none' : 'transparent'} onClick={() => p.audio.note(m + f, 0, 0.8, p.audio.origin())} role="button" aria-label={`${NAMES[pc]} fret ${f}`} />; })}
      </g>)}
      {Array.from({ length: frets }, (_, f) => <line key={f} x1={24 + (f + 1) * 40} x2={24 + (f + 1) * 40} y1={6} y2={strs.length * 16 + 4} stroke="#666" strokeWidth={f === -1 ? 3 : 1} />)}
    </svg>
  );
}

function Ladder({ p }: { p: ToolProps }) {
  const ivs = MODE_BY_ID[p.k.mode].intervals; const t = tonicPc(p.k);
  const feel = ['home', 'passing', 'colour', 'lifted', 'strong', 'soft', 'leans home'];
  return (
    <div className="guide-ladder" role="group" aria-label="Scale-step ladder — tap a step">
      {[...ivs].map((iv, i) => ({ iv, i })).reverse().map(({ iv, i }) => (
        <button key={i} type="button" style={{ background: DEGREE_COLORS[i] }} onClick={() => p.audio.note(60 + t + iv, 0, 0.9, p.audio.origin())}>
          <b>{i + 1}</b><span>{NAMES[(t + iv) % 12]}</span><em>{p.k.mode === 'major' ? feel[i] : ''}</em>
        </button>
      ))}
    </div>
  );
}

function ModeSlider({ p }: { p: ToolProps }) {
  const [i, setI] = useState(Math.max(0, BRIGHTNESS.indexOf(p.k.mode as never)) || 1);
  const m = BRIGHTNESS[i]!; const k = { ...p.k, mode: m } as Key; const prev = i > 0 ? BRIGHTNESS[i - 1]! : null;
  const run = () => { const o = p.audio.origin(); const ivs = MODE_BY_ID[m].intervals; [...ivs, 12].forEach((iv, j) => p.audio.note(60 + tonicPc(k) + iv, j * 0.26, 0.24, o)); };
  return (
    <div className="guide-modes">
      <label className="small">Brighter ←→ darker
        <input type="range" min={0} max={BRIGHTNESS.length - 1} value={i} onChange={(e) => setI(+e.target.value)} aria-label="Mode brightness" />
      </label>
      <div className="guide-modes-row"><b>{MODE_BY_ID[m].name}</b>{prev && <span className="small muted"> · vs {MODE_BY_ID[prev].name.replace(/ \(.*\)/, '')}: {modeStepNote(prev, m)}</span>}</div>
      <Keyboard k={k} hi={scalePcs(k)} onTap={(n) => p.audio.note(n, 0, 0.8, p.audio.origin())} />
      <div className="tool-actions"><button type="button" className="add" onClick={run}>▶ Hear {MODE_BY_ID[m].name.replace(/ \(.*\)/, '')}</button></div>
    </div>
  );
}

function TensionCurve({ p, s, playing }: { p: ToolProps; s: GuideSound; playing: { s: GuideSound; t0: number } | null }) {
  const cs = s.chords ?? []; const step = s.step ?? 0.8;
  const pts = useMemo(() => progressionTension(cs, p.k, { style: p.tStyle, adventure: p.adventure, target: null }).points, [cs, p.k, p.tStyle, p.adventure]);
  const [t, setT] = useState(-1); const raf = useRef(0);
  useEffect(() => {
    if (playing?.s !== s) { setT(-1); return; }
    const tick = () => { setT((performance.now() - playing.t0) / 1000 / step); raf.current = requestAnimationFrame(tick); };
    raf.current = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf.current);
  }, [playing, s, step]);
  const W = 300, H = 90; const x = (i: number) => 16 + (i * (W - 32)) / Math.max(1, pts.length - 1); const y = (v: number) => H - 14 - v * (H - 28);
  const d = pts.map((q, i) => `${i ? 'L' : 'M'}${x(i)},${y(q.level)}`).join(' ');
  const cx = t >= 0 ? x(Math.min(pts.length - 1, t)) : null;
  return (
    <svg className="guide-tension" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Tension curve">
      <line x1={16} x2={W - 16} y1={y(0)} y2={y(0)} stroke="#555" strokeDasharray="3 3" />
      <path d={d} fill="none" stroke="#ff9f6b" strokeWidth={3} />
      {pts.map((q, i) => <g key={i}><circle cx={x(i)} cy={y(q.level)} r={4} fill="#ff9f6b" /><text x={x(i)} y={H - 1} fontSize="10" textAnchor="middle" fill="currentColor">{chordSymbol(cs[i]!, true)}</text></g>)}
      {cx !== null && <line className="guide-playhead" x1={cx} x2={cx} y1={4} y2={H - 12} stroke="#7fb4ff" strokeWidth={2} />}
    </svg>
  );
}

function FunctionMap({ p }: { p: ToolProps }) {
  const k: Key = { ...p.k, mode: 'major' }; const d = diatonicChords(k);
  const groups: Array<[string, number[]]> = [['Home', [0, 5, 2]], ['Away', [3, 1]], ['Pull home', [4, 6]]];
  const RN = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
  return (
    <div className="guide-fmap" role="group" aria-label="Chord-function map">
      {groups.map(([g, ix]) => <div key={g} className="guide-fgroup"><span className="small muted">{g}</span>
        {ix.map((i) => <button key={i} type="button" className="chip" style={{ borderColor: DEGREE_COLORS[i] }} onClick={() => p.playChord(d[i]!)}><b>{RN[i]}</b> {chordSymbol(d[i]!, true)}</button>)}
      </div>)}
      <span className="small muted">Away → Pull home → Home is the classic loop. Tap to hear.</span>
    </div>
  );
}

function Visual({ ch, p, playing }: { ch: GuideChapter; p: ToolProps; playing: { s: GuideSound; t0: number } | null }) {
  const lastChords = playing?.s.chords ?? ch.sounds.find((s) => s.chords)?.chords;
  const hi = lastChords?.length ? chordPcs(lastChords[0] as Chord) : scalePcs(p.k);
  switch (ch.visual) {
    case 'keyboard': return <Keyboard k={p.k} hi={hi} onTap={(m) => p.audio.note(m, 0, 0.8, p.audio.origin())} />;
    case 'fretboard': return <Fretboard p={p} hi={scalePcs(p.k)} />;
    case 'ladder': return <Ladder p={p} />;
    case 'modes': return <ModeSlider p={p} />;
    case 'tension': return ch.sounds[0] ? <TensionCurve p={p} s={ch.sounds[0]} playing={playing} /> : null;
    case 'functions': return <FunctionMap p={p} />;
    case 'strum': return <div className="guide-strums">{STRUMS.slice(0, 4).map((s) => <div key={s.id}><b className="small">{s.name}</b><span className="guide-strokes">{s.strokes.map((x, i) => <i key={i} className={x === '-' ? 'rest' : x === x.toUpperCase() ? 'acc' : ''}>{x === '-' ? '·' : x.toUpperCase() === 'D' ? '↓' : '↑'}</i>)}</span></div>)}</div>;
    default: return null;
  }
}

function Quiz({ ch, g, setG, play }: { ch: GuideChapter; g: GuideProgress; setG: (g: GuideProgress) => void; play: (s: GuideSound) => void }) {
  const [picked, setPicked] = useState<Record<number, number>>({});
  if (!ch.quiz.length) return null;
  return (
    <div className="guide-quiz"><h4>Quick check</h4>
      {ch.quiz.map((q, qi) => { const a = picked[qi]; const ok = a === q.answer;
        return <div key={qi} className="tool-card guide-q"><b>{q.q}</b>
          {q.sound && <button type="button" className="chip" onClick={() => play(q.sound!)}>▶ {q.sound.label}</button>}
          <div className="guide-opts">{q.options.map((o, oi) => <button key={oi} type="button" className={`chip${a === oi ? (ok ? ' right' : ' wrong') : ''}`} aria-pressed={a === oi}
            onClick={() => { setPicked({ ...picked, [qi]: oi }); if (oi === q.answer) { const n = { ...g, quiz: { ...g.quiz, [ch.id]: (g.quiz[ch.id] ?? 0) | (1 << qi) } }; setG(n); save(n); } }}>{o}</button>)}</div>
          {a !== undefined && <span className={`small guide-fb-text ${ok ? 'ok' : 'no'}`} role="status">{ok ? '✓ Right — ' : 'Not quite — '}{q.why}</span>}
        </div>; })}
    </div>
  );
}

export default function TheoryGuideTool(p: ToolProps) {
  const chapters = useMemo(() => guideChapters(p.k), [p.k]);
  const [g, setG] = useState<GuideProgress>(() => parseGuideProgress(localStorage.getItem(STORE)));
  const [cur, setCur] = useState<string>(() => { try { const c = localStorage.getItem(CH_KEY); localStorage.removeItem(CH_KEY); return c ?? 'intro'; } catch { return 'intro'; } });
  const { playing, play } = useSoundPlayer(p);
  const top = useRef<HTMLDivElement>(null);
  const ch = chapters.find((c) => c.id === cur) ?? null;
  useEffect(() => {
    if (ch && !g.read.includes(ch.id)) { const n = { ...g, read: [...g.read, ch.id] }; setG(n); save(n); }
    top.current?.scrollIntoView?.({ block: 'start' });
  }, [cur]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = (t: { tool: string; tab?: string; mode?: Key['mode'] }) => {
    if (t.tab && TAB_KEY[t.tool]) { try { localStorage.setItem(TAB_KEY[t.tool]!, t.tab); } catch { /* */ } }
    if (t.mode) p.setKey(noteName(p.k.tonic, false), t.mode);
    p.openTool(t.tool as ToolId);
  };
  const doneN = chapters.filter((c) => chapterDone(g, c)).length;
  const idx = ch ? chapters.indexOf(ch) : -1;
  return (
    <div className="tool guide-tool" ref={top}>
      <nav className="guide-nav" aria-label="Chapters">
        <select aria-label="Chapter" value={cur} onChange={(e) => setCur(e.target.value)}>
          <option value="intro">How this guide teaches</option>
          {chapters.map((c) => <option key={c.id} value={c.id}>{chapterDone(g, c) ? '✓ ' : ''}{c.n}. {c.title}</option>)}
        </select>
        <span className="small muted">{doneN}/{chapters.length - 1} done · examples in {NAMES[tonicPc(p.k)]}</span>
      </nav>
      {!ch && <>
        <ToolIntro>Music theory from the ground up — every idea has something to hear, something to see and something to try. Examples follow your key and instrument.</ToolIntro>
        <h3>How this guide teaches</h3>
        <ul className="guide-ped">{GUIDE_PEDAGOGY.map((x) => <li key={x.name}><b>{x.name}.</b> {x.how} <span className="small muted">({x.src})</span></li>)}</ul>
        <div className="guide-toc">{chapters.map((c) => <button key={c.id} type="button" className={`guide-toc-row${chapterDone(g, c) ? ' done' : ''}`} onClick={() => setCur(c.id)}>
          <span className="guide-num">{chapterDone(g, c) ? '✓' : c.n}</span><span><b>{c.title}</b><span className="small muted">{c.level}</span></span></button>)}</div>
      </>}
      {ch && <article className="guide-ch" aria-labelledby={`gh-${ch.id}`}>
        <span className="small muted">Chapter {ch.n} · {ch.level}</span>
        <h3 id={`gh-${ch.id}`}>{ch.title}</h3>
        <p className="guide-idea">{ch.idea}</p>
        {ch.revisit && <p className="small guide-revisit">↺ Revisit: {ch.revisit}</p>}
        {ch.sounds.length > 0 && <div className="guide-sounds">{ch.sounds.map((s, i) => <button key={i} type="button" className={`chip${playing?.s === s ? ' on' : ''}`} onClick={() => play(s)}>▶ {s.label}</button>)}</div>}
        <Visual ch={ch} p={p} playing={playing} />
        {ch.body.length > 0 && <ul className="guide-body">{ch.body.map((b, i) => <li key={i}>{b}</li>)}</ul>}
        {ch.id === 'glossary' && <dl className="guide-gloss">{GLOSSARY.map((x) => <div key={x.term}><dt>{x.term}</dt><dd>{x.def} <button type="button" className="linkish" onClick={() => setCur(x.ch)}>ch. {chapters.find((c) => c.id === x.ch)?.n}</button></dd></div>)}</dl>}
        {ch.tries.length > 0 && <div className="guide-try">{ch.tries.map((t) => <button key={t.label} type="button" className="add" onClick={() => go(t)}>Try it in Muse: {t.label}</button>)}</div>}
        <Quiz key={ch.id} ch={ch} g={g} setG={setG} play={play} />
        <p className="small muted guide-src">Sources: {ch.sources.join('; ')}</p>
        <div className="guide-pager">
          <button type="button" className="chip" onClick={() => setCur(idx > 0 ? chapters[idx - 1]!.id : 'intro')}>← {idx > 0 ? chapters[idx - 1]!.title : 'Contents'}</button>
          {idx < chapters.length - 1 && <button type="button" className="chip" onClick={() => setCur(chapters[idx + 1]!.id)}>{chapters[idx + 1]!.title} →</button>}
        </div>
      </article>}
    </div>
  );
}
