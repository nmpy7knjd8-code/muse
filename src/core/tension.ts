// Muse tension model: reference implementation (framework-free, no DOM, portable to Swift).
//
// Three layers, each traceable to published work (see tension_report.md for sources and evidence levels):
//   1. Vertical (sensory) dissonance of a single chord: interference/roughness (Hutchinson & Knopoff 1978),
//      harmonicity proxy (Parncutt 1988 root ambiguity) and familiarity, combined as in the composite model of
//      Harrison & Pearce (2020). Huron's (1994) interval-class weights give a cheap symbolic fallback.
//   2. Tonal tension of a chord in context: a "TPS-lite" version of Lerdahl's Tonal Pitch Space
//      (chord distance i+j+k, surface tension rule, melodic/harmonic attraction; Lerdahl & Krumhansl 2007),
//      plus voice-leading motion (Bigand, Parncutt & Lerdahl 1996) and optional surprise (Cheung et al. 2019).
//      Chew's spiral-array "tension ribbons" (Herremans & Chew 2016) are provided as extra visual features.
//   3. Tension over time: a leaky "unresolved tension" account (debt) with style thresholds calibrated on
//      rock (RS200), jazz (iRealPro) and classical (ABC Beethoven) corpora, and a sweet-spot advisor
//      (inverted-U: Berlyne; Chmiel & Schubert 2017; Gold et al. 2019; Cheung et al. 2019).
//
// Everything marked HEURISTIC is a design choice, not a published value. All pitch classes are integers 0..11.

export type Mode = 'major' | 'minor';
export interface KeyCtx { tonic: number; mode: Mode }
export interface ChordIn {
  /** pitch classes (absolute, 0..11) */
  pcs: number[];
  /** root pitch class */
  root: number;
  /** bass pitch class (defaults to root) */
  bass?: number;
  /** actual voicing as MIDI note numbers (optional; improves roughness, which is register dependent) */
  voicing?: number[];
  /** melody pitch class sounding over the chord (optional; used by the surface-tension rule) */
  melody?: number;
}

export const mod12 = (n: number) => ((n % 12) + 12) % 12;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const uniq = (pcs: number[]) => Array.from(new Set(pcs.map(mod12))).sort((a, b) => a - b);

// =====================================================================================================
// 1. Vertical dissonance
// =====================================================================================================

/** Huron (1994) aggregate-dyadic-consonance weights for interval classes 1..6 (via incon package source). */
export const HURON_IC_WEIGHTS = [-1.428, -0.582, 0.594, 0.386, 1.24, -0.453] as const;

/** Interval-class vector <ic1..ic6> of a pitch-class set. */
export function intervalClassVector(pcs: number[]): number[] {
  const s = uniq(pcs);
  const v = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < s.length; i++)
    for (let j = i + 1; j < s.length; j++) {
      const d = mod12(s[j] - s[i]);
      const ic = Math.min(d, 12 - d);
      if (ic > 0) v[ic - 1]++;
    }
  return v;
}

/** Huron (1994) aggregate dyadic consonance (higher = more consonant; sums over pairs). */
export function huronConsonance(pcs: number[]): number {
  return intervalClassVector(pcs).reduce((s, n, i) => s + n * HURON_IC_WEIGHTS[i], 0);
}

/** Huron-based dissonance 0..1: mean pair consonance mapped so ic5-only = 0 and ic1-only = 1. */
export function huronDissonance01(pcs: number[]): number {
  const v = intervalClassVector(pcs);
  const pairs = v.reduce((a, b) => a + b, 0);
  if (!pairs) return 0;
  const mean = huronConsonance(pcs) / pairs;
  return clamp01((HURON_IC_WEIGHTS[4] - mean) / (HURON_IC_WEIGHTS[4] - HURON_IC_WEIGHTS[0]));
}

/** Parncutt (1988) root-support weights ("v2": interval above candidate root -> weight), per incon/parn88. */
export const PARNCUTT_ROOT_SUPPORT: Record<number, number> = { 0: 10, 7: 5, 4: 3, 10: 2, 2: 1 };

/** Parncutt (1988) root ambiguity = (sum_i w_i / max w)^0.5, w_i = root support of each candidate root. */
export function rootAmbiguity(pcs: number[]): number {
  const s = new Set(uniq(pcs));
  const w: number[] = [];
  for (let r = 0; r < 12; r++) {
    let t = 0;
    for (const [iv, wt] of Object.entries(PARNCUTT_ROOT_SUPPORT)) if (s.has(mod12(r + Number(iv)))) t += wt;
    w.push(t);
  }
  const mx = Math.max(...w);
  if (!mx) return 0;
  return Math.pow(w.reduce((a, b) => a + b / mx, 0), 0.5);
}
const AMBIG_MIN = rootAmbiguity([0]);
const AMBIG_MAX = rootAmbiguity([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
/** Root ambiguity normalised 0 (single tone) .. 1 (chromatic aggregate). Proxy for LOW harmonicity. */
export function ambiguity01(pcs: number[]): number {
  return clamp01((rootAmbiguity(pcs) - AMBIG_MIN) / (AMBIG_MAX - AMBIG_MIN));
}

export const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export interface SpectrumOpts { harmonics?: number; rolloff?: number }
/** Harmonic complex tones: `harmonics` partials, amplitude 1/k^rolloff (HEURISTIC timbre: 11 partials, 1/k). */
export function spectrum(midi: number[], o: SpectrumOpts = {}): Array<[number, number]> {
  const H = o.harmonics ?? 11, ro = o.rolloff ?? 1;
  const out: Array<[number, number]> = [];
  for (const m of midi) {
    const f0 = midiToHz(m);
    for (let k = 1; k <= H; k++) out.push([f0 * k, 1 / Math.pow(k, ro)]);
  }
  return out;
}

/** Hutchinson & Knopoff (1978) roughness, Mashinter's parametrisation as implemented in the dycon R package:
 *  R = sum_{i<j} A_i A_j g(y_ij) / sum_i A_i^2, y = |f_i - f_j| / CBW, CBW = 1.72 * fmean^0.65,
 *  g(y) = ((y/0.25) * e^(1 - y/0.25))^2 for y <= 1.2, else 0. */
export function hkRoughness(midi: number[], o: SpectrumOpts = {}): number {
  const p = spectrum(midi, o);
  let num = 0, den = 0;
  for (const [, a] of p) den += a * a;
  for (let i = 0; i < p.length; i++)
    for (let j = i + 1; j < p.length; j++) {
      const [f1, a1] = p[i], [f2, a2] = p[j];
      const cbw = 1.72 * Math.pow((f1 + f2) / 2, 0.65);
      const y = Math.abs(f1 - f2) / cbw;
      if (y > 1.2) continue;
      const g = Math.pow((y / 0.25) * Math.exp(1 - y / 0.25), 2);
      num += a1 * a2 * g;
    }
  return den ? num / den : 0;
}

/** Sethares (1993) parametrisation of the Plomp & Levelt (1965) curve, summed over partial pairs. */
export function setharesRoughness(midi: number[], o: SpectrumOpts = {}): number {
  const p = spectrum(midi, o);
  const b1 = 3.5, b2 = 5.75, dstar = 0.24, s1 = 0.0207, s2 = 18.96;
  let r = 0;
  for (let i = 0; i < p.length; i++)
    for (let j = i + 1; j < p.length; j++) {
      const [f1, a1] = p[i], [f2, a2] = p[j];
      const s = dstar / (s1 * Math.min(f1, f2) + s2);
      const d = Math.abs(f2 - f1);
      r += Math.min(a1, a2) * (Math.exp(-b1 * s * d) - Math.exp(-b2 * s * d));
    }
  return r;
}

/** Classify chord tones relative to the root: core (root/3rd/5th/7th or 6th) vs tensions (9, 11, 13 ...). */
export function chordStructure(c: ChordIn): { core: number[]; triad: number[]; tensions: number[]; third: number | null; fifth: number | null; seventh: number | null } {
  const ivs = new Set(uniq(c.pcs).map((p) => mod12(p - c.root)));
  const third = ivs.has(4) ? 4 : ivs.has(3) ? 3 : null;
  const fifth = ivs.has(7) ? 7 : ivs.has(6) && third === 3 ? 6 : ivs.has(8) && third === 4 ? 8 : ivs.has(6) ? 6 : null;
  const seventh = ivs.has(10) ? 10 : ivs.has(11) ? 11 : third === 3 && fifth === 6 && ivs.has(9) ? 9 : null;
  const sus = third === null ? (ivs.has(5) ? 5 : ivs.has(2) ? 2 : null) : null;
  const coreIv = new Set<number>([0]);
  if (third !== null) coreIv.add(third);
  if (fifth !== null) coreIv.add(fifth);
  if (seventh !== null) coreIv.add(seventh);
  if (sus !== null) coreIv.add(sus);
  if (seventh === null && ivs.has(9) && third !== null) coreIv.add(9); // added sixth
  const triadIv = [0, third, fifth].filter((x): x is number => x !== null);
  const toPc = (iv: number) => mod12(c.root + iv);
  return {
    core: [...coreIv].map(toPc),
    triad: triadIv.map(toPc),
    tensions: [...ivs].filter((iv) => !coreIv.has(iv)).map(toPc),
    third: third === null ? null : toPc(third),
    fifth: fifth === null ? null : toPc(fifth),
    seventh: seventh === null ? null : toPc(seventh),
  };
}

/** HEURISTIC standard piano voicing: bass in octave 3 (MIDI 48-59), core tones in close position above it,
 *  tensions (9/11/13) an octave higher so they do not form artificial seconds. */
export function standardVoicing(c: ChordIn, bassOctaveMidi = 48): number[] {
  const bass = mod12(c.bass ?? c.root);
  const st = chordStructure(c);
  const b = bassOctaveMidi + bass;
  const out = [b];
  const core = uniq([...st.core, ...(bass !== mod12(c.root) ? [c.root] : [])]).filter((p) => p !== bass);
  let top = b;
  for (const p of core.sort((x, y) => mod12(x - bass) - mod12(y - bass))) {
    const m = b + mod12(p - bass);
    out.push(m);
    top = Math.max(top, m);
  }
  for (const p of uniq(st.tensions).filter((p) => p !== bass)) {
    let m = b + mod12(p - bass) + 12;
    while (m <= top) m += 12;
    out.push(m);
  }
  return out.sort((x, y) => x - y);
}

/** Standard voicing transposed so the ROOT is C: isolates chord type + inversion from key/register effects.
 *  Pass a real `voicing` to include register (roughness rises in low registers). */
export function canonicalVoicing(c: ChordIn): number[] {
  const t = mod12(c.root);
  return standardVoicing({ root: 0, pcs: c.pcs.map((p) => p - t), bass: c.bass === undefined ? undefined : c.bass - t });
}

const R_SINGLE = hkRoughness([60]);
const R_CLUSTER = hkRoughness([60, 61, 62]);
/** HK roughness normalised: 0 = a single harmonic tone (C4), 1 = chromatic cluster C4-C#4-D4. */
export function roughness01(midi: number[]): number {
  return clamp01((hkRoughness(midi) - R_SINGLE) / (R_CLUSTER - R_SINGLE));
}

export interface VerticalWeights { roughness: number; harmonicity: number; familiarity: number }
/** Relative weights read from Harrison & Pearce (2020) Fig. 2C standardized betas
 *  (interference ~0.18, periodicity/harmonicity ~0.16, culture ~0.14), renormalised. */
export const HP2020_WEIGHTS: VerticalWeights = { roughness: 0.38, harmonicity: 0.33, familiarity: 0.29 };

export interface VerticalResult { roughness: number; roughness01: number; ambiguity01: number; huron01: number; familiarity: number | null; score: number }
/** Composite vertical dissonance 0..1 (HIGH = more dissonant/tense). familiarity 0..1 is optional
 *  (style-specific chord prevalence, see tension_model.json); if absent the other two terms are renormalised. */
export function verticalDissonance(c: ChordIn, familiarity: number | null = null, w: VerticalWeights = HP2020_WEIGHTS): VerticalResult {
  const v = c.voicing && c.voicing.length ? c.voicing : canonicalVoicing(c);
  const r = hkRoughness(v);
  const r01 = roughness01(v);
  const a01 = ambiguity01(c.pcs);
  let score: number;
  if (familiarity === null) score = (w.roughness * r01 + w.harmonicity * a01) / (w.roughness + w.harmonicity);
  else score = w.roughness * r01 + w.harmonicity * a01 + w.familiarity * (1 - clamp01(familiarity));
  return { roughness: r, roughness01: r01, ambiguity01: a01, huron01: huronDissonance01(c.pcs), familiarity, score: clamp01(score) };
}

/** Pairwise dyad roughness weights (HK, harmonic tones) for intervals 0..24 semitones above a given MIDI note.
 *  Useful as a lookup-table recipe: chord roughness ~ sum of pair weights (approximation; HK itself is not additive). */
export function dyadRoughnessTable(lowMidi = 60, maxInterval = 24): number[] {
  const out: number[] = [];
  for (let i = 0; i <= maxInterval; i++) out.push(i === 0 ? 0 : hkRoughness([lowMidi, lowMidi + i]) - R_SINGLE);
  return out;
}

/** Low interval limits (arranging rule of thumb, Sweetwater InSync glossary; converted to MIDI with C4 = 60).
 *  Lowest MIDI pitch of the LOWER note at which the interval stays clear. Tritone entry is HEURISTIC (source
 *  lists an implausibly low value). Compound intervals use the simple-interval limit. */
export const LOW_INTERVAL_LIMITS: Record<number, number> = { 1: 52, 2: 51, 3: 48, 4: 47, 5: 45, 6: 47, 7: 37, 8: 41, 9: 41, 10: 41, 11: 41 };
/** Pairs of adjacent voices below their low interval limit (muddiness flags). */
export function lowIntervalViolations(midi: number[]): Array<{ low: number; high: number; interval: number; limit: number }> {
  const v = [...midi].sort((a, b) => a - b);
  const out: Array<{ low: number; high: number; interval: number; limit: number }> = [];
  for (let i = 0; i + 1 < v.length; i++) {
    const iv = v[i + 1] - v[i];
    const simple = iv % 12;
    if (iv === 0 || simple === 0 || iv > 16) continue;
    const lim = LOW_INTERVAL_LIMITS[simple];
    if (lim !== undefined && v[i] < lim) out.push({ low: v[i], high: v[i + 1], interval: iv, limit: lim });
  }
  return out;
}

// =====================================================================================================
// 2. Tonal tension (TPS-lite) and attraction
// =====================================================================================================

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const NAT_MINOR = [0, 2, 3, 5, 7, 8, 10];
/** Diatonic collection. Minor = natural minor plus raised 7th (so V and vii° are diatonic) - modelling choice. */
export function diatonicSet(k: KeyCtx): number[] {
  const base = k.mode === 'major' ? MAJOR_SCALE : [...NAT_MINOR, 11];
  return uniq(base.map((x) => k.tonic + x));
}
const keySig = (k: KeyCtx) => {
  const relMaj = k.mode === 'major' ? k.tonic : k.tonic + 3;
  const s = mod12(relMaj * 7);
  return s > 6 ? s - 12 : s;
};
/** Lerdahl regional distance i: steps around the circle of fifths between key signatures (C->G 1, C->c 3, C->a 0). */
export function regionDistance(a: KeyCtx, b: KeyCtx): number {
  const d = Math.abs(keySig(a) - keySig(b)) % 12;
  return Math.min(d, 12 - d);
}

const ALL_KEYS: KeyCtx[] = [];
for (let t = 0; t < 12; t++) ALL_KEYS.push({ tonic: t, mode: 'major' }, { tonic: t, mode: 'minor' });

/** Region (key) in which a chord is heard: the home key if its core tones are diatonic there, else the
 *  nearest key (by regional distance) that contains them; ties prefer the parallel key, then major. */
export function regionFor(c: ChordIn, home: KeyCtx): KeyCtx {
  const st = chordStructure(c);
  const need = st.core.length ? st.core : uniq(c.pcs);
  const fits = (k: KeyCtx) => { const d = new Set(diatonicSet(k)); return need.every((p) => d.has(mod12(p))); };
  if (fits(home)) return home;
  let best: KeyCtx | null = null, bd = 99;
  for (const k of ALL_KEYS) {
    if (!fits(k)) continue;
    const d = regionDistance(home, k);
    const better = d < bd || (d === bd && best !== null && (
      (k.tonic === home.tonic && best.tonic !== home.tonic) || (k.tonic === home.tonic) === (best.tonic === home.tonic) && k.mode === 'major' && best.mode !== 'major'));
    if (better) { best = k; bd = d; }
  }
  return best ?? home;
}

function diatonicFifthsOrder(k: KeyCtx): number[] {
  const s = (k.mode === 'major' ? MAJOR_SCALE : NAT_MINOR).map((x) => mod12(k.tonic + x));
  return [...s].sort((a, b) => mod12((a - k.tonic) * 7) - mod12((b - k.tonic) * 7));
}
/** Lerdahl j: chord-root distance on the (diatonic) circle of fifths; chromatic circle if a root is outside. */
export function rootFifthsDistance(r1: number, r2: number, region: KeyCtx): number {
  const ord = diatonicFifthsOrder(region);
  const i = ord.indexOf(mod12(r1)), j = ord.indexOf(mod12(r2));
  if (i >= 0 && j >= 0) { const d = Math.abs(i - j); return Math.min(d, 7 - d); }
  const d = mod12((r2 - r1) * 7);
  return Math.min(d, 12 - d);
}

/** Lerdahl basic space of a chord in a region: levels a (root), b (root+fifth), c (chord tones), d (diatonic). */
export function basicSpace(c: ChordIn, region: KeyCtx): number[][] {
  const st = chordStructure(c);
  const a = [mod12(c.root)];
  const b = uniq([c.root, ...(st.fifth !== null ? [st.fifth] : [])]);
  const cc = uniq([...b, ...c.pcs]);
  // level d uses the natural-minor collection for minor regions (reproduces LK 2007 Fig. 5: I/C -> i/a = 7)
  const coll = (region.mode === 'major' ? MAJOR_SCALE : NAT_MINOR).map((x) => region.tonic + x);
  const d = uniq([...cc, ...coll]);
  return [a, b, cc, d];
}

export interface TpsDistance { i: number; j: number; k: number; total: number }
/** Lerdahl chord distance delta(x->y) = i + j + k (k = distinct new pcs at each basic-space level). */
export function tpsDistance(x: ChordIn, rx: KeyCtx, y: ChordIn, ry: KeyCtx): TpsDistance {
  const i = regionDistance(rx, ry);
  const j = rootFifthsDistance(x.root, y.root, ry);
  const bx = basicSpace(x, rx), by = basicSpace(y, ry);
  let k = 0;
  for (let L = 0; L < 4; L++) { const s = new Set(bx[L]); k += by[L].filter((p) => !s.has(p)).length; }
  return { i, j, k, total: i + j + k };
}

export const tonicTriad = (k: KeyCtx): ChordIn => ({ root: k.tonic, pcs: [k.tonic, k.tonic + (k.mode === 'major' ? 4 : 3), k.tonic + 7].map(mod12) });

/** Distance from the tonic triad of the home key (flat right-branching approximation of hierarchical tension). */
export function distanceFromHome(y: ChordIn, home: KeyCtx): TpsDistance {
  return tpsDistance(tonicTriad(home), home, y, regionFor(y, home));
}

/** Lerdahl & Krumhansl (2007) surface tension rule (Fig. 9): +1 melody on chord 3rd/5th; +2 chord 3rd/5th in
 *  bass (extension: 7th in bass also +2); per non-harmonic tone +3 if diatonic, +4 if chromatic. Tones outside the
 *  triad (7ths, added and sus tones, 9/11/13) count as non-harmonic, as in TPS. */
export function surfaceTension(c: ChordIn, home: KeyCtx): number {
  const st = chordStructure(c);
  const triad = new Set(st.triad);
  const dia = new Set(diatonicSet(home));
  let t = 0;
  if (c.melody !== undefined && (mod12(c.melody) === st.third || mod12(c.melody) === st.fifth)) t += 1;
  const bass = mod12(c.bass ?? c.root);
  if (bass !== mod12(c.root) && (bass === st.third || bass === st.fifth || bass === st.seventh)) t += 2;
  const tones = uniq([...c.pcs, ...(c.melody !== undefined ? [c.melody] : [])]);
  for (const p of tones) if (!triad.has(p)) t += dia.has(p) ? 3 : 4;
  return t;
}

/** Anchoring strength (Lerdahl & Krumhansl Fig. 13a; fifth level omitted): 4 root, 3 triad, 2 diatonic, 1 chromatic. */
export function anchoring(pc: number, ctx: ChordIn, region: KeyCtx): number {
  const p = mod12(pc);
  if (p === mod12(ctx.root)) return 4;
  if (chordStructure(ctx).triad.includes(p)) return 3;
  if (diatonicSet(region).includes(p)) return 2;
  return 1;
}
/** Melodic attraction alpha(p1->p2) = (s2/s1) * 1/n^2 (Lerdahl & Krumhansl 2007 Fig. 13b). */
export function melodicAttraction(p1: number, p2: number, ctx: ChordIn, region: KeyCtx): number {
  const d = mod12(p2 - p1), n = Math.min(d, 12 - d);
  if (n === 0) return 0;
  return (anchoring(p2, ctx, region) / anchoring(p1, ctx, region)) / (n * n);
}
/** Summed realised voice-leading attraction alpha_rvl(x->y) (numerator of the harmonic attraction rule). */
export function voiceLeadingAttraction(x: ChordIn, y: ChordIn, home: KeyCtx): number {
  const ry = regionFor(y, home);
  const ys = uniq(y.pcs);
  let sum = 0;
  for (const p of uniq(x.pcs)) {
    if (ys.includes(p)) continue;
    let best = 0;
    for (const q of ys) {
      const d = mod12(q - p), n = Math.min(d, 12 - d);
      if (n > 2) continue;
      best = Math.max(best, melodicAttraction(p, q, y, ry));
    }
    sum += best;
  }
  return sum;
}
/** Harmonic attraction alpha_rh(x->y) = 10 * alpha_rvl / delta(x->y) (Fig. 14). Voice leading is not given for pc
 *  sets, so each non-common tone of x moves to its most attracting tone of y within 2 semitones (assumption);
 *  anchoring strengths are taken in y's context. */
export function harmonicAttraction(x: ChordIn, y: ChordIn, home: KeyCtx): number {
  const delta = Math.max(1, tpsDistance(x, regionFor(x, home), y, regionFor(y, home)).total);
  return (10 * voiceLeadingAttraction(x, y, home)) / delta;
}

/** Simple voice-leading size between two pc sets: mean nearest-neighbour semitone distance, both directions. */
export function voiceLeadingSize(x: ChordIn, y: ChordIn): number {
  const near = (p: number, set: number[]) => Math.min(...set.map((q) => { const d = mod12(q - p); return Math.min(d, 12 - d); }));
  const xs = uniq(x.pcs), ys = uniq(y.pcs);
  const a = xs.reduce((s, p) => s + near(p, ys), 0) / xs.length;
  const b = ys.reduce((s, p) => s + near(p, xs), 0) / ys.length;
  return (a + b) / 2;
}

// ---- Spiral array (Chew) / tension ribbons (Herremans & Chew 2016); constants as in the partitura implementation
const SA_A = Math.sqrt(2 / 15) * Math.PI / 2;
const SA_W = [0.516, 0.315, 0.168];
type V3 = [number, number, number];
const saPos = (k: number): V3 => { const t = k * Math.PI / 2; return [Math.sin(t), Math.cos(t), SA_A * t]; };
const dist3 = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const SA_SCALE = 1 / dist3(saPos(0), saPos(12)); // C to B#
const wsum = (ps: V3[], w: number[]): V3 => { const t = w.reduce((a, b) => a + b, 0); return [0, 1, 2].map((i) => ps.reduce((s, p, j) => s + p[i] * w[j], 0) / t) as V3; };
/** Line-of-fifths index for a pc, spelled relative to the key (window tonic-5 .. tonic+6). */
export function fifthsIndex(pc: number, k: KeyCtx): number {
  const t0 = (() => { const s = mod12(k.tonic * 7); return s > 6 ? s - 12 : s; })();
  let idx = mod12(pc * 7);
  while (idx > t0 + 6) idx -= 12;
  while (idx < t0 - 5) idx += 12;
  return idx;
}
const majChordCE = (r: number) => wsum([saPos(r), saPos(r + 1), saPos(r + 4)], SA_W);
const minChordCE = (r: number) => wsum([saPos(r), saPos(r + 1), saPos(r - 3)], SA_W);
export function keyCE(k: KeyCtx): V3 {
  const t = fifthsIndex(k.tonic, k);
  if (k.mode === 'major') return wsum([majChordCE(t), majChordCE(t + 1), majChordCE(t - 1)], SA_W);
  const dom = majChordCE(t + 1).map((v, i) => 0.75 * v + 0.25 * minChordCE(t + 1)[i]) as V3;
  const sub = minChordCE(t - 1).map((v, i) => 0.75 * v + 0.25 * majChordCE(t - 1)[i]) as V3;
  return wsum([minChordCE(t), dom, sub], SA_W);
}
export interface Ribbon { diameter: number; strain: number; momentum: number }
/** Cloud diameter, tensile strain and cloud momentum for each chord (equal note weights). */
export function tensionRibbons(prog: ChordIn[], k: KeyCtx): Ribbon[] {
  const kc = keyCE(k);
  let prevCE: V3 | null = null;
  return prog.map((c) => {
    const pts = uniq(c.pcs).map((p) => saPos(fifthsIndex(p, k)));
    let diam = 0;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) diam = Math.max(diam, dist3(pts[i], pts[j]));
    const ce = wsum(pts, pts.map(() => 1));
    const r = { diameter: diam * SA_SCALE, strain: dist3(ce, kc) * SA_SCALE, momentum: prevCE ? dist3(ce, prevCE) * SA_SCALE : 0 };
    prevCE = ce;
    return r;
  });
}

// =====================================================================================================
// 3. Event tension, curve, budget
// =====================================================================================================

export interface TensionParams {
  /** component weights (renormalised over available components) - HEURISTIC, guided by relative effect sizes in
   *  Bigand et al. 1996 (TPS distance > roughness; motion matters most for non-musicians) and LK 2007
   *  (hierarchical tension + attraction both significant). */
  weights: { tonal: number; vertical: number; attraction: number; surface: number; motion: number; surprise: number };
  /** raw-value scales mapping each component to 0..1 via x/(x+scale) (HEURISTIC; scale = typical "half-tension" value) */
  scale: { tonal: number; surface: number; attraction: number; motion: number };
  /** scale for realised harmonic attraction prev->cur (release strength) */
  releaseScale: number;
  vertical: VerticalWeights;
  /** multiplier on vertical+surface when the non-chord tones were held over from the previous chord (prepared). HEURISTIC */
  preparedDiscount: number;
}
export const DEFAULT_PARAMS: TensionParams = {
  weights: { tonal: 0.3, vertical: 0.25, attraction: 0.15, surface: 0.1, motion: 0.12, surprise: 0.08 },
  scale: { tonal: 7, surface: 4, attraction: 3, motion: 1.5 },
  releaseScale: 4,
  vertical: HP2020_WEIGHTS,
  preparedDiscount: 0.85,
};

export interface EventOpts {
  /** 0..1 surprise of this chord given context (e.g. -log2 p / maxBits from the app's transition prior) */
  surprise?: number;
  /** 0..1 familiarity (chord-type prevalence in the chosen style); see tension_model.json familiarity tables */
  familiarity?: number;
  /** 0..1 metric strength of the onset (1 = downbeat). HEURISTIC salience scaling of vertical+surface. */
  beatStrength?: number;
}
export interface EventTension {
  level: number;
  raw: { home: TpsDistance; seq: TpsDistance | null; surface: number; pull: number; voiceLeading: number | null; vertical: VerticalResult; surprise: number | null };
  parts: { tonal: number; vertical: number; attraction: number; surface: number; motion: number | null; surprise: number | null };
  region: KeyCtx;
  prepared: boolean;
}
const sat = (x: number, s: number) => (x <= 0 ? 0 : x / (x + s));

/** Momentary tension (0..1) of chord `cur` after `prev` in key `home`. */
export function eventTension(prev: ChordIn | null, cur: ChordIn, home: KeyCtx, o: EventOpts = {}, P: TensionParams = DEFAULT_PARAMS): EventTension {
  const region = regionFor(cur, home);
  const homeD = distanceFromHome(cur, home);
  const seq = prev ? tpsDistance(prev, regionFor(prev, home), cur, region) : null;
  const surface = surfaceTension(cur, home);
  const vertical = verticalDissonance(cur, o.familiarity ?? null, P.vertical);
  const tonic = tonicTriad(home);
  const pull = voiceLeadingAttraction(cur, tonic, home);
  const vl = prev ? voiceLeadingSize(prev, cur) : null;
  const st = chordStructure(cur);
  const nonTriad = uniq(cur.pcs).filter((p) => !st.triad.includes(p));
  const prepared = !!prev && nonTriad.length > 0 && nonTriad.every((p) => uniq(prev.pcs).includes(p));
  let salience = o.beatStrength === undefined ? 1 : 0.8 + 0.4 * clamp01(o.beatStrength);
  if (prepared) salience *= P.preparedDiscount;
  const parts = {
    tonal: sat(homeD.total, P.scale.tonal),
    vertical: clamp01(vertical.score * salience),
    attraction: sat(pull, P.scale.attraction),
    surface: clamp01(sat(surface, P.scale.surface) * salience),
    motion: seq && vl !== null ? 0.5 * sat(seq.total, P.scale.tonal) + 0.5 * sat(vl, P.scale.motion) : null,
    surprise: o.surprise === undefined ? null : clamp01(o.surprise),
  };
  const w = P.weights;
  let num = 0, den = 0;
  for (const key of Object.keys(w) as Array<keyof typeof w>) {
    const v = parts[key];
    if (v === null) continue;
    num += w[key] * v; den += w[key];
  }
  return { level: den ? num / den : 0, raw: { home: homeD, seq, surface, pull, voiceLeading: vl, vertical, surprise: parts.surprise }, parts, region, prepared };
}

/** Chord-type key used by the familiarity tables: intervals above the root, e.g. "0,4,7,10". */
export function chordTypeKey(c: ChordIn): string {
  return uniq(c.pcs.map((p) => p - c.root)).join(',');
}
/** Familiarity 0..1 of a chord type in a style table {typeKey: familiarity}; unseen types get `unseen`. */
export function familiarityFor(c: ChordIn, table: Record<string, number> | null | undefined, unseen = 0): number | undefined {
  if (!table) return undefined;
  return table[chordTypeKey(c)] ?? unseen;
}

// ---- style presets ---------------------------------------------------------------------------------
export interface StylePreset {
  id: string;
  label: string;
  /** "rest" level: chords below this pay back unresolved tension */
  rest: number;
  /** debt ceiling: above this the advisor suggests resolving */
  ceiling: number;
  /** sweet-spot band for the rolling (4-chord) mean level */
  bandLow: number;
  bandHigh: number;
  /** longest typical run of chords above `rest` before a release (P90 in corpus) */
  maxRun: number;
  /** leak per step for the debt integrator */
  leak: number;
  evidence: 'corpus-calibrated' | 'heuristic';
  source: string;
}
/** Defaults. Corpus-calibrated rows come from build/calibrate.mjs (percentiles of this exact model run over the corpora);
 *  regenerate with `npm run calibrate` in research/tension and paste from tension_model.json. */
export const STYLE_PRESETS: Record<string, StylePreset> = {
  pop: { id: 'pop', label: 'Pop / rock', rest: 0.305, ceiling: 0.225, bandLow: 0.225, bandHigh: 0.298, maxRun: 3, leak: 0.85, evidence: 'corpus-calibrated', source: 'RS200 rock corpus v2.1 (de Clercq & Temperley 2011), analyst DT; 194 songs, 18,446 chord events' },
  classical: { id: 'classical', label: 'Classical', rest: 0.346, ceiling: 0.301, bandLow: 0.27, bandHigh: 0.369, maxRun: 3, leak: 0.85, evidence: 'corpus-calibrated', source: 'ABC Beethoven string quartets (Neuwirth et al. 2018); 888 local-key segments, 27,200 chords' },
  jazz: { id: 'jazz', label: 'Jazz', rest: 0.429, ceiling: 0.276, bandLow: 0.385, bandHigh: 0.463, maxRun: 5, leak: 0.85, evidence: 'corpus-calibrated', source: 'iRb jazz standards corpus v1.0 (Broze & Shanahan 2013); 1,182 tunes, 42,815 chords' },
  film: { id: 'film', label: 'Film / cinematic', rest: 0.38, ceiling: 0.3, bandLow: 0.3, bandHigh: 0.42, maxRun: 5, leak: 0.85, evidence: 'heuristic', source: 'No corpus: set between classical and jazz, longer runs allowed (Lehman 2013: withheld cadences, chromatic mediants)' },
};

/** Familiarity (0..1, log prevalence) of the app's chord qualities per style, from build/calibrate.mjs.
 *  pop = RS200 (+ HEURISTIC floors for 5, sus2, add9, sus4, 6, maj7, m7, madd9 which the roman-numeral annotations omit). */
export const APP_QUALITY_FAMILIARITY: Record<string, Record<string, number>> = {pop:{"5":0.7,"6":0.45,"7":0.657,"9":0,"maj":1,"min":0.863,"sus4":0.5,"sus2":0.55,"dim":0.382,"aug":0.169,"m6":0,"maj7":0.45,"m7":0.62,"m7b5":0.445,"dim7":0.354,"mMaj7":0.398,"7sus4":0,"aug7":0,"add9":0.55,"madd9":0.45,"maj9":0,"m9":0,"7b9":0,"7#9":0,"maj7#11":0},jazz:{"5":0,"6":0.816,"7":1,"9":0.643,"maj":0.735,"min":0.707,"sus4":0.233,"sus2":0,"dim":0.476,"aug":0.412,"m6":0.667,"maj7":0.91,"m7":0.988,"m7b5":0.798,"dim7":0.715,"mMaj7":0.53,"7sus4":0.644,"aug7":0.649,"add9":0.332,"madd9":0,"maj9":0.487,"m9":0.542,"7b9":0.801,"7#9":0.619,"maj7#11":0.558},classical:{"5":0,"6":0.306,"7":0.945,"9":0.474,"maj":1,"min":0.913,"sus4":0.594,"sus2":0,"dim":0.763,"aug":0.52,"m6":0.15,"maj7":0.402,"m7":0.657,"m7b5":0.597,"dim7":0.774,"mMaj7":0.238,"7sus4":0.545,"aug7":0.318,"add9":0.52,"madd9":0.404,"maj9":0.174,"m9":0.15,"7b9":0.502,"7#9":0,"maj7#11":0}};


/** Mood tension values (0..1) copied from research/theory/theory_kb.json moodVocabulary. */
export const MOOD_TENSION: Record<string, number> = {
  bright: 0.1, melancholy: 0.25, peaceful: 0.03, warm: 0.05, energetic: 0.4, aggressive: 0.85, tense: 0.95, romantic: 0.25,
  dreamy: 0.15, nostalgic: 0.15, bittersweet: 0.25, yearning: 0.55, hopeful: 0.2, triumphant: 0.3, epic: 0.45, wonder: 0.3,
  mystical: 0.35, solemn: 0.2, dark: 0.5, ominous: 0.8, uncanny: 0.7, dramatic: 0.7, playful: 0.15, resolved: 0.05,
  floating: 0.3, surprising: 0.5, bluesy: 0.4, jazzy: 0.35, earthy: 0.15,
};
/** Weighted mean tension of a mood blend {moodId: weight}; null if no known moods. */
export function moodTargetTension(moods: Record<string, number>): number | null {
  let s = 0, w = 0;
  for (const [m, wt] of Object.entries(moods)) if (MOOD_TENSION[m] !== undefined && wt > 0) { s += MOOD_TENSION[m] * wt; w += wt; }
  return w ? s / w : null;
}

export interface Limits { rest: number; ceiling: number; bandLow: number; bandHigh: number; maxRun: number; leak: number }
/** Apply the Safe<->Adventurous slider (0..1) and a mood target tension (0..1, null = neutral) to a style preset.
 *  HEURISTIC mapping: slider scales the ceiling 0.6x..1.4x; mood target scales it 0.7x..1.3x; both shift the band
 *  (and half as much the rest level) by up to +-0.05 (slider) and +-0.1 (mood). */
export function effectiveLimits(style: StylePreset, adventure = 0.5, targetTension: number | null = null): Limits {
  const a = clamp01(adventure);
  const m = targetTension === null ? 0.5 : clamp01(targetTension);
  const ceilMul = (0.6 + 0.8 * a) * (0.7 + 0.6 * m);
  const shift = (a - 0.5) * 0.1 + (m - 0.5) * 0.2;
  const width = style.bandHigh - style.bandLow;
  const bandLow = clamp01(style.bandLow + shift);
  return {
    rest: clamp01(style.rest + 0.5 * shift),
    ceiling: style.ceiling * ceilMul,
    bandLow,
    bandHigh: clamp01(bandLow + width),
    maxRun: Math.max(1, Math.round(style.maxRun * (0.6 + 0.8 * a))),
    leak: style.leak,
  };
}

export interface CurvePoint {
  index: number;
  level: number;
  /** accumulated unresolved tension */
  debt: number;
  /** mean level of the last 4 chords (incl. this one) */
  rolling: number;
  /** consecutive chords at or above the rest level */
  run: number;
  /** realised attraction from previous chord into this one, 0..1 (release strength) */
  release: number;
  event: EventTension;
}
export interface CurveOpts { style?: StylePreset; params?: TensionParams; events?: EventOpts[] }

/** One step of the debt integrator: D' = max(0, leak*D + (L - rest)) - 0.3*release (HEURISTIC). */
export function stepDebt(debt: number, level: number, release: number, s: { rest: number; leak: number }): number {
  return Math.max(0, Math.max(0, s.leak * debt + (level - s.rest)) - 0.3 * release * (level < s.rest ? 1 : 0.5));
}

export function tensionCurve(prog: ChordIn[], home: KeyCtx, o: CurveOpts = {}): CurvePoint[] {
  const style = o.style ?? STYLE_PRESETS.pop;
  const P = o.params ?? DEFAULT_PARAMS;
  const out: CurvePoint[] = [];
  let debt = 0, run = 0;
  const hist: number[] = [];
  prog.forEach((c, i) => {
    const prev = i > 0 ? prog[i - 1] : null;
    const ev = eventTension(prev, c, home, o.events?.[i] ?? {}, P);
    const release = prev ? sat(harmonicAttraction(prev, c, home), P.releaseScale) : 0;
    debt = stepDebt(debt, ev.level, release, style);
    run = ev.level >= style.rest ? run + 1 : 0;
    hist.push(ev.level);
    const last = hist.slice(-4);
    out.push({ index: i, level: ev.level, debt, rolling: last.reduce((a, b) => a + b, 0) / last.length, run, release, event: ev });
  });
  return out;
}

export type BudgetStatus = 'too-static' | 'building' | 'sweet-spot' | 'resolve-soon' | 'over-budget';
export interface BudgetState { status: BudgetStatus; limits: Limits; debt: number; rolling: number; run: number; message: string }
/** Where the progression stands relative to the (style x slider x mood) sweet spot. */
export function budgetState(curve: CurvePoint[], style: StylePreset, adventure = 0.5, targetTension: number | null = null): BudgetState {
  const L = effectiveLimits(style, adventure, targetTension);
  const last = curve[curve.length - 1];
  if (!last) return { status: 'building', limits: L, debt: 0, rolling: 0, run: 0, message: 'Start anywhere.' };
  let status: BudgetStatus;
  if (last.debt > L.ceiling) status = 'over-budget';
  else if (last.debt > 0.75 * L.ceiling || last.run >= L.maxRun) status = 'resolve-soon';
  else if (curve.length >= 4 && last.rolling < L.bandLow) status = 'too-static';
  else if (last.rolling >= L.bandLow && last.rolling <= L.bandHigh) status = 'sweet-spot';
  else status = 'building';
  const msg: Record<BudgetStatus, string> = {
    'over-budget': 'Lots of unresolved tension: a resolution now will feel earned.',
    'resolve-soon': 'Tension is building: one or two more steps, then release.',
    'too-static': 'Very settled: a surprising or colourful chord would add interest.',
    'sweet-spot': 'Nice balance of tension and rest.',
    building: "Above this style's usual level: fine while it is heading somewhere.",
  };
  return { status, limits: L, debt: last.debt, rolling: last.rolling, run: last.run, message: msg[status] };
}

export interface CandidateEval { level: number; debtAfter: number; release: number; adjust: number; reasons: string[] }
export interface RankCtx {
  home: KeyCtx;
  style?: StylePreset;
  adventure?: number;
  targetTension?: number | null;
  params?: TensionParams;
  /** 0..1 uncertainty of the context (entropy of the app's next-chord distribution / max entropy) */
  contextUncertainty?: number;
}
/** HEURISTIC score adjustment for a candidate next chord (add to the app's ranking score; typical range +-1). */
export function evaluateCandidate(prog: ChordIn[], cand: ChordIn, ctx: RankCtx, candOpts: EventOpts = {}): CandidateEval {
  const style = ctx.style ?? STYLE_PRESETS.pop;
  const P = ctx.params ?? DEFAULT_PARAMS;
  const L = effectiveLimits(style, ctx.adventure ?? 0.5, ctx.targetTension ?? null);
  const curve = tensionCurve(prog, ctx.home, { style, params: P });
  const now = curve[curve.length - 1];
  const prev = prog.length ? prog[prog.length - 1] : null;
  const ev = eventTension(prev, cand, ctx.home, candOpts, P);
  const release = prev ? sat(harmonicAttraction(prev, cand, ctx.home), P.releaseScale) : 0;
  const debtNow = now ? now.debt : 0;
  const debtAfter = stepDebt(debtNow, ev.level, release, style);
  const st = budgetState(curve, style, ctx.adventure ?? 0.5, ctx.targetTension ?? null);
  const reasons: string[] = [];
  let adj = 0;
  const target = (L.bandLow + L.bandHigh) / 2;
  // 1. stay near the sweet-spot band (inverted-U)
  adj -= 0.6 * Math.abs(ev.level - target);
  // 2. ceiling
  if (debtAfter > L.ceiling) { adj -= 0.8 * (debtAfter - L.ceiling) / L.ceiling; reasons.push('pushes past the tension budget'); }
  // 3. when over budget / run too long, reward release
  if (st.status === 'over-budget' || st.status === 'resolve-soon') {
    const gain = (debtNow - debtAfter) / Math.max(L.ceiling, 1e-6);
    adj += 0.9 * Math.max(0, gain) + 0.4 * release;
    if (gain > 0.2 || release > 0.5) reasons.push('resolves built-up tension');
  }
  // 4. when static, reward colour
  if (st.status === 'too-static' && ev.level > (now?.rolling ?? 0)) { adj += 0.5 * (ev.level - (now?.rolling ?? 0)); reasons.push('adds colour after a settled stretch'); }
  // 5. Cheung et al. (2019) saddle: surprise is best in predictable contexts, predictability best in uncertain ones
  if (ctx.contextUncertainty !== undefined && candOpts.surprise !== undefined) {
    const u = clamp01(ctx.contextUncertainty), s = clamp01(candOpts.surprise);
    adj += -1.2 * (u - 0.5) * (s - 0.5);
    if (u < 0.4 && s > 0.6) reasons.push('a well-placed surprise');
    if (u > 0.6 && s < 0.4) reasons.push('grounding after an uncertain stretch');
  }
  return { level: ev.level, debtAfter, release, adjust: adj, reasons };
}

// ---- melody notes -------------------------------------------------------------------------------------
export interface NoteTension { level: number; surface: number; pull: number; roughness01: number; flags: string[] }
/** Tension of a melody note `pc` over `chord`: LK surface rule for the note, its strongest melodic attraction to a
 *  neighbouring stable tone, and roughness against the chord voicing (note placed in octave 5). HEURISTIC weights. */
export function noteTension(pc: number, chord: ChordIn, home: KeyCtx, prevPc?: number, prevChord?: ChordIn): NoteTension {
  const p = mod12(pc);
  const st = chordStructure(chord);
  const region = regionFor(chord, home);
  const dia = new Set(diatonicSet(home));
  let surface = 0;
  if (p === st.third || p === st.fifth) surface += 1;
  else if (p !== mod12(chord.root) && !st.core.includes(p)) surface += dia.has(p) ? 3 : 4;
  else if (st.seventh === p) surface += 3;
  let pull = 0;
  for (const d of [-2, -1, 1, 2]) pull = Math.max(pull, melodicAttraction(p, p + d, chord, region));
  const v = chord.voicing && chord.voicing.length ? chord.voicing : standardVoicing(chord);
  const midi = 72 + p;
  const r01 = clamp01(roughness01([...v, midi]) - roughness01(v));
  const flags: string[] = [];
  const nonChord = !uniq(chord.pcs).includes(p);
  if (nonChord && prevPc !== undefined) {
    const leap = Math.min(mod12(p - prevPc), mod12(prevPc - p));
    if (mod12(prevPc) === p && prevChord && uniq(prevChord.pcs).includes(p)) flags.push('suspension');
    else if (leap > 2) flags.push('appoggiatura');
  }
  const level = clamp01(0.45 * sat(surface, 3) + 0.3 * sat(pull, 1) + 0.25 * clamp01(r01 * 4));
  return { level, surface, pull, roughness01: r01, flags };
}
