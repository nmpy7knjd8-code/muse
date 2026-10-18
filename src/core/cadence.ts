// Backward cadence finder: pick where you want to land, get the strongest ways to arrive there.
// Searches backwards from the destination over key + target-relative approach chords, scoring each
// path by the tension model's release into the target, how natural each step is to the suggestion
// engine, and a build-then-land tension shape. Framework-free.
import { Chord, chordSymbol, QualityId } from './chords';
import { pc, spell } from './notes';
import { colourPaletteChords, secondaryPaletteChords } from './palette';
import { Key, diatonicChords } from './scales';
import type { SuggestionEngine } from './suggest';
import { progressionTension, type TensionStyleId } from './harmonyTension';

export type ApproachKind = 'dominant' | 'leading' | 'plagal' | 'minorPlagal' | 'tritone' | 'backdoor' | 'lift' | 'supertonic' | 'colour';
export const APPROACH_LABEL: Record<ApproachKind, { title: string; why: string }> = {
  dominant: { title: 'Dominant pull', why: 'A V chord a fifth above leans hard into the target — the classic “here it comes”.' },
  leading: { title: 'Leading-tone squeeze', why: 'A diminished chord a half-step below crowds every voice toward the target.' },
  plagal: { title: 'Plagal (amen)', why: 'Arriving from a fourth above is gentle and open — church “amen”, anthem endings.' },
  minorPlagal: { title: 'Minor plagal', why: 'The minor iv borrows a sigh from the parallel minor right before home.' },
  tritone: { title: 'Side-slip', why: 'A chord a half-step above slides down into the target — jazzy tritone-sub glide.' },
  backdoor: { title: 'Backdoor', why: 'From a whole step below (♭VII) — rock / soul arrival that skips the obvious V.' },
  lift: { title: 'Deceptive lift', why: 'From ♭VI the bass rises two half-steps — cinematic, a little bittersweet.' },
  supertonic: { title: 'Step down', why: 'A minor chord a step above walks down into the target — soft and conversational.' },
  colour: { title: 'Colour route', why: 'An unexpected neighbour that still lands convincingly.' },
};

export interface Approach { kind: ApproachKind; chords: Chord[]; release: number; score: number; levels: number[] }

/** Chord `semis` above `target`'s root, spelled `steps` letters up. */
function rel(target: Chord, steps: number, semis: number, quality: QualityId): Chord {
  return { root: spell((target.root.letter + steps) % 7, (pc(target.root) + semis) % 12), quality };
}

/** Classify the final move (last approach chord → target). */
export function approachKind(from: Chord, to: Chord): ApproachKind {
  const d = (pc(from.root) - pc(to.root) + 12) % 12;
  const q = from.quality;
  const dom = q === 'maj' || q === '7' || q === '9' || q === '7b9' || q === '7#9' || q === '7sus4' || q === 'aug7';
  const dim = q === 'dim' || q === 'dim7' || q === 'm7b5';
  if (d === 7 && dom) return 'dominant';
  if (d === 11 && dim) return 'leading';
  if (d === 5 && (q === 'min' || q === 'm6' || q === 'm7')) return 'minorPlagal';
  if (d === 5 && (q === 'maj' || q === 'maj7' || q === 'add9' || q === '6')) return 'plagal';
  if (d === 1 && (dom || q === 'maj7')) return 'tritone';
  if (d === 10 && (q === 'maj' || q === '7' || q === 'add9')) return 'backdoor';
  if (d === 8 && (q === 'maj' || q === 'maj7' || q === 'add9')) return 'lift';
  if (d === 2 && (q === 'min' || q === 'm7' || q === 'm9')) return 'supertonic';
  return 'colour';
}

function approachPool(k: Key, target: Chord): Chord[] {
  const out = new Map<string, Chord>();
  const add = (c: Chord) => { const s = chordSymbol(c); if (s !== chordSymbol(target) && !out.has(s)) out.set(s, c); };
  [...diatonicChords(k), ...diatonicChords(k, true), ...secondaryPaletteChords(k), ...colourPaletteChords(k)].forEach(add);
  [
    rel(target, 4, 7, '7'), rel(target, 4, 7, 'maj'), rel(target, 4, 7, '7sus4'), rel(target, 4, 7, '7b9'),
    rel(target, 6, 11, 'dim7'), rel(target, 6, 11, 'm7b5'),
    rel(target, 3, 5, 'maj'), rel(target, 3, 5, 'min'), rel(target, 3, 5, 'm6'),
    rel(target, 1, 1, '7'), rel(target, 1, 1, 'maj7'),
    rel(target, 6, 10, 'maj'), rel(target, 6, 10, '7'), rel(target, 5, 8, 'maj'), rel(target, 5, 8, 'maj7'),
    rel(target, 1, 2, 'm7'), rel(target, 1, 2, 'min'),
    // ii of the target's dominant, so ii–V–target can form
    rel(target, 1, 2, 'm7b5'),
  ].forEach(add);
  return [...out.values()];
}

/**
 * Up to `max` approaches (one per kind, best first) of `length` chords that land on `target`.
 * `before` is optional context (chords already in the song before the approach).
 */
export function findApproaches(
  engine: SuggestionEngine, k: Key, target: Chord,
  opts: { length?: number; before?: Chord[]; style?: TensionStyleId; adventure?: number; max?: number } = {},
): Approach[] {
  const L = Math.max(1, Math.min(4, opts.length ?? 2));
  const before = (opts.before ?? []).slice(-2);
  const settings = { style: opts.style ?? 'pop', adventure: opts.adventure ?? 0.4, target: null };
  const pool = approachPool(k, target);
  const diatonic = new Set([...diatonicChords(k), ...diatonicChords(k, true)].map((c) => chordSymbol(c)));
  const nat = new Map<string, Map<string, number>>();
  const natural = (a: Chord | undefined, b: Chord): number => {
    const id = a ? chordSymbol(a) : '∅';
    let m = nat.get(id);
    if (!m) {
      const sugg = engine.suggestChords({ key: k, progression: a ? [a] : [], adventure: settings.adventure, limit: 40, tensionStyle: null });
      m = new Map(sugg.map((s, i) => [s.symbol, 1 - i / 40]));
      nat.set(id, m);
    }
    return m.get(chordSymbol(b)) ?? 0;
  };
  type P = { chords: Chord[]; partial: number };
  // Backward beam: grow [x_1 … x_L, target] from the target outwards.
  let beams: P[] = [{ chords: [target], partial: 0 }];
  for (let step = 0; step < L; step++) {
    const next: P[] = [];
    for (const b of beams) {
      for (const c of pool) {
        if (chordSymbol(c) === chordSymbol(b.chords[0]!)) continue;
        if (b.chords.some((x) => chordSymbol(x) === chordSymbol(c))) continue;
        const sameRoot = pc(c.root) === pc(b.chords[0]!.root);
        if (step === 0 && sameRoot) continue; // Fm → F is a mode flip, not an approach
        const into = natural(c, b.chords[0]!);
        // the last approach chord matters most; earlier ones should simply flow (and mostly stay in key)
        const w = step === 0 ? 1.4 : 0.8;
        const inKey = diatonic.has(chordSymbol(c));
        const penalty = (sameRoot ? 0.9 : 0) + (step > 0 && !inKey ? 0.3 : 0);
        next.push({ chords: [c, ...b.chords], partial: b.partial + w * into - penalty });
      }
    }
    next.sort((x, y) => y.partial - x.partial);
    // keep diversity on the final-move kind
    const perKind = new Map<string, number>();
    beams = next.filter((p) => {
      const kind = approachKind(p.chords[p.chords.length - 2]!, target);
      const n = perKind.get(kind) ?? 0;
      if (n >= 6) return false;
      perKind.set(kind, n + 1);
      return true;
    }).slice(0, 48);
  }
  const scored: Approach[] = beams.map((b) => {
    const seq = [...before, ...b.chords];
    const pts = progressionTension(seq, k, settings).points.slice(before.length);
    const levels = pts.map((p) => p.level);
    const release = pts[pts.length - 1]!.release;
    const peak = Math.max(...levels.slice(0, -1));
    const drop = Math.max(0, peak - levels[levels.length - 1]!);
    const first = before.length ? natural(before[before.length - 1], b.chords[0]!) : 0.5;
    const score = 2.2 * release + 1.5 * drop + b.partial / (1.4 + 0.8 * (L - 1)) + 0.3 * first;
    return { kind: approachKind(b.chords[b.chords.length - 2]!, target), chords: b.chords, release, score, levels };
  }).sort((x, y) => y.score - x.score);
  const seen = new Set<ApproachKind>();
  const out: Approach[] = [];
  for (const a of scored) {
    if (seen.has(a.kind)) continue;
    seen.add(a.kind); out.push(a);
    if (out.length >= (opts.max ?? 5)) break;
  }
  return out;
}
