// Tension curve: per-chord tension, sweet-spot band, unresolved debt, ghost preview.
// Melody chips use the same REL_COLORS as the timeline; selection syncs with App via selectedIndex.
import { useEffect, useRef, useState } from 'react';
import {
  BUDGET_COLORS, BUDGET_LABEL, REL_COLORS, REL_LABEL, TENSION_MAX, TENSION_STYLES,
  TensionState, TensionStyleId, pointStatus, tensionStyleLabel, type RelKind,
} from '../core';

export interface TensionMelNote {
  name: string;
  /** Interval label vs chord root (R, 3, ♯11…); empty when unknown. */
  label: string;
  kind: RelKind | null;
}

interface Ghost { level: number; debtAfter: number; label: string; color: string }
interface Props {
  state: TensionState;
  labels: string[];
  /** Structured melody notes under each chord bar (same length as labels). */
  melodyNotes?: TensionMelNote[][];
  ghost?: Ghost | null;
  style: TensionStyleId;
  onStyle: (s: TensionStyleId) => void;
  /** Controlled pick among chorded bars (null = latest). */
  selectedIndex?: number | null;
  onSelect?: (index: number) => void;
}

const H = 112, PAD_T = 8, PAD_B = 20, PAD_L = 4;
/** Melody dissonance at/above this counts as a “rub” for the blue ring. */
const MEL_RUB = 0.25;

const STATUS_TIP: Record<string, string> = {
  'too-static': 'Feeling stuck — try a colour change or a stronger move.',
  building: 'Tension is rising — keep going or start aiming home.',
  'sweet-spot': 'In the pocket for this style — good place to land a phrase.',
  'resolve-soon': 'Unresolved tension is stacking — a release (↓) would help.',
  'over-budget': 'Past the budget — resolve toward home or a resting chord.',
};

function melRubLabel(m: number | null): string | null {
  if (m === null) return null;
  if (m < MEL_RUB) return 'Melody sits well';
  if (m < 0.5) return 'Melody mild rub';
  return 'Melody strong clash';
}

function MelChip({ n }: { n: TensionMelNote }) {
  const color = n.kind ? REL_COLORS[n.kind] : '#7fd3ff';
  const text = n.label ? `${n.name} · ${n.label}` : n.name;
  return (
    <span
      className="tmel-chip"
      style={{ borderColor: color, color, background: `${color}22` }}
      title={n.kind ? REL_LABEL[n.kind] : undefined}
    >
      {text}
    </span>
  );
}

export function TensionCurve({ state, labels, melodyNotes, ghost, style, onStyle, selectedIndex, onSelect }: Props) {
  const { points, limits: L, budget } = state;
  const [localPick, setLocalPick] = useState<number | null>(null);
  const [details, setDetails] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const controlled = selectedIndex !== undefined;
  const pick = controlled ? (selectedIndex ?? null) : localPick;
  const setPick = (i: number) => {
    if (!controlled) setLocalPick(i);
    onSelect?.(i);
  };

  useEffect(() => { const el = scroller.current; if (el) el.scrollLeft = el.scrollWidth; }, [points.length, ghost?.label]);

  const n = points.length + (ghost ? 1 : 0);
  const col = Math.max(28, Math.min(56, 336 / Math.max(n, 1)));
  const W = Math.max(336, PAD_L * 2 + col * n);
  const x = (i: number) => PAD_L + col * (i + 0.5);
  const y = (v: number) => PAD_T + (1 - Math.min(v, TENSION_MAX) / TENSION_MAX) * (H - PAD_T - PAD_B);
  const base = y(0);
  const debtPts = points.map((p, i) => `${x(i)},${y(p.debt)}`);
  const debtArea = points.length ? `M${x(0)},${base} L${debtPts.join(' L')} L${x(points.length - 1)},${base} Z` : '';
  const selIdx = pick !== null && pick >= 0 && pick < points.length ? pick : points.length - 1;
  const sel = points[selIdx];
  const last = points[points.length - 1];
  const pct = (v: number) => Math.round(v * 100);
  const color = BUDGET_COLORS[budget.status];
  const melUnder = melodyNotes?.[selIdx] ?? [];
  const rubChip = melRubLabel(sel?.melody ?? null);

  return (
    <div className="tension">
      <div className="tension-head">
        <div className="tension-head-left">
          <h3 className="tension-title">Tension</h3>
          <span className="tstatus" style={{ color }}><i style={{ background: color }} />{BUDGET_LABEL[budget.status]}</span>
        </div>
        <select aria-label="Tension style" value={style} onChange={(e) => onStyle(e.target.value as TensionStyleId)}>
          {TENSION_STYLES.map((s) => <option key={s} value={s}>{tensionStyleLabel(s)}</option>)}
        </select>
      </div>
      <p className="small tmsg">{STATUS_TIP[budget.status] ?? budget.message}</p>
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
            const rub = p.melody !== null && p.melody >= MEL_RUB;
            return (
              <g key={i} onClick={() => setPick(i)} style={{ cursor: 'pointer' }}>
                <rect x={x(i) - col / 2} y={0} width={col} height={H} fill="transparent" />
                {i === selIdx && <rect x={x(i) - col / 2 + 2} y={2} width={col - 4} height={H - 4} rx={6} fill="#ffffff" opacity={0.05} />}
                {p.release > 0.5 && <text x={x(i)} y={y(p.level) - 9} textAnchor="middle" className="tlabel" fill="#4fd1a5">↓</text>}
                <circle cx={x(i)} cy={y(p.level)} r={4.5} fill={BUDGET_COLORS[st]} stroke="#121117" strokeWidth={1.5} />
                {rub && <circle cx={x(i)} cy={y(p.level)} r={8} fill="none" stroke="#7fd3ff" strokeWidth={1} opacity={0.85} />}
                <text x={x(i)} y={H - 6} textAnchor="middle" className="tlabel">{labels[i]}</text>
              </g>
            );
          })}
        </svg>
        {/* Mini melody chips under each column — same colours as the timeline */}
        {melodyNotes?.some((row) => row.length > 0) && (
          <div className="tmel-cols" style={{ width: W }}>
            {points.map((_, i) => (
              <div key={i} className={'tmel-col' + (i === selIdx ? ' on' : '')} style={{ width: col }} onClick={() => setPick(i)}>
                {(melodyNotes[i] ?? []).slice(0, 3).map((n, j) => <MelChip key={j} n={n} />)}
              </div>
            ))}
            {ghost && <div className="tmel-col" style={{ width: col }} />}
          </div>
        )}
      </div>
      {sel && (
        <div className="tbreak">
          <div className="tbreak-top">
            <b>{labels[selIdx]}</b>
            <div className="tmetric-row">
              <span className="tmetric">Tension {pct(sel.level)}</span>
              <span className="tmetric">Unresolved {pct(sel.debt)}</span>
              {rubChip && (
                <span className={'tmetric' + ((sel.melody ?? 0) >= MEL_RUB ? ' rub' : ' ok')}>{rubChip}</span>
              )}
            </div>
            <button type="button" className="ghost tdetails-btn" onClick={() => setDetails((d) => !d)} aria-expanded={details}>
              {details ? 'Hide details' : 'Details'}
            </button>
          </div>
          {details && (
            <p className="small muted tdetails">
              how far from home {pct(sel.event.parts.tonal)}
              {' · '}chord grit {pct(sel.event.parts.vertical)}
              {' · '}pull {pct(sel.event.parts.attraction)}
              {sel.event.parts.motion !== null ? ` · voice motion ${pct(sel.event.parts.motion)}` : ''}
              {sel.melody !== null ? ` · melody vs chord ${pct(sel.melody)}` : ''}
              {sel.idiom ? ` · eased: ${sel.idiom}` : ''}
            </p>
          )}
          {melUnder.length > 0 && (
            <div className="tmel-link">
              <span className="muted">Melody over this chord:</span>
              {melUnder.map((n, i) => <MelChip key={i} n={n} />)}
            </div>
          )}
        </div>
      )}
      <div className="tlegend small muted">
        <span><i className="band" />sweet spot</span>
        <span><i className="debt" />unresolved</span>
        <span><i className="ceil" />budget</span>
        <span><i className="melring" />melody rub</span>
        <span>↓ release</span>
        <span>higher = tenser</span>
      </div>
    </div>
  );
}
