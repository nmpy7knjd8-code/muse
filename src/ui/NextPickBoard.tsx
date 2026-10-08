// Next-pick board: compare suggested chords or notes on a 2D map + rank strip, with Hear / Add.
// When harmonizing a pending melody, the x-axis becomes clash → fit instead of familiar → colourful.
import { useMemo } from 'react';
import {
  Chord, ChordSuggestion, NoteSuggestion, REL_COLORS, REL_LABEL, rootMotion, type RelKind,
} from '../core';

type Item = ChordSuggestion | NoteSuggestion;

interface Props {
  mode: 'chords' | 'melody';
  items: Item[];
  selectedId: string | null;
  colorOf: (moodId: string) => string;
  labelOf: (moodId: string) => string;
  onSelect: (id: string) => void;
  onAdd: (id: string) => void;
  /** Optional current chord/note label for the headline. */
  fromLabel?: string;
  /** Previous chord — used for root ↑/↓ vs current. */
  fromChord?: Chord;
  /** Pending N.C. melody: map by melody fit and label Hear accordingly. */
  harmonizing?: boolean;
}

const W = 340, H = 168, PAD_L = 36, PAD_R = 12, PAD_T = 16, PAD_B = 28;

function isChord(s: Item): s is ChordSuggestion { return 'chord' in s; }

function chordXY(s: ChordSuggestion, harmonizing: boolean): { x: number; y: number } {
  // harmonize: clash → fit (x), calm → tense (y); else familiar → colourful (x), calm → tense (y)
  const x = harmonizing && s.harmony
    ? (s.harmony.fit + 1) / 2
    : 1 - s.commonness;
  const y = s.tension ? Math.min(1, s.tension.level) : s.features.tension;
  return { x, y };
}

function noteXY(s: NoteSuggestion, items: NoteSuggestion[]): { x: number; y: number } {
  const midis = items.map((n) => n.midi);
  const lo = Math.min(...midis), hi = Math.max(...midis);
  const x = hi === lo ? 0.5 : (s.midi - lo) / (hi - lo);
  const relY: Record<RelKind, number> = { chord: 0.18, tension: 0.48, avoid: 0.72, clash: 0.92 };
  const y = s.relation ? relY[s.relation.kind] : s.features.tension;
  return { x, y };
}

function jitter(id: string, i: number): { dx: number; dy: number } {
  // Stable tiny spread so coincident dots don't stack completely
  let h = 0;
  for (let k = 0; k < id.length; k++) h = (h * 31 + id.charCodeAt(k)) | 0;
  return { dx: ((h % 7) - 3) * 0.8 + (i % 3) * 0.3, dy: (((h >> 3) % 7) - 3) * 0.8 };
}

export function NextPickBoard({ mode, items, selectedId, colorOf, labelOf, onSelect, onAdd, fromLabel, fromChord, harmonizing }: Props) {
  const top = useMemo(() => items.slice(0, 16), [items]);
  const selected = top.find((s) => s.id === selectedId) ?? top[0] ?? null;
  const harmMode = !!harmonizing && mode === 'chords';

  const laid = useMemo(() => {
    const notes = mode === 'melody' ? top.filter((s): s is NoteSuggestion => !isChord(s)) : [];
    return top.map((s, i) => {
      const raw = isChord(s) ? chordXY(s, harmMode) : noteXY(s, notes);
      const j = jitter(s.id, i);
      const px = PAD_L + raw.x * (W - PAD_L - PAD_R) + j.dx;
      const py = PAD_T + (1 - raw.y) * (H - PAD_T - PAD_B) + j.dy;
      return { s, px, py, color: colorOf(s.primaryMood) };
    });
  }, [top, mode, colorOf, harmMode]);

  if (!top.length) return null;
  const selLaid = laid.find((l) => l.s.id === selected?.id) ?? laid[0];
  const title = mode === 'chords'
    ? (harmMode
      ? (fromLabel ? `Chord for ${fromLabel}` : 'Chord for this melody')
      : (fromLabel ? `Next after ${fromLabel}` : 'Next chord'))
    : (fromLabel ? `Next after ${fromLabel}` : 'Next note');

  const xAxis = mode === 'chords'
    ? (harmMode ? ['clashes', 'fits melody'] : ['familiar', 'colourful'])
    : ['lower', 'higher'];
  const yAxis = mode === 'chords' ? ['calm', 'tense'] : ['in the chord', 'clashes'];

  return (
    <div className="nextpick" aria-label="Next pick board">
      <div className="nextpick-head">
        <span className="tstatus"><i style={{ background: selLaid.color }} />{title}</span>
        <span className="small muted">
          {harmMode ? 'tap a dot to hear chord + melody' : 'tap a dot to hear · closer to calm/fit is easier'}
        </span>
      </div>

      <svg className="nextpick-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        {/* guide bands */}
        <rect x={PAD_L} y={PAD_T} width={(W - PAD_L - PAD_R) / 2} height={(H - PAD_T - PAD_B) / 2} fill="#4fd1a5" opacity={0.06} />
        <rect x={PAD_L + (W - PAD_L - PAD_R) / 2} y={PAD_T + (H - PAD_T - PAD_B) / 2} width={(W - PAD_L - PAD_R) / 2} height={(H - PAD_T - PAD_B) / 2} fill="#f0a050" opacity={0.07} />
        <line x1={PAD_L} x2={W - PAD_R} y1={PAD_T + (H - PAD_T - PAD_B) / 2} y2={PAD_T + (H - PAD_T - PAD_B) / 2} stroke="#3a3550" strokeWidth={1} />
        <line x1={PAD_L + (W - PAD_L - PAD_R) / 2} x2={PAD_L + (W - PAD_L - PAD_R) / 2} y1={PAD_T} y2={H - PAD_B} stroke="#3a3550" strokeWidth={1} />

        {/* axis labels */}
        <text x={PAD_L} y={H - 8} className="nplabel">{xAxis[0]}</text>
        <text x={W - PAD_R} y={H - 8} textAnchor="end" className="nplabel">{xAxis[1]}</text>
        <text x={10} y={H - PAD_B} textAnchor="middle" className="nplabel" transform={`rotate(-90 10 ${H - PAD_B})`}>{yAxis[0]}</text>
        <text x={10} y={PAD_T + 8} textAnchor="middle" className="nplabel" transform={`rotate(-90 10 ${PAD_T + 8})`}>{yAxis[1]}</text>

        {laid.map(({ s, px, py, color }) => {
          const on = s.id === selected?.id;
          const label = isChord(s) ? s.symbol : s.name.replace('#', '♯').replace(/b(?=\d)/, '♭');
          const root = isChord(s) && fromChord && !harmMode ? rootMotion(fromChord, s.chord) : null;
          const arrow = root && root.dir !== '→' ? root.dir : '';
          return (
            <g key={s.id} onClick={() => onSelect(s.id)} style={{ cursor: 'pointer' }}>
              {on && <circle cx={px} cy={py} r={14} fill="none" stroke={color} strokeWidth={2} opacity={0.85} />}
              <circle cx={px} cy={py} r={on ? 7 : 5.5} fill={color} stroke="#121117" strokeWidth={1.5} />
              <text x={px} y={py - 11} textAnchor="middle" className={'nplabel' + (on ? ' on' : '')} fill={on ? color : '#bdb8d4'}>
                {arrow ? `${arrow} ${label}` : label}
              </text>
              {arrow && <title>{root!.label}</title>}
            </g>
          );
        })}
      </svg>

      {/* Rank strip — top options as tension-like bars */}
      <div className="nextpick-ranks" role="list">
        {top.slice(0, 8).map((s, i) => {
          const color = colorOf(s.primaryMood);
          const on = s.id === selected?.id;
          const bar = isChord(s)
            ? (harmMode && s.harmony
              ? Math.round(((s.harmony.fit + 1) / 2) * 100)
              : Math.round(((s.tension?.level ?? s.features.tension) * 100)))
            : Math.round((1 - s.commonness) * 100);
          const name = isChord(s) ? s.symbol : s.name.replace('#', '♯');
          const root = isChord(s) && fromChord && !harmMode ? rootMotion(fromChord, s.chord) : null;
          return (
            <button
              key={s.id}
              type="button"
              role="listitem"
              className={'nprank' + (on ? ' on' : '')}
              style={{ borderColor: on ? color : undefined }}
              onClick={() => onSelect(s.id)}
            >
              <span className="nprank-i">{i + 1}</span>
              <span className="nprank-name" style={{ color }}>{name}</span>
              <span className="nprank-bar"><i style={{ width: `${Math.max(8, bar)}%`, background: color }} /></span>
              <span className="nprank-meta">
                <span className="muted">{isChord(s) ? s.roman : s.degree}</span>
                {harmMode && isChord(s) && s.harmony && (
                  <span className="fit-badge" title="How well this chord fits the waiting melody">{Math.round(((s.harmony.fit + 1) / 2) * 100)}% fit</span>
                )}
                {root && <span className={'root-badge tight ' + (root.dir === '↑' ? 'root-up' : root.dir === '↓' ? 'root-down' : 'root-same')}>{root.label}</span>}
              </span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="nextpick-break">
          <div className="nextpick-break-top">
            <b style={{ color: colorOf(selected.primaryMood) }}>
              {isChord(selected) ? selected.symbol : selected.name.replace('#', '♯')}
            </b>
            <span className="muted">
              {isChord(selected) ? selected.roman : `degree ${selected.degree} from home`}
              {isChord(selected) && fromChord && !harmMode ? (() => {
                const r = rootMotion(fromChord, selected.chord);
                return <span className={'root-badge ' + (r.dir === '↑' ? 'root-up' : r.dir === '↓' ? 'root-down' : 'root-same')}>{r.label}</span>;
              })() : null}
              {' · '}{labelOf(selected.primaryMood).toLowerCase()}
              {isChord(selected) && selected.moodShift ? ` · ${selected.moodShift.arrow} ${selected.moodShift.text}` : ''}
              {!isChord(selected) && selected.relation ? ` · ${selected.relation.label} (${REL_LABEL[selected.relation.kind]})` : ''}
            </span>
          </div>
          <p className="small why">{selected.why}</p>
          <div className="small muted">
            {isChord(selected) ? (
              <>
                {harmMode && selected.harmony ? (
                  <>
                    melody fit {Math.round(((selected.harmony.fit + 1) / 2) * 100)}%
                    {' · '}
                    {selected.harmony.relations.filter((r) => r.kind === 'chord').length}/{selected.harmony.relations.length} notes in the chord
                    {' · '}
                  </>
                ) : null}
                how common {Math.round(selected.commonness * 100)}
                {' · '}how tense {Math.round((selected.tension?.level ?? selected.features.tension) * 100)}
                {selected.tension?.reasons[0] ? ` · ${selected.tension.reasons[0]}` : ''}
                {!harmMode && selected.harmony ? ` · melody fit ${Math.round(((selected.harmony.fit + 1) / 2) * 100)}%` : ''}
                {selected.match ? ` · mood match ${Math.round(selected.match.total * 100)}%` : ''}
              </>
            ) : (
              <>
                {selected.inScale ? 'in the key' : 'outside the key'}
                {selected.isChordTone ? ' · in the chord' : ''}
                {selected.relation ? (
                  <span style={{ color: REL_COLORS[selected.relation.kind] }}>
                    {' · '}{REL_LABEL[selected.relation.kind]}
                  </span>
                ) : null}
                {selected.match ? ` · mood match ${Math.round(selected.match.total * 100)}%` : ''}
              </>
            )}
          </div>
          <div className="row gap" style={{ marginTop: 8 }}>
            <button type="button" onClick={() => onSelect(selected.id)}>{harmMode ? '▶ Hear with melody' : '▶ Hear'}</button>
            <button type="button" className="add" onClick={() => onAdd(selected.id)}>＋ Add</button>
          </div>
        </div>
      )}

      <div className="tlegend small muted">
        {mode === 'chords' ? (
          harmMode ? (
            <>
              <span>left = clashes melody</span><span>right = fits melody</span><span>up = tenser</span>
            </>
          ) : (
            <>
              <span>left = familiar</span><span>right = colourful</span><span>up = tenser</span>
            </>
          )
        ) : (
          <>
            <span>left = lower</span><span>right = higher</span><span>up = rubs the chord more</span>
          </>
        )}
      </div>
    </div>
  );
}
