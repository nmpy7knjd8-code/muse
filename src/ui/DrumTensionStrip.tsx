// Percussion tension build/release coach for the Drums tab (sibling to TensionCurve).
import type { ReactNode } from 'react';
import {
  BUDGET_COLORS, DRUM_BUDGET_LABEL, DRUM_TENSION_THEORY, type BudgetStatus,
  type DrumTensionParts, type DrumTensionState,
} from '../core';

interface Coach {
  level: number;
  release: number;
  parts: DrumTensionParts;
  status: BudgetStatus;
  message: string;
  reasons: string[];
  levers: Array<{ name: string; detail: string }>;
}

interface Props {
  /** Live coach for the bar being edited. */
  coach: Coach;
  /** Multi-bar drum tension when the timeline has several drum bars. */
  progression?: DrumTensionState | null;
  selectedBar?: number;
}

function Meter({ label, value, tip }: { label: string; value: number; tip: string }) {
  return (
    <div className="drum-t-meter" title={tip}>
      <span className="drum-t-meter-label">{label}</span>
      <span className="drum-t-meter-track" aria-hidden>
        <i style={{ width: `${Math.round(clamp01(value) * 100)}%` }} />
      </span>
      <span className="drum-t-meter-val">{value.toFixed(2)}</span>
    </div>
  );
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function DrumTensionStrip({ coach, progression, selectedBar = 0 }: Props): ReactNode {
  const color = BUDGET_COLORS[coach.status];
  const progPoint = progression?.points[selectedBar] ?? progression?.points.at(-1) ?? null;

  return (
    <div className="drum-tension" aria-label="Drum tension build and release">
      <div className="drum-tension-head">
        <div>
          <span className="drum-tension-kicker">Rhythm tension</span>
          <span className="drum-budget" style={{ background: color }}>{DRUM_BUDGET_LABEL[coach.status]}</span>
        </div>
        <span className="small muted" title="Level 0..1 · release vs previous bar">
          level {coach.level.toFixed(2)}
          {coach.release > 0.05 ? ` · release ↓ ${coach.release.toFixed(2)}` : ''}
          {progPoint ? ` · debt ${progPoint.debt.toFixed(2)}` : ''}
        </span>
      </div>
      <p className="drum-tension-msg">{coach.message}</p>

      <div className="drum-t-meters" aria-label="Feature meters">
        <Meter label="Density" value={coach.parts.density} tip="How full the grid is — raises energy and expectancy." />
        <Meter label="Syncopa." value={coach.parts.syncopation} tip="Kick/snare off the expected strong/backbeat seats." />
        <Meter label="Fill" value={coach.parts.fill} tip="Toms/crash departure from the timekeeper ostinato." />
        <Meter label="Home" value={coach.parts.backbeatHome} tip="How close this bar sits to the tonic backbeat pocket." />
      </div>

      {coach.reasons.length > 0 && (
        <div className="drum-t-reasons">
          {coach.reasons.map((r) => (
            <span key={r} className="drum-t-chip">{r}</span>
          ))}
        </div>
      )}

      {progression && progression.points.length > 1 && (
        <div className="drum-t-curve" aria-label="Drum tension across bars">
          <div className="drum-t-curve-label small muted">
            Across timeline · home groove bar {(progression.homeIndex + 1)} · {progression.message}
          </div>
          <div className="drum-t-bars">
            {progression.points.map((p) => (
              <div
                key={p.index}
                className={'drum-t-bar' + (p.index === selectedBar ? ' on' : '')}
                title={`Bar ${p.index + 1}: level ${p.level.toFixed(2)}, debt ${p.debt.toFixed(2)}, release ${p.release.toFixed(2)}`}
              >
                <i style={{ height: `${Math.max(8, Math.round(p.level * 100))}%`, background: BUDGET_COLORS[p.status] }} />
                {p.release > 0.35 && <span className="drum-t-rel">↓</span>}
                <em>{p.index + 1}</em>
              </div>
            ))}
          </div>
        </div>
      )}

      <details className="drum-t-levers">
        <summary>Build &amp; release levers</summary>
        <ul>
          {coach.levers.map((l) => (
            <li key={l.name}><b>{l.name}.</b> {l.detail}</li>
          ))}
        </ul>
        <div className="drum-t-theory">
          {DRUM_TENSION_THEORY.map((t) => (
            <p key={t.name} className="small"><b>{t.name}.</b> {t.detail}</p>
          ))}
        </div>
      </details>
    </div>
  );
}
