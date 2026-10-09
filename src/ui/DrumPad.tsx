// Drum percussion grid: kit rows × subdivision columns. Same column = play simultaneously.
import type { ReactNode } from 'react';
import {
  DRUM_PATTERNS, DRUM_THEORY_PILLARS, DRUM_VOICES, DrumArtic, DrumHit, DrumVoiceId,
  cycleDrumArtic, drumRoleHint, drumTabAscii, drumVel, toggleDrumHit,
} from '../core';

interface Props {
  hits: DrumHit[];
  beats: number;
  subdiv: 1 | 2 | 4;
  /** Highlight playhead column while looping (beat in part pulses). */
  playBeat?: number | null;
  onChange: (hits: DrumHit[]) => void;
  onPreview: (voice: DrumVoiceId, artic?: DrumArtic) => void;
  onLoadPattern: (hits: DrumHit[], beats: number, subdiv: 1 | 2 | 4) => void;
}

const GRID_VOICES: DrumVoiceId[] = ['CC', 'Rd', 'HH', 'HO', 'SD', 'T1', 'T2', 'FT', 'BD', 'Hf'];

function cellArtic(hits: DrumHit[], voice: DrumVoiceId, beat: number): DrumArtic | null {
  const h = hits.find((x) => x.voice === voice && Math.abs(x.beat - beat) < 1e-6);
  return h ? (h.artic ?? 'normal') : null;
}

export function DrumPad({
  hits, beats, subdiv, playBeat, onChange, onPreview, onLoadPattern,
}: Props): ReactNode {
  const step = 1 / subdiv;
  const cols = Math.round(beats * subdiv);
  const ascii = drumTabAscii(hits, beats, subdiv, GRID_VOICES.filter((v) => hits.some((h) => h.voice === v)));

  return (
    <div className="drum-pad" aria-label="Drum percussion tab">
      <div className="drum-theory-strip" aria-label="Percussion theory">
        <p className="drum-theory-lead">
          <b>Percussion theory.</b> Columns are time; rows are kit voices. Stacked marks in one column
          sound together — that simultaneous layering is the groove.
        </p>
        <ul className="drum-pillars">
          {DRUM_THEORY_PILLARS.slice(0, 4).map((p) => (
            <li key={p.name}><b>{p.name}.</b> {p.detail}</li>
          ))}
        </ul>
      </div>

      <div className="drum-patterns" role="list" aria-label="Starter grooves">
        {DRUM_PATTERNS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="drum-pattern-chip"
            title={p.theory}
            onClick={() => onLoadPattern(p.hits.map((h) => ({ ...h })), p.beats, p.subdiv)}
          >
            <span className="drum-pattern-name">{p.name}</span>
            <span className="drum-pattern-tags">{p.tags.slice(0, 2).join(' · ')}</span>
          </button>
        ))}
      </div>

      <div className="drum-grid-wrap">
        <table className="drum-grid">
          <thead>
            <tr>
              <th scope="col" className="drum-voice-h">Kit</th>
              {Array.from({ length: cols }, (_, i) => {
                const beat = i * step;
                const isBeat = Math.abs(beat - Math.round(beat)) < 1e-6;
                const active = playBeat != null && Math.abs(playBeat - beat) < step / 2;
                return (
                  <th
                    key={i}
                    scope="col"
                    className={'drum-col-h' + (isBeat ? ' beat' : '') + (active ? ' play' : '')}
                  >
                    {isBeat ? String(Math.round(beat) + 1) : subdiv === 2 ? '+' : (i % 4 === 1 ? 'e' : i % 4 === 2 ? '+' : 'a')}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {GRID_VOICES.map((voice) => {
              const def = DRUM_VOICES.find((v) => v.id === voice)!;
              return (
                <tr key={voice}>
                  <th scope="row" className="drum-voice-label">
                    <button
                      type="button"
                      className="drum-voice-btn"
                      title={`${def.label} · ${def.limb} · ${def.theory}`}
                      onClick={() => onPreview(voice)}
                    >
                      <span className="drum-voice-id">{voice}</span>
                      <span className="drum-voice-name">{def.label}</span>
                      <span className="drum-voice-role">{def.role}</span>
                    </button>
                  </th>
                  {Array.from({ length: cols }, (_, i) => {
                    const beat = i * step;
                    const artic = cellArtic(hits, voice, beat);
                    const active = playBeat != null && Math.abs(playBeat - beat) < step / 2;
                    return (
                      <td key={i} className={'drum-cell' + (active ? ' play' : '')}>
                        <button
                          type="button"
                          className={'drum-hit' + (artic ? ` on ${artic}` : '')}
                          aria-pressed={!!artic}
                          title={artic
                            ? `${def.label} @ ${beat + 1} (${artic}) — tap to cycle artic / clear`
                            : `${def.label} @ ${beat + 1} — ${drumRoleHint(voice, beat, beats)}`}
                          onClick={() => {
                            if (!artic) {
                              onPreview(voice, 'normal');
                              onChange(toggleDrumHit(hits, voice, beat, 'normal'));
                            } else {
                              const next = cycleDrumArtic(hits, voice, beat);
                              const still = next.find((h) => h.voice === voice && Math.abs(h.beat - beat) < 1e-6);
                              if (still) onPreview(voice, still.artic ?? 'normal');
                              onChange(next);
                            }
                          }}
                        >
                          {artic === 'ghost' ? 'g' : artic === 'accent' ? (voice === 'HH' || voice === 'Rd' || voice === 'CC' || voice === 'Hf' ? 'X' : 'O') : artic ? (voice === 'HH' || voice === 'Rd' || voice === 'CC' || voice === 'Hf' ? 'x' : 'o') : ''}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="drum-footer">
        <div className="drum-actions">
          <button type="button" className="pill quiet" onClick={() => onChange([])} disabled={!hits.length}>
            Clear bar
          </button>
          <span className="small muted">
            Tap a cell to add · tap again for ghost → accent → clear · stacked cells play together · Loop to practice
          </span>
        </div>
        {hits.length > 0 && (
          <pre className="drum-ascii" aria-label="ASCII drum tab">{ascii}</pre>
        )}
        {hits.length > 0 && (
          <p className="small muted drum-hit-count">
            {hits.length} hit{hits.length === 1 ? '' : 's'} · avg vel{' '}
            {(hits.reduce((a, h) => a + drumVel(h), 0) / hits.length).toFixed(2)}
          </p>
        )}
      </div>
    </div>
  );
}
