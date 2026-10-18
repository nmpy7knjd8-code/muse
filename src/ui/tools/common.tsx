// Small shared pieces for tool pages: chord chips, action row, number-free meter.
import type { ReactNode } from 'react';
import { chordSymbol, romanOf, type Chord, type Key } from '../../core';
import { PlayIcon } from '../icons';

export function ChordChips({ chords, k, onTap, active, colorOf, sub }: {
  chords: Chord[]; k: Key; onTap?: (c: Chord, i: number) => void; active?: number | null;
  colorOf?: (c: Chord, i: number) => string | undefined; sub?: (c: Chord, i: number) => ReactNode;
}) {
  return (
    <div className="tool-chips" role="list">
      {chords.map((c, i) => (
        <button
          type="button" role="listitem" key={i}
          className={'tool-chip' + (active === i ? ' on' : '')}
          style={colorOf?.(c, i) ? { borderColor: colorOf(c, i) } : undefined}
          onClick={() => onTap?.(c, i)}
          aria-label={`Hear ${chordSymbol(c, true)}`}
        >
          <b>{chordSymbol(c, true)}</b>
          <small>{sub ? sub(c, i) : romanOf(c, k)}</small>
        </button>
      ))}
    </div>
  );
}

export function ToolActions({ chords, onHear, onUse, onAppend, useLabel = 'Use as progression', extra }: {
  chords: Chord[]; onHear: () => void; onUse?: () => void; onAppend?: () => void; useLabel?: string; extra?: ReactNode;
}) {
  return (
    <div className="tool-actions">
      <button type="button" className="tool-hear" onClick={onHear} disabled={!chords.length}><PlayIcon size={14} /> Hear</button>
      {onUse && <button type="button" className="add" onClick={onUse} disabled={!chords.length}>{useLabel}</button>}
      {onAppend && <button type="button" onClick={onAppend} disabled={!chords.length}>Add to end</button>}
      {extra}
    </div>
  );
}

/** Number-free horizontal meter (matches the Artist Lens polarity bars). */
export function Meter({ value, label, left, right, color }: { value: number; label: string; left?: string; right?: string; color?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="tool-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={1} aria-valuenow={Math.round(v * 100) / 100}>
      <div className="tool-meter-head"><span>{label}</span></div>
      <div className="tool-meter-track"><i style={{ width: `${v * 100}%`, background: color }} /></div>
      {(left || right) && <div className="tool-meter-poles"><span>{left}</span><span>{right}</span></div>}
    </div>
  );
}

export function ToolIntro({ children }: { children: ReactNode }) {
  return <p className="tool-intro small muted">{children}</p>;
}
