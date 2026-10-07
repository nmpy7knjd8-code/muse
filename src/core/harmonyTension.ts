// Bridge between Muse's chord/key types and the research tension model (tension.ts, kept verbatim from
// research/tension so it can be re-synced). Adds what the app needs on top of it:
//   - style presets × Safe↔Adventurous slider × mood target → limits (sweet-spot band, debt ceiling, max run)
//   - an idiom discount for modal / blues colours (bVII, I7 tonic, modal-only chords), which Lerdahl's
//     common-practice anchoring over-rates (tension_report.md §7)
//   - melody-vs-chord dissonance folded into each chord's tension (noteTension per melody note)
//   - per-candidate ranking adjustment computed against one shared curve (cheap for ~40 candidates)
import { Chord, chordPcs } from './chords';
import { mod, pc } from './notes';
import { Key, MODE_BY_ID, inScale } from './scales';
import type { MoodProfile } from './profile';
import * as T from './tension';

export type TensionStyleId = 'pop' | 'classical' | 'jazz' | 'film';
export const TENSION_STYLES: TensionStyleId[] = ['pop', 'classical', 'jazz', 'film'];
export const tensionStyleLabel = (s: TensionStyleId) => T.STYLE_PRESETS[s].label;

export interface TensionSettings {
  style: TensionStyleId;
  /** Safe↔Adventurous slider 0..1 */
  adventure: number;
  /** 0..1 mood target tension (null = neutral) */
  target: number | null;
}

/** Display range: event levels rarely exceed ~0.65, so the curve's y-axis tops out here. */
export const TENSION_MAX = 0.7;
/** How much the tension advisor moves suggestion scores (×adjust, typical adjust ±1). HEURISTIC. */
export const TENSION_GAIN = 0.45;
/** Weight of melody-vs-chord dissonance in a chord's tension when melody notes are present. HEURISTIC. */
export const MELODY_TENSION_WEIGHT = 0.3;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sat = (x: number, s: number) => (x <= 0 ? 0 : x / (x + s));

export function toKeyCtx(k: Key): T.KeyCtx {
  return { tonic: pc(k.tonic), mode: MODE_BY_ID[k.mode].family === 'minor' ? 'minor' : 'major' };
}
export function toChordIn(c: Chord, voicing?: number[]): T.ChordIn {
  return { pcs: chordPcs(c), root: pc(c.root), bass: c.bass ? pc(c.bass) : undefined, voicing };
}

function familiarity(c: Chord, style: TensionStyleId): number | undefined {
  const t = T.APP_QUALITY_FAMILIARITY;
  if (style === 'film') {
    const a = t.classical[c.quality], b = t.jazz[c.quality];
    return a === undefined || b === undefined ? undefined : (a + b) / 2;
  }
  return t[style]?.[c.quality];
}

/**
 * Lerdahl-style anchoring is tuned to common-practice tonality, so modal/blues colours read as more tense
 * than they feel (tension_report.md §7). Factor ≤ 1 applied to a chord's level. HEURISTIC values.
 */
export function idiomDiscount(c: Chord, k: Key): { factor: number; why: string | null } {
  const t = pc(k.tonic), off = mod(pc(c.root) - t, 12);
  const fam = MODE_BY_ID[k.mode].family;
  const modal = k.mode !== 'major' && k.mode !== 'minor';
  const pcs = chordPcs(c);
  const inMode = pcs.every((p) => inScale(k, p));
  const parent: Key = { tonic: k.tonic, mode: fam === 'minor' ? 'minor' : 'major' };
  const inParent = pcs.every((p) => inScale(parent, p));
  if (modal && inMode && !inParent) return { factor: 0.8, why: 'modal colour (native to this mode)' };
  if (off === 0 && (c.quality === '7' || c.quality === '9')) return { factor: 0.85, why: 'bluesy dominant-7 tonic' };
  if (fam === 'major' && off === 10 && (c.quality === 'maj' || c.quality === '5')) return { factor: 0.85, why: 'rock/Mixolydian ♭VII' };
  return { factor: 1, why: null };
}

export interface ChordTensionPoint extends T.CurvePoint {
  /** level before the melody was folded in */
  harmonyLevel: number;
  /** mean melody-vs-chord dissonance (0..1) of the notes over this chord, null if none */
  melody: number | null;
  idiom: string | null;
}
export interface TensionState { points: ChordTensionPoint[]; budget: T.BudgetState; limits: T.Limits; settings: TensionSettings }

export function moodTarget(profile: MoodProfile | null | undefined): number | null {
  if (!profile) return null;
  const fromMoods = T.moodTargetTension(profile.moods);
  const dim = profile.dims.tension;
  if (dim !== undefined && fromMoods !== null) return clamp01(0.5 * dim + 0.5 * fromMoods);
  return dim ?? fromMoods;
}

/** Mean melody-vs-chord dissonance (LK surface + attraction + added roughness) of `notes` (MIDI) over `c`. */
export function melodyDissonance(notes: number[], c: Chord, k: Key, prevNote?: number, prevChord?: Chord): number | null {
  if (!notes.length) return null;
  const home = toKeyCtx(k), ci = toChordIn(c), pci = prevChord ? toChordIn(prevChord) : undefined;
  let s = 0, last = prevNote;
  for (const n of notes) { s += T.noteTension(mod(n, 12), ci, home, last !== undefined ? mod(last, 12) : undefined, pci).level; last = n; }
  return s / notes.length;
}

interface StepIn { chord: Chord; melody?: number[] }

function eventFor(prev: Chord | null, cur: Chord, k: Key, style: TensionStyleId, melody: number[] | undefined, prevNote: number | undefined) {
  const home = toKeyCtx(k);
  const ev = T.eventTension(prev ? toChordIn(prev) : null, toChordIn(cur), home, { familiarity: familiarity(cur, style) });
  const idiom = idiomDiscount(cur, k);
  const harmonyLevel = ev.level * idiom.factor;
  const mel = melody?.length ? melodyDissonance(melody, cur, k, prevNote, prev ?? undefined) : null;
  const level = mel === null ? harmonyLevel : (1 - MELODY_TENSION_WEIGHT) * harmonyLevel + MELODY_TENSION_WEIGHT * mel;
  const release = prev ? sat(T.harmonicAttraction(toChordIn(prev), toChordIn(cur), home), T.DEFAULT_PARAMS.releaseScale) : 0;
  return { ev, level, harmonyLevel, mel, idiom: idiom.why, release };
}

/** Tension curve + budget for a progression (optionally with melody notes per chord). */
export function progressionTension(steps: Array<Chord | StepIn>, k: Key, settings: TensionSettings): TensionState {
  const style = T.STYLE_PRESETS[settings.style];
  const limits = T.effectiveLimits(style, settings.adventure, settings.target);
  const s = steps.map((x) => ('chord' in x ? x : { chord: x }));
  const points: ChordTensionPoint[] = [];
  let debt = 0, run = 0, lastNote: number | undefined;
  const hist: number[] = [];
  s.forEach((st, i) => {
    const prev = i > 0 ? s[i - 1].chord : null;
    const e = eventFor(prev, st.chord, k, settings.style, st.melody, lastNote);
    if (st.melody?.length) lastNote = st.melody[st.melody.length - 1];
    debt = T.stepDebt(debt, e.level, e.release, limits);
    run = e.level >= limits.rest ? run + 1 : 0;
    hist.push(e.level);
    const last = hist.slice(-4);
    points.push({ index: i, level: e.level, debt, rolling: last.reduce((a, b) => a + b, 0) / last.length, run, release: e.release, event: e.ev, harmonyLevel: e.harmonyLevel, melody: e.mel, idiom: e.idiom });
  });
  return { points, budget: T.budgetState(points, style, settings.adventure, settings.target), limits, settings };
}

export interface CandidateTension { level: number; debtAfter: number; release: number; adjust: number; reasons: string[]; idiom: string | null }

/** Ranking adjustment for a candidate next chord against the current state (mirrors T.evaluateCandidate). */
export function candidateTension(state: TensionState, prev: Chord | null, cand: Chord, k: Key, melody?: number[]): CandidateTension {
  const L = state.limits;
  const now = state.points[state.points.length - 1];
  const e = eventFor(prev, cand, k, state.settings.style, melody, undefined);
  const debtNow = now ? now.debt : 0;
  const debtAfter = T.stepDebt(debtNow, e.level, e.release, L);
  const st = state.budget.status;
  const reasons: string[] = [];
  let adj = 0;
  const target = (L.bandLow + L.bandHigh) / 2;
  adj -= 0.6 * Math.abs(e.level - target);
  if (debtAfter > L.ceiling) { adj -= (0.8 * (debtAfter - L.ceiling)) / L.ceiling; reasons.push('pushes past the tension budget'); }
  if (st === 'over-budget' || st === 'resolve-soon') {
    const gain = (debtNow - debtAfter) / Math.max(L.ceiling, 1e-6);
    adj += 0.9 * Math.max(0, gain) + 0.4 * e.release;
    if (gain > 0.2 || e.release > 0.5) reasons.push('resolves built-up tension');
  }
  if (st === 'too-static' && now && e.level > now.rolling) { adj += 0.5 * (e.level - now.rolling); reasons.push('adds colour after a settled stretch'); }
  return { level: e.level, debtAfter, release: e.release, adjust: Math.max(-1.5, Math.min(1.5, adj)), reasons, idiom: e.idiom };
}

export const BUDGET_COLORS: Record<T.BudgetStatus, string> = {
  'too-static': '#8f8aa3', building: '#e6c35c', 'sweet-spot': '#4fd1a5', 'resolve-soon': '#f0a050', 'over-budget': '#ef5b5b',
};
export const BUDGET_LABEL: Record<T.BudgetStatus, string> = {
  'too-static': 'Too static', building: 'Building', 'sweet-spot': 'Sweet spot', 'resolve-soon': 'Resolve soon', 'over-budget': 'Over budget',
};
/** Per-point status (same rules as budgetState, applied to each prefix) for colouring the curve's dots. */
export function pointStatus(p: T.CurvePoint, i: number, L: T.Limits): T.BudgetStatus {
  if (p.debt > L.ceiling) return 'over-budget';
  if (p.debt > 0.75 * L.ceiling || p.run >= L.maxRun) return 'resolve-soon';
  if (i >= 3 && p.rolling < L.bandLow) return 'too-static';
  if (p.rolling >= L.bandLow && p.rolling <= L.bandHigh) return 'sweet-spot';
  return 'building';
}
