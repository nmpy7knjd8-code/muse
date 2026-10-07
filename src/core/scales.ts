// Scales, modes, keys and diatonic harmony.
import { Chord, QualityId, qualityFromIntervals } from './chords';
import { LETTERS, NoteName, mod, noteName, parseNote, pc, spell } from './notes';

export type ModeId =
  | 'major' | 'dorian' | 'phrygian' | 'lydian' | 'mixolydian' | 'minor' | 'locrian'
  | 'harmonicMinor' | 'melodicMinor' | 'phrygianDominant' | 'lydianDominant';

export interface ModeDef {
  id: ModeId;
  name: string;
  intervals: number[];
  /** Is the tonic triad minor-ish (used to match KB moves with keyMode major/minor). */
  family: 'major' | 'minor';
  /** Characteristic degree vs. major/minor parent, as a short hint. */
  characteristic: string;
  aliases: string[];
}

export const MODES: ModeDef[] = [
  { id: 'major', name: 'Major (Ionian)', intervals: [0, 2, 4, 5, 7, 9, 11], family: 'major', characteristic: '3 & 7', aliases: ['major', 'ionian', 'maj', ''] },
  { id: 'minor', name: 'Minor (Aeolian)', intervals: [0, 2, 3, 5, 7, 8, 10], family: 'minor', characteristic: 'b3 & b6', aliases: ['minor', 'aeolian', 'min', 'm', 'natural minor'] },
  { id: 'dorian', name: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10], family: 'minor', characteristic: '6 (raised 6th)', aliases: ['dorian'] },
  { id: 'phrygian', name: 'Phrygian', intervals: [0, 1, 3, 5, 7, 8, 10], family: 'minor', characteristic: 'b2', aliases: ['phrygian'] },
  { id: 'lydian', name: 'Lydian', intervals: [0, 2, 4, 6, 7, 9, 11], family: 'major', characteristic: '#4', aliases: ['lydian'] },
  { id: 'mixolydian', name: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10], family: 'major', characteristic: 'b7', aliases: ['mixolydian', 'mixo'] },
  { id: 'locrian', name: 'Locrian', intervals: [0, 1, 3, 5, 6, 8, 10], family: 'minor', characteristic: 'b2 & b5', aliases: ['locrian'] },
  { id: 'harmonicMinor', name: 'Harmonic minor', intervals: [0, 2, 3, 5, 7, 8, 11], family: 'minor', characteristic: 'raised 7 over b6', aliases: ['harmonic minor', 'harmonicminor'] },
  { id: 'phrygianDominant', name: 'Phrygian dominant', intervals: [0, 1, 4, 5, 7, 8, 10], family: 'major', characteristic: 'b2 with major 3', aliases: ['phrygian dominant', 'phrygiandominant', 'spanish'] },
  { id: 'lydianDominant', name: 'Lydian dominant', intervals: [0, 2, 4, 6, 7, 9, 10], family: 'major', characteristic: '#4 & b7', aliases: ['lydian dominant', 'lydiandominant', 'acoustic'] },
  { id: 'melodicMinor', name: 'Melodic minor', intervals: [0, 2, 3, 5, 7, 9, 11], family: 'minor', characteristic: 'raised 6 & 7', aliases: ['melodic minor', 'melodicminor', 'jazz minor'] },
];
export const MODE_BY_ID: Record<ModeId, ModeDef> = Object.fromEntries(MODES.map((m) => [m.id, m])) as Record<ModeId, ModeDef>;

export interface Key {
  tonic: NoteName;
  mode: ModeId;
}

export function key(tonic: string, mode: ModeId = 'major'): Key {
  const t = parseNote(tonic);
  if (!t) throw new Error(`Bad tonic: ${tonic}`);
  return { tonic: t, mode };
}

/** Parse "C major", "F# dorian", "Am", "Bb minor". */
export function parseKey(s: string): Key | null {
  const m = /^\s*([A-Ga-g][#♯b♭]?)\s*(.*)$/.exec(s);
  if (!m) return null;
  const tonic = parseNote(m[1]);
  if (!tonic) return null;
  const rest = m[2].trim().toLowerCase();
  const mode = MODES.find((md) => md.aliases.includes(rest));
  if (!mode) return null;
  return { tonic, mode: mode.id };
}

export function keyName(k: Key, unicode = true): string {
  const md = MODE_BY_ID[k.mode];
  const label = k.mode === 'major' ? 'major' : k.mode === 'minor' ? 'minor' : md.name;
  return `${noteName(k.tonic, unicode)} ${label}`;
}

export function tonicPc(k: Key): number {
  return pc(k.tonic);
}

export function scaleNotes(k: Key): NoteName[] {
  const t = pc(k.tonic);
  return MODE_BY_ID[k.mode].intervals.map((iv, i) => spell(k.tonic.letter + i, t + iv));
}

export function scalePcs(k: Key): number[] {
  const t = pc(k.tonic);
  return MODE_BY_ID[k.mode].intervals.map((iv) => mod(t + iv, 12));
}

export function inScale(k: Key, pitch: number): boolean {
  return scalePcs(k).includes(mod(pitch, 12));
}

/** Spell any pitch class in the context of a key (scale notes keep their letter; chromatic notes use b3/b6/b7/b2/#4 conventions). */
export function spellInKey(k: Key, pitch: number): NoteName {
  const notes = scaleNotes(k);
  const hit = notes.find((n) => pc(n) === mod(pitch, 12));
  if (hit) return hit;
  const off = mod(pitch - pc(k.tonic), 12);
  // major-relative degree conventions: 1:b2 3:b3 6:#4 8:b6 10:b7 ; others fall back to nearest
  const degreeFor: Record<number, number> = { 0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 5, 9: 5, 10: 6, 11: 6 };
  const n = spell(k.tonic.letter + degreeFor[off], pitch);
  if (Math.abs(n.acc) <= 1) return n;
  // avoid double accidentals: try neighbouring letters
  for (const d of [-1, 1]) {
    const alt = spell(k.tonic.letter + degreeFor[off] + d, pitch);
    if (Math.abs(alt.acc) <= 1) return alt;
  }
  return n;
}

/** Diatonic triads (or sevenths) stacked in thirds on each scale degree. */
export function diatonicChords(k: Key, sevenths = false): Chord[] {
  const notes = scaleNotes(k);
  const pcs = notes.map(pc);
  const out: Chord[] = [];
  for (let i = 0; i < 7; i++) {
    const idx = sevenths ? [0, 2, 4, 6] : [0, 2, 4];
    const ivs = idx.map((s) => mod(pcs[(i + s) % 7] - pcs[i], 12));
    let q: QualityId | null = qualityFromIntervals(ivs);
    if (!q && sevenths) q = qualityFromIntervals(ivs.slice(0, 3));
    if (!q) q = ivs[1] === 3 ? 'min' : 'maj';
    out.push({ root: notes[i], quality: q });
  }
  return out;
}

/** Twelve tonic choices for pickers, spelled conventionally for the mode family. */
export function tonicChoices(mode: ModeId): string[] {
  return MODE_BY_ID[mode].family === 'major'
    ? ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
    : ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
}

export { LETTERS };
