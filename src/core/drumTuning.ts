// Key / mode pairing for pitched kit voices (toms, kick fundamental, ride bell)
// and melodic steel-drum accents that sit in the same scale as chords/melody/bass.
import { Key, MODE_BY_ID, scalePcs, spellInKey } from './scales';
import { mod, noteName, pc } from './notes';
import type { DrumVoiceId } from './drums';

/** Fold a pitch class into a MIDI octave window. */
export function midiInRange(pitchClass: number, lo: number, hi: number): number {
  let m = mod(Math.round(pitchClass), 12);
  while (m < lo) m += 12;
  while (m > hi) m -= 12;
  if (m < lo) m += 12;
  return m;
}

export interface DrumToneRole {
  /** Scale degree index 0..n-1 in the mode. */
  degree: number;
  /** Interval from tonic in semitones. */
  interval: number;
  /** Short roman/degree label (1, b3, 5…). */
  label: string;
  /** MIDI note for audition / pitched hits. */
  midi: number;
  /** Which kit voices prefer this tone. */
  voices: DrumVoiceId[];
  /** Why it pairs with the mode. */
  why: string;
}

export interface DrumKeyTuning {
  key: Key;
  /** Kick body — tonic in a low register. */
  kick: number;
  /** Punch/short kick — often the 5th below or tonic up. */
  kickPunch: number;
  floor: number;
  mid: number;
  high: number;
  /** Ride bell — clear 5th (or characteristic tone) in the treble. */
  rideBell: number;
  /** Splash / crash colour — often ♭7 or characteristic degree, mid-high. */
  splash: number;
  /** Ordered scale tones for melodic steel / tom melody. */
  scaleTones: DrumToneRole[];
}

function degreeLabel(interval: number, modeId: string): string {
  const names: Record<number, string> = {
    0: '1', 1: '♭2', 2: '2', 3: '♭3', 4: '3', 5: '4', 6: '♯4/♭5',
    7: '5', 8: '♭6', 9: '6', 10: '♭7', 11: '7',
  };
  // Mode-aware cosmetic: major 3 in phrygian-dominant still "3"
  if (modeId === 'phrygianDominant' && interval === 4) return '3';
  if (modeId === 'lydian' && interval === 6) return '♯4';
  return names[interval] ?? String(interval);
}

/**
 * Map the session key/mode onto kit fundamentals so drums lock with harmony.
 * Toms spell 1–3–5 (or mode equivalents); kick = 1; ride bell = 5 (or characteristic).
 */
export function drumTuningForKey(k: Key): DrumKeyTuning {
  const t = pc(k.tonic);
  const ivs = MODE_BY_ID[k.mode].intervals;
  const pcs = scalePcs(k);
  const deg = (i: number) => ivs[Math.min(i, ivs.length - 1)]!;
  // Prefer chord-tone stack: 1, 3rd (or ♭3), 5 — then characteristic colour for splash/bell.
  const thirdIv = deg(2);
  const fifthIv = deg(4);
  const charIv = ivs.find((x) => x === 1 || x === 6 || x === 10 || x === 11) ?? deg(6);
  const seventhIv = deg(6);

  const kick = midiInRange(t, 36, 43);           // ~C2..G2
  const kickPunch = midiInRange(t + fifthIv, 38, 48);
  const floor = midiInRange(t, 41, 53);          // floor ≈ tonic
  const mid = midiInRange(t + thirdIv, 48, 60);  // mid ≈ 3rd
  const high = midiInRange(t + fifthIv, 55, 67); // high ≈ 5th
  const rideBell = midiInRange(t + fifthIv, 67, 79);
  const splash = midiInRange(t + seventhIv, 70, 82);

  const scaleTones: DrumToneRole[] = pcs.map((p, i) => {
    const interval = mod(p - t, 12);
    const label = degreeLabel(interval, k.mode);
    const midi = midiInRange(p, 48, 84);
    const v: DrumVoiceId[] = [];
    if (i === 0) v.push('BD', 'BDp', 'FT');
    if (interval === thirdIv) v.push('T2');
    if (interval === fifthIv) v.push('T1', 'Rb');
    if (interval === seventhIv || interval === charIv) v.push('Cs');
    return {
      degree: i,
      interval,
      label,
      midi,
      voices: v,
      why: i === 0
        ? 'Tonic — kick / floor / melodic home'
        : interval === thirdIv
          ? 'Third — mid tom colour of the mode'
          : interval === fifthIv
            ? 'Fifth — high tom / ride bell ring with the key'
            : `Scale degree ${label} — melodic steel / fill colour`,
    };
  });

  return { key: k, kick, kickPunch, floor, mid, high, rideBell, splash, scaleTones };
}

/** Default MIDI for a pitched kit voice in the current key (undefined = unpitched synthesis). */
export function defaultMidiForVoice(voice: DrumVoiceId, tuning: DrumKeyTuning): number | undefined {
  switch (voice) {
    case 'BD': return tuning.kick;
    case 'BDp': return tuning.kickPunch;
    case 'FT': return tuning.floor;
    case 'T2': return tuning.mid;
    case 'T1': return tuning.high;
    case 'Rb': return tuning.rideBell;
    case 'Cs': return tuning.splash;
    default: return undefined;
  }
}

/** Human label “C2 · 1” for a tuned voice. */
export function voiceTuneLabel(voice: DrumVoiceId, tuning: DrumKeyTuning): string | null {
  const m = defaultMidiForVoice(voice, tuning);
  if (m == null) return null;
  const nn = noteName(spellInKey(tuning.key, m), true);
  const tone = tuning.scaleTones.find((t) => mod(t.midi, 12) === mod(m, 12));
  return tone ? `${nn} · ${tone.label}` : nn;
}

/** Voices that carry pitch from the session key. */
export const PITCHED_DRUM_VOICES: DrumVoiceId[] = ['BD', 'BDp', 'FT', 'T2', 'T1', 'Rb', 'Cs'];
