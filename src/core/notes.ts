// Pitch classes, spelled note names, intervals. Framework-free (no DOM/React).

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
export const NATURAL_PC = [0, 2, 4, 5, 7, 9, 11] as const;
/** Semitones of the major scale; used as the reference for roman-numeral accidentals. */
export const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11] as const;

export const mod = (n: number, m: number): number => ((n % m) + m) % m;

/** A spelled note: letter index 0..6 (C..B) plus accidental (-2..+2). */
export interface NoteName {
  letter: number;
  acc: number;
}

export function pc(n: NoteName): number {
  return mod(NATURAL_PC[mod(n.letter, 7)] + n.acc, 12);
}

/** Spell pitch class `pitch` using letter index `letter` (e.g. letter F + pc 6 => F#). */
export function spell(letter: number, pitch: number): NoteName {
  const l = mod(letter, 7);
  const acc = mod(pitch - NATURAL_PC[l] + 6, 12) - 6;
  return { letter: l, acc };
}

export function accidentalString(acc: number, unicode = false): string {
  if (acc === 0) return '';
  const sharp = unicode ? '♯' : '#';
  const flat = unicode ? '♭' : 'b';
  if (unicode && acc === 2) return '𝄪';
  if (unicode && acc === -2) return '𝄫';
  return (acc > 0 ? sharp : flat).repeat(Math.abs(acc));
}

export function noteName(n: NoteName, unicode = false): string {
  return LETTERS[n.letter] + accidentalString(n.acc, unicode);
}

export function parseAccidentals(s: string): number | null {
  let acc = 0;
  for (const ch of s) {
    if (ch === '#' || ch === '♯') acc += 1;
    else if (ch === 'b' || ch === '♭') acc -= 1;
    else if (ch === 'x' || ch === '𝄪') acc += 2;
    else if (ch === '𝄫') acc -= 2;
    else return null;
  }
  return acc;
}

/** Parse "C", "F#", "Bb", "E♭", "Cbb". Letter must be A-G (case-insensitive). */
export function parseNote(s: string): NoteName | null {
  const m = /^\s*([A-Ga-g])([#♯b♭x𝄪𝄫]*)\s*$/.exec(s);
  if (!m) return null;
  const letter = LETTERS.indexOf(m[1].toUpperCase() as (typeof LETTERS)[number]);
  const acc = parseAccidentals(m[2]);
  if (acc === null || Math.abs(acc) > 2) return null;
  return { letter, acc };
}

export function sameNote(a: NoteName, b: NoteName): boolean {
  return a.letter === b.letter && a.acc === b.acc;
}

/** Default (key-less) spelling of a pitch class: flats for black keys except F#. */
const DEFAULT_SPELL: Array<[number, number]> = [
  [0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0], [3, 1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0],
];
export function defaultSpelling(pitch: number): NoteName {
  const [letter, acc] = DEFAULT_SPELL[mod(pitch, 12)];
  return { letter, acc };
}

// ---- MIDI helpers ----
export function midiToPc(midi: number): number {
  return mod(midi, 12);
}
export function midiOctave(midi: number): number {
  return Math.floor(midi / 12) - 1; // MIDI 60 = C4
}
export function midiName(midi: number, spelling?: NoteName): string {
  const n = spelling ?? defaultSpelling(midi);
  return noteName(n) + midiOctave(midi);
}

// ---- Intervals ----
const INTERVAL_NAMES: Record<number, string> = {
  0: 'unison', 1: 'minor 2nd', 2: 'major 2nd', 3: 'minor 3rd', 4: 'major 3rd', 5: 'perfect 4th',
  6: 'tritone', 7: 'perfect 5th', 8: 'minor 6th', 9: 'major 6th', 10: 'minor 7th', 11: 'major 7th', 12: 'octave',
};
export function intervalName(semitones: number): string {
  const a = Math.abs(semitones);
  if (a <= 12) return INTERVAL_NAMES[a];
  return `${INTERVAL_NAMES[a % 12] ?? a + ' semitones'} + ${Math.floor(a / 12)} oct`;
}

/** Major-relative scale-degree label for a semitone offset from the tonic, e.g. 3 => "b3", 6 => "#4". */
const DEGREE_LABELS = ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'];
export function degreeLabel(offset: number): string {
  return DEGREE_LABELS[mod(offset, 12)];
}
/** Parse a degree label like "b6", "♭6", "#4", "7", "^5" into a semitone offset. */
export function parseDegreeLabel(s: string): number | null {
  const m = /^\^?([#♯b♭]*)([1-7])$/.exec(String(s).trim());
  if (!m) return null;
  const acc = parseAccidentals(m[1]);
  if (acc === null) return null;
  return mod(MAJOR_STEPS[Number(m[2]) - 1] + acc, 12);
}
