// Treble-staff geometry for chord/note graphics (pure; no DOM).
import { NoteName, defaultSpelling, midiOctave } from './notes';

/** Diatonic staff step: C0=0, D0=1, … B0=6, C1=7, … (E4 = bottom treble line = 30). */
export function staffStep(midi: number, spelling?: NoteName): number {
  const n = spelling ?? defaultSpelling(midi);
  // B♯ / C♭ sit in the neighbouring octave's letter slot
  const pcLetter = [0, 2, 4, 5, 7, 9, 11][n.letter];
  const natural = pcLetter + n.acc;
  const octave = midiOctave(midi) + (natural < 0 ? 1 : natural > 11 ? -1 : 0);
  return n.letter + octave * 7;
}

/** Bottom treble line (E4). */
export const TREBLE_BOTTOM_STEP = 30;

/**
 * Vertical position of a notehead, measured down from the TOP staff line (F5 = 0), in px for a staff
 * whose lines are `gap` px apart. E4 (bottom line) = 4·gap; each diatonic step is gap/2.
 */
export function trebleY(step: number, gap: number): number {
  return 4 * gap + (TREBLE_BOTTOM_STEP - step) * (gap / 2);
}
