// Drum percussion grid: kit rows × subdivision columns. Same column = play simultaneously.
// Key/mode strip shows which notes the pitched voices (kick, toms, ride bell) lock to.
import type { ReactNode } from 'react';
import {
  DRUM_PATTERNS, DRUM_THEORY_PILLARS, DRUM_VOICES, DrumArtic, DrumHit, DrumVoiceId,
  cycleDrumArtic, defaultMidiForVoice, drumRoleHint, drumTabAscii, drumTuningForKey, drumVel,
  keyName, noteName, spellInKey, toggleDrumHit, voiceTuneLabel,
  coachDrumBar, type DrumKeyTuning, type DrumTensionState, type Key, type PartMeter,
} from '../core';
import { DrumTensionStrip } from './DrumTensionStrip';

interface Props {
  hits: DrumHit[];
  beats: number;
  subdiv: 1 | 2 | 4;
  meter: PartMeter;
  /** Session key — pitched kit voices pair to this mode. */
  keyInfo: Key;
  prevHits?: DrumHit[];
  progression?: DrumTensionState | null;
  barIndex?: number;
  playBeat?: number | null;
  onChange: (hits: DrumHit[]) => void;
  onPreview: (voice: DrumVoiceId, artic?: DrumArtic, midi?: number) => void;
  onLoadPattern: (hits: DrumHit[], beats: number, subdiv: 1 | 2 | 4) => void;
  /** Place a melodic steel accent (scale degree) on the next empty tom/steel slot. */
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

function KeyToneStrip({
  tuning, onPreviewVoice, onPreviewTone,
}: {
  tuning: DrumKeyTuning;
  onPreviewVoice: (voice: DrumVoiceId, midi?: number) => void;
  onPreviewTone?: (midi: number, label: string) => void;
}): ReactNode {
  const pairs: Array<{ voice: DrumVoiceId; tip: string }> = [
    { voice: 'BD', tip: 'Kick · tonic' },
    { voice: 'BDp', tip: 'Punch kick · 5th' },
    { voice: 'FT', tip: 'Floor tom · tonic' },
    { voice: 'T2', tip: 'Mid tom · 3rd' },
    { voice: 'T1', tip: 'High tom · 5th' },
    { voice: 'Rb', tip: 'Ride bell · 5th' },
    { voice: 'Cs', tip: 'Splash · ♭7 / colour' },
  ];
  return (
    <div className="drum-keytones" aria-label="Key and mode drum tones">
      <div className="drum-keytones-head">
        <span className="drum-keytones-kicker">Key tones</span>
        <b>{keyName(tuning.key, true)}</b>
        <span className="small muted">Pitched kit voices lock to this mode so drums agree with chords / melody / bass.</span>
      </div>
      <div className="drum-keytones-pairs">
        {pairs.map(({ voice, tip }) => {
          const label = voiceTuneLabel(voice, tuning);
          const midi = defaultMidiForVoice(voice, tuning);
          if (!label || midi == null) return null;
          return (
            <button
              key={voice}
              type="button"
              className="drum-keytone-chip"
              title={`${tip} — ${label}`}
              onClick={() => onPreviewVoice(voice, midi)}
            >
              <span className="drum-keytone-voice">{voice}</span>
              <span className="drum-keytone-note">{label}</span>
            </button>
          );
        })}
      </div>
      <div className="drum-scale-tones" aria-label="Melodic steel scale degrees">
        <span className="small muted">Melodic steel (in mode)</span>
        <div className="drum-scale-row">
          {tuning.scaleTones.map((t) => (
            <button
              key={`${t.degree}-${t.midi}`}
              type="button"
              className="drum-scale-chip"
              title={`${t.why} · MIDI ${t.midi}`}
              onClick={() => onPreviewTone?.(t.midi, t.label)}
            >
              <b>{t.label}</b>
              <span>{noteName(spellInKey(tuning.key, t.midi), true)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DrumPad({
  hits, beats, subdiv, meter, keyInfo, prevHits, progression, barIndex = 0, playBeat,
  onChange, onPreview, onLoadPattern, onPreviewTone,
}: Props): ReactNode {
  const step = 1 / subdiv;
  const cols = Math.round(beats * subdiv);
  const ascii = drumTabAscii(hits, beats, subdiv, GRID_VOICES.filter((v) => hits.some((h) => h.voice === v)));
  const coach = coachDrumBar(hits, meter, prevHits);
  const tuning = drumTuningForKey(keyInfo);

  const midiFor = (voice: DrumVoiceId) => defaultMidiForVoice(voice, tuning);

  return (
    <div className="drum-pad" aria-label="Drum percussion tab">
      <div className="drum-theory-strip" aria-label="Percussion theory">
        <p className="drum-theory-lead">
          <b>Percussion theory.</b> Columns are time; rows are kit voices (several hats, kicks, toms, crash/splash, ride/bell).
          Stacked marks sound together. Pitched voices — kick, toms, ride bell — lock to <b>{keyName(keyInfo, true)}</b>.
        </p>
        <ul className="drum-pillars">
          {DRUM_THEORY_PILLARS.filter((p) => ['Simultaneous columns', 'Ostinato first', 'Backbeat vs foundation', 'Build & release'].includes(p.name)).map((p) => (
            <li key={p.name}><b>{p.name}.</b> {p.detail}</li>
          ))}
        </ul>
      </div>

      <KeyToneStrip
        tuning={tuning}
        onPreviewVoice={(voice, midi) => onPreview(voice, 'normal', midi)}
        onPreviewTone={onPreviewTone}
      />

      <DrumTensionStrip coach={coach} progression={progression} selectedBar={barIndex} />

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
          <button type="button" className="pill quiet" onClick={() => onChange([])} disabled={!hits.length}>
            Clear bar
          </button>
          <span className="small muted">
            Hats · kicks · toms · crash/splash · ride/bell · rim — stacked cells play together · pitched rows follow the key
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
