// SVG visualisations: piano, guitar diagram, voice leading, circle of fifths, Tonnetz.
import { useMemo, useState, type PointerEvent as RPointerEvent, type ReactElement } from 'react';
import {
  Chord, GuitarShape, VoiceLine, asTriad, fifthsDistance, fifthsIndex, fifthsMoveLabel, fifthsMovePlain, fifthsStepTag, midiOctave, mod, pc as pcOf, tonnetzPc, layoutMoodMap,
} from '../core';

const isBlack = (m: number) => [1, 3, 6, 8, 10].includes(mod(m, 12));
export const CURRENT_COLOR = '#8FA8C8';
export const KIND_COLORS: Record<VoiceLine['kind'], string> = { common: '#9AA0A6', half: '#4CD964', whole: '#FFCC00', leap: '#FF6B6B' };

// ---------------- Piano ----------------
export interface PianoVizProps {
  scalePcs?: number[];
  current?: number[];
  suggested?: number[];
  fingers?: number[];
  melody?: number[];
  color?: string;
  spell: (midi: number) => string;
  onKey?: (midi: number) => void;
  minLow?: number;
  minHigh?: number;
  height?: number;
  label?: string;
  /** pitch class of the key's tonic (marked distinctly) */
  tonicPc?: number;
  /** Label every key (melody) vs only Cs / tonic / lit keys (chords). */
  labelKeys?: 'c' | 'all';
}

/** Scale marking colours: deliberately quieter than the full-key chord/melody highlights. */
export const SCALE_COLOR = '#A693F5';
export const TONIC_COLOR = '#3FC9B4';

export function PianoViz({ scalePcs = [], current = [], suggested = [], fingers = [], melody = [], color = '#9C7CF4', spell, onKey, minLow, minHigh, height = 120, label, tonicPc, labelKeys = 'c' }: PianoVizProps) {
  const all = [...current, ...suggested, ...melody];
  let lo = Math.min(minLow ?? 60, ...all);
  let hi = Math.max(minHigh ?? 83, ...all);
  lo = lo - mod(lo, 12); // start on C
  hi = hi + (11 - mod(hi, 12)); // end on B
  if (hi - lo < 23) hi = lo + 23;
  const whites: number[] = [];
  for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m);
  const W = 26, H = height, BW = 16, BH = H * 0.62;
  const xOf = (m: number) => whites.indexOf(m) * W;
  const fingerOf = new Map<number, number>();
  [...suggested].sort((a, b) => a - b).forEach((m, i) => fingers[i] !== undefined && fingerOf.set(m, fingers[i]));
  const cur = new Set(current), sug = new Set(suggested), mel = new Set(melody);
  const scale = new Set(scalePcs);
  const hasScale = scale.size > 0;
  const inScale = (m: number) => !hasScale || scale.has(mod(m, 12));
  const isTonic = (m: number) => tonicPc !== undefined && mod(m, 12) === mod(tonicPc, 12);
  const lit = (m: number) => sug.has(m) || cur.has(m);
  // in-scale keys: bright (white) / lifted purple-grey (black) + a coloured bar; out-of-scale keys are dimmed
  const keyFill = (m: number) => {
    if (sug.has(m)) return color;
    if (cur.has(m)) return CURRENT_COLOR;
    if (isBlack(m)) return inScale(m) ? '#4A4366' : '#0E0D12';
    return inScale(m) ? '#FFFFFF' : '#C2BFCD';
  };
  const bar = (m: number, x: number, w: number, bottom: number, black: boolean) => {
    if (!hasScale || !inScale(m)) return null;
    const tonic = isTonic(m);
    const h = tonic ? (black ? 7 : 9) : black ? 5 : 6;
    const inset = black ? 2 : 3;
    return (
      <rect className={tonic ? 'scalebar tonic' : 'scalebar'} x={x + inset} y={bottom - h - (black ? 3 : 4)} width={w - inset * 2} height={h} rx={h / 2}
        fill={tonic ? TONIC_COLOR : SCALE_COLOR} opacity={lit(m) ? 0.95 : 1} stroke={lit(m) ? '#111' : 'none'} strokeWidth={lit(m) ? 1 : 0} />
    );
  };
  const press = (m: number) => onKey?.(m);
  const keyProps = (m: number) => ({
    'data-midi': m,
    'data-scale': inScale(m) ? (isTonic(m) ? 'tonic' : 'in') : 'out',
    ...(onKey ? { onPointerDown: (e: RPointerEvent) => { e.preventDefault(); press(m); }, style: { cursor: 'pointer' } } : {}),
  });
  return (
    <svg className="piano" viewBox={`0 0 ${whites.length * W} ${H + 4}`} role="img" aria-label={label ?? 'Piano keyboard'}>
      {whites.map((m) => (
        <g key={m} {...keyProps(m)}>
          <rect x={xOf(m) + 0.5} y={0.5} width={W - 1} height={H} rx={3} fill={keyFill(m)} stroke={cur.has(m) && sug.has(m) ? CURRENT_COLOR : '#2a2933'} strokeWidth={cur.has(m) && sug.has(m) ? 4 : 1} />
          {bar(m, xOf(m), W, H, false)}
          {labelKeys === 'all' && (
            <text x={xOf(m) + W / 2} y={H - 12} className={'kname' + (lit(m) ? ' on' : '') + (isTonic(m) && !lit(m) ? ' tonic' : '')}>
              {mod(m, 12) === 0 ? `C${midiOctave(m)}` : spell(m)}
            </text>
          )}
          {labelKeys === 'c' && mod(m, 12) === 0 && !lit(m) && <text x={xOf(m) + W / 2} y={H - 17} className="kname">C{midiOctave(m)}</text>}
          {labelKeys === 'c' && isTonic(m) && !lit(m) && mod(m, 12) !== 0 && <text x={xOf(m) + W / 2} y={H - 17} className="kname tonic">{spell(m)}</text>}
          {labelKeys === 'c' && lit(m) && <text x={xOf(m) + W / 2} y={H - 22} className="kname on">{spell(m)}</text>}
          {fingerOf.has(m) && <FingerBadge x={xOf(m) + W / 2} y={H - 42} n={fingerOf.get(m)!} />}
          {mel.has(m) && <circle cx={xOf(m) + W / 2} cy={H * 0.7} r={5.5} className="meldot" />}
        </g>
      ))}
      {Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).filter(isBlack).map((m) => {
        const x = xOf(m - 1) + W - BW / 2;
        return (
          <g key={m} {...keyProps(m)}>
            <rect x={x} y={0} width={BW} height={BH} rx={2} fill={keyFill(m)} stroke={cur.has(m) && sug.has(m) ? CURRENT_COLOR : inScale(m) && hasScale ? '#6E6590' : '#000'} strokeWidth={cur.has(m) && sug.has(m) ? 3 : 1} />
            {bar(m, x, BW, BH, true)}
            {labelKeys === 'all' && (
              <text x={x + BW / 2} y={BH - 6} className={'kname black' + (lit(m) ? ' on' : '') + (isTonic(m) && !lit(m) ? ' tonic' : '')}>{spell(m)}</text>
            )}
            {fingerOf.has(m) && <FingerBadge x={x + BW / 2} y={BH - 22} n={fingerOf.get(m)!} small />}
            {mel.has(m) && <circle cx={x + BW / 2} cy={12} r={4.5} className="meldot" />}
          </g>
        );
      })}
    </svg>
  );
}

/** Legend for the scale marking (shared by every piano). */
export function ScaleLegend({ keyLabel, tonic }: { keyLabel: string; tonic: string }) {
  return (
    <>
      <span><i className="bar" style={{ background: SCALE_COLOR }} />in {keyLabel}</span>
      <span><i className="bar" style={{ background: TONIC_COLOR }} />home (tonic) {tonic}</span>
      <span><i style={{ background: '#C2BFCD' }} />outside the key</span>
    </>
  );
}

function FingerBadge({ x, y, n, small }: { x: number; y: number; n: number; small?: boolean }) {
  const r = small ? 7 : 8.5;
  return (
    <g className="finger">
      <circle cx={x} cy={y} r={r} />
      <text x={x} y={y + 0.5}>{n}</text>
    </g>
  );
}

// ---------------- Guitar ----------------
export function GuitarDiagram({ shape, color, title }: { shape: GuitarShape; color: string; title?: string }) {
  const strings = 6, frets = 5;
  const left = 26, top = 34, sw = 22, fh = 28;
  const width = left * 2 + sw * (strings - 1);
  const height = top + fh * frets + 26;
  const base = shape.baseFret;
  const xs = (s: number) => left + s * sw;
  const yf = (f: number) => top + (f - base + 0.5) * fh;
  return (
    <svg className="guitar" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title ?? 'Guitar chord diagram'}>
      {base === 1 ? <rect x={left - 2} y={top - 5} width={sw * 5 + 4} height={5} fill="#ddd" rx={1} /> : <text x={left - 10} y={top + fh / 2 + 4} className="fretno">{base}fr</text>}
      {Array.from({ length: frets + 1 }, (_, i) => <line key={'f' + i} x1={left} x2={left + sw * 5} y1={top + i * fh} y2={top + i * fh} stroke="#666" strokeWidth={1} />)}
      {Array.from({ length: strings }, (_, s) => <line key={'s' + s} x1={xs(s)} x2={xs(s)} y1={top} y2={top + fh * frets} stroke="#999" strokeWidth={1 + (5 - s) * 0.25} />)}
      {shape.frets.map((f, s) => f === null
        ? <text key={'m' + s} x={xs(s)} y={top - 12} className="openmute">×</text>
        : f === 0 ? <circle key={'o' + s} cx={xs(s)} cy={top - 16} r={5} fill="none" stroke="#ddd" strokeWidth={1.5} /> : null)}
      {shape.barre && shape.barre.fret >= base && (
        <rect x={xs(shape.barre.from) - 9} y={yf(shape.barre.fret) - 9} width={xs(shape.barre.to) - xs(shape.barre.from) + 18} height={18} rx={9} fill={color} opacity={0.9} />
      )}
      {shape.frets.map((f, s) => (f !== null && f > 0 && f >= base && f < base + frets ? (
        <g key={'d' + s}>
          <circle cx={xs(s)} cy={yf(f)} r={9} fill={color} stroke="#111" strokeWidth={1} />
          <text x={xs(s)} y={yf(f) + 0.5} className="gfinger">{shape.fingers[s] ?? ''}</text>
        </g>
      ) : null))}
      {['E', 'A', 'D', 'G', 'B', 'e'].map((n, s) => <text key={'n' + s} x={xs(s)} y={height - 8} className="sname">{n}</text>)}
    </svg>
  );
}

// ---------------- Voice leading ----------------
export function VoiceLeadingViz({ lines, fromLabel, toLabel, spell, color }: { lines: VoiceLine[]; fromLabel: string; toLabel: string; spell: (m: number) => string; color: string }) {
  if (!lines.length) return <p className="muted small">Add a chord to the progression to see how each voice moves.</p>;
  const notes = lines.flatMap((l) => [l.from, l.to]);
  const lo = Math.min(...notes) - 1, hi = Math.max(...notes) + 1;
  const W = 320, H = Math.max(150, (hi - lo) * 11 + 50), x1 = 78, x2 = W - 78;
  const y = (m: number) => 34 + ((hi - m) / (hi - lo)) * (H - 50);
  return (
    <svg className="vl" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="How each note moves">
      <text x={x1} y={16} className="vlhead">{fromLabel}</text>
      <text x={x2} y={16} className="vlhead" fill={color}>{toLabel}</text>
      {lines.map((l, i) => {
        const c = KIND_COLORS[l.kind];
        const mx = (x1 + x2) / 2;
        return (
          <g key={i}>
            <path d={`M ${x1 + 8} ${y(l.from)} C ${mx} ${y(l.from)}, ${mx} ${y(l.to)}, ${x2 - 8} ${y(l.to)}`} stroke={c} strokeWidth={l.kind === 'common' ? 2 : 3} fill="none" strokeDasharray={l.kind === 'common' ? '5 4' : undefined} />
            <text x={mx} y={(y(l.from) + y(l.to)) / 2 - 5} className="vldelta" fill={c}>{l.delta === 0 ? 'held' : (l.delta > 0 ? '+' : '') + l.delta}</text>
            <circle cx={x1} cy={y(l.from)} r={7} fill={CURRENT_COLOR} />
            <text x={x1 - 14} y={y(l.from) + 4} className="vlnote" textAnchor="end">{spell(l.from)}</text>
            <circle cx={x2} cy={y(l.to)} r={7} fill={color} />
            <text x={x2 + 14} y={y(l.to) + 4} className="vlnote" textAnchor="start">{spell(l.to)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function VoiceLegend() {
  return (
    <div className="legend">
      {(['common', 'half', 'whole', 'leap'] as const).map((k) => (
        <span key={k}>
          <i style={{ background: KIND_COLORS[k] }} />
          {k === 'common' ? 'same note held' : k === 'half' ? 'half-step (1 fret)' : k === 'whole' ? 'whole step (2 frets)' : 'larger jump'}
        </span>
      ))}
    </div>
  );
}

// ---------------- Circle of fifths ----------------
export interface CircleProps {
  tonicPc: number;
  scalePcs: number[];
  currentPc?: number;
  /** Best-first next picks (score-desc). Used for rim dots and node brightness. */
  others: Array<{ pc: number; color: string; id: string }>;
  selected?: { pc: number; color: string; label: string };
  spellPc: (p: number) => string;
  /** Tap an outer suggestion dot to preview/select that suggestion. */
  onPick?: (id: string) => void;
  /** Tap a pitch-class node to add that root (chord or melody note) to the timeline. */
  onAddPc?: (pitchClass: number) => void;
}

/**
 * Visibility 0..1 for each pitch class from best-first suggestion order.
 * Top-ranked roots stay near 1; unranked roots dim so the circle reads as a gradient of next-pick strength.
 */
export function cofPcVisibility(others: Array<{ pc: number }>): Map<number, number> {
  const best = new Map<number, number>();
  others.forEach((o, i) => { if (!best.has(o.pc)) best.set(o.pc, i); });
  const ranked = [...best.values()];
  const maxRank = ranked.length ? Math.max(...ranked) : 0;
  const out = new Map<number, number>();
  for (let p = 0; p < 12; p++) {
    const r = best.get(p);
    if (r === undefined) {
      // Well below ranked floors so unpicked roots recede.
      out.set(p, others.length ? 0.12 : 1);
      continue;
    }
    // Rank 0 (best) → 1; worst ranked among suggestions → ~0.5 (still above unranked).
    const t = maxRank <= 0 ? 1 : 1 - r / maxRank;
    out.set(p, 0.5 + 0.5 * (t * t));
  }
  return out;
}

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/** Lift a dark node fill toward a brighter tint by visibility t (0..1). */
function cofNodeFill(inKey: boolean, t: number): string {
  const lo = inKey ? [0x22, 0x20, 0x30] : [0x16, 0x15, 0x1c];
  const hi = inKey ? [0x8a, 0x80, 0xc0] : [0x5c, 0x56, 0x72];
  const u = Math.max(0, Math.min(1, t));
  return `rgb(${lerpChannel(lo[0], hi[0], u)} ${lerpChannel(lo[1], hi[1], u)} ${lerpChannel(lo[2], hi[2], u)})`;
}

function cofNodeStroke(inKey: boolean, t: number, isTonic: boolean, hit: boolean): string {
  if (hit) return '#ECEAF4';
  if (isTonic) return '#fff';
  const lo = inKey ? [0x3a, 0x36, 0x50] : [0x28, 0x26, 0x32];
  const hi = inKey ? [0xd0, 0xc8, 0xf0] : [0x9a, 0x92, 0xb0];
  const u = Math.max(0, Math.min(1, t));
  return `rgb(${lerpChannel(lo[0], hi[0], u)} ${lerpChannel(lo[1], hi[1], u)} ${lerpChannel(lo[2], hi[2], u)})`;
}

export function CircleOfFifths({ tonicPc, scalePcs, currentPc, others, selected, spellPc, onPick, onAddPc }: CircleProps) {
  const S = 300, c = S / 2, R = 112;
  const [pressed, setPressed] = useState<number | null>(null);
  const pos = (p: number, r: number) => {
    const a = (fifthsIndex(p) / 12) * Math.PI * 2 - Math.PI / 2;
    return { x: c + Math.cos(a) * r, y: c + Math.sin(a) * r };
  };
  const counts = new Map<number, number>();
  const visibility = useMemo(() => cofPcVisibility(others), [others]);
  const arrow = useMemo(() => {
    if (currentPc === undefined || !selected) return null;
    const a = pos(currentPc, R - 18), b = pos(selected.pc, R - 18);
    if (currentPc === selected.pc) {
      return `M ${a.x - 8} ${a.y} C ${c} ${c}, ${c} ${c}, ${a.x + 8} ${a.y}`;
    }
    const ctrl = { x: (a.x + b.x) / 2 * 0.55 + c * 0.45, y: (a.y + b.y) / 2 * 0.55 + c * 0.45 };
    return `M ${a.x} ${a.y} Q ${ctrl.x} ${ctrl.y} ${b.x} ${b.y}`;
  }, [currentPc, selected?.pc]); // eslint-disable-line react-hooks/exhaustive-deps
  // Step tags are vs current root when present, else vs tonic — so each note shows its directional role.
  const refPc = currentPc !== undefined ? currentPc : tonicPc;
  const move = currentPc !== undefined && selected ? fifthsDistance(currentPc, selected.pc) : null;
  const movePlain = currentPc !== undefined && selected
    ? fifthsMovePlain(currentPc, selected.pc)
    : selected
      ? fifthsMovePlain(tonicPc, selected.pc)
      : null;
  const fromName = currentPc !== undefined ? spellPc(currentPc) : spellPc(tonicPc);
  const toName = selected ? spellPc(selected.pc) : null;
  return (
    <svg className="circle" viewBox={`0 0 ${S} ${S}`} role="img" aria-label="Circle of fifths — brighter letters are stronger next picks">
      <defs>
        <marker id="arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={selected?.color ?? '#fff'} />
        </marker>
        <marker id="arrowhead-cw" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#7fd0a8" />
        </marker>
        <marker id="arrowhead-ccw" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#f0a070" />
        </marker>
      </defs>
      <circle cx={c} cy={c} r={R + 22} fill="#17161d" stroke="#2c2a36" />
      <circle cx={c} cy={c} r={R - 30} fill="#121117" stroke="#2c2a36" />
      {/* Direction legend: clockwise = brighter / homeward; counter-clockwise = opener / relax */}
      <path d={`M ${c + 18} ${c - R + 42} A ${R - 42} ${R - 42} 0 0 1 ${c + R - 42} ${c - 4}`} fill="none" stroke="#7fd0a8" strokeWidth={1.4} markerEnd="url(#arrowhead-cw)" opacity={0.85} />
      <path d={`M ${c - 18} ${c - R + 42} A ${R - 42} ${R - 42} 0 0 0 ${c - R + 42} ${c - 4}`} fill="none" stroke="#f0a070" strokeWidth={1.4} markerEnd="url(#arrowhead-ccw)" opacity={0.85} />
      <text x={c + 54} y={c - R + 30} className="cdir cw">→ brighter</text>
      <text x={c - 54} y={c - R + 30} className="cdir ccw">← opens</text>
      {Array.from({ length: 12 }, (_, i) => {
        const p = mod(i * 7, 12);
        const { x, y } = pos(p, R);
        const inKey = scalePcs.includes(p);
        const isTonic = p === tonicPc;
        const isCur = p === currentPc;
        const label = spellPc(p);
        const steps = fifthsDistance(refPc, p);
        const tag = fifthsStepTag(refPc, p);
        const tagClass = steps > 0 ? 'cw' : steps < 0 ? 'ccw' : 'home';
        const hit = pressed === p;
        const isSel = selected?.pc === p;
        const vis = isCur || isSel ? 1 : (visibility.get(p) ?? 1);
        const fill = isCur ? CURRENT_COLOR : cofNodeFill(inKey, vis);
        const stroke = isCur
          ? (hit ? '#ECEAF4' : '#8FA8C8')
          : isSel
            ? (hit ? '#ECEAF4' : (selected?.color ?? '#ECEAF4'))
            : cofNodeStroke(inKey, vis, isTonic, hit);
        return (
          <g
            key={p}
            className={onAddPc ? 'cnode-hit' : undefined}
            opacity={isCur || isSel ? 1 : 0.18 + 0.82 * vis}
            onPointerDown={(e) => {
              if (!onAddPc) return;
              e.preventDefault();
              setPressed(p);
              onAddPc(p);
            }}
            onPointerUp={() => setPressed(null)}
            onPointerLeave={() => setPressed(null)}
            style={{ cursor: onAddPc ? 'pointer' : undefined, touchAction: onAddPc ? 'manipulation' : undefined }}
            role={onAddPc ? 'button' : undefined}
            aria-label={onAddPc ? `Add ${label}` : label}
          >
            <title>
              {onAddPc
                ? `Tap to add ${label}${others.length ? ` · next-pick strength ${Math.round(vis * 100)}%` : ''}`
                : `${label}: ${fifthsMoveLabel(refPc, p)}`}
            </title>
            {/* Large invisible hit target for fingers */}
            {onAddPc && <circle cx={x} cy={y} r={26} fill="transparent" />}
            <circle
              cx={x} cy={y} r={hit ? 19 : 17}
              fill={fill}
              stroke={stroke}
              strokeWidth={hit || isTonic || isSel || vis > 0.85 ? 2.5 : vis > 0.55 ? 1.6 : 1}
            />
            <text x={x} y={y + 1} className={'cname' + (isCur ? ' dark' : '')}>{label}</text>
            <text x={x} y={y + 12} className={'cstep ' + tagClass}>{tag}</text>
            {onAddPc && <text x={x} y={y + 26} className="cadd">＋ add</text>}
          </g>
        );
      })}
      {others.map((o) => {
        const n = counts.get(o.pc) ?? 0;
        counts.set(o.pc, n + 1);
        const a = (fifthsIndex(o.pc) / 12) * Math.PI * 2 - Math.PI / 2 + (n - 1) * 0.11;
        const r = R + 27;
        return (
          <circle
            key={o.id}
            cx={c + Math.cos(a) * r}
            cy={c + Math.sin(a) * r}
            r={6.5}
            fill={o.color}
            stroke="#121117"
            strokeWidth={1}
            onPointerDown={(e) => { e.stopPropagation(); onPick?.(o.id); }}
            style={{ cursor: onPick ? 'pointer' : undefined }}
          >
            <title>Suggested next — tap to hear</title>
          </circle>
        );
      })}
      {arrow && selected && <path d={arrow} stroke={selected.color} strokeWidth={3.5} fill="none" markerEnd="url(#arrowhead)" opacity={0.95} />}
      {selected && (
        <g>
          <text x={c} y={c - 18} className="ccenter" fill={selected.color}>{selected.label}</text>
          {toName && (
            <text x={c} y={c} className="cmove" fill={selected.color}>
              {fromName}{move !== null && move < 0 ? ' ← ' : ' → '}{toName}
            </text>
          )}
          {movePlain && (
            <>
              <text x={c} y={c + 14} className="ceffect" fill="#e8e4f4">{movePlain.title}</text>
              <text x={c} y={c + 26} className="ceffect soft" fill="#a9a3bc">
                {movePlain.hint.length > 44 ? `${movePlain.hint.slice(0, 42)}…` : movePlain.hint}
              </text>
            </>
          )}
        </g>
      )}
      {!selected && (
        <g>
          <text x={c} y={c - 10} className="ccenter" fill="#bdb8d4">{spellPc(tonicPc)}</text>
          <text x={c} y={c + 6} className="ceffect" fill="#cfcbe0">home of this key</text>
          <text x={c} y={c + 18} className="ceffect soft" fill="#8f8aa3">rim dots = next picks · tap to hear</text>
        </g>
      )}
    </svg>
  );
}

// ---------------- Tonnetz ----------------
export function TonnetzViz({ tonicPc, current, suggested, color, nrt, spellPc }: { tonicPc: number; current?: Chord; suggested?: Chord; color: string; nrt: string | null; spellPc: (p: number) => string }) {
  const cols = 7, rows = 5, Wd = 44, Ht = 38;
  const xr = Math.floor(cols / 2), yr = Math.floor(rows / 2);
  const width = cols * Wd + Wd, height = rows * Ht + 30;
  const cx = width / 2 - Wd / 4, cy = height / 2;
  const P = (x: number, y: number) => ({ px: cx + (x + y * 0.5) * Wd, py: cy - y * Ht });
  const pts: Array<{ x: number; y: number; p: number }> = [];
  for (let y = -yr; y <= yr; y++) for (let x = -xr; x <= xr; x++) pts.push({ x, y, p: tonnetzPc(tonicPc, x, y) });
  const tri = (c?: Chord) => {
    if (!c) return null;
    const t = asTriad(c);
    if (!t) return null;
    let best: { x: number; y: number; d: number } | null = null;
    for (const q of pts) {
      if (q.p !== t.root) continue;
      const verts = t.minor ? [[q.x, q.y], [q.x + 1, q.y - 1], [q.x + 1, q.y]] : [[q.x, q.y], [q.x, q.y + 1], [q.x + 1, q.y]];
      if (verts.some(([vx, vy]) => Math.abs(vx) > xr || Math.abs(vy) > yr)) continue;
      const d = Math.abs(q.x) + Math.abs(q.y);
      if (!best || d < best.d) best = { x: q.x, y: q.y, d };
    }
    if (!best) return null;
    const v = t.minor ? [[best.x, best.y], [best.x + 1, best.y - 1], [best.x + 1, best.y]] : [[best.x, best.y], [best.x, best.y + 1], [best.x + 1, best.y]];
    return v.map(([x, y]) => P(x, y)).map((q) => `${q.px},${q.py}`).join(' ');
  };
  const curTri = tri(current), sugTri = tri(suggested);
  const curPcs = new Set(current ? [pcOf(current.root)] : []);
  return (
    <svg className="tonnetz" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Tonnetz">
      {pts.map(({ x, y }) => {
        const a = P(x, y);
        const lines = [] as ReactElement[];
        if (x < xr) { const b = P(x + 1, y); lines.push(<line key={`h${x}${y}`} x1={a.px} y1={a.py} x2={b.px} y2={b.py} />); }
        if (y < yr) { const b = P(x, y + 1); lines.push(<line key={`u${x}${y}`} x1={a.px} y1={a.py} x2={b.px} y2={b.py} />); }
        if (x < xr && y > -yr) { const b = P(x + 1, y - 1); lines.push(<line key={`d${x}${y}`} x1={a.px} y1={a.py} x2={b.px} y2={b.py} />); }
        return <g key={`l${x},${y}`} className="tgrid">{lines}</g>;
      })}
      {curTri && <polygon points={curTri} fill={CURRENT_COLOR} opacity={0.55} />}
      {sugTri && <polygon points={sugTri} fill={color} opacity={0.6} stroke={color} strokeWidth={2} />}
      {pts.map(({ x, y, p }) => {
        const a = P(x, y);
        return (
          <g key={`n${x},${y}`}>
            <circle cx={a.px} cy={a.py} r={11} className={'tnode' + (p === tonicPc ? ' tonic' : '') + (curPcs.has(p) ? ' cur' : '')} />
            <text x={a.px} y={a.py + 4} className="tname">{spellPc(p)}</text>
          </g>
        );
      })}
      <text x={8} y={height - 8} className="tcap">{nrt === null ? 'Only plain major/minor triads get this move map' : nrt === '' ? 'Same triad' : `Simple triad move: ${nrt.split('').join(' → ')}`}</text>
    </svg>
  );
}

// ---------------- Mood map ----------------
export interface MapPoint { id: string; label: string; x: number; y: number; color: string }

/** 2-D map: x = dark ↔ bright (-1..1), y = calm ↔ tense (0..1). */
export function MoodMap({ points, selectedId, current, target, onPick }: { points: MapPoint[]; selectedId?: string; current?: { x: number; y: number; label: string }; target?: { x?: number; y?: number }; onPick?: (id: string) => void }) {
  const W = 340, H = 250, pad = 28;
  const px = (x: number) => pad + ((x + 1) / 2) * (W - 2 * pad);
  const py = (y: number) => H - pad - y * (H - 2 * pad);
  return (
    <svg className="moodmap" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Mood map of next moves">
      <rect x={pad} y={pad} width={W - 2 * pad} height={H - 2 * pad} fill="#15141b" stroke="#2c2a36" rx={8} />
      <line x1={px(0)} x2={px(0)} y1={pad} y2={H - pad} stroke="#2c2a36" />
      <line x1={pad} x2={W - pad} y1={py(0.5)} y2={py(0.5)} stroke="#2c2a36" />
      <text x={pad} y={H - 8} className="maxis">← darker</text>
      <text x={W - pad} y={H - 8} className="maxis" textAnchor="end">brighter →</text>
      <text x={8} y={pad + 4} className="maxis">tense</text>
      <text x={8} y={H - pad} className="maxis">calm</text>
      {target && (target.x !== undefined || target.y !== undefined) && (
        <g className="target">
          {target.x !== undefined && <line x1={px(target.x)} x2={px(target.x)} y1={pad} y2={H - pad} stroke="#fff" strokeDasharray="3 4" opacity={0.5} />}
          {target.y !== undefined && <line x1={pad} x2={W - pad} y1={py(target.y)} y2={py(target.y)} stroke="#fff" strokeDasharray="3 4" opacity={0.5} />}
        </g>
      )}
      {current && (
        <g>
          <rect x={px(current.x) - 7} y={py(current.y) - 7} width={14} height={14} fill={CURRENT_COLOR} transform={`rotate(45 ${px(current.x)} ${py(current.y)})`} />
          <text x={px(current.x)} y={py(current.y) + 20} textAnchor="middle" className="mlabel">{current.label}</text>
        </g>
      )}
      {(() => {
        const laid = layoutMoodMap(
          points.map((p, i) => ({ id: p.id, x: px(p.x), y: py(p.y), label: p.label, priority: p.id === selectedId ? 1e6 : points.length - i })),
          { r: 8, charW: 6.4, lineH: 11, box: { x0: pad + 6, y0: pad + 6, x1: W - pad - 6, y1: H - pad - 6 } },
        );
        const byId = new Map(points.map((p) => [p.id, p]));
        // draw selected last so it sits on top
        const ordered = [...laid].sort((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId));
        return ordered.map((l) => {
          const p = byId.get(l.id)!;
          const sel = l.id === selectedId;
          return (
            <g key={l.id} onClick={() => onPick?.(l.id)} style={{ cursor: onPick ? 'pointer' : undefined }}>
              {current && sel && <line x1={px(current.x)} y1={py(current.y)} x2={l.x} y2={l.y} stroke={p.color} strokeWidth={2} opacity={0.7} />}
              <circle cx={l.x} cy={l.y} r={sel ? 10 : 7} fill={p.color} stroke={sel ? '#fff' : '#111'} strokeWidth={sel ? 2.5 : 1} />
              <circle cx={l.x} cy={l.y} r={14} fill="transparent" />
              {l.showLabel && <text x={l.labelX} y={l.labelY} textAnchor={l.anchor} className={'mlabel' + (sel ? ' sel' : '')}>{l.label}</text>}
            </g>
          );
        });
      })()}
    </svg>
  );
}
