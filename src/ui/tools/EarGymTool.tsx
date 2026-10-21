// Ear gym (ideas 1–7): five hearing games sharing one adaptive engine (spaced review + blocked→mixed
// stages). Every question reads the current key/mode, Style and guitar tuning. See docs/dialectic/01–07.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  EMPTY_GYM, GYM_STAGES, bassMidiFor, chordSymbol, degreeItemId, degreeMidi, gymAnswer, gymDue, gymLevel, gymLoop, gymMastery,
  gymPick, homeCadence, judgeSung, keyName, makeBass, makeName, makeSwap, modeDegrees, openStringNote, parseGym, prettyDegree,
  resolvePath, romanOf, suggestedStage, type BassQuestion, type Chord, type Degree, type GymStats, type NameQuestion, type SwapQuestion,
} from '../../core';
import { listenErrorMessage } from '../listen';
import { startMicPitch, type MicSession } from '../micPitch';
import { PlayIcon } from '../icons';
import { Meter, ToolIntro } from './common';
import type { ToolProps } from './types';

const STORE = 'muse.gym';
const load = (): GymStats => { try { return parseGym(localStorage.getItem(STORE)); } catch { return EMPTY_GYM; } };
const save = (s: GymStats) => { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* private mode */ } };

type Game = 'degree' | 'swap' | 'name' | 'bass' | 'sing';
const GAMES: Array<{ id: Game; label: string }> = [
  { id: 'degree', label: 'Home notes' }, { id: 'swap', label: 'Swap' }, { id: 'name', label: 'Name it' }, { id: 'bass', label: 'Bass' }, { id: 'sing', label: 'Sing' },
];
const pretty = (l: string) => prettyDegree(l);

export default function EarGymTool(p: ToolProps) {
  const [game, setGame] = useState<Game>(() => (localStorage.getItem('muse.gym.game') as Game) || 'degree');
  const [stats, setStatsRaw] = useState<GymStats>(load);
  const setStats = (s: GymStats) => { setStatsRaw(s); save(s); };
  const record = (g: string, id: string, ok: boolean) => setStats(gymAnswer(gymAnswer(stats, g, id, ok), g === game ? `${game}-all` : g, id, ok));
  useEffect(() => { try { localStorage.setItem('muse.gym.game', game); } catch { /* */ } }, [game]);
  const due = gymDue(stats).length;
  const step = Math.max(0.5, p.beatSec * 1.6);
  const ctx = { p, stats, record, step };
  return (
    <div className="tool gym-tool">
      <ToolIntro>Short ear games in your key (<b>{keyName(p.k)}</b>). Muse brings back what you miss a little later — that spacing is what makes it stick.</ToolIntro>
      <div className="seg small-seg gym-games" role="tablist" aria-label="Ear game">
        {GAMES.map((g) => (
          <button key={g.id} type="button" role="tab" aria-selected={game === g.id} className={game === g.id ? 'on' : ''} onClick={() => { p.audio.stop(); setGame(g.id); }}>{g.label}</button>
        ))}
      </div>
      {due > 0 && <p className="gym-due small">Due for review: {due} · they come up first-ish</p>}
      {game === 'degree' && <DegreeGame key={`d-${p.k.tonic}-${p.k.mode}`} {...ctx} mode="degree" />}
      {game === 'sing' && <DegreeGame key={`s-${p.k.tonic}-${p.k.mode}`} {...ctx} mode="sing" />}
      {game === 'swap' && <SwapGame key={`w-${p.k.tonic}-${p.k.mode}-${p.styleId}`} {...ctx} />}
      {game === 'name' && <NameGame key={`n-${p.k.tonic}-${p.k.mode}-${p.styleId}`} {...ctx} />}
      {game === 'bass' && <BassGame key={`b-${p.k.tonic}-${p.k.mode}-${p.styleId}-${p.tuning.id}`} {...ctx} />}
      <div className="tool-card gym-progress">
        <Meter value={gymMastery(stats, Object.keys(stats.items).filter((i) => i.startsWith(game === 'sing' ? 'sing:' : game + ':')))} label="This game" left="learning" right="solid" />
        {Object.keys(stats.items).length > 0 && <button type="button" className="pill ear-reset" onClick={() => setStats(EMPTY_GYM)}>Reset ear gym</button>}
      </div>
    </div>
  );
}

interface Ctx { p: ToolProps; stats: GymStats; record: (g: string, id: string, ok: boolean) => void; step: number }

// ───────── #1 / #5 / #6 — scale degrees (tap or sing) ─────────
function DegreeGame({ p, stats, record, step, mode }: Ctx & { mode: 'degree' | 'sing' }) {
  const degrees = useMemo(() => modeDegrees(p.k), [p.k]);
  const [stage, setStage] = useState(() => suggestedStage(stats, mode));
  const pool = GYM_STAGES.find((s) => s.id === stage)!.idx.map((i) => degrees[i]!);
  const ids = pool.map((d) => degreeItemId(p.k, d, mode));
  const fresh = (avoid?: string) => pool[ids.indexOf(gymPick(stats, ids, Math.random, Date.now(), avoid))]!;
  const [target, setTarget] = useState<Degree>(() => fresh());
  const [answer, setAnswer] = useState<Degree | null>(null);
  const [heard, setHeard] = useState(false);
  const suggested = suggestedStage(stats, mode);

  const play = (t = target) => {
    const o = p.audio.origin();
    homeCadence(p.k).forEach((c, i) => p.audio.chord(c, i * step, step * 0.9, o));
    p.audio.note(degreeMidi(p.k, t), 4 * step + 0.25, 1.2, o);
    setHeard(true);
  };
  const resolve = (t: Degree) => {
    const o = p.audio.origin();
    resolvePath(p.k, t).forEach((m, i) => p.audio.note(m, i * 0.42, 0.5, o));
  };
  const choose = (d: Degree, ok = d.label === target.label) => {
    if (answer) return;
    setAnswer(d);
    record(`${mode}-${stage}`, degreeItemId(p.k, target, mode), ok);
    resolve(target);
  };
  const next = (st = stage) => {
    const nPool = GYM_STAGES.find((s) => s.id === st)!.idx.map((i) => degrees[i]!);
    const nIds = nPool.map((d) => degreeItemId(p.k, d, mode));
    const t = nPool[nIds.indexOf(gymPick(stats, nIds, Math.random, Date.now(), degreeItemId(p.k, target, mode)))]!;
    setTarget(t); setAnswer(null); play(t);
  };
  const ok = answer && answer.label === target.label;
  return (
    <div className="tool-card gym-card">
      <div className="seg small-seg gym-stages" role="group" aria-label="Note group">
        {GYM_STAGES.map((s) => (
          <button key={s.id} type="button" aria-pressed={stage === s.id} className={(stage === s.id ? 'on' : '') + (suggested === s.id && stage !== s.id ? ' suggest' : '')}
            onClick={() => { setStage(s.id); setAnswer(null); setHeard(false); setTarget(GYM_STAGES.find((x) => x.id === s.id)!.idx.map((i) => degrees[i]!)[1] ?? degrees[0]!); }}>
            {s.id === 'mix' ? s.name : s.name.split('·').map((x) => pretty(degrees[Number(x) - 1]?.label ?? x)).join('·')}
          </button>
        ))}
      </div>
      {suggested !== stage && GYM_STAGES.findIndex((s) => s.id === suggested) > GYM_STAGES.findIndex((s) => s.id === stage) && (
        <p className="small gym-ready">Ready for the next group → <button type="button" className="linkish" onClick={() => { setStage(suggested); setAnswer(null); setHeard(false); }}>try it</button></p>
      )}
      <h4 className="ear-q">{mode === 'sing' ? 'Muse sets up home, then plays a note. Sing it back.' : 'Muse sets up home, then plays one note. Which step is it?'}</h4>
      <button type="button" className="tool-hear" onClick={() => play()}><PlayIcon size={14} /> {heard ? 'Hear again' : 'Play'}</button>
      {mode === 'degree' ? (
        <div className="gym-choices" role="group" aria-label="Which step">
          {pool.map((d) => (
            <button key={d.label} type="button" disabled={!heard}
              className={'gym-choice' + (answer ? (d.label === target.label ? ' right' : d.label === answer.label ? ' wrong' : ' dim') : '')}
              onClick={() => choose(d)}>
              <b>{pretty(d.label)}</b><small>{d.feel}</small>
            </button>
          ))}
        </div>
      ) : (
        <SingCheck key={target.label + String(answer)} p={p} target={target} disabled={!heard || !!answer} onResult={(r) => choose(r ? target : { ...target, label: '?' }, r)} />
      )}
      {answer && (
        <div className="ear-result" aria-live="polite">
          <p className={ok ? 'ear-good' : 'ear-bad'}>
            {ok ? 'Yes — ' : `Not quite — it was `}<b>{pretty(target.label)} ({target.feel})</b>. {target.pull}
          </p>
          <div className="tool-actions">
            <button type="button" className="tool-hear" onClick={() => resolve(target)}><PlayIcon size={14} /> Hear it go home</button>
            <button type="button" className="add" onClick={() => next()}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SingCheck({ p, target, disabled, onResult }: { p: ToolProps; target: Degree; disabled: boolean; onResult: (ok: boolean) => void }) {
  const [state, setState] = useState<'idle' | 'listening' | 'self' | 'done'>('idle');
  const [live, setLive] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const mic = useRef<MicSession | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const stop = () => { mic.current?.stop(); mic.current = null; window.clearTimeout(timer.current); };
  useEffect(() => stop, []);
  const targetMidi = degreeMidi(p.k, target);
  const listen = async () => {
    setErr(null);
    const frames: Array<{ t: number; midi: number | null }> = [];
    try {
      mic.current = await startMicPitch({
        isPaused: () => p.audio.isPlaying(),
        onFrame: (f) => {
          frames.push({ t: f.t, midi: f.midi }); setLive(f.midi);
          const r = judgeSung(frames, targetMidi);
          if (r.ok) { stop(); setState('done'); onResult(true); }
        },
      });
      setState('listening');
      timer.current = window.setTimeout(() => { stop(); setState('done'); onResult(judgeSung(frames, targetMidi).ok); }, 4000);
    } catch (e) { setErr(listenErrorMessage(e)); setState('self'); }
  };
  const off = live === null ? null : ((live - targetMidi + 6) % 12 + 12) % 12 - 6;
  return (
    <div className="gym-sing">
      {state === 'listening' ? (
        <>
          <p className="small">Listening… sing and hold the note.</p>
          <Meter value={off === null ? 0.5 : Math.max(0, Math.min(1, 0.5 + off / 6))} label="Your note" left="low" right="high" color={off !== null && Math.abs(off) <= 0.5 ? '#7ad39a' : undefined} />
        </>
      ) : (
        <div className="tool-actions">
          <button type="button" className="add" disabled={disabled} onClick={listen}>Listen to me</button>
          <button type="button" disabled={disabled} onClick={() => setState('self')}>No mic</button>
        </div>
      )}
      {err && <p className="tool-warn small">{err}</p>}
      {state === 'self' && !disabled && (
        <div className="tool-actions">
          <span className="small muted">Sing it, then hear the answer:</span>
          <button type="button" className="tool-hear" onClick={() => { const o = p.audio.origin(); p.audio.note(targetMidi, 0, 1.2, o); }}><PlayIcon size={14} /> Answer</button>
          <button type="button" className="add" onClick={() => onResult(true)}>I matched it</button>
          <button type="button" onClick={() => onResult(false)}>I missed</button>
        </div>
      )}
    </div>
  );
}

// ───────── shared loop source for chord games ─────────
function useLoop(p: ToolProps) {
  const [prefer, setPrefer] = useState<'mine' | 'style'>('mine');
  const loop = useMemo(() => gymLoop(p.chords, p.k, p.styleId, prefer), [p.chords, p.k, p.styleId, prefer]);
  const picker = (
    <div className="seg small-seg" role="group" aria-label="Practise on">
      <button type="button" aria-pressed={loop.source === 'mine'} className={loop.source === 'mine' ? 'on' : ''} onClick={() => setPrefer('mine')}>My bars</button>
      <button type="button" aria-pressed={loop.source !== 'mine'} className={loop.source !== 'mine' ? 'on' : ''} onClick={() => setPrefer('style')}>{p.styleId ? 'My style' : 'Common loop'}</button>
    </div>
  );
  return { loop, picker };
}
function Bars({ chords, k, hide, mark, onTap, reveal }: { chords: Chord[]; k: ToolProps['k']; hide?: number[]; mark?: number | null; onTap?: (i: number) => void; reveal?: boolean }) {
  return (
    <div className="gym-bars" role="group" aria-label="Bars">
      {chords.map((c, i) => (
        <button key={i} type="button" className={'gym-bar' + (mark === i ? ' on' : '')} onClick={() => onTap?.(i)} disabled={!onTap} aria-label={`Bar ${i + 1}`}>
          <small>{i + 1}</small>
          <b>{hide?.includes(i) && !reveal ? '?' : romanOf(c, k)}</b>
          {reveal && <i>{chordSymbol(c, true)}</i>}
        </button>
      ))}
    </div>
  );
}

// ───────── #2 — spot the swap ─────────
function SwapGame({ p, stats, record, step }: Ctx) {
  const { loop, picker } = useLoop(p);
  const level = gymLevel(stats, 'swap');
  const [q, setQ] = useState<SwapQuestion | null>(() => makeSwap(loop.chords, p.k, level));
  useEffect(() => { setQ(makeSwap(loop.chords, p.k, level)); setBar(null); setPick(null); }, [loop.chords]); // eslint-disable-line react-hooks/exhaustive-deps
  const [bar, setBar] = useState<number | null>(null);
  const [pick, setPick] = useState<Chord | null>(null);
  if (!q) return <div className="tool-card">{picker}<p className="tool-warn">Need at least two bars to play this.</p></div>;
  const playBoth = () => { p.playChords([...q.loop, ...q.changed], step); };
  const done = pick !== null;
  const barOk = bar === q.bar;
  const choose = (c: Chord) => {
    if (done) return;
    setPick(c);
    record('swap', q.itemId, barOk && chordSymbol(c) === chordSymbol(q.replacement));
  };
  return (
    <div className="tool-card gym-card">
      {picker}
      {loop.note && <p className="small muted">{loop.note}</p>}
      <h4 className="ear-q">{done ? 'Here’s what changed.' : bar === null ? 'Muse plays the loop, then again with one chord changed. Which bar changed? (Bar 1 stays home.)' : 'What did it change to?'}</h4>
      <div className="tool-actions">
        <button type="button" className="tool-hear" onClick={playBoth}><PlayIcon size={14} /> Original, then changed</button>
        <button type="button" onClick={() => p.playChords(q.changed, step)}>Changed only</button>
      </div>
      <Bars chords={done ? q.changed : q.loop} k={p.k} mark={done ? q.bar : bar} onTap={bar === null ? (i) => { if (i > 0) setBar(i); } : undefined} reveal={done} />
      {bar !== null && (
        <div className="gym-choices" role="group" aria-label="Replacement">
          {q.options.map((c) => (
            <div key={chordSymbol(c)} className={'gym-choice gym-opt' + (done ? (chordSymbol(c) === chordSymbol(q.replacement) ? ' right' : pick && chordSymbol(c) === chordSymbol(pick) ? ' wrong' : ' dim') : '')}>
              <button type="button" className="ear-hear" aria-label={`Hear ${romanOf(c, p.k)} in place`} onClick={() => p.playChords(q.loop.map((x, i) => (i === bar ? c : x)), step)}><PlayIcon size={14} /></button>
              <button type="button" className="gym-pick" onClick={() => choose(c)}><b>{romanOf(c, p.k)}</b>{done && <small>{chordSymbol(c, true)}</small>}</button>
            </div>
          ))}
        </div>
      )}
      {done && (
        <div className="ear-result" aria-live="polite">
          <p className={barOk && chordSymbol(pick!) === chordSymbol(q.replacement) ? 'ear-good' : 'ear-bad'}>
            {barOk ? 'Right bar' : `It was bar ${q.bar + 1}`}{!barOk && chordSymbol(pick!) === chordSymbol(q.replacement) ? ' (you heard the new chord though!)' : ''} — {romanOf(q.loop[q.bar]!, p.k)} became <b>{romanOf(q.replacement, p.k)}</b> ({chordSymbol(q.replacement, true)}).
            {level === 'close' ? ' Close swaps share notes, so they blend — listen to the top note.' : ''}
          </p>
          <div className="tool-actions">
            <button type="button" onClick={() => p.useChords(q.changed, 'Used the changed loop')}>Use this version</button>
            <button type="button" className="add" onClick={() => { setQ(makeSwap(loop.chords, p.k, gymLevel(stats, 'swap'))); setBar(null); setPick(null); }}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────── #3 — name the chord ─────────
function NameGame({ p, stats, record, step }: Ctx) {
  const { loop, picker } = useLoop(p);
  const mk = () => makeName(loop.chords, p.k, stats, gymLevel(stats, 'name'));
  const [q, setQ] = useState<NameQuestion | null>(mk);
  useEffect(() => { setQ(mk()); setPick(null); }, [loop.chords]); // eslint-disable-line react-hooks/exhaustive-deps
  const [pick, setPick] = useState<Chord | null>(null);
  if (!q) return <div className="tool-card">{picker}<p className="tool-warn">Need at least two bars to play this.</p></div>;
  const done = pick !== null;
  const ok = done && chordSymbol(pick!) === chordSymbol(q.answer);
  return (
    <div className="tool-card gym-card">
      {picker}
      {loop.note && <p className="small muted">{loop.note}</p>}
      <h4 className="ear-q">One chord is hidden. Listen, then pick what fits the “?”.</h4>
      <button type="button" className="tool-hear" onClick={() => p.playChords(q.loop, step)}><PlayIcon size={14} /> Play the loop</button>
      <Bars chords={q.loop} k={p.k} hide={[q.bar]} mark={q.bar} reveal={done} />
      <div className="gym-choices" role="group" aria-label="Hidden chord">
        {q.options.map((c) => (
          <div key={chordSymbol(c)} className={'gym-choice gym-opt' + (done ? (chordSymbol(c) === chordSymbol(q.answer) ? ' right' : chordSymbol(c) === chordSymbol(pick!) ? ' wrong' : ' dim') : '')}>
            <button type="button" className="ear-hear" aria-label={`Hear ${romanOf(c, p.k)}`} onClick={() => p.playChord(c)}><PlayIcon size={14} /></button>
            <button type="button" className="gym-pick" onClick={() => { if (done) return; setPick(c); record('name', q.itemId, chordSymbol(c) === chordSymbol(q.answer)); }}>
              <b>{romanOf(c, p.k)}</b>{done && <small>{chordSymbol(c, true)}</small>}
            </button>
          </div>
        ))}
      </div>
      {done && (
        <div className="ear-result" aria-live="polite">
          <p className={ok ? 'ear-good' : 'ear-bad'}>{ok ? 'Yes — ' : 'It was '}<b>{romanOf(q.answer, p.k)}</b> ({chordSymbol(q.answer, true)}) in bar {q.bar + 1}.</p>
          <div className="tool-actions">
            <button type="button" className="tool-hear" onClick={() => p.playChords(q.loop, step)}><PlayIcon size={14} /> Hear in place</button>
            <button type="button" className="add" onClick={() => { setQ(mk()); setPick(null); }}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────── #7 — bass detective ─────────
function BassGame({ p, stats, record, step }: Ctx) {
  const { loop, picker } = useLoop(p);
  const mk = () => makeBass(loop.chords, p.k, stats);
  const [q, setQ] = useState<BassQuestion | null>(mk);
  useEffect(() => { setQ(mk()); setPicks([]); }, [loop.chords]); // eslint-disable-line react-hooks/exhaustive-deps
  const [picks, setPicks] = useState<Degree[]>([]);
  if (!q) return <div className="tool-card">{picker}<p className="tool-warn">No in-key bass notes to ask about here.</p></div>;
  const play = () => {
    const o = p.audio.origin();
    q.loop.forEach((c, i) => {
      const t = i * step * 2;
      p.audio.note(bassMidiFor(c, p.tuning), t, step * 0.9, o);
      p.audio.chord(c, t + step, step * 0.9, o);
    });
  };
  const cur = picks.length;
  const done = cur >= q.bars.length;
  const choose = (d: Degree) => {
    if (done) return;
    record('bass', q.itemIds[cur]!, d.label === q.answers[cur]!.label);
    setPicks([...picks, d]);
  };
  const notes = done ? q.bars.map((b) => openStringNote(q.loop[b]!, p.tuning, p.k)).filter(Boolean) : [];
  return (
    <div className="tool-card gym-card">
      {picker}
      {loop.note && <p className="small muted">{loop.note}</p>}
      <h4 className="ear-q">Each bar plays its bass note alone, then the full chord. {done ? '' : `What step is the bass in bar ${q.bars[cur]! + 1}?`}</h4>
      <button type="button" className="tool-hear" onClick={play}><PlayIcon size={14} /> Bass, then full</button>
      <Bars chords={q.loop} k={p.k} hide={q.bars} mark={done ? null : q.bars[cur]} reveal={done} />
      {!done && (
        <div className="gym-choices" role="group" aria-label="Bass step">
          {q.options.map((d) => (
            <button key={d.label} type="button" className="gym-choice" onClick={() => choose(d)}><b>{pretty(d.label)}</b><small>{d.feel}</small></button>
          ))}
        </div>
      )}
      {done && (
        <div className="ear-result" aria-live="polite">
          {q.bars.map((b, i) => (
            <p key={b} className={picks[i]!.label === q.answers[i]!.label ? 'ear-good' : 'ear-bad'}>
              Bar {b + 1}: bass on <b>{pretty(q.answers[i]!.label)}</b> ({q.answers[i]!.feel}){picks[i]!.label === q.answers[i]!.label ? ' ✓' : ` — you said ${pretty(picks[i]!.label)}`}
            </p>
          ))}
          {notes.map((n) => <p key={n} className="small gym-tuning">{n}</p>)}
          <button type="button" className="add" onClick={() => { setQ(mk()); setPicks([]); }}>Next</button>
        </div>
      )}
    </div>
  );
}
