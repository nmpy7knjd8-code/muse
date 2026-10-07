// Tension curve: per-chord tension (line + status dots), the style's sweet-spot band and rest line,
// accumulated unresolved tension ("debt", orange area) against its budget (dashed red), and a ghost segment
// previewing where the selected suggestion would take the curve. Data comes from core/harmonyTension.
import { useEffect, useRef, useState } from 'react';
import { BUDGET_COLORS, BUDGET_LABEL, TENSION_MAX, TENSION_STYLES, TensionState, TensionStyleId, pointStatus, tensionStyleLabel } from '../core';

interface Ghost { level: number; debtAfter: number; label: string; color: string }
interface Props {
  state: TensionState;
  labels: string[];
  ghost?: Ghost | null;
  style: TensionStyleId;
  onStyle: (s: TensionStyleId) => void;
}

const H = 112, PAD_T = 8, PAD_B = 20, PAD_L = 4;

export function TensionCurve({ state, labels, ghost, style, onStyle }: Props) {
  const { points, limits: L, budget } = state;
  const [pick, setPick] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // keep the newest chord (and the ghost preview) in view on long progressions
  useEffect(() => { const el = scroller.current; if (el) el.scrollLeft = el.scrollWidth; }, [points.length, ghost?.label]);
  const n = points.length + (ghost ? 1 : 0);
  const col = Math.max(28, Math.min(56, 336 / Math.max(n, 1)));
  const W = Math.max(336, PAD_L * 2 + col * n);
  const x = (i: number) => PAD_L + col * (i + 0.5);
  const y = (v: number) => PAD_T + (1 - Math.min(v, TENSION_MAX) / TENSION_MAX) * (H - PAD_T - PAD_B);
  const base = y(0);
  const debtPts = points.map((p, i) => `${x(i)},${y(p.debt)}`);
  const debtArea = points.length ? `M${x(0)},${base} L${debtPts.join(' L')} L${x(points.length - 1)},${base} Z` : '';
  const sel = pick !== null && pick < points.length ? points[pick] : points[points.length - 1];
  const selIdx = pick !== null && pick < points.length ? pick : points.length - 1;
  const last = points[points.length - 1];
  const pct = (v: number) => Math.round(v * 100);
  const color = BUDGET_COLORS[budget.status];
  return (
    <div className="tension">
      <div className="tension-head">
        <span className="tstatus" style={{ color }}><i style={{ background: color }} />{BUDGET_LABEL[budget.status]}</span>
        <select aria-label="Tension style" value={style} onChange={(e) => onStyle(e.target.value as TensionStyleId)}>
          {TENSION_STYLES.map((s) => <option key={s} value={s}>{tensionStyleLabel(s)}</option>)}
        </select>
      </div>
      <p className="small tmsg">{budget.message}</p>
      <div className="tension-scroll" ref={scroller}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Tension curve">
          <rect x={0} y={y(L.bandHigh)} width={W} height={y(L.bandLow) - y(L.bandHigh)} fill="#4fd1a5" opacity={0.12} />
          <line x1={0} x2={W} y1={y(L.rest)} y2={y(L.rest)} stroke="#8f8aa3" strokeDasharray="3 4" strokeWidth={1} />
          <line x1={0} x2={W} y1={y(L.ceiling)} y2={y(L.ceiling)} stroke="#ef5b5b" strokeDasharray="5 4" strokeWidth={1} opacity={0.7} />
          {debtArea && <path d={debtArea} fill="#f0a050" opacity={0.3} />}
          {ghost && last && (
            <path d={`M${x(points.length - 1)},${base} L${x(points.length - 1)},${y(last.debt)} L${x(points.length)},${y(ghost.debtAfter)} L${x(points.length)},${base} Z`} fill="#f0a050" opacity={0.13} />
          )}
          <polyline points={points.map((p, i) => `${x(i)},${y(p.level)}`).join(' ')} fill="none" stroke="#ECEAF4" strokeWidth={2} strokeLinejoin="round" />
          {ghost && last && (
            <g>
              <line x1={x(points.length - 1)} y1={y(last.level)} x2={x(points.length)} y2={y(ghost.level)} stroke={ghost.color} strokeWidth={2} strokeDasharray="4 3" />
              <circle cx={x(points.length)} cy={y(ghost.level)} r={5} fill="none" stroke={ghost.color} strokeWidth={2} />
              <text x={x(points.length)} y={H - 6} textAnchor="middle" className="tlabel ghost" fill={ghost.color}>{ghost.label}?</text>
            </g>
          )}
          {points.map((p, i) => {
            const st = pointStatus(p, i, L);
            return (
              <g key={i} onClick={() => setPick(i)} style={{ cursor: 'pointer' }}>
                <rect x={x(i) - col / 2} y={0} width={col} height={H} fill="transparent" />
                {i === selIdx && <rect x={x(i) - col / 2 + 2} y={2} width={col - 4} height={H - 4} rx={6} fill="#ffffff" opacity={0.05} />}
                {p.release > 0.5 && <text x={x(i)} y={y(p.level) - 9} textAnchor="middle" className="tlabel" fill="#4fd1a5">↓</text>}
                <circle cx={x(i)} cy={y(p.level)} r={4.5} fill={BUDGET_COLORS[st]} stroke="#121117" strokeWidth={1.5} />
                {p.melody !== null && <circle cx={x(i)} cy={y(p.level)} r={8} fill="none" stroke="#7fd3ff" strokeWidth={1} opacity={0.7} />}
                <text x={x(i)} y={H - 6} textAnchor="middle" className="tlabel">{labels[i]}</text>
              </g>
            );
          })}
        </svg>
      </div>
      {sel && (
        <div className="small tbreak">
          <b>{labels[selIdx]}</b> tension {pct(sel.level)}
          <span className="muted"> · home distance {pct(sel.event.parts.tonal)} · chord dissonance {pct(sel.event.parts.vertical)} · pull {pct(sel.event.parts.attraction)}{sel.event.parts.motion !== null ? ` · motion ${pct(sel.event.parts.motion)}` : ''}{sel.melody !== null ? ` · melody clash ${pct(sel.melody)}` : ''} · unresolved {pct(sel.debt)}{sel.idiom ? ` · eased: ${sel.idiom}` : ''}</span>
        </div>
      )}
      <div className="tlegend small muted">
        <span><i className="band" />sweet spot</span><span><i className="debt" />unresolved</span><span><i className="ceil" />budget</span><span>↓ release</span>
      </div>
    </div>
  );
}
