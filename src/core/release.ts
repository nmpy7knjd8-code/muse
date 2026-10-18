// Release-moment finder (idea 12): read the tension model's debt curve for a progression, find where
// tension peaks and how long it builds, flag releases that come too early (nothing built yet), and
// suggest where the release should land plus three ways to land it (strongest / softer / surprising).
import { Chord, chordSymbol } from './chords';
import { candidateTension, progressionTension, type TensionStyleId } from './harmonyTension';
import { mod, pc } from './notes';
import { parseRoman, romanOf } from './roman';
import { Key, MODE_BY_ID } from './scales';

export type ReleaseKind = 'strongest' | 'softer' | 'surprising';
export type ReleaseStatus = 'short' | 'flat' | 'overdue' | 'placed' | 'move';
export interface ReleaseOption { kind: ReleaseKind; chord: Chord; roman: string; release: number; debtAfter: number; why: string }
export interface ExistingRelease { index: number; kind: 'earned' | 'early'; drop: number }
export interface ReleaseReport {
  status: ReleaseStatus;
  levels: number[];
  debts: number[];
  ceiling: number;
  rest: number;
  peak: { index: number; debt: number } | null;
  build: { from: number; to: number } | null;
  releases: ExistingRelease[];
  /** Where the release should land: index of the chord to replace, or chords.length to append. */
  best: { index: number; append: boolean } | null;
  options: ReleaseOption[];
  /** Optional set-up: a dominant on the bar before `best` for a firmer landing. */
  setup: { index: number; chord: Chord; why: string } | null;
  message: string;
}

const KIND_WHY: Record<ReleaseKind, string> = {
  strongest: 'Lands home and clears the built-up tension.',
  softer: 'Lets some air out but keeps a little colour hanging.',
  surprising: 'A deceptive turn — releases, but somewhere you didn’t expect.',
};

function candidates(k: Key): Array<{ rn: string; kind: ReleaseKind; bass3?: boolean }> {
  const minor = MODE_BY_ID[k.mode].family === 'minor';
  return minor
    ? [
      { rn: 'i', kind: 'strongest' }, { rn: 'i7', kind: 'strongest' },
      { rn: 'i', kind: 'softer', bass3: true }, { rn: 'iv', kind: 'softer' }, { rn: 'bIII', kind: 'softer' },
      { rn: 'bVI', kind: 'surprising' }, { rn: 'I', kind: 'surprising' }, { rn: 'bVImaj7', kind: 'surprising' }, { rn: 'bII', kind: 'surprising' },
    ]
    : [
      { rn: 'I', kind: 'strongest' }, { rn: 'Imaj7', kind: 'strongest' },
      { rn: 'I', kind: 'softer', bass3: true }, { rn: 'IV', kind: 'softer' }, { rn: 'Iadd9', kind: 'softer' },
      { rn: 'vi', kind: 'surprising' }, { rn: 'bVI', kind: 'surprising' }, { rn: 'iii', kind: 'surprising' }, { rn: 'bVII', kind: 'surprising' },
    ];
}
const withThirdBass = (c: Chord, k: Key): Chord => {
  const third = MODE_BY_ID[k.mode].family === 'minor' ? 3 : 4;
  const p = mod(pc(c.root) + third, 12);
  // spell the 3rd two letters above the root
  const letter = (c.root.letter + 2) % 7;
  const nat = [0, 2, 4, 5, 7, 9, 11][letter]!;
  let acc = mod(p - nat + 6, 12) - 6;
  if (Math.abs(acc) > 2) acc = 0;
  return { ...c, bass: { letter, acc } };
};

/** Home threshold: chords below this tension level feel like arriving (tonic-like). */
export const HOME_LEVEL = 0.18;
const EARNED = 0.3;

/**
 * Build-up "pressure" per chord from the tension model's levels: it accumulates (with leak) while you stay
 * away from home and falls back when you arrive. Unlike the model's debt (corpus-calibrated and often 0 for
 * plain pop loops) this rises visibly over a 3–4 bar departure, which is what a release needs to pay off.
 */
export function buildPressure(levels: number[]): number[] {
  const out: number[] = [];
  let pr = 0;
  for (const l of levels) {
    pr = l >= HOME_LEVEL ? 0.8 * pr + Math.max(0, l - 0.12) : 0.25 * pr;
    out.push(pr);
  }
  return out;
}

export function findReleaseMoments(chords: Chord[], k: Key, o: { style?: TensionStyleId; adventure?: number } = {}): ReleaseReport {
  const settings = { style: o.style ?? 'pop', adventure: o.adventure ?? 0.5, target: null };
  const st = progressionTension(chords, k, settings);
  const L = st.limits;
  const levels = st.points.map((p) => p.level);
  const pressure = buildPressure(levels);
  const top = Math.max(0.6, ...pressure);
  const base = { levels, debts: pressure.map((x) => x / top), ceiling: 1, rest: L.rest };
  const n = chords.length;
  if (n < 3) {
    return { ...base, status: 'short', peak: null, build: null, releases: [], best: null, options: [], setup: null, message: 'Add at least three chords — there needs to be something to release.' };
  }
  let pi = 0;
  pressure.forEach((d, i) => { if (d > pressure[pi]!) pi = i; });
  const peak = pressure[pi]!;
  let from = pi;
  while (from > 0 && levels[from - 1]! >= HOME_LEVEL) from--;
  const releases: ExistingRelease[] = [];
  for (let i = 1; i < n; i++) {
    if (levels[i]! < HOME_LEVEL && levels[i - 1]! >= HOME_LEVEL) {
      const before = pressure[i - 1]!;
      releases.push({ index: i, kind: before >= EARNED ? 'earned' : 'early', drop: before - pressure[i]! });
    }
  }
  if (peak < 0.2) {
    return {
      ...base, status: 'flat', peak: { index: pi, debt: peak }, build: null, releases, best: null, options: [], setup: null,
      message: 'Very little tension builds here, so there’s nothing to release yet. Try a IV–V, a borrowed chord or a sus before you head home.',
    };
  }
  // Best landing: after the peak, at a phrase end if possible, weighted by how much pressure is waiting.
  const phraseEnd = (i: number) => i % 4 === 0 || i === n;
  let best = n, bestV = -Infinity;
  for (let i = pi + 1; i <= n; i++) {
    const v = pressure[i - 1]! + (phraseEnd(i) ? 0.12 : 0) - 0.05 * (i - pi - 1);
    if (v > bestV) { bestV = v; best = i; }
  }
  const append = best >= n;
  const prefix = progressionTension(chords.slice(0, best), k, settings);
  const prev = chords[best - 1] ?? null;
  const tonicPc = pc(k.tonic);
  const scored = candidates(k).map((c) => {
    let chord = parseRoman(c.rn, k);
    if (!chord) return null;
    if (c.bass3) chord = withThirdBass(chord, k);
    const t = candidateTension(prefix, prev, chord, k);
    return { ...c, chord, release: t.release, debtAfter: t.debtAfter, level: t.level };
  }).filter((x): x is NonNullable<typeof x> => !!x && !(prev && pc(x.chord.root) === pc(prev.root) && x.chord.quality === prev.quality));
  const pick = (kind: ReleaseKind, score: (x: (typeof scored)[number]) => number) =>
    scored.filter((x) => x.kind === kind).sort((a, b) => score(b) - score(a))[0];
  const strongest = pick('strongest', (x) => x.release - 1.5 * x.level);
  const softer = pick('softer', (x) => 0.6 * x.release - Math.abs(x.level - 0.2));
  const surprising = pick('surprising', (x) => x.release - Math.abs(x.level - 0.28) - (pc(x.chord.root) === tonicPc ? 0.1 : 0));
  const options: ReleaseOption[] = [strongest, softer, surprising].filter((x): x is NonNullable<typeof x> => !!x).map((x) => ({
    kind: x.kind, chord: x.chord, roman: romanOf(x.chord, k), release: x.release, debtAfter: x.debtAfter, why: KIND_WHY[x.kind],
  }));
  // Set-up: if the bar before the landing doesn't pull home, a V7 there makes the release land harder.
  let setup: ReleaseReport['setup'] = null;
  const v7 = parseRoman('V7', k)!;
  if (strongest && best >= 2 && prev && pc(prev.root) !== pc(v7.root) && levels[best - 1]! >= HOME_LEVEL) {
    const into = candidateTension(prefix, prev, strongest.chord, k).release;
    if (into < 0.55) setup = { index: best - 1, chord: v7, why: `${chordSymbol(prev, true)} doesn’t pull home strongly; a ${chordSymbol(v7, true)} there makes the landing firmer.` };
  }
  const atBest = releases.find((r) => r.index === best && r.kind === 'earned');
  const early = releases.filter((r) => r.kind === 'early');
  const loopsHome = levels[0]! < HOME_LEVEL;
  const endsAway = levels[n - 1]! >= HOME_LEVEL;
  const status: ReleaseStatus = atBest ? 'placed' : append && endsAway && !loopsHome ? 'overdue' : 'move';
  const bar = (i: number) => `bar ${i + 1}`;
  const span = from < pi ? `builds from ${bar(from)} to ${bar(pi)}` : `peaks at ${bar(pi)}`;
  let message = status === 'placed'
    ? `Tension ${span} and your release at ${bar(best)} lands right where it should.`
    : status === 'overdue'
      ? `Tension ${span} and never comes home — add a release after the last bar.`
      : append
        ? `Tension ${span}; the release belongs right after the last bar${loopsHome ? ' — which is what happens when the loop returns to bar 1' : ''}.`
        : `Tension ${span}; the release lands best at ${bar(best)}.`;
  if (early.length && status !== 'placed') message += ` The arrival at ${bar(early[0]!.index)} comes before much has built, so it can feel a little early.`;
  return { ...base, status, peak: { index: pi, debt: peak / top }, build: { from, to: pi }, releases, best: { index: best, append }, options, setup, message };
}
