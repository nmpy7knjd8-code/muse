// Idea 12 — where should the release land? Reads the tension model, shows the build, flags early
// arrivals and offers three ways to land (strongest / softer / surprising) at the best spot.
import { useMemo } from 'react';
import { beatsPerBar, chordSymbol, findReleaseMoments, parseRoman, romanOf, HOME_LEVEL, type Chord, type ReleaseOption } from '../../core';
import { PlayIcon } from '../icons';
import { ChordChips, ToolIntro } from './common';
import type { ToolProps } from './types';

const KIND_TITLE: Record<ReleaseOption['kind'], string> = { strongest: 'Strongest', softer: 'Softer', surprising: 'Surprising' };
const KIND_COLOR: Record<ReleaseOption['kind'], string> = { strongest: '#4fd1a5', softer: '#81D4FA', surprising: '#CE93D8' };

export default function ReleaseTool(p: ToolProps) {
  const chords = p.chords;
  const r = useMemo(() => findReleaseMoments(chords, p.k, { style: p.tStyle, adventure: p.adventure }), [chords, p.k, p.tStyle, p.adventure]);
  const bpb = beatsPerBar(p.timeSig);
  const R = (rn: string) => parseRoman(rn, p.k)!;
  const best = r.best;

  const withChord = (c: Chord, at: number) => {
    const out = chords.slice();
    if (at >= out.length) out.push(c); else out[at] = c;
    return out;
  };
  const apply = (next: Chord[], label: string) => {
    // Keep the melody under each bar when every bar has a chord (bars map 1:1).
    if (p.slots.length === chords.length && p.melody.length) {
      p.useBars(next.map((c, i) => ({ chord: c, notes: p.melody.filter((n) => n.beat >= i * bpb && n.beat < (i + 1) * bpb).map((n) => ({ ...n, beat: n.beat - i * bpb })) })), label);
    } else p.useChords(next, label);
  };
  const hearAround = (next: Chord[], at: number) => p.playChords(next.slice(Math.max(0, at - 3), at + 1), Math.min(1.1, p.beatSec * 2));

  if (r.status === 'short') {
    return (
      <div className="tool release-tool">
        <ToolIntro>Finds where your progression’s tension peaks and where the release should land.</ToolIntro>
        <div className="tool-card"><p className="muted">{r.message}</p>
          <div className="tool-actions"><button type="button" className="add" onClick={() => p.useChords(['I', 'IV', 'vi', 'V'].map(R), 'Example build loaded')}>Try an example</button></div>
        </div>
      </div>
    );
  }

  // ---- curve ----
  const n = chords.length;
  const cols = n + (best?.append ? 1 : 0);
  const W = Math.max(340, cols * 54), H = 120, top = 14, bot = 26;
  const x = (i: number) => 27 + i * ((W - 54) / Math.max(1, cols - 1));
  const y = (v: number) => top + (1 - Math.min(1, v)) * (H - top - bot);
  const area = r.debts.length ? `M${x(0)},${y(0)} ` + r.debts.map((d, i) => `L${x(i)},${y(d)}`).join(' ') + ` L${x(n - 1)},${y(0)} Z` : '';
  const line = r.debts.map((d, i) => `${x(i)},${y(d)}`).join(' ');

  return (
    <div className="tool release-tool">
      <ToolIntro>Muse follows how tension builds while you stay away from home, finds the peak, and shows where letting it go will feel most earned.</ToolIntro>

      <div className="tool-card release-curve-card">
        <p className="release-msg">{r.message}</p>
        <div className="release-scroll">
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ minWidth: Math.min(W, cols * 54) }} role="img" aria-label="Build-up of tension per bar">
            {r.build && r.build.to > r.build.from && (
              <rect x={x(r.build.from) - 14} y={top - 6} width={x(r.build.to) - x(r.build.from) + 28} height={H - top - bot + 8} rx={8} fill="#f0a050" opacity={0.1} />
            )}
            <path d={area} fill="#f0a050" opacity={0.28} />
            <polyline points={line} fill="none" stroke="#f0a050" strokeWidth={2} strokeLinejoin="round" />
            {r.debts.map((d, i) => {
              const rel = r.releases.find((q) => q.index === i);
              const home = r.levels[i]! < HOME_LEVEL;
              return (
                <g key={i}>
                  <circle cx={x(i)} cy={y(d)} r={rel ? 6 : 4} fill={rel ? (rel.kind === 'earned' ? '#4fd1a5' : '#e6c35c') : home ? '#8f8aa3' : '#f0a050'} />
                  <text x={x(i)} y={H - 8} textAnchor="middle" className="tlabel" fill={best && !best.append && best.index === i ? '#4fd1a5' : '#bdb8cc'}>{chordSymbol(chords[i]!, true)}</text>
                </g>
              );
            })}
            {r.peak && <text x={x(r.peak.index)} y={y(r.debts[r.peak.index]!) - 9} textAnchor="middle" className="release-tag" fill="#f0a050">peak</text>}
            {best && (
              <g className="release-here">
                <line x1={x(best.index)} x2={x(best.index)} y1={top} y2={H - bot} stroke="#4fd1a5" strokeWidth={2} strokeDasharray="4 3" />
                {best.append && <text x={x(best.index)} y={H - 8} textAnchor="middle" className="tlabel" fill="#4fd1a5">＋</text>}
                <text x={x(best.index) + (best.index >= cols - 1 ? -6 : 6)} y={H - bot - 6} textAnchor={best.index >= cols - 1 ? 'end' : 'start'} className="release-tag" fill="#4fd1a5">release here</text>
              </g>
            )}
          </svg>
        </div>
        <div className="release-legend small">
          <span><i style={{ background: '#f0a050' }} />build-up</span>
          <span><i style={{ background: '#4fd1a5' }} />earned release</span>
          <span><i style={{ background: '#e6c35c' }} />early arrival</span>
        </div>
      </div>

      {r.status === 'flat' && (
        <div className="tool-card">
          <h4>Build something first</h4>
          <p className="muted small">The progression stays close to home. Open the Tension arc tool to sketch a rise, or try one of these before the last bar.</p>
          <div className="tool-actions">
            <button type="button" onClick={() => p.openTool('arc')}>Open Tension arc</button>
            <button type="button" onClick={() => p.appendChords(['IV', 'V'].map(R), 'Added a IV–V build')}>Add IV–V</button>
          </div>
        </div>
      )}

      {best && r.options.length > 0 && (
        <>
          <p className="tool-label">{best.append ? 'Land it after the last bar with…' : `Land it at bar ${best.index + 1} with…`}</p>
          <div className="release-options">
            {r.options.map((o) => {
              const next = withChord(o.chord, best.index);
              return (
                <div key={o.kind} className="tool-card release-option" style={{ borderLeftColor: KIND_COLOR[o.kind] }}>
                  <div className="release-option-head">
                    <h4>{KIND_TITLE[o.kind]}</h4>
                    <b className="release-sym">{chordSymbol(o.chord, true)}</b>
                    <span className="muted small">{o.roman}</span>
                  </div>
                  <p className="muted small">{o.why}</p>
                  <div className="tool-actions">
                    <button type="button" className="tool-hear" onClick={() => hearAround(next, best.index)}><PlayIcon size={14} /> Hear it land</button>
                    <button type="button" className="add" onClick={() => apply(next, `${KIND_TITLE[o.kind]} release: ${chordSymbol(o.chord)} ${best.append ? 'added at the end' : `at bar ${best.index + 1}`}`)}>
                      {best.append ? 'Add at end' : `Use at bar ${best.index + 1}`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {best && r.setup && r.options[0] && (
        <div className="tool-card release-setup">
          <h4>Set it up</h4>
          <p className="muted small">{r.setup.why}</p>
          <ChordChips chords={withChord(r.options[0].chord, best.index).map((c, i) => (i === r.setup!.index ? r.setup!.chord : c)).slice(Math.max(0, r.setup.index - 1), best.index + 1)} k={p.k} onTap={(c) => p.playChord(c)} sub={(c) => romanOf(c, p.k)} />
          <div className="tool-actions">
            {(() => {
              const next = withChord(r.options[0]!.chord, best.index).map((c, i) => (i === r.setup!.index ? r.setup!.chord : c));
              return (
                <>
                  <button type="button" className="tool-hear" onClick={() => hearAround(next, best.index)}><PlayIcon size={14} /> Hear</button>
                  <button type="button" className="add" onClick={() => apply(next, `${chordSymbol(r.setup!.chord)} → ${chordSymbol(r.options[0]!.chord)} release`)}>Use both</button>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
