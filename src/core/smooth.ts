// "Smooth it": choose inversions (slash basses) so the bass walks and the voices move as little as
// possible, and score voice-leading smoothness before/after. Framework-free.
import { Chord, chordNotes, chordSymbol, QUALITY_BY_ID } from './chords';
import { mod, pc, type NoteName } from './notes';
import { closeVoicings, pianoVoicing, voiceLeadingCost } from './voicing';

const circ = (a: number, b: number) => { const d = mod(a - b, 12); return Math.min(d, 12 - d); };

/** Bass candidates: root (no slash), 3rd, 5th, and 7th for seventh chords. Existing slash basses stay fixed. */
export function bassOptions(c: Chord): Array<{ bass?: NoteName; rank: number }> {
  if (c.bass && pc(c.bass) !== pc(c.root)) return [{ bass: c.bass, rank: 0 }];
  const notes = chordNotes(c);
  const tones = QUALITY_BY_ID[c.quality].tones;
  const out: Array<{ bass?: NoteName; rank: number }> = [{ rank: 0 }];
  tones.forEach(([steps, semis], i) => {
    if (i === 0) return;
    const n = notes[i]!;
    if (steps === 2) out.push({ bass: n, rank: 1 }); // 3rd → first inversion
    else if (steps === 4) out.push({ bass: n, rank: 2 }); // 5th → second inversion
    else if (steps === 6 && semis >= 10) out.push({ bass: n, rank: 3 }); // 7th in the bass
  });
  return out;
}
const INV_COST = [0, 0.35, 1.0, 0.7];

/** Voice-leading smoothness 0..100 of a progression as it would sound (voice-led upper + bass). */
export function smoothness(chords: Chord[]): number {
  if (chords.length < 2) return 100;
  let prev: number[] | undefined;
  let total = 0, n = 0;
  for (let i = 0; i < chords.length; i++) {
    const v = pianoVoicing(chords[i]!, prev);
    if (prev) {
      const upper = voiceLeadingCost(prev, v) / Math.max(1, v.length);
      const bp = chords[i - 1]!.bass ?? chords[i - 1]!.root, bc = chords[i]!.bass ?? chords[i]!.root;
      total += (upper * v.length + 1.5 * circ(pc(bp), pc(bc))) / (v.length + 1.5);
      n++;
    }
    prev = v;
  }
  const avg = total / n;
  return Math.round(100 * Math.max(0, Math.min(1, 1 - avg / 3.5)));
}

export interface SmoothResult { chords: Chord[]; changed: number[]; before: number; after: number; bassLine: string[] }

/**
 * Pick a bass per chord for a walking, step-wise bass while keeping the upper voices close.
 * DP over (bass option × close voicing) states; first and last chord stay in root position.
 */
export function smoothInversions(chords: Chord[]): SmoothResult {
  const n = chords.length;
  const before = smoothness(chords);
  const line = (cs: Chord[]) => cs.map((c) => chordSymbol({ root: c.bass ?? c.root, quality: 'maj' }));
  if (n < 2) return { chords, changed: [], before, after: before, bassLine: line(chords) };
  type St = { chord: Chord; bassPc: number; rank: number; voicing: number[] };
  const states: St[][] = chords.map((c) => bassOptions(c).flatMap((o) => {
    const { bass: _drop, ...rest } = c;
    const chord: Chord = o.bass ? { ...rest, bass: o.bass } : rest;
    return closeVoicings(chord).map((v) => ({ chord, bassPc: pc(o.bass ?? c.root), rank: o.rank, voicing: v }));
  }));
  const place = (i: number, st: St) => {
    const ends = (i === 0 || i === n - 1) && !chords[i]!.bass ? (st.rank ? 3 : 0) : 0;
    // first chord: prefer a voicing around middle C
    const reg = i === 0 ? Math.abs((st.voicing[0]! + st.voicing[st.voicing.length - 1]!) / 2 - 64) * 0.08 : 0;
    return INV_COST[st.rank]! + ends + reg;
  };
  const cost: number[][] = states.map((ss) => ss.map(() => Infinity));
  const back: number[][] = states.map((ss) => ss.map(() => -1));
  states[0]!.forEach((st, j) => { cost[0]![j] = place(0, st); });
  for (let i = 1; i < n; i++) {
    states[i]!.forEach((st, j) => {
      const pl = place(i, st);
      states[i - 1]!.forEach((pv, q) => {
        if (cost[i - 1]![q] === Infinity) return;
        const d = circ(pv.bassPc, st.bassPc);
        // bass: steps are the goal, a held bass is fine, leaps cost more the bigger they get
        const bassMove = d === 0 ? 0.4 : d <= 2 ? 0 : d <= 4 ? 0.8 : 1.4 + 0.2 * (d - 5);
        const upper = voiceLeadingCost(pv.voicing, st.voicing) / Math.max(1, st.voicing.length);
        const c = cost[i - 1]![q]! + 1.2 * bassMove + 0.6 * upper + pl;
        if (c < cost[i]![j]!) { cost[i]![j] = c; back[i]![j] = q; }
      });
    });
  }
  let j = cost[n - 1]!.indexOf(Math.min(...cost[n - 1]!));
  const pick: number[] = new Array(n);
  for (let i = n - 1; i >= 0; i--) { pick[i] = j; j = back[i]![j]!; }
  let out: Chord[] = pick.map((jj, i) => states[i]![jj]!.chord);
  // Polish against what playback actually voices (greedy voice-leading): hill-climb single-bar bass
  // changes on smoothness minus an inversion tax (so it doesn't turn everything into pedal 6/4s).
  const opts = chords.map((c) => bassOptions(c).map((o) => { const { bass: _d, ...rest } = c; return { chord: (o.bass ? { ...rest, bass: o.bass } : rest) as Chord, rank: o.rank }; }));
  const tax = [0, 1.5, 6, 3];
  const objective = (cs: Chord[], ranks: number[]) => smoothness(cs) - ranks.reduce((t, r) => t + tax[r]!, 0);
  const climb = (start: number[]) => {
    let ranksIdx = start.slice();
    const build = (idx: number[]) => idx.map((k, i) => opts[i]![k]!.chord);
    let best = objective(build(ranksIdx), ranksIdx.map((k, i) => opts[i]![k]!.rank));
    for (let pass = 0; pass < 3; pass++) {
      let improved = false;
      for (let i = 1; i < n - 1; i++) {
        for (let k = 0; k < opts[i]!.length; k++) {
          if (k === ranksIdx[i]) continue;
          const trial = ranksIdx.slice(); trial[i] = k;
          const sc = objective(build(trial), trial.map((kk, ii) => opts[ii]![kk]!.rank));
          if (sc > best + 0.5) { ranksIdx = trial; best = sc; improved = true; }
        }
      }
      if (!improved) break;
    }
    return { idx: ranksIdx, best };
  };
  const fromDp = out.map((c, i) => Math.max(0, opts[i]!.findIndex((o) => chordSymbol(o.chord) === chordSymbol(c))));
  const a = climb(fromDp), b = climb(chords.map(() => 0));
  const win = a.best >= b.best ? a : b;
  out = win.idx.map((k, i) => opts[i]![k]!.chord);
  let after = smoothness(out);
  // Never make it worse: fall back to the original if the inversions don't actually help.
  if (after < before) { out = chords; after = before; }
  const changed = out.flatMap((c, i) => (chordSymbol(c) !== chordSymbol(chords[i]!) ? [i] : []));
  return { chords: out, changed, before, after, bassLine: line(out) };
}
