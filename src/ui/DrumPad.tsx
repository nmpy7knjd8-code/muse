// Drum percussion grid: kit rows × subdivision columns. Same column = play simultaneously.
// Pitched voices (kick, toms, ride bell) still lock to the session key/mode when played.
import type { ReactNode } from 'react';
import {
  DEFAULT_DRUM_KIT, DRUM_KITS, DRUM_PATTERNS, DRUM_THEORY_PILLARS, DRUM_VOICES,
  DrumArtic, DrumHit, DrumKitId, DrumVoiceId,
  cycleDrumArtic, defaultMidiForVoice, drumRoleHint, drumTabAscii, drumTuningForKey, drumVel,
  keyName, toggleDrumHit, voiceTuneLabel,
  type DrumKeyTuning, type Key,
} from '../core';

interface Props {
  hits: DrumHit[];
  beats: number;
  subdiv: 1 | 2 | 4;
  /** Session key — pitched kit voices pair to this mode. */
  keyInfo: Key;
  /** Sound character — independent of the written groove (mix & match). */
  kit?: DrumKitId;
  playBeat?: number | null;
  /** True while the drums-only session groove loop is running. */
  grooveLooping?: boolean;
  onChange: (hits: DrumHit[]) => void;
  onPreview: (voice: DrumVoiceId, artic?: DrumArtic, midi?: number) => void;
  onLoadPattern: (hits: DrumHit[], beats: number, subdiv: 1 | 2 | 4) => void;
  onChooseKit?: (id: DrumKitId) => void;
  /** Practice the pad groove alone (no chords/melody). */
  onLoopGroove?: () => void;
  /** Stamp the pad groove under timeline notes/chords. */
  onApplyToNotes?: () => void;
  /** Melodic steel accent preview (scale degree) — Key tones strip is hidden. */
  onPreviewTone?: (midi: number, label: string) => void;
}

const GRID_VOICES: DrumVoiceId[] = [
  'CC', 'Cs', 'Rd', 'Rb', 'HH', 'HHs', 'HO', 'Hf', 'SD', 'RS', 'T1', 'T2', 'FT', 'BD', 'BDp',
];

const CYMBALISH: DrumVoiceId[] = ['CC', 'Cs', 'Rd', 'Rb', 'HH', 'HHs', 'HO', 'Hf', 'RS'];

function cellArtic(hits: DrumHit[], voice: DrumVoiceId, beat: number): DrumArtic | null {
  const h = hits.find((x) => x.voice === voice && Math.abs(x.beat - beat) < 1e-6);
  return h ? (h.artic ?? 'normal') : null;
}

function hitMark(voice: DrumVoiceId, artic: DrumArtic): string {
  if (artic === 'ghost') return 'g';
  if (voice === 'Rb') return artic === 'accent' ? 'B' : 'b';
  if (CYMBALISH.includes(voice)) return artic === 'accent' ? 'X' : 'x';
  return artic === 'accent' ? 'O' : 'o';
}

export function DrumPad({
  hits, beats, subdiv, keyInfo, kit = DEFAULT_DRUM_KIT, playBeat, grooveLooping = false,
  onChange, onPreview, onLoadPattern, onChooseKit, onLoopGroove, onApplyToNotes,
}: Props): ReactNode {
  const step = 1 / subdiv;
  const cols = Math.round(beats * subdiv);
  const ascii = drumTabAscii(hits, beats, subdiv, GRID_VOICES.filter((v) => hits.some((h) => h.voice === v)));
  const tuning = drumTuningForKey(keyInfo);
  const kitMeta = DRUM_KITS.find((k) => k.id === kit) ?? DRUM_KITS[0]!;

  const midiFor = (voice: DrumVoiceId) => defaultMidiForVoice(voice, tuning);

  return (
    <div className="drum-pad" aria-label="Drum percussion tab">
      <div className="drum-theory-strip" aria-label="Percussion theory">
        <p className="drum-theory-lead">
          <b>Percussion theory.</b> Columns are time; rows are kit voices (several hats, kicks, toms, crash/splash, ride/bell).
          Stacked marks sound together. Pitched voices — kick, toms, ride bell — lock to <b>{keyName(keyInfo, true)}</b>.
          Kits change sound colour; patterns change the groove — mix freely.
          Practice with <b>Loop groove</b> (drums alone), then <b>Add to notes</b> to layer under your chords and melody.
        </p>
        <ul className="drum-pillars">
          {DRUM_THEORY_PILLARS.filter((p) => ['Simultaneous columns', 'Ostinato first', 'Backbeat vs foundation', 'Build & release'].includes(p.name)).map((p) => (
            <li key={p.name}><b>{p.name}.</b> {p.detail}</li>
          ))}
        </ul>
      </div>

      <div className="drum-kits" role="radiogroup" aria-label="Drum kit sound">
        <div className="drum-kits-head">
          <span className="drum-kits-kicker">Kit sound</span>
          <span className="small muted">{kitMeta.blurb}</span>
        </div>
        <div className="drum-kits-row">
          {DRUM_KITS.map((k) => (
            <button
              key={k.id}
              type="button"
              role="radio"
              aria-checked={kit === k.id}
              className={'drum-kit-chip' + (kit === k.id ? ' on' : '')}
              title={k.blurb}
              onClick={() => onChooseKit?.(k.id)}
            >
              <span className="drum-kit-name">{k.name}</span>
              <span className="drum-kit-tags">{k.tags.slice(0, 2).join(' · ')}</span>
            </button>
          ))}
        </div>
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
              const tune = voiceTuneLabel(voice, tuning);
              return (
                <tr key={voice}>
                  <th scope="row" className="drum-voice-label">
                    <button
                      type="button"
                      className="drum-voice-btn"
                      title={`${def.label} · ${def.limb} · ${def.theory}${tune ? ` · ${tune}` : ''}`}
                      onClick={() => onPreview(voice, 'normal', midiFor(voice))}
                    >
                      <span className="drum-voice-id">{voice}</span>
                      <span className="drum-voice-name">{def.label}</span>
                      {tune
                        ? <span className="drum-voice-tune">{tune}</span>
                        : <span className="drum-voice-role">{def.role}</span>}
                    </button>
                  </th>
                  {Array.from({ length: cols }, (_, i) => {
                    const beat = i * step;
                    const artic = cellArtic(hits, voice, beat);
                    const active = playBeat != null && Math.abs(playBeat - beat) < step / 2;
                    const midi = midiFor(voice);
                    return (
                      <td key={i} className={'drum-cell' + (active ? ' play' : '')}>
                        <button
                          type="button"
                          className={'drum-hit' + (artic ? ` on ${artic}` : '')}
                          aria-pressed={!!artic}
                          title={artic
                            ? `${def.label} @ ${beat + 1} (${artic}) — tap to cycle artic / clear`
                            : `${def.label} @ ${beat + 1} — ${drumRoleHint(voice, beat, beats)}${tune ? ` · ${tune}` : ''}`}
                          onClick={() => {
                            if (!artic) {
                              onPreview(voice, 'normal', midi);
                              onChange(toggleDrumHit(hits, voice, beat, 'normal', midi));
                            } else {
                              const next = cycleDrumArtic(hits, voice, beat);
                              const still = next.find((h) => h.voice === voice && Math.abs(h.beat - beat) < 1e-6);
                              if (still) onPreview(voice, still.artic ?? 'normal', still.midi ?? midi);
                              onChange(next.map((h) => (
                                h.voice === voice && Math.abs(h.beat - beat) < 1e-6 && h.midi == null && midi != null
                                  ? { ...h, midi }
                                  : h
                              )));
                            }
                          }}
                        >
                          {artic ? hitMark(voice, artic) : ''}
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
          <button
            type="button"
            className={'pill' + (grooveLooping ? ' on' : '')}
            aria-pressed={grooveLooping}
            disabled={!hits.length && !grooveLooping}
            title={grooveLooping ? 'Stop the drums-only groove loop' : 'Loop this groove without chords or melody'}
            onClick={() => onLoopGroove?.()}
          >
            {grooveLooping ? '■ Stop groove' : '▶ Loop groove'}
          </button>
          <button
            type="button"
            className="add"
            disabled={!hits.length}
            title="Stamp this groove under every timeline bar (chords & melody stay in place)"
            onClick={() => onApplyToNotes?.()}
          >
            Add to notes
          </button>
          <button type="button" className="pill quiet" onClick={() => onChange([])} disabled={!hits.length}>
            Clear pad
          </button>
          <span className="small muted">
            Session pad · loop alone, then add under notes · stacked cells play together
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

/** Stamp key MIDI onto pitched hits that lack an explicit midi (e.g. loaded patterns). */
export function applyKeyTuning(hits: DrumHit[], tuning: DrumKeyTuning): DrumHit[] {
  return hits.map((h) => {
    if (h.midi != null) return h;
    const midi = defaultMidiForVoice(h.voice, tuning);
    return midi != null ? { ...h, midi } : h;
  });
}
