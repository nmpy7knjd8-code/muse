// Key detection from a chord progression (and optional melody notes).
import { Chord, chordPcs, triadClass } from './chords';
import { mod, pc, parseNote } from './notes';
import { Key, ModeId, diatonicChords, scalePcs, tonicChoices } from './scales';

export interface KeyCandidate {
  key: Key;
  score: number;
  confidence: number; // 0..1 softmax over candidates
}

// Krumhansl–Kessler key profiles (for melody notes).
const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlation(a: number[], b: number[]): number {
  const ma = a.reduce((x, y) => x + y, 0) / a.length;
  const mb = b.reduce((x, y) => x + y, 0) / b.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

function scoreKey(k: Key, chords: Chord[], melody: number[]): number {
  const t = pc(k.tonic);
  const scale = scalePcs(k);
  const dia = diatonicChords(k);
  const minorFamily = k.mode === 'minor';
  let score = 0;
  chords.forEach((c, i) => {
    const pcs = chordPcs(c);
    const inScale = pcs.filter((p) => scale.includes(p)).length / pcs.length;
    score += inScale;
    const rootPc = pc(c.root);
    const cls = triadClass(c.quality);
    const d = dia.findIndex((x) => pc(x.root) === rootPc);
    if (d >= 0 && triadClass(dia[d].quality) === cls) score += 1;
    // harmonic-minor dominant (V or V7 with raised leading tone) counts as diatonic in minor
    if (minorFamily && mod(rootPc - t, 12) === 7 && cls === 'maj') score += 0.9;
    if (minorFamily && mod(rootPc - t, 12) === 11 && cls === 'dim') score += 0.6;
    const isTonic = rootPc === t && (cls === (minorFamily ? 'min' : 'maj'));
    // Songs usually start on the tonic; the last chord is only a weak cue because the user is still writing.
    if (isTonic && i === 0) score += 2.5;
    if (isTonic && i === chords.length - 1) score += chords.length >= 4 ? 1.2 : 0.6;
    if (isTonic) score += 0.3;
    // authentic cadence into the tonic
    if (isTonic && i > 0) {
      const prev = chords[i - 1];
      if (mod(pc(prev.root) - t, 12) === 7 && triadClass(prev.quality) === 'maj') score += 1.2;
    }
  });
  if (melody.length) {
    const hist = new Array(12).fill(0);
    melody.forEach((m) => (hist[mod(m, 12)] += 1));
    const profile = (minorFamily ? KK_MINOR : KK_MAJOR).map((_, i) => (minorFamily ? KK_MINOR : KK_MAJOR)[mod(i - t, 12)]);
    score += correlation(hist, profile) * Math.min(4, 1 + melody.length / 3);
    const last = melody[melody.length - 1];
    if (mod(last, 12) === t) score += 0.5;
  }
  return score;
}

/** Rank the 24 major/minor keys for the given progression/melody. */
export function detectKeys(chords: Chord[], melody: number[] = [], modes: ModeId[] = ['major', 'minor']): KeyCandidate[] {
  const cands: KeyCandidate[] = [];
  for (const mode of modes) {
    for (const name of tonicChoices(mode)) {
      const k: Key = { tonic: parseNote(name)!, mode };
      cands.push({ key: k, score: scoreKey(k, chords, melody), confidence: 0 });
    }
  }
  const max = Math.max(...cands.map((c) => c.score));
  const temp = 0.6;
  const exps = cands.map((c) => Math.exp((c.score - max) / temp));
  const sum = exps.reduce((a, b) => a + b, 0);
  cands.forEach((c, i) => (c.confidence = exps[i] / sum));
  cands.sort((a, b) => b.score - a.score);
  // Prefer flats/sharps spelling consistent with the progression's own spelling of the tonic
  for (const c of cands) {
    const match = chords.find((ch) => pc(ch.root) === pc(c.key.tonic));
    if (match) c.key = { ...c.key, tonic: match.root };
  }
  return cands;
}

export function detectKey(chords: Chord[], melody: number[] = []): KeyCandidate | null {
  if (!chords.length && !melody.length) return null;
  return detectKeys(chords, melody)[0];
}
