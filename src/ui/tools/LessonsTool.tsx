// Lessons (ideas 8–13): Fix it · Missions · Your theory · Key slide · Mode morph (+ colour-by-step toggle).
// Every tab reads the current key/mode, Style and tuning. See docs/dialectic/08–13.
import { useEffect, useMemo, useState } from 'react';
import {
  BRIGHTNESS, CONCEPTS, MODE_BY_ID, MODE_FEEL, checkPuzzle, chordSymbol, coherence, conceptExample, detectConcepts, gymLoop, key as mkKey,
  keyName, keyRing, makePuzzle, missions, modeStepNote, morphChords, parseNote, romanOf, transposeChords, type Chord, type ConceptId,
  type ModeId, type Puzzle, type PuzzleKind,
} from '../../core';
import { PlayIcon } from '../icons';
import { ToolIntro } from './common';
import type { ToolProps } from './types';

type Tab = 'fix' | 'missions' | 'theory' | 'keys' | 'modes';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'fix', label: 'Fix it' }, { id: 'missions', label: 'Missions' }, { id: 'theory', label: 'Your theory' }, { id: 'keys', label: 'Key slide' }, { id: 'modes', label: 'Mode morph' },
];
const loadSet = (k: string): string[] => { try { const v = JSON.parse(localStorage.getItem(k) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const saveSet = (k: string, v: string[]) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } };

export default function LessonsTool(p: ToolProps) {
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem('muse.lessons.tab') as Tab) || 'fix');
  const go = (t: Tab) => { p.audio.stop(); setTab(t); try { localStorage.setItem('muse.lessons.tab', t); } catch { /* */ } };
  return (
    <div className="tool lessons-tool">
      <ToolIntro>Learn by doing in your key (<b>{keyName(p.k)}</b>). Try things, hear them, and the names come after.</ToolIntro>
      <label className="tool-check"><input type="checkbox" checked={p.degColors} onChange={(e) => p.setDegColors(e.target.checked)} /> Colour by step (numerals under your bars)</label>
      <div className="seg small-seg gym-games" role="tablist" aria-label="Lesson">
        {TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => go(t.id)}>{t.label}</button>)}
      </div>
      {tab === 'fix' && <FixIt key={`${p.k.tonic.letter}${p.k.tonic.acc}${p.k.mode}${p.styleId}`} p={p} />}
      {tab === 'missions' && <Missions p={p} />}
      {tab === 'theory' && <Theory p={p} />}
      {tab === 'keys' && <KeySlide p={p} />}
      {tab === 'modes' && <ModeMorph p={p} />}
    </div>
  );
}

// ───────── #8 ─────────
const KINDS: PuzzleKind[] = ['finish', 'clash', 'stuck', 'lift'];
function FixIt({ p }: { p: ToolProps }) {
  const [n, setN] = useState(0);
  const [puz, setPuz] = useState<Puzzle>(() => makePuzzle(KINDS[0]!, p.k, p.styleId));
  const [bars, setBars] = useState<Chord[]>(puz.chords);
  const [sel, setSel] = useState<number | null>(null);
  const [checked, setChecked] = useState<ReturnType<typeof checkPuzzle> | null>(null);
  const step = Math.max(0.5, p.beatSec * 2);
  const next = () => { const i = (n + 1) % KINDS.length; const z = makePuzzle(KINDS[i]!, p.k, p.styleId); setN(i); setPuz(z); setBars(z.chords); setSel(null); setChecked(null); };
  return (
    <div className="tool-card gym-card">
      <h4 className="ear-q">{puz.goal}</h4>
      <div className="tool-actions">
        <button type="button" className="tool-hear" onClick={() => p.playChords(puz.chords, step)}><PlayIcon size={14} /> Before</button>
        <button type="button" className="tool-hear" onClick={() => p.playChords(bars, step)}><PlayIcon size={14} /> Yours</button>
      </div>
      <div className="gym-bars" role="group" aria-label="Puzzle bars">
        {bars.map((c, i) => (
          <button key={i} type="button" className={'gym-bar' + (sel === i ? ' on' : '')} onClick={() => setSel(i)} aria-label={`Bar ${i + 1}: ${chordSymbol(c, true)}`}>
            <small>{i + 1}</small><b>{romanOf(c, p.k)}</b><i>{chordSymbol(c, true)}</i>
          </button>
        ))}
      </div>
      {sel !== null ? (
        <div className="tool-chips" role="group" aria-label={`Chord for bar ${sel + 1}`}>
          {puz.choices.map((c) => (
            <button key={chordSymbol(c)} type="button" className="tool-chip" onClick={() => { const b = bars.map((x, i) => (i === sel ? c : x)); setBars(b); setChecked(null); p.playChord(c); }}>
              <b>{chordSymbol(c, true)}</b><small>{romanOf(c, p.k)}</small>
            </button>
          ))}
        </div>
      ) : <p className="small muted">Tap a bar, then pick a chord for it.</p>}
      <div className="tool-actions">
        <button type="button" className="add" onClick={() => setChecked(checkPuzzle(puz, bars, p.k, p.styleId))}>Check</button>
        <button type="button" onClick={() => setChecked({ ok: false, why: puz.hint })}>Hint</button>
        <button type="button" onClick={next}>Next puzzle</button>
      </div>
      {checked && (
        <div className="ear-result" aria-live="polite">
          <p className={checked.ok ? 'ear-good' : 'ear-bad'}>{checked.ok ? 'Fixed! ' : ''}{checked.why}</p>
          {checked.ok && <button type="button" onClick={() => p.useChords(bars, 'Used your fix')}>Use this as my progression</button>}
        </div>
      )}
    </div>
  );
}

// ───────── #9 ─────────
function Missions({ p }: { p: ToolProps }) {
  const list = useMemo(() => missions(p.k), [p.k]);
  const [done, setDone] = useState<string[]>(() => loadSet('muse.missions'));
  const live = list.filter((m) => m.check(p.chords, p.k)).map((m) => m.id);
  const newlyKey = live.filter((id) => !done.includes(id)).join(',');
  useEffect(() => { if (!newlyKey) return; const d = [...done, ...newlyKey.split(',')]; setDone(d); saveSet('muse.missions', d); }, [newlyKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="tool-card gym-card">
      <p className="small muted">Each mission is one idea. Muse checks your real bars as you write — ✓ appears when you’ve done it.</p>
      <ul className="lesson-list">
        {list.map((m) => {
          const ok = live.includes(m.id); const ever = done.includes(m.id);
          return (
            <li key={m.id} className={'lesson-item' + (ok ? ' ok' : ever ? ' ever' : '')}>
              <button type="button" className="lesson-head" aria-expanded={open === m.id} onClick={() => setOpen(open === m.id ? null : m.id)}>
                <span className="lesson-tick" aria-hidden>{ok ? '✓' : ever ? '○✓' : '○'}</span><b>{m.title}</b>
              </button>
              {open === m.id && (
                <div className="lesson-body small">
                  <p>{ok ? m.learn : m.hint}</p>
                  {ever && !ok && <p className="muted">You did this before — your current bars don’t show it right now.</p>}
                  {!ok && <button type="button" className="add" onClick={p.close}>Try it on my bars</button>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="small muted">{done.length} of {list.length} done</p>
    </div>
  );
}

// ───────── #10 ─────────
function Theory({ p }: { p: ToolProps }) {
  const found = detectConcepts(p.chords, p.k);
  const seen = loadSet('muse.concepts');
  const step = Math.max(0.5, p.beatSec * 2);
  return (
    <div className="tool-card gym-card">
      <p className="small muted">Ideas you’ve used light up here (Muse also pops a short note the first time). Locked ones show what to try next.</p>
      <ul className="lesson-list">
        {[...CONCEPTS].sort((a, b) => Number(!!found[b.id as ConceptId]) - Number(!!found[a.id as ConceptId]) || Number(seen.includes(b.id)) - Number(seen.includes(a.id))).map((c) => {
          const where = found[c.id as ConceptId];
          const known = !!where || seen.includes(c.id);
          return (
            <li key={c.id} className={'lesson-item' + (where ? ' ok' : known ? ' ever' : ' locked')}>
              <div className="lesson-head"><span className="lesson-tick" aria-hidden>{where ? '★' : known ? '☆' : '·'}</span><b>{known ? c.name : c.name.replace(/\(.*\)/, '').trim()}</b></div>
              <div className="lesson-body small">
                <p>{c.plain}</p>
                {where && <p className="muted">In your bars: {where.map((i) => `bar ${i + 1} (${chordSymbol(p.chords[i]!, true)})`).join(', ')}</p>}
                <div className="tool-actions">
                  <button type="button" className="tool-hear" onClick={() => p.playChords(conceptExample(c.id as ConceptId, p.k), step)}><PlayIcon size={14} /> Hear an example in {keyName(p.k)}</button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ───────── #12 ─────────
function KeySlide({ p }: { p: ToolProps }) {
  const loop = useMemo(() => gymLoop(p.chords, p.k, p.styleId), [p.chords, p.k, p.styleId]);
  const ring = keyRing(p.k, p.tuning);
  const [to, setTo] = useState<string | null>(null);
  const toNote = to ? parseNote(to) : null;
  const shown = toNote ? transposeChords(loop.chords, p.k.tonic, toNote) : loop.chords;
  const k2 = to ? mkKey(to, p.k.mode) : p.k;
  const step = Math.max(0.5, p.beatSec * 2);
  return (
    <div className="tool-card gym-card">
      <p className="small">The letters change, the relationships don’t — that’s why it still sounds like your song (just higher or lower).</p>
      {loop.source !== 'mine' && <p className="small muted">{loop.note ?? 'Using a loop for your key.'}</p>}
      <div className="key-ring" role="group" aria-label="Try in key">
        {ring.map((r) => (
          <button key={r.tonic} type="button" className={'key-btn' + ((to ?? '') === r.tonic || (!to && r.current) ? ' on' : '') + (r.easy ? ' easy' : '')}
            aria-pressed={(to ?? '') === r.tonic} onClick={() => { const n = parseNote(r.tonic)!; setTo(r.current ? null : r.tonic); p.playChords(r.current ? loop.chords : transposeChords(loop.chords, p.k.tonic, n), step); }}>
            {r.tonic.replace('b', '♭').replace('#', '♯')}{r.current && <small>now</small>}
          </button>
        ))}
      </div>
      {ring.some((r) => r.easy) && <p className="small muted"><span className="easy-dot" aria-hidden /> suits {p.tuning.name} (open strings)</p>}
      <div className="gym-bars">
        {shown.map((c, i) => <div key={i} className="gym-bar"><b>{chordSymbol(c, true)}</b><i>{romanOf(c, k2)}</i></div>)}
      </div>
      <div className="tool-actions">
        <button type="button" className="tool-hear" onClick={() => p.playChords(shown, step)}><PlayIcon size={14} /> Hear in {keyName(k2)}</button>
        {to && loop.source === 'mine' && <button type="button" className="add" onClick={() => p.transposeSong(to)}>Move my song to {to.replace('b', '♭').replace('#', '♯')}</button>}
      </div>
    </div>
  );
}

// ───────── #13 ─────────
function ModeMorph({ p }: { p: ToolProps }) {
  const loop = useMemo(() => gymLoop(p.chords, p.k, p.styleId), [p.chords, p.k, p.styleId]);
  const [m, setM] = useState<ModeId>(BRIGHTNESS.includes(p.k.mode) ? p.k.mode : 'minor');
  const k2 = { ...p.k, mode: m };
  const morphed = morphChords(loop.chords, p.k, m);
  const i = BRIGHTNESS.indexOf(m);
  const fromCur = BRIGHTNESS.includes(p.k.mode) && i > 0 ? modeStepNote(BRIGHTNESS[i - 1]!, m) : null;
  const coh = coherence(p.styleId, k2, p.tuning);
  const step = Math.max(0.5, p.beatSec * 2);
  return (
    <div className="tool-card gym-card">
      <p className="small">Same home note, one note changed each step — brightest on the left, darkest on the right.</p>
      <div className="tool-meter-poles small"><span>brighter</span><span>darker</span></div>
      <div className="mode-ladder" role="group" aria-label="Mode brightness">
        {BRIGHTNESS.map((id) => (
          <button key={id} type="button" aria-pressed={m === id} className={'mode-step' + (m === id ? ' on' : '') + (p.k.mode === id ? ' cur' : '')}
            onClick={() => { setM(id); p.playChords(morphChords(loop.chords, p.k, id), step); }}>
            {MODE_BY_ID[id].name.replace(/ \(.*\)/, '')}
          </button>
        ))}
      </div>
      <p className="small"><b>{MODE_BY_ID[m].name}</b>: {MODE_FEEL[m]}.{fromCur ? ` From ${MODE_BY_ID[BRIGHTNESS[i - 1]!].name.replace(/ \(.*\)/, '')}: ${fromCur}` : ''}</p>
      {m === 'locrian' && <p className="small style-coh">Locrian’s home chord is diminished, so it rarely feels like home — that’s why it’s so rare.</p>}
      {coh?.note && <p className="small style-coh">{coh.note}</p>}
      <div className="gym-bars">{morphed.map((c, j) => <div key={j} className="gym-bar"><b>{chordSymbol(c, true)}</b><i>{romanOf(c, k2)}</i></div>)}</div>
      <div className="tool-actions">
        <button type="button" className="tool-hear" onClick={() => p.playChords(morphed, step)}><PlayIcon size={14} /> Hear</button>
        {m !== p.k.mode && <button type="button" className="add" onClick={() => { p.setKey(`${'CDEFGAB'[p.k.tonic.letter]}${p.k.tonic.acc > 0 ? '#' : p.k.tonic.acc < 0 ? 'b' : ''}`, m); if (loop.source === 'mine') p.useChords(morphed, `Moved to ${MODE_BY_ID[m].name}`); else p.flash(`Mode set to ${MODE_BY_ID[m].name}`); }}>Use this mode</button>}
      </div>
    </div>
  );
}
