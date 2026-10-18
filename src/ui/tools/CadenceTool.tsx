// Idea 5 — backward cadence finder: choose where to land, get the best ways to arrive there.
import { useEffect, useMemo, useState } from 'react';
import { APPROACH_LABEL, chordSymbol, diatonicChords, findApproaches, romanOf, type Approach, type Chord } from '../../core';
import { ChordChips, Meter, ToolIntro } from './common';
import { PlayIcon } from '../icons';
import type { ToolProps } from './types';

export default function CadenceTool(p: ToolProps) {
  const targets = useMemo(() => {
    const m = new Map<string, Chord>();
    for (const c of [...diatonicChords(p.k), ...p.chords]) { const s = chordSymbol(c); if (!m.has(s)) m.set(s, c); }
    return [...m.values()].slice(0, 14);
  }, [p.k, p.chords]);
  const [target, setTarget] = useState<Chord>(() => diatonicChords(p.k)[0]!);
  const [len, setLen] = useState(2);
  const [fromSong, setFromSong] = useState(p.chords.length > 0);
  const [res, setRes] = useState<Approach[]>([]);
  const [busy, setBusy] = useState(false);
  const before = fromSong ? p.chords : [];

  useEffect(() => {
    setBusy(true);
    const id = window.setTimeout(() => {
      setRes(findApproaches(p.engine, p.k, target, { length: len, before, style: p.tStyle, adventure: p.adventure }));
      setBusy(false);
    }, 20);
    return () => window.clearTimeout(id);
  }, [target, len, fromSong, p.engine, p.k, p.tStyle, p.adventure, p.chords]);

  const hear = (a: Approach) => {
    const ctx = fromSong && p.chords.length ? [p.chords[p.chords.length - 1]!] : [];
    p.playChords([...ctx, ...a.chords], p.beatSec * 2);
  };

  return (
    <div className="tool cadence-tool">
      <ToolIntro>Pick where you want to land. Muse works backwards and finds the strongest ways to arrive — each a different kind of arrival.</ToolIntro>
      <div>
        <p className="tool-label">Land on</p>
        <div className="tool-chips" role="radiogroup" aria-label="Target chord">
          {targets.map((c) => {
            const on = chordSymbol(c) === chordSymbol(target);
            return (
              <button key={chordSymbol(c)} type="button" role="radio" aria-checked={on} className={'tool-chip' + (on ? ' on' : '')} onClick={() => { setTarget(c); p.playChord(c); }}>
                <b>{chordSymbol(c, true)}</b><small>{romanOf(c, p.k)}</small>
              </button>
            );
          })}
        </div>
      </div>
      <div className="tool-row">
        <div className="seg small-seg" role="group" aria-label="Chords before the target">
          {[1, 2, 3].map((n) => <button key={n} type="button" className={len === n ? 'on' : ''} aria-pressed={len === n} onClick={() => setLen(n)}>{n} before</button>)}
        </div>
      </div>
      {p.chords.length > 0 && (
        <label className="tool-check"><input type="checkbox" checked={fromSong} onChange={(e) => setFromSong(e.target.checked)} /> Continue from my progression (ends on {chordSymbol(p.chords[p.chords.length - 1]!, true)})</label>
      )}
      <div aria-live="polite" className="hum-results">
        {busy && !res.length && <p className="small muted">Working backwards…</p>}
        {res.map((a, i) => (
          <div key={a.kind} className={'tool-card cad-card' + (i === 0 ? ' best' : '')}>
            <div className="cad-head"><h4>{APPROACH_LABEL[a.kind].title}</h4>{i === 0 && <span className="cad-best">strongest</span>}</div>
            <p className="tool-note">{APPROACH_LABEL[a.kind].why}</p>
            <ChordChips chords={a.chords} k={p.k} active={a.chords.length - 1} onTap={(c) => p.playChord(c)} />
            <Meter value={Math.min(1, a.release / 0.8)} label="How firmly it lands" left="softly" right="firmly" />
            <div className="tool-actions">
              <button type="button" className="tool-hear" onClick={() => hear(a)}><PlayIcon size={14} /> Hear</button>
              {fromSong && p.chords.length > 0
                ? <button type="button" className="add" onClick={() => p.appendChords(a.chords, `${APPROACH_LABEL[a.kind].title} added`)}>Add to end</button>
                : <button type="button" className="add" onClick={() => p.useChords(a.chords, `${APPROACH_LABEL[a.kind].title} loaded`)}>Use as progression</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
