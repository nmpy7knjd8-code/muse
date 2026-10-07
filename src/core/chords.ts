// Chord qualities, parsing, spelling and symbols.
import { NoteName, mod, noteName, parseNote, pc, spell } from './notes';

/** Quality ids intentionally match the theory KB's quality strings. */
export type QualityId =
  | 'maj' | 'min' | 'dim' | 'aug' | 'sus2' | 'sus4' | '5'
  | '7' | 'maj7' | 'm7' | 'm7b5' | 'dim7' | 'mMaj7' | '7sus4' | 'aug7'
  | '6' | 'm6' | 'add9' | 'madd9' | '9' | 'maj9' | 'm9' | '7b9' | '7#9' | 'maj7#11';

export type TriadClass = 'maj' | 'min' | 'dim' | 'aug' | 'sus' | 'power';

export interface QualityDef {
  id: QualityId;
  /** Display suffix after the root, e.g. "m7". */
  suffix: string;
  /** Chord tones as [letter steps above root, semitones above root]. */
  tones: Array<[number, number]>;
  triad: TriadClass;
  aliases: string[];
  name: string;
}

const Q = (id: QualityId, suffix: string, name: string, triad: TriadClass, tones: Array<[number, number]>, aliases: string[] = []): QualityDef => ({
  id, suffix, name, triad, tones, aliases,
});

const R: [number, number] = [0, 0];
const m3: [number, number] = [2, 3];
const M3: [number, number] = [2, 4];
const P5: [number, number] = [4, 7];
const d5: [number, number] = [4, 6];
const A5: [number, number] = [4, 8];
const m7: [number, number] = [6, 10];
const M7: [number, number] = [6, 11];
const d7: [number, number] = [6, 9];
const M2: [number, number] = [1, 2];
const P4: [number, number] = [3, 5];
const M6: [number, number] = [5, 9];
const M9: [number, number] = [1, 14];
const m9: [number, number] = [1, 13];
const A9: [number, number] = [1, 15];
const A11: [number, number] = [3, 18];

export const QUALITIES: QualityDef[] = [
  Q('maj', '', 'major', 'maj', [R, M3, P5], ['M', 'maj', 'major', 'Maj']),
  Q('min', 'm', 'minor', 'min', [R, m3, P5], ['m', 'min', '-', 'minor', 'mi']),
  Q('dim', 'dim', 'diminished', 'dim', [R, m3, d5], ['°', 'o', 'dim', 'mb5']),
  Q('aug', 'aug', 'augmented', 'aug', [R, M3, A5], ['+', 'aug', '#5', '(#5)']),
  Q('sus2', 'sus2', 'suspended 2nd', 'sus', [R, M2, P5], ['sus2']),
  Q('sus4', 'sus4', 'suspended 4th', 'sus', [R, P4, P5], ['sus', 'sus4']),
  Q('5', '5', 'power chord', 'power', [R, P5], ['5', '(no3)']),
  Q('7', '7', 'dominant 7th', 'maj', [R, M3, P5, m7], ['7', 'dom7', 'dom']),
  Q('maj7', 'maj7', 'major 7th', 'maj', [R, M3, P5, M7], ['maj7', 'M7', 'Δ7', 'Δ', 'ma7', 'Maj7', 'j7']),
  Q('m7', 'm7', 'minor 7th', 'min', [R, m3, P5, m7], ['m7', 'min7', '-7', 'mi7']),
  Q('m7b5', 'm7b5', 'half-diminished 7th', 'dim', [R, m3, d5, m7], ['m7b5', 'ø', 'ø7', 'min7b5', '-7b5', 'm7(b5)']),
  Q('dim7', 'dim7', 'diminished 7th', 'dim', [R, m3, d5, d7], ['dim7', '°7', 'o7']),
  Q('mMaj7', 'm(maj7)', 'minor-major 7th', 'min', [R, m3, P5, M7], ['mMaj7', 'mM7', 'm(maj7)', 'minMaj7', '-Δ7', 'm(Maj7)', 'mmaj7']),
  Q('7sus4', '7sus4', 'dominant 7th sus4', 'sus', [R, P4, P5, m7], ['7sus4', '7sus']),
  Q('aug7', '+7', 'augmented 7th', 'aug', [R, M3, A5, m7], ['+7', 'aug7', '7#5', '7(#5)']),
  Q('6', '6', 'major 6th', 'maj', [R, M3, P5, M6], ['6', 'maj6', 'M6']),
  Q('m6', 'm6', 'minor 6th', 'min', [R, m3, P5, M6], ['m6', 'min6', '-6']),
  Q('add9', 'add9', 'add 9', 'maj', [R, M3, P5, M9], ['add9', 'add2', '(add9)', '2']),
  Q('madd9', 'm(add9)', 'minor add 9', 'min', [R, m3, P5, M9], ['madd9', 'm(add9)', 'madd2']),
  Q('9', '9', 'dominant 9th', 'maj', [R, M3, P5, m7, M9], ['9', 'dom9']),
  Q('maj9', 'maj9', 'major 9th', 'maj', [R, M3, P5, M7, M9], ['maj9', 'M9', 'Δ9']),
  Q('m9', 'm9', 'minor 9th', 'min', [R, m3, P5, m7, M9], ['m9', 'min9', '-9']),
  Q('7b9', '7b9', 'dominant 7♭9', 'maj', [R, M3, P5, m7, m9], ['7b9', '7♭9', '7(b9)']),
  Q('7#9', '7#9', 'dominant 7♯9', 'maj', [R, M3, P5, m7, A9], ['7#9', '7♯9', '7(#9)']),
  Q('maj7#11', 'maj7#11', 'major 7♯11 (Lydian)', 'maj', [R, M3, P5, M7, A11], ['maj7#11', 'maj7♯11', 'Δ7#11', 'M7#11']),
];

export const QUALITY_BY_ID: Record<QualityId, QualityDef> = Object.fromEntries(QUALITIES.map((q) => [q.id, q])) as Record<QualityId, QualityDef>;

const ALIAS_MAP = new Map<string, QualityId>();
for (const q of QUALITIES) {
  ALIAS_MAP.set(q.suffix, q.id);
  for (const a of q.aliases) ALIAS_MAP.set(a, q.id);
  ALIAS_MAP.set(q.id, q.id);
}
ALIAS_MAP.set('', 'maj');

/** Resolve a quality string (chord suffix or KB quality id). Case-sensitive for M vs m. */
export function parseQuality(s: string): QualityId | null {
  const t = s.trim().replace(/♭/g, 'b').replace(/♯/g, '#');
  if (ALIAS_MAP.has(t)) return ALIAS_MAP.get(t)!;
  if (ALIAS_MAP.has(s.trim())) return ALIAS_MAP.get(s.trim())!;
  const lower = t.toLowerCase();
  // a few unambiguous long-form names
  const longForms: Record<string, QualityId> = {
    major: 'maj', minor: 'min', diminished: 'dim', augmented: 'aug', dominant: '7', 'half-diminished': 'm7b5',
    halfdim: 'm7b5', 'minor-major7': 'mMaj7', power: '5',
  };
  return longForms[lower] ?? null;
}

export interface Chord {
  root: NoteName;
  quality: QualityId;
  bass?: NoteName;
}

/** Parse chord symbols like "C", "F#m7", "Bbmaj7", "G7/B", "Cø7", "Ebaug", "Asus4". */
export function parseChord(input: string): Chord | null {
  const s = input.trim();
  const m = /^([A-Ga-g])(##|bb|#|b|♯|♭|x)?(.*?)(?:\/([A-Ga-g](?:##|bb|#|b|♯|♭)?))?$/.exec(s);
  if (!m) return null;
  const root = parseNote(m[1] + (m[2] ?? ''));
  if (!root) return null;
  const quality = parseQuality(m[3] ?? '');
  if (!quality) return null;
  const chord: Chord = { root, quality };
  if (m[4]) {
    const bass = parseNote(m[4]);
    if (!bass) return null;
    if (pc(bass) !== pc(root)) chord.bass = bass;
  }
  return chord;
}

export function chordNotes(chord: Chord): NoteName[] {
  const def = QUALITY_BY_ID[chord.quality];
  return def.tones.map(([steps, semis]) => spell(chord.root.letter + steps, pc(chord.root) + semis));
}

export function chordPcs(chord: Chord): number[] {
  const pcs = chordNotes(chord).map(pc);
  if (chord.bass) pcs.unshift(pc(chord.bass));
  return [...new Set(pcs)];
}

export function chordSymbol(chord: Chord, unicode = false): string {
  const def = QUALITY_BY_ID[chord.quality];
  let suffix = def.suffix;
  if (unicode) suffix = suffix.replace(/b(?=\d)/g, '♭').replace(/#/g, '♯');
  let s = noteName(chord.root, unicode) + suffix;
  if (chord.bass) s += '/' + noteName(chord.bass, unicode);
  return s;
}

export function chordName(chord: Chord): string {
  return `${noteName(chord.root, true)} ${QUALITY_BY_ID[chord.quality].name}`;
}

export function triadClass(q: QualityId): TriadClass {
  return QUALITY_BY_ID[q].triad;
}

export function chordsEqual(a: Chord, b: Chord): boolean {
  return pc(a.root) === pc(b.root) && a.quality === b.quality && (a.bass ? pc(a.bass) : -1) === (b.bass ? pc(b.bass) : -1);
}

/** Build a chord from a root pitch class and a preferred letter (spelling). */
export function makeChord(letter: number, rootPc: number, quality: QualityId): Chord {
  return { root: spell(letter, rootPc), quality };
}

/** Infer quality from a set of semitone intervals above the root (used for diatonic chord stacking). */
export function qualityFromIntervals(intervals: number[]): QualityId | null {
  const key = intervals.map((i) => mod(i, 12)).join(',');
  const table: Record<string, QualityId> = {
    '0,4,7': 'maj', '0,3,7': 'min', '0,3,6': 'dim', '0,4,8': 'aug',
    '0,4,7,10': '7', '0,4,7,11': 'maj7', '0,3,7,10': 'm7', '0,3,6,10': 'm7b5', '0,3,6,9': 'dim7',
    '0,3,7,11': 'mMaj7', '0,4,8,10': 'aug7',
  };
  return table[key] ?? null;
}
