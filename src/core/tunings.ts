// Guitar tunings (low string → high, MIDI). Plain data + helpers; guitar.ts re-frets chords for any of these.
// Artist presets cite where the tuning is documented (see notes); they reuse the same string sets.
import { mod } from './notes';

export type TuningKind = 'standard' | 'shifted' | 'drop' | 'open' | 'modal';
export interface Tuning {
  id: string;
  name: string;
  /** low string (6) → high string (1), MIDI */
  strings: number[];
  kind: TuningKind;
  group: 'Common' | 'Artist presets';
  /** short note shown under the selector */
  note?: string;
}

const STD = [40, 45, 50, 55, 59, 64];
const shift = (d: number) => STD.map((m) => m + d);

export const TUNINGS: Tuning[] = [
  { id: 'standard', name: 'Standard', strings: STD, kind: 'standard', group: 'Common' },
  { id: 'halfDown', name: 'Half-step down', strings: shift(-1), kind: 'shifted', group: 'Common', note: 'Same shapes as standard, everything sounds a semitone lower.' },
  { id: 'fullDown', name: 'Full-step down', strings: shift(-2), kind: 'shifted', group: 'Common', note: 'Same shapes as standard, a whole step lower.' },
  { id: 'dropD', name: 'Drop D', strings: [38, 45, 50, 55, 59, 64], kind: 'drop', group: 'Common', note: 'Low D: one-finger power chords on the bottom three strings.' },
  { id: 'dropC', name: 'Drop C', strings: [36, 43, 48, 53, 57, 62], kind: 'drop', group: 'Common', note: 'Drop D a whole step lower — heavy one-finger fifths.' },
  { id: 'dropB', name: 'Drop B', strings: [35, 42, 47, 52, 56, 61], kind: 'drop', group: 'Common', note: 'Very low drop tuning (modern metal).' },
  { id: 'dadgad', name: 'DADGAD', strings: [38, 45, 50, 55, 57, 62], kind: 'modal', group: 'Common', note: 'Dsus4 open — droning, Celtic/folk colour; neither major nor minor.' },
  { id: 'openG', name: 'Open G', strings: [38, 43, 50, 55, 59, 62], kind: 'open', group: 'Common', note: 'Open strings ring a G chord; barre one fret for any major chord.' },
  { id: 'openD', name: 'Open D', strings: [38, 45, 50, 54, 57, 62], kind: 'open', group: 'Common', note: 'Open strings ring a D chord.' },
  { id: 'openE', name: 'Open E', strings: [40, 47, 52, 56, 59, 64], kind: 'open', group: 'Common', note: 'Open strings ring an E chord (slide guitar favourite).' },
  { id: 'openC', name: 'Open C', strings: [36, 43, 48, 55, 60, 64], kind: 'open', group: 'Common', note: 'Open strings ring a big low C chord.' },
  // Artist presets
  { id: 'toolDropD', name: 'TOOL — Drop D', strings: [38, 45, 50, 55, 59, 64], kind: 'drop', group: 'Artist presets', note: 'Adam Jones writes many riffs in drop D (e.g. “Schism”).' },
  { id: 'sabbathCs', name: 'Black Sabbath — C♯ standard', strings: shift(-3), kind: 'shifted', group: 'Artist presets', note: 'Iommi tuned 1½ steps down from Master of Reality (1971): bigger, heavier, easier on his fingertips.' },
  { id: 'nirvanaEb', name: 'Nirvana — E♭ standard', strings: shift(-1), kind: 'shifted', group: 'Artist presets', note: 'Half-step down, as on much of Nevermind.' },
  { id: 'stonesOpenG', name: 'Keith Richards — open G', strings: [38, 43, 50, 55, 59, 62], kind: 'open', group: 'Artist presets', note: 'Keith often removes the low string and plays one-finger I↔IV moves.' },
  { id: 'joniOpenD', name: 'Joni Mitchell — open D', strings: [38, 45, 50, 54, 57, 62], kind: 'open', group: 'Artist presets', note: 'Her most-used open tuning — “Chelsea Morning”, “Free Man in Paris”, “Cactus Tree”.' },
  { id: 'sonicGGDDGG', name: 'Sonic Youth — G G D D G G', strings: [43, 43, 50, 50, 55, 55], kind: 'open', group: 'Artist presets', note: 'Lee Ranaldo’s “Teen Age Riot” tuning: paired unison strings, drone-heavy.' },
  { id: 'zeppDadgad', name: 'Led Zeppelin — DADGAD', strings: [38, 45, 50, 55, 57, 62], kind: 'modal', group: 'Artist presets', note: 'Jimmy Page’s “Kashmir” tuning.' },
];

export const TUNING_BY_ID: Record<string, Tuning> = Object.fromEntries(TUNINGS.map((t) => [t.id, t]));
export const DEFAULT_TUNING_ID = 'standard';
export const tuningById = (id: string | null | undefined): Tuning => TUNING_BY_ID[id ?? ''] ?? TUNING_BY_ID[DEFAULT_TUNING_ID]!;
export const isTuningId = (id: unknown): id is string => typeof id === 'string' && id in TUNING_BY_ID;

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
/** String letter labels low → high (high string lowercased when it repeats the low one, like E…e). */
export function tuningStringNames(strings: number[]): string[] {
  const n = strings.map((m) => NAMES[mod(m, 12)]!);
  if (n[5] === n[0]) n[5] = n[5]!.toLowerCase();
  return n;
}

/** Semitone offset when every string is shifted equally from standard; null otherwise. */
export function uniformShift(strings: number[]): number | null {
  const d = strings[0]! - STD[0]!;
  return strings.every((m, i) => m - STD[i]! === d) ? d : null;
}

/** Root pitch classes a tuning makes especially easy (open low strings / the open chord), for style nudges. */
export function tuningFriendlyRoots(t: Tuning): number[] {
  if (t.kind === 'standard') return [];
  const low = mod(t.strings[0]!, 12);
  const next = mod(t.strings[1]!, 12);
  return [...new Set([low, next])];
}
