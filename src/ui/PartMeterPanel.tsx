// Per-part meter controls: time signature + subdivision for polyrhythm / rests / precision.
import type { ReactNode } from 'react';
import {
  PartId, PartMeter, TIME_SIG_PRESETS, beatsPerBar, pulseStep, slotsPerPartBar, timeSigEqual, timeSigLabel,
  type TimeSig,
} from '../core';
import type { TimelineNote } from '../core';

interface Props {
  part: PartId;
  meter: PartMeter;
  /** Session (master) meter — bars share this wall-clock length. */
  master: TimeSig;
  /** Events in the active bar for this part (melody/bass), for the pulse grid. */
  laneNotes?: TimelineNote[];
  onChange: (next: PartMeter) => void;
  onAddRest?: () => void;
  onMatchSession: () => void;
}

const SUBDIVS: Array<{ v: PartMeter['subdiv']; label: string; tip: string }> = [
  { v: 1, label: 'Beat', tip: 'One event per pulse' },
  { v: 2, label: '½', tip: 'Half-pulse precision' },
  { v: 4, label: '¼', tip: 'Quarter-pulse precision' },
];

export function PartMeterPanel({
  part, meter, master, laneNotes = [], onChange, onAddRest, onMatchSession,
}: Props): ReactNode {
  const pulses = beatsPerBar(meter.timeSig);
  const step = pulseStep(meter.subdiv);
  const capacity = slotsPerPartBar(meter);
  const matched = timeSigEqual(meter.timeSig, master) && meter.subdiv === 1;
  const title = part === 'chords' ? 'Chords' : part === 'melody' ? 'Melody' : 'Bass';

  const occupied = new Map<number, TimelineNote>();
  for (const n of laneNotes) {
    const key = Math.round(n.beat / step);
    if (!occupied.has(key)) occupied.set(key, n);
  }

  return (
    <div className="part-meter" aria-label={`${title} meter`}>
      <p className="small muted part-meter-lead">
        <b>{title} meter</b> sets how many pulses fill each <b>session</b> bar ({timeSigLabel(master)}).
        Different part meters overlap as polyrhythm (e.g. melody 3/4 over chords 4/4).
        Subdivision adds rests and precise placement.
      </p>

      <div className="part-meter-row">
        <span className="muted">Meter</span>
        <div className="part-meter-sigs" role="group" aria-label={`${title} time signature`}>
          {TIME_SIG_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className={'pill' + (timeSigEqual(meter.timeSig, p) ? ' on' : '')}
              aria-pressed={timeSigEqual(meter.timeSig, p)}
              title={p.hint}
              onClick={() => onChange({ ...meter, timeSig: { num: p.num, den: p.den } })}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="part-meter-row">
        <span className="muted">Precision</span>
        <div className="part-meter-sigs" role="group" aria-label={`${title} subdivision`}>
          {SUBDIVS.map((s) => (
            <button
              key={s.v}
              type="button"
              className={'pill' + (meter.subdiv === s.v ? ' on' : '')}
              aria-pressed={meter.subdiv === s.v}
              title={s.tip}
              onClick={() => onChange({ ...meter, subdiv: s.v })}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="part-meter-actions">
        <button type="button" className={'pill' + (matched ? ' on' : '')} onClick={onMatchSession} disabled={matched}>
          Match session {timeSigLabel(master)}
        </button>
        {onAddRest && part !== 'chords' && (
          <button type="button" className="pill" onClick={onAddRest} title="Insert a rest on the next pulse">
            ＋ Rest
          </button>
        )}
      </div>

      {part !== 'chords' && (
        <div className="part-meter-grid" role="list" aria-label={`${title} pulse grid (${capacity} slots)`}>
          {Array.from({ length: capacity }, (_, i) => {
            const beat = i * step;
            const n = occupied.get(i);
            const rest = n?.midi == null && n !== undefined;
            const tone = n && n.midi != null;
            return (
              <div
                key={i}
                role="listitem"
                className={'pm-cell' + (tone ? ' tone' : '') + (rest ? ' rest' : '') + (i % meter.subdiv === 0 ? ' pulse' : '')}
                title={tone ? `beat ${beat + 1}` : rest ? `rest @ ${beat + 1}` : `empty @ ${beat + 1}`}
              >
                <span className="pm-beat">{Number.isInteger(beat) ? beat + 1 : (beat + 1).toFixed(2)}</span>
                <span className="pm-mark">{tone ? '●' : rest ? '𝄽' : '·'}</span>
              </div>
            );
          })}
        </div>
      )}

      {part === 'chords' && (
        <p className="small muted">
          Chord changes still land once per session bar. Set this meter to match how you count the groove;
          melody/bass meters can diverge for 3:2, 3:4, 5:4, and other overlays.
        </p>
      )}

      <p className="small muted part-meter-foot">
        {pulses} pulse{pulses === 1 ? '' : 's'}/bar
        {meter.subdiv > 1 ? ` · ${meter.subdiv}× subdiv (${capacity} places)` : ''}
        {!timeSigEqual(meter.timeSig, master) ? ` · polyrhythm vs session ${timeSigLabel(master)}` : ''}
      </p>
    </div>
  );
}
