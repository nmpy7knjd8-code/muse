// Piano voicings (voice-led), right/left-hand fingerings and voice-leading analysis.
import { Chord, chordNotes, QUALITY_BY_ID } from './chords';
import { mod, pc } from './notes';

export interface VoicingOptions {
  /** Lowest allowed note for the bottom voice of the right hand. */
  low?: number;
  /** Highest allowed top note. */
  high?: number;
  /** Max number of voices (drops the 5th first on 5-note chords). */
  maxVoices?: number;
}

/** Pitch classes to voice, dropping the perfect 5th first when a chord has more tones than voices. */
export function voicePcs(chord: Chord, maxVoices = 4): number[] {
  const def = QUALITY_BY_ID[chord.quality];
  const notes = chordNotes(chord).map(pc);
  let tones = def.tones.map((t, i) => ({ pc: notes[i], semis: t[1] }));
  while (tones.length > maxVoices) {
    const fifth = tones.findIndex((t) => t.semis === 7);
    if (fifth >= 0) tones.splice(fifth, 1);
    else tones.splice(tones.length - 2, 1);
  }
  return [...new Set(tones.map((t) => t.pc))];
}

/** All close-position voicings (each inversion) whose notes fit in [low, high]. */
export function closeVoicings(chord: Chord, opts: VoicingOptions = {}): number[][] {
  const low = opts.low ?? 52;
  const high = opts.high ?? 79;
  const pcs = voicePcs(chord, opts.maxVoices ?? 4);
  const out: number[][] = [];
  for (let inv = 0; inv < pcs.length; inv++) {
    const order = pcs.slice(inv).concat(pcs.slice(0, inv));
    for (let base = low; base < low + 12; base++) {
      if (mod(base, 12) !== order[0]) continue;
      for (let oct = 0; oct < 3; oct++) {
        const v: number[] = [base + 12 * oct];
        for (let i = 1; i < order.length; i++) {
          let n = v[i - 1] + 1;
          while (mod(n, 12) !== order[i]) n++;
          v.push(n);
        }
        if (v[0] >= low && v[v.length - 1] <= high) out.push(v);
      }
    }
  }
  return out;
}

/** Total semitone movement between two voicings using the optimal voice assignment. */
export function voiceLeadingCost(a: number[], b: number[]): number {
  return voiceLeading(a, b).reduce((s, l) => s + Math.abs(l.delta), 0);
}

/**
 * Pick the close-position voicing of `chord` nearest to `previous` (smoothest voice leading).
 * Without a previous voicing, prefers root position centred around middle C.
 */
export function pianoVoicing(chord: Chord, previous?: number[], opts: VoicingOptions = {}): number[] {
  const cands = closeVoicings(chord, opts);
  if (!cands.length) return [];
  const rootPc = pc(chord.root);
  let best = cands[0];
  let bestCost = Infinity;
  for (const v of cands) {
    let cost: number;
    if (previous && previous.length) {
      cost = voiceLeadingCost(previous, v);
      cost += Math.abs(v[0] - previous[0]) * 0.05; // gentle preference for keeping register
    } else {
      const centre = (v[0] + v[v.length - 1]) / 2;
      cost = Math.abs(centre - 64) + (mod(v[0], 12) === rootPc ? 0 : 3);
    }
    if (cost < bestCost - 1e-9) {
      bestCost = cost;
      best = v;
    }
  }
  return best;
}

/** Bass note for a left-hand root (or slash bass) in octave 2–3. */
export function bassNote(chord: Chord, low = 40): number {
  const p = chord.bass ? pc(chord.bass) : pc(chord.root);
  let n = low;
  while (mod(n, 12) !== p) n++;
  return n;
}

/**
 * Standard block-chord fingering, returned bottom-to-top.
 * Right hand: root position 1-3-5, first inversion 1-2-5, second inversion 1-3-5; 7th chords 1-2-3-5.
 * Left hand: root position 5-3-1, first inversion 5-3-1, second inversion 5-2-1; 7th chords 5-3-2-1.
 */
export function pianoFingering(notes: number[], hand: 'R' | 'L' = 'R'): number[] {
  const sorted = [...notes].sort((x, y) => x - y);
  const n = sorted.length;
  const gaps = sorted.slice(1).map((x, i) => x - sorted[i]);
  const spanFinger = (g: number) => (g >= 7 ? 5 : g >= 5 ? 4 : g >= 3 ? 3 : 2);
  if (n === 0) return [];
  if (n === 1) return [hand === 'R' ? 1 : 5];
  if (hand === 'R') {
    if (n === 2) return [1, spanFinger(gaps[0])];
    if (n === 3) return gaps[1] >= 5 ? [1, 2, 5] : [1, 3, 5];
    if (n === 4) return [1, 2, 3, gaps[2] >= 3 ? 5 : 4];
    return [1, 2, 3, 4, 5].slice(0, n);
  }
  if (n === 2) return [spanFinger(gaps[0]), 1];
  if (n === 3) return gaps[0] >= 5 ? [5, 2, 1] : [5, 3, 1];
  if (n === 4) return [gaps[0] >= 3 ? 5 : 4, 3, 2, 1];
  return [5, 4, 3, 2, 1].slice(5 - n);
}

export type MoveKind = 'common' | 'half' | 'whole' | 'leap';

export interface VoiceLine {
  from: number;
  to: number;
  delta: number;
  kind: MoveKind;
}

export function moveKind(delta: number): MoveKind {
  const a = Math.abs(delta);
  return a === 0 ? 'common' : a === 1 ? 'half' : a === 2 ? 'whole' : 'leap';
}

/**
 * Optimal voice assignment between two voicings (minimum total movement). When the chords have
 * different sizes, a voice may split (one-to-two) or merge (two-to-one).
 * Returns one line per voice of the larger chord, sorted by source pitch.
 */
export function voiceLeading(a: number[], b: number[]): VoiceLine[] {
  if (!a.length || !b.length) return [];
  const big = a.length >= b.length ? a : b;
  const small = a.length >= b.length ? b : a;
  const aIsBig = big === a;
  let best: number[] | null = null;
  let bestCost = Infinity;
  const assign: number[] = new Array(big.length).fill(0);
  const rec = (i: number) => {
    if (i === big.length) {
      // every voice of the smaller chord must be used
      const used = new Set(assign);
      if (used.size !== small.length) return;
      let cost = 0;
      for (let k = 0; k < big.length; k++) cost += Math.abs(big[k] - small[assign[k]]);
      // tie-break: penalise crossings
      for (let k = 1; k < big.length; k++) if (small[assign[k]] < small[assign[k - 1]]) cost += 0.5;
      if (cost < bestCost) {
        bestCost = cost;
        best = [...assign];
      }
      return;
    }
    for (let j = 0; j < small.length; j++) {
      assign[i] = j;
      rec(i + 1);
    }
  };
  rec(0);
  const map = best ?? big.map((_, i) => Math.min(i, small.length - 1));
  const lines = big.map((note, k) => {
    const other = small[map[k]];
    const from = aIsBig ? note : other;
    const to = aIsBig ? other : note;
    return { from, to, delta: to - from, kind: moveKind(to - from) };
  });
  return lines.sort((x, y) => x.from - y.from || x.to - y.to);
}

export function commonTones(a: Chord, b: Chord): number {
  const pa = new Set(chordNotes(a).map(pc));
  return [...new Set(chordNotes(b).map(pc))].filter((p) => pa.has(p)).length;
}
