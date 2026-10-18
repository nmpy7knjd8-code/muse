// Idea 6 — section builder with a contrast meter.
import { useEffect, useMemo, useState } from 'react';
import { buildSection, chordSymbol, parseChord, sectionContrast, sectionProfile, SECTION_ROLES, type BuiltSection, type Chord, type SectionRole } from '../../core';
import { ChordChips, ToolIntro } from './common';
import { PlayIcon } from '../icons';
import type { ToolProps } from './types';

const EXAMPLE = ['Am', 'F', 'C', 'G'].map((s) => parseChord(s)!);

/** Number-free contrast meter with a marker for the target. */
function ContrastMeter({ value, target, label }: { value: number; target?: number; label: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="tool-meter contrast-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={1} aria-valuenow={Math.round(v * 100) / 100}>
      <div className="tool-meter-head"><span>{label}</span></div>
      <div className="tool-meter-track contrast-track">
        <i style={{ width: `${v * 100}%` }} />
        {target != null && <b className="contrast-target" style={{ left: `${Math.max(0, Math.min(1, target)) * 100}%` }} aria-hidden />}
      </div>
      <div className="contrast-poles" aria-hidden><span style={{ left: 0 }}>same</span><span style={{ left: '25%' }}>related</span><span style={{ left: '55%' }}>new</span><span style={{ right: 0 }}>different song</span></div>
    </div>
  );
}

export default function SectionsTool(p: ToolProps) {
  const own = p.chords.length >= 2;
  const base: Chord[] = own ? p.chords.slice(-8) : EXAMPLE;
  const [role, setRole] = useState<SectionRole>('chorus');
  const [target, setTarget] = useState(SECTION_ROLES.chorus.target);
  const [length, setLength] = useState(4);
  const [res, setRes] = useState<BuiltSection[]>([]);
  const [busy, setBusy] = useState(false);
  const baseKey = base.map((c) => chordSymbol(c)).join(' ');

  useEffect(() => {
    setBusy(true);
    const id = window.setTimeout(() => {
      setRes(buildSection(p.engine, p.k, base, { role, target, length, style: p.tStyle, adventure: p.adventure }));
      setBusy(false);
    }, 40);
    return () => window.clearTimeout(id);
  }, [baseKey, role, target, length, p.engine, p.k, p.tStyle, p.adventure]);

  // Contrast inside the user's own song: first half vs second half.
  const halves = useMemo(() => {
    if (p.chords.length < 6) return null;
    const mid = Math.floor(p.chords.length / 2);
    const a = sectionProfile(p.engine, p.k, p.chords.slice(0, mid), p.tStyle);
    const b = sectionProfile(p.engine, p.k, p.chords.slice(mid), p.tStyle);
    return sectionContrast(a, b);
  }, [p.chords, p.engine, p.k, p.tStyle]);

  const hear = (s: BuiltSection) => p.playChords([...base.slice(-2), ...s.chords], p.beatSec * 2);

  return (
    <div className="tool sections-tool">
      <ToolIntro>Build the next section of your song. Choose what it should be and how different it should feel — the contrast meter shows how far each option travels from {own ? 'your progression' : 'the example verse'}.</ToolIntro>
      <div className="tool-card sec-base">
        <span className="small muted">{own ? 'Your section' : 'Example verse (add chords to use yours)'}</span>
        <ChordChips chords={base} k={p.k} onTap={(c) => p.playChord(c)} />
      </div>
      <div className="tool-presets" role="radiogroup" aria-label="Section type">
        {(Object.keys(SECTION_ROLES) as SectionRole[]).map((r) => (
          <button key={r} type="button" role="radio" aria-checked={role === r} className={'pill' + (role === r ? ' on' : '')} onClick={() => { setRole(r); setTarget(SECTION_ROLES[r].target); }}>{SECTION_ROLES[r].label}</button>
        ))}
      </div>
      <p className="tool-note">{SECTION_ROLES[role].blurb}</p>
      <label className="sec-slider">
        <span className="small muted">How different?</span>
        <input type="range" min={0.1} max={0.9} step={0.05} value={target} onChange={(e) => setTarget(Number(e.target.value))} aria-label="How different the new section should feel" aria-valuetext={target < 0.3 ? 'subtle' : target < 0.55 ? 'clear' : 'bold'} />
        <span className="tool-meter-poles"><span>subtle</span><span>bold</span></span>
      </label>
      <div className="seg small-seg" role="group" aria-label="Section length">
        {[4, 8].map((n) => <button key={n} type="button" className={length === n ? 'on' : ''} aria-pressed={length === n} onClick={() => setLength(n)}>{n} bars</button>)}
      </div>
      <div aria-live="polite" className="hum-results">
        {busy && !res.length && <p className="small muted">Building…</p>}
        {res.map((s, i) => (
          <div key={s.chords.map((c) => chordSymbol(c)).join()} className={'tool-card' + (busy ? ' stale' : '')}>
            <div className="cad-head"><h4>{SECTION_ROLES[role].label} {String.fromCharCode(65 + i)}</h4><span className="small muted">{s.contrast.verdict}</span></div>
            <ChordChips chords={s.chords} k={p.k} onTap={(c) => p.playChord(c)} />
            <ContrastMeter value={s.contrast.score} target={target} label="Contrast with your section" />
            <div className="sec-words">{s.contrast.words.map((w) => <span key={w} className="tag">{w}</span>)}</div>
            <div className="tool-actions">
              <button type="button" className="tool-hear" onClick={() => hear(s)}><PlayIcon size={14} /> Hear after yours</button>
              {own
                ? <button type="button" className="add" onClick={() => p.appendChords(s.chords, `${SECTION_ROLES[role].label} added`)}>Add after my section</button>
                : <button type="button" className="add" onClick={() => p.useChords([...base, ...s.chords], `Verse + ${SECTION_ROLES[role].label.toLowerCase()} loaded`)}>Use verse + this</button>}
            </div>
          </div>
        ))}
      </div>
      {halves && (
        <div className="tool-card">
          <h4>Your song so far</h4>
          <ContrastMeter value={halves.score} label="First half vs second half" />
          <p className="tool-note">{halves.verdict}{halves.words.length ? ` — second half is ${halves.words.slice(0, 3).join(', ')}.` : '.'}</p>
        </div>
      )}
    </div>
  );
}
