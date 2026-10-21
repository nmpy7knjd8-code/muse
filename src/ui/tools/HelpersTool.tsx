// Song helpers (ideas 14–19): Melody coach · Strum · Hooks · Lyrics · Key change · Layers.
// Preview first; your bars change only on an explicit button (undo-able). See docs/dialectic/14–19.
import { useMemo, useState } from 'react';
import {
  HOOK_VARIATIONS, LAYERS, STRUMS, arrangeLayers, chordPcs, chordSymbol, fitStress, guessStress, gymLoop, keyName, makeHooks,
  melodyCoach, modulationRoutes, modulationTargets, strumHits, strumsFor, suggestedStrum, varyHook, type BeatNote, type Chord,
  type HookVariation, type LayerId, type Syllable,
} from '../../core';
import { PlayIcon } from '../icons';
import { Meter, ToolIntro } from './common';
import type { ToolProps } from './types';

type Tab = 'coach' | 'strum' | 'hooks' | 'lyrics' | 'mod' | 'layers';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'coach', label: 'Melody coach' }, { id: 'strum', label: 'Strum' }, { id: 'hooks', label: 'Hooks' },
  { id: 'lyrics', label: 'Lyrics' }, { id: 'mod', label: 'Key change' }, { id: 'layers', label: 'Layers' },
];
const pretty = (t: string) => t.replace('b', '♭').replace('#', '♯');

export default function HelpersTool(p: ToolProps) {
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem('muse.helpers.tab') as Tab) || 'coach');
  const go = (t: Tab) => { p.audio.stop(); setTab(t); try { localStorage.setItem('muse.helpers.tab', t); } catch { /* */ } };
  return (
    <div className="tool helpers-tool">
      <ToolIntro>Songwriting helpers for your song in <b>{keyName(p.k)}</b>. Everything previews first — your bars only change when you tap a “Use/Put/Add” button.</ToolIntro>
      <div className="tab-grid" role="tablist" aria-label="Helper">
        {TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => go(t.id)}>{t.label}</button>)}
      </div>
      {tab === 'coach' && <Coach p={p} />}
      {tab === 'strum' && <Strum p={p} />}
      {tab === 'hooks' && <Hooks p={p} />}
      {tab === 'lyrics' && <Lyrics p={p} />}
      {tab === 'mod' && <KeyChange p={p} />}
      {tab === 'layers' && <Layers p={p} />}
    </div>
  );
}
const bpb = (p: ToolProps) => p.timeSig.num * (p.timeSig.den === 8 ? 0.5 : 1);
function playNotes(p: ToolProps, notes: BeatNote[], chords: Chord[], beatsPerBar: number) {
  const o = p.audio.origin(); const s = p.beatSec;
  const bars = Math.max(1, Math.ceil(Math.max(0, ...notes.map((n) => n.beat + n.dur)) / beatsPerBar));
  for (let b = 0; b < bars; b++) { const c = chords[b % Math.max(1, chords.length)]; if (c) p.audio.chord(c, b * beatsPerBar * s, beatsPerBar * s * 0.95, o); }
  for (const n of notes) p.audio.note(n.midi, n.beat * s, n.dur * s * 0.95, o);
}

// ───────── #14 ─────────
function Coach({ p }: { p: ToolProps }) {
  const r = useMemo(() => melodyCoach(p.melody, p.chords, p.k, bpb(p)), [p.melody, p.chords, p.k]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!r) return (
    <div className="tool-card gym-card">
      <p>The coach needs a melody (4+ notes) in your bars.</p>
      <div className="tool-actions">
        <button type="button" className="add" onClick={() => { p.close(); p.flash('Tap the Melody tab under the bars to write notes'); }}>Write a melody</button>
        <button type="button" onClick={() => p.openTool('hum')}>Hum one</button>
      </div>
    </div>
  );
  return (
    <div className="tool-card gym-card">
      {r.traits.map((t) => <Meter key={t.id} value={t.value} label={t.label} left={t.left} right={t.right} />)}
      <p className="coach-tip"><b>Try this:</b> {r.tip}</p>
      <button type="button" className="tool-hear" onClick={() => playNotes(p, p.melody, p.chords, bpb(p))}><PlayIcon size={14} /> Hear my melody</button>
    </div>
  );
}

// ───────── #15 ─────────
function Strum({ p }: { p: ToolProps }) {
  const num = p.timeSig.num;
  const fits = strumsFor(num);
  const sug = suggestedStrum(p.styleId, num);
  const [id, setId] = useState(sug.id);
  const pat = STRUMS.find((s) => s.id === id && s.num.includes(num)) ?? sug;
  const loop = gymLoop(p.chords, p.k, p.styleId).chords.slice(0, 4);
  const play = () => {
    const o = p.audio.origin(); const s = p.beatSec; const B = bpb(p);
    loop.forEach((c, b) => {
      if (pat.id === 'arp') {
        const pcs = chordPcs(c); const base = 52 + ((pcs[0]! - 52) % 12 + 12) % 12;
        strumHits(pat, B).forEach((h, i) => p.audio.note(base + ((pcs[i % pcs.length]! - pcs[0]! + 12) % 12) + (i >= pcs.length ? 12 : 0), (b * B + h.beat) * s, s * 0.9, o));
      } else strumHits(pat, B).forEach((h) => p.audio.chord(c, (b * B + h.beat) * s, s * (h.accent ? 0.45 : 0.3), o));
    });
  };
  return (
    <div className="tool-card gym-card">
      <label className="tool-check">Pattern
        <select value={pat.id} onChange={(e) => setId(e.target.value)} aria-label="Strum pattern">
          {fits.map((s) => <option key={s.id} value={s.id}>{s.name}{s.id === sug.id ? ' (suits your style)' : ''}</option>)}
        </select>
      </label>
      <div className={'strum-row sub' + pat.sub} aria-label={`Pattern ${pat.name}`}>
        {pat.strokes.map((s, i) => (
          <span key={i} className={'strum-cell' + (s === '-' ? ' rest' : '') + (s === 'D' || s === 'U' ? ' acc' : '') + (i % (pat.strokes.length / bpb(p)) === 0 ? ' beat' : '')}>
            {s === '-' ? '·' : s.toLowerCase() === 'd' ? '↓' : '↑'}
          </span>
        ))}
      </div>
      <p className="small">{pat.how}</p>
      <button type="button" className="tool-hear" onClick={play}><PlayIcon size={14} /> Hear over my chords</button>
      <p className="small muted">Big arrows = accent. Keep your hand moving down-up even on the dots — just miss the strings.</p>
    </div>
  );
}

// ───────── #16 ─────────
function Hooks({ p }: { p: ToolProps }) {
  // Your own first chords when you have them (even out-of-key), else a loop for your key/style.
  const loop = p.chords.length >= 2 ? p.chords : gymLoop(p.chords, p.k, p.styleId).chords;
  const B = bpb(p);
  const [seed, setSeed] = useState(1);
  const hooks = useMemo(() => { let s = seed * 9301; return makeHooks(loop, p.k, B, () => ((s = (s * 9301 + 49297) % 233280) / 233280)); }, [seed, p.k, B, loop.map((c) => chordSymbol(c)).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const [v, setV] = useState<HookVariation>('sequence');
  const vdef = HOOK_VARIATIONS.find((x) => x.id === v)!;
  return (
    <div className="tool-card gym-card">
      <label className="tool-check">Bar 2 answers by
        <select value={v} onChange={(e) => setV(e.target.value as HookVariation)} aria-label="Variation">
          {HOOK_VARIATIONS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
      </label>
      <p className="small muted">{vdef.why}</p>
      {hooks.map((h, i) => {
        const two = varyHook(h.notes, v, p.k, loop[1], B);
        return (
          <div key={i} className="hook-card">
            <div><b>{h.name}</b> <span className="small muted">{h.how}</span></div>
            <HookShape notes={two} beats={B * 2} />
            <div className="tool-actions">
              <button type="button" className="tool-hear" onClick={() => playNotes(p, two, loop, B)}><PlayIcon size={14} /> Hear</button>
              <button type="button" className="add" onClick={() => p.useBars(loop.map((c, b) => ({ chord: c, notes: (b < 2 ? two.filter((n) => Math.floor(n.beat / B) === b).map((n) => ({ ...n, beat: n.beat - b * B })) : p.melody.filter((n) => Math.floor(n.beat / B) === b).map((n) => ({ ...n, beat: n.beat - b * B }))) })), 'Hook in bars 1–2')}>Put in bars 1–2</button>
            </div>
          </div>
        );
      })}
      <button type="button" onClick={() => setSeed(seed + 1)}>New ideas</button>
    </div>
  );
}
function HookShape({ notes, beats }: { notes: BeatNote[]; beats: number }) {
  const lo = Math.min(...notes.map((n) => n.midi)); const hi = Math.max(...notes.map((n) => n.midi)); const span = Math.max(4, hi - lo);
  return (
    <svg className="hook-shape" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden>
      <line x1="50" x2="50" y1="0" y2="30" />
      {notes.map((n, i) => <rect key={i} x={(n.beat / beats) * 100} y={26 - ((n.midi - lo) / span) * 22} width={Math.max(2, (n.dur / beats) * 100 - 1)} height="4" rx="1.5" />)}
    </svg>
  );
}

// ───────── #17 ─────────
function Lyrics({ p }: { p: ToolProps }) {
  const [line, setLine] = useState(() => localStorage.getItem('muse.lyric') ?? 'I want to hold your hand');
  const [flips, setFlips] = useState<Record<number, boolean>>({});
  const B = Math.max(2, Math.round(bpb(p)));
  const syls: Syllable[] = guessStress(line).map((s, i) => (i in flips ? { ...s, stress: flips[i]! } : s));
  const placed = fitStress(syls, B);
  const slots = Math.max(...placed.map((x) => x.slot), 0) + 1;
  const bars = Math.ceil(slots / (B * 2));
  const clashes = placed.filter((x) => x.clash).length;
  const loop = gymLoop(p.chords, p.k, p.styleId).chords;
  const hear = () => {
    const notes: BeatNote[] = placed.map((x) => {
      const c = loop[Math.floor(x.slot / (B * 2)) % loop.length]!; const pcs = chordPcs(c);
      const m = 60 + ((pcs[x.stress ? 0 : 1 % pcs.length]! - 60) % 12 + 12) % 12;
      return { midi: m + (x.stress ? 0 : 0), beat: x.slot / 2, dur: 0.45 };
    });
    playNotes(p, notes, loop, B);
  };
  return (
    <div className="tool-card gym-card">
      <label className="lyric-input">Your line
        <input value={line} onChange={(e) => { setLine(e.target.value); setFlips({}); try { localStorage.setItem('muse.lyric', e.target.value); } catch { /* */ } }} placeholder="Type a lyric line" aria-label="Lyric line" />
      </label>
      <p className="small muted">Bold = stressed (Muse guesses — tap a syllable to flip it). Strong beats are shaded.</p>
      <div className="lyric-grid" style={{ gridTemplateColumns: `repeat(${B * 2}, minmax(0, 1fr))` }}>
        {Array.from({ length: bars * B * 2 }, (_, slot) => {
          const s = placed.find((x) => x.slot === slot); const i = s ? placed.indexOf(s) : -1;
          const strong = slot % 2 === 0 && ((slot / 2) % B === 0 || (B === 4 && (slot / 2) % B === 2));
          return (
            <button key={slot} type="button" disabled={!s} className={'lyric-slot' + (strong ? ' strong' : '') + (s?.stress ? ' stress' : '') + (s?.clash ? ' clash' : '')}
              onClick={() => s && setFlips({ ...flips, [i]: !s.stress })} aria-label={s ? `${s.text}${s.stress ? ' stressed' : ''}` : 'rest'}>
              {s?.text ?? ''}
            </button>
          );
        })}
      </div>
      <p className={'small ' + (clashes ? 'style-coh' : 'ear-good')}>{clashes ? `${clashes} spot${clashes > 1 ? 's' : ''} (amber) may sound awkward — a stressed syllable off the beat, or a weak one on a strong beat. Try adding or dropping a small word nearby.` : 'Every stressed syllable lands on a strong beat — it’ll sing naturally.'}</p>
      <button type="button" className="tool-hear" onClick={hear}><PlayIcon size={14} /> Hear the rhythm</button>
    </div>
  );
}

// ───────── #18 ─────────
function KeyChange({ p }: { p: ToolProps }) {
  const targets = modulationTargets(p.k, p.tuning);
  const [to, setTo] = useState(targets[0]!.tonic);
  const last = p.chords.at(-1);
  const routes = modulationRoutes(p.k, to, last);
  return (
    <div className="tool-card gym-card">
      <p className="small">Where should the song go next? (Keeps your mode.)</p>
      <div className="mod-targets" role="group" aria-label="Target key">
        {targets.map((t) => (
          <button key={t.tonic} type="button" aria-pressed={to === t.tonic} className={'mod-target' + (to === t.tonic ? ' on' : '') + (t.easy ? ' easy' : '')} onClick={() => setTo(t.tonic)}>
            <b>{pretty(t.tonic)}</b><small>{t.label}</small>
          </button>
        ))}
      </div>
      {targets.some((t) => t.easy) && <p className="small muted"><span className="easy-dot" aria-hidden /> suits {p.tuning.name}</p>}
      {routes.map((r) => (
        <div key={r.kind} className="hook-card">
          <div><b>{r.name}</b>: {r.chords.map((c) => chordSymbol(c, true)).join(' → ')}</div>
          <p className="small muted">{r.why}</p>
          <div className="tool-actions">
            <button type="button" className="tool-hear" onClick={() => p.playChords([...(last ? [last] : []), ...r.chords])}><PlayIcon size={14} /> Hear</button>
            <button type="button" className="add" onClick={() => { p.appendChords(r.chords, `Key change to ${pretty(to)}`); p.setKey(to, p.k.mode); }}>Add to end &amp; switch key</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ───────── #19 ─────────
function Layers({ p }: { p: ToolProps }) {
  const [on, setOn] = useState<LayerId[]>(['pad', 'bass']);
  const loop = gymLoop(p.chords, p.k, p.styleId).chords.slice(0, 4);
  const B = bpb(p);
  const play = () => {
    p.audio.stop();
    const o = p.audio.origin(); const s = p.beatSec;
    for (const e of arrangeLayers(loop, B, p.styleId, p.tuning, on)) {
      if (e.kind === 'chord') p.audio.chord(e.chord!, e.beat * s, e.dur * s, o); else p.audio.note(e.midi!, e.beat * s, e.dur * s, o);
    }
  };
  return (
    <div className="tool-card gym-card">
      <p className="small">Same chords, different jobs. Toggle layers and hear how each one changes the feel.</p>
      <div className="layer-chips" role="group" aria-label="Layers">
        {LAYERS.map((l) => (
          <button key={l.id} type="button" aria-pressed={on.includes(l.id)} className={'layer-chip' + (on.includes(l.id) ? ' on' : '')} onClick={() => setOn(on.includes(l.id) ? on.filter((x) => x !== l.id) : [...on, l.id])}>
            <b>{l.name}</b><small>{l.role}</small>
          </button>
        ))}
      </div>
      <div className="tool-actions">
        <button type="button" className="tool-hear" onClick={play} disabled={!on.length}><PlayIcon size={14} /> Play layers</button>
        <button type="button" onClick={() => p.audio.stop()}>Stop</button>
      </div>
      <p className="small muted">Preview only — it plays your first 4 bars{p.styleId ? ', with arp busyness from your style' : ''}; bass sits on your {p.tuning.name} low string.</p>
    </div>
  );
}
