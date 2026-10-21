// Ear gym (ideas 1–7): scale-degree game, spot-the-swap, name-the-chord, sing-it-back, bass detective,
// sharing one adaptive engine — Leitner spaced review per item (Hua 2015) and blocked → mixed stages
// (Moloney 2004). Every question reads the current key/mode (and Style / tuning where relevant).
// Framework-free; see docs/dialectic/01–07.
import { Chord, chordPcs, chordSymbol, chordsEqual, triadClass } from './chords';
import { mod, pc } from './notes';
import { Key, MODE_BY_ID, diatonicChords, scalePcs, tonicPc } from './scales';
import { romanOf } from './roman';
import { STYLE_BY_ID, styleProgressions } from './styles';
import type { Tuning } from './tunings';

export type GymGame = 'degree' | 'swap' | 'name' | 'sing' | 'bass';
export type Rand = () => number;

// ───────────────────────── adaptive engine (#4) ─────────────────────────
export interface GymItem { box: number; due: number; asked: number; right: number }
export interface GymStats { items: Record<string, GymItem>; recent: Record<string, boolean[]> }
export const EMPTY_GYM: GymStats = { items: {}, recent: {} };
/** Review gaps per Leitner box (ms): box 0 = new. */
export const GYM_GAPS = [0, 10 * 60e3, 864e5, 3 * 864e5, 7 * 864e5, 21 * 864e5];
const RECENT = 10;

export function parseGym(raw: string | null): GymStats {
  try {
    const o = JSON.parse(raw ?? '');
    if (!o || typeof o !== 'object' || typeof o.items !== 'object') return { items: {}, recent: {} };
    const items: Record<string, GymItem> = {};
    for (const [k, v] of Object.entries(o.items as Record<string, GymItem>)) {
      if (v && [v.box, v.due, v.asked, v.right].every((n) => typeof n === 'number')) items[k] = { box: Math.max(0, Math.min(5, v.box)), due: v.due, asked: v.asked, right: v.right };
    }
    const recent: Record<string, boolean[]> = {};
    for (const [k, v] of Object.entries((o.recent ?? {}) as Record<string, unknown>)) if (Array.isArray(v)) recent[k] = v.filter((b) => typeof b === 'boolean').slice(-RECENT);
    return { items, recent };
  } catch { return { items: {}, recent: {} }; }
}

/** Record an answer for `itemId` (e.g. "degree:minor:b6") in game `game` (or a stage id). */
export function gymAnswer(s: GymStats, game: string, itemId: string, ok: boolean, now = Date.now()): GymStats {
  const prev = s.items[itemId] ?? { box: 0, due: now, asked: 0, right: 0 };
  const box = ok ? Math.min(5, prev.box + 1) : 1;
  const item: GymItem = { box, due: now + GYM_GAPS[box]!, asked: prev.asked + 1, right: prev.right + (ok ? 1 : 0) };
  return {
    items: { ...s.items, [itemId]: item },
    recent: { ...s.recent, [game]: [...(s.recent[game] ?? []), ok].slice(-RECENT) },
  };
}

/** Share right of the last ≤10 answers in a game/stage (null when nothing yet). */
export function gymAccuracy(s: GymStats, game: string): number | null {
  const r = s.recent[game];
  return r?.length ? r.filter(Boolean).length / r.length : null;
}
/** Adaptive level: 'close' (harder) once 8 of the last 10 are right. */
export function gymLevel(s: GymStats, game: string): 'easy' | 'close' {
  const r = s.recent[game] ?? [];
  return r.length >= 6 && r.filter(Boolean).length / r.length >= 0.8 ? 'close' : 'easy';
}
/** Items (of the given ids, or all) whose review is due now and that have been seen before. */
export function gymDue(s: GymStats, now = Date.now(), ids?: string[]): string[] {
  return (ids ?? Object.keys(s.items)).filter((id) => { const it = s.items[id]; return !!it && it.asked > 0 && it.due <= now; });
}
/** Mastery 0..1 of a set of items (box / 5 averaged; unseen = 0). */
export function gymMastery(s: GymStats, ids: string[]): number {
  if (!ids.length) return 0;
  return ids.reduce((a, id) => a + (s.items[id]?.box ?? 0) / 5, 0) / ids.length;
}
/** Pick the next item: a due review ~40% of the time, otherwise the weakest/newest; never `avoid` if possible. */
export function gymPick(s: GymStats, ids: string[], rand: Rand = Math.random, now = Date.now(), avoid?: string): string {
  const pool = ids.length > 1 && avoid ? ids.filter((i) => i !== avoid) : ids;
  const due = gymDue(s, now, pool);
  if (due.length && rand() < 0.4) return due[Math.floor(rand() * due.length)]!;
  const score = (id: string) => { const it = s.items[id]; return (it?.box ?? 0) + (it ? it.right / Math.max(1, it.asked) : 0) + rand() * 1.5; };
  return [...pool].sort((a, b) => score(a) - score(b))[0]!;
}

// ───────────────────────── scale degrees (#1, #5, #6) ─────────────────────────
export interface Degree { index: number; semis: number; label: string; feel: string; pull: string }

const FEEL: Record<string, [string, string]> = {
  '1': ['home', 'This is home — everything else leans back to it.'],
  '2': ['passing', 'One step above home — it usually steps down to home.'],
  'b2': ['dark edge', 'A half step above home — tense and dark, it sinks to home.'],
  '3': ['bright colour', 'The note that makes it sound happy; stable, sits on top of home.'],
  'b3': ['sad colour', 'The note that makes it sound sad; stable, sits on top of home.'],
  '4': ['lifted', 'Feels lifted and wants to fall back a step.'],
  '#4': ['floating', 'The raised 4th — floating, dreamy, wants to rise to 5.'],
  '5': ['strong', 'The strongest note after home — stable, like a second home.'],
  'b5': ['unstable', 'Halfway across — very unstable.'],
  '6': ['soft', 'Soft and warm; it drifts down to 5.'],
  'b6': ['wistful', 'Wistful and heavy; it sighs down to 5.'],
  '7': ['leans home', 'Right under home — it pulls hard up into home.'],
  'b7': ['relaxed', 'A whole step under home — relaxed, bluesy, no hurry to resolve.'],
};
const LABEL = ['1', 'b2', '2', 'b3', '3', '4', '#4', '5', 'b6', '6', 'b7', '7'];
export const prettyDegree = (l: string) => l.replace('b', '♭').replace('#', '♯');

/** The seven steps of the current mode with mode-aware labels (♭3 in minor) and plain feel words. */
export function modeDegrees(k: Key): Degree[] {
  const ivs = MODE_BY_ID[k.mode].intervals;
  return ivs.map((semis, index) => {
    let label = LABEL[semis]!;
    if (semis === 6 && index === 4) label = 'b5';
    const [feel, pull] = FEEL[label]!;
    return { index, semis, label, feel, pull };
  });
}

/** Blocked → mixed stages (degree indexes; every stage keeps 1 as the anchor). */
export const GYM_STAGES: Array<{ id: string; name: string; idx: number[] }> = [
  { id: 's135', name: '1·3·5', idx: [0, 2, 4] },
  { id: 's27', name: '2·7', idx: [0, 1, 6] },
  { id: 's46', name: '4·6', idx: [0, 3, 5] },
  { id: 'mix', name: 'Mix all', idx: [0, 1, 2, 3, 4, 5, 6] },
];
export const degreeItemId = (k: Key, d: Degree, game: 'degree' | 'sing' = 'degree') => `${game}:${k.mode}:${d.label}`;
/** Suggested stage: the first not yet solid (8/10 recent right in that stage). */
export function suggestedStage(s: GymStats, game: 'degree' | 'sing' = 'degree'): string {
  for (const st of GYM_STAGES) { const a = gymAccuracy(s, `${game}-${st.id}`); if (st.id === 'mix' || a === null || a < 0.8 || (s.recent[`${game}-${st.id}`]?.length ?? 0) < 8) return st.id; }
  return 'mix';
}

/** Home cadence in this key: 1–4–5–1 from the mode's own chords (mode-aware context, JMTP "contextual ear training"). */
export function homeCadence(k: Key): Chord[] {
  const d = diatonicChords(k);
  return [d[0]!, d[3]!, d[4]!, d[0]!];
}
/** MIDI for a degree near middle register (C4..B4 band around the tonic). */
export function degreeMidi(k: Key, d: Degree, base = 60): number {
  const t = tonicPc(k);
  return base + mod(t - base, 12) + d.semis - (mod(t - base, 12) + d.semis >= 10 ? 12 : 0);
}
/** Resolution path from a degree to the nearest home, step by step through the scale (played after answering). */
export function resolvePath(k: Key, d: Degree, base = 60): number[] {
  const start = degreeMidi(k, d, base);
  if (d.index === 0) return [start];
  const pcs = scalePcs(k);
  const up = d.index >= 4; // 5,6,7 go up to the octave; 2,3,4 come down
  const out = [start];
  let m = start;
  for (let guard = 0; guard < 8 && mod(m - tonicPc(k), 12) !== 0; guard++) {
    do { m += up ? 1 : -1; } while (!pcs.includes(mod(m, 12)));
    out.push(m);
  }
  return out;
}

// ───────────────────────── sung pitch judging (#6) ─────────────────────────
export interface SungFrame { t: number; midi: number | null }
export interface SungResult { ok: boolean; heard: number | null; offset: number | null; heldSec: number }
/** Octave-free check: ≥ minHold seconds within ±tol semitones of the target pitch class. */
export function judgeSung(frames: SungFrame[], targetMidi: number, tol = 0.5, minHold = 0.35): SungResult {
  const voiced = frames.filter((f) => f.midi !== null) as Array<{ t: number; midi: number }>;
  if (!voiced.length) return { ok: false, heard: null, offset: null, heldSec: 0 };
  const off = (m: number) => { const d = mod(m - targetMidi + 6, 12) - 6; return d; };
  let best = 0; let runStart: number | null = null; let last = 0;
  for (const f of voiced) {
    if (Math.abs(off(f.midi)) <= tol) {
      if (runStart === null || f.t - last > 0.15) runStart = f.t;
      best = Math.max(best, f.t - runStart); last = f.t;
    } else runStart = null;
  }
  const sorted = voiced.map((f) => f.midi).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  return { ok: best >= minHold, heard: median, offset: off(median), heldSec: best };
}

// ───────────────────────── loops for chord games (#2, #3, #7) ─────────────────────────
const fits = (c: Chord, k: Key) => { const s = scalePcs(k); return chordPcs(c).filter((p) => !s.includes(p)).length <= 1; };
/** Loop to practise on: your bars (≥3, mostly in key) → your Style's top progression → I–V–vi–IV-ish. */
export function gymLoop(bars: Chord[], k: Key, styleId: string | null, prefer: 'mine' | 'style' = 'mine'): { chords: Chord[]; source: 'mine' | 'style' | 'default'; note?: string } {
  const mine = bars.slice(0, 8);
  const mineOk = mine.length >= 3 && mine.filter((c) => fits(c, k)).length >= mine.length - 1 && new Set(mine.map((c) => chordSymbol(c))).size >= 2;
  if (prefer === 'mine' && mineOk) return { chords: mine, source: 'mine' };
  const styl = styleProgressions(styleId ? STYLE_BY_ID[styleId] : null, k).find((p) => p.chords.length >= 3 && new Set(p.symbols).size >= 3);
  const from = styleId && STYLE_BY_ID[styleId] ? `a ${STYLE_BY_ID[styleId]!.name} progression` : 'a common progression';
  const note = prefer === 'mine' && !mineOk ? (mine.length < 3 ? `Your bars are short, so this uses ${from} in your key.` : `Your bars wander outside the key, so this uses ${from} in your key.`) : undefined;
  if (styl) return { chords: styl.chords.slice(0, 8), source: 'style', note };
  const d = diatonicChords(k);
  return { chords: [d[0]!, d[4]!, d[5]!, d[3]!], source: 'default', note };
}

/** Similarity of two chords (shared notes + same family) — higher = harder to tell apart. */
export function chordCloseness(a: Chord, b: Chord): number {
  const pa = chordPcs(a); const pb = new Set(chordPcs(b));
  const shared = pa.filter((p) => pb.has(p)).length;
  return shared + (triadClass(a.quality) === triadClass(b.quality) ? 0.5 : 0);
}

function candidates(k: Key, exclude: Chord[]): Chord[] {
  const d = diatonicChords(k);
  return d.filter((c) => !exclude.some((e) => chordsEqual(e, c)) && c.quality !== 'dim');
}
function shuffle<T>(xs: T[], rand: Rand): T[] { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; } return a; }

export interface SwapQuestion { loop: Chord[]; bar: number; changed: Chord[]; replacement: Chord; options: Chord[]; itemId: string }
/** #2 — one bar (not the first) swapped for a diatonic chord; 'easy' = distant swap, 'close' = similar chord. */
export function makeSwap(loop: Chord[], k: Key, level: 'easy' | 'close', rand: Rand = Math.random): SwapQuestion | null {
  if (loop.length < 2) return null;
  const bar = 1 + Math.floor(rand() * (loop.length - 1));
  const orig = loop[bar]!;
  const pool = candidates(k, [orig]).filter((c) => !chordsEqual(c, loop[bar - 1]!));
  if (!pool.length) return null;
  const ranked = [...pool].sort((a, b) => chordCloseness(orig, a) - chordCloseness(orig, b));
  const half = Math.max(1, Math.ceil(ranked.length / 2));
  const band = level === 'easy' ? ranked.slice(0, half) : ranked.slice(-half);
  const replacement = band[Math.floor(rand() * band.length)]!;
  const changed = loop.map((c, i) => (i === bar ? replacement : c));
  const distract = shuffle(pool.filter((c) => !chordsEqual(c, replacement)), rand).slice(0, 2);
  return { loop, bar, changed, replacement, options: shuffle([replacement, ...distract], rand), itemId: `swap:${romanOf(orig, k)}>${romanOf(replacement, k)}` };
}

export interface NameQuestion { loop: Chord[]; bar: number; answer: Chord; options: Chord[]; itemId: string }
/** #3 — hide one bar (never bar 1, which is shown as home); 4 numeral choices. Picks the bar via the adaptive engine. */
export function makeName(loop: Chord[], k: Key, s: GymStats, level: 'easy' | 'close', rand: Rand = Math.random): NameQuestion | null {
  if (loop.length < 2) return null;
  const bars = loop.map((_, i) => i).slice(1);
  const ids = bars.map((i) => `name:${k.mode}:${romanOf(loop[i]!, k)}`);
  const pick = gymPick(s, ids, rand);
  const bar = bars[ids.indexOf(pick)]!;
  const answer = loop[bar]!;
  const pool = candidates(k, [answer]);
  const ranked = [...pool].sort((a, b) => chordCloseness(answer, a) - chordCloseness(answer, b));
  const band = level === 'easy' ? ranked.slice(0, 4) : ranked.slice(-4);
  return { loop, bar, answer, options: shuffle([answer, ...shuffle(band, rand).slice(0, 3)], rand), itemId: pick };
}

export interface BassQuestion { loop: Chord[]; bars: number[]; answers: Degree[]; options: Degree[]; itemIds: string[] }
/** Bass step of a chord (its slash bass if any, else root) as a mode degree (null if outside the mode). */
export function bassDegree(c: Chord, k: Key): Degree | null {
  const semis = mod(pc(c.bass ?? c.root) - tonicPc(k), 12);
  return modeDegrees(k).find((d) => d.semis === semis) ?? null;
}
/** #7 — ask the bass step of 2 bars (bar 1 is shown as home); choices = loop's bass steps + one distractor. */
export function makeBass(loop: Chord[], k: Key, s: GymStats, rand: Rand = Math.random): BassQuestion | null {
  const degs = loop.map((c) => bassDegree(c, k));
  const askable = loop.map((_, i) => i).filter((i) => i > 0 && degs[i]);
  if (!askable.length) return null;
  const ids = askable.map((i) => `bass:${k.mode}:${degs[i]!.label}`);
  const first = askable[ids.indexOf(gymPick(s, ids, rand))]!;
  const rest = askable.filter((i) => i !== first);
  const bars = [first, ...(rest.length ? [rest[Math.floor(rand() * rest.length)]!] : [])].sort((a, b) => a - b);
  const answers = bars.map((i) => degs[i]!);
  const all = modeDegrees(k);
  const inLoop = all.filter((d) => degs.some((x) => x?.label === d.label));
  const extra = shuffle(all.filter((d) => !inLoop.includes(d)), rand)[0];
  const options = [...inLoop, ...(extra && inLoop.length < 5 ? [extra] : [])].sort((a, b) => a.index - b.index);
  return { loop, bars, answers, options, itemIds: answers.map((d) => `bass:${k.mode}:${d.label}`) };
}
/** Low bass MIDI for a chord: lands at/above the tuning's lowest string (so Drop D's open D is reachable). */
export function bassMidiFor(c: Chord, tuning?: Tuning | null): number {
  const floor = tuning?.strings[0] ?? 40;
  return floor + mod(pc(c.bass ?? c.root) - floor, 12);
}
/** Plain note when a bass lands on the tuning's open low string. */
export function openStringNote(c: Chord, tuning: Tuning | null | undefined, k: Key): string | null {
  if (!tuning) return null;
  const low = tuning.strings[0]!;
  if (mod(pc(c.bass ?? c.root) - low, 12) !== 0) return null;
  const home = mod(low - tonicPc(k), 12) === 0;
  return `That bass is your open low string in ${tuning.name}${home ? ' — home, so it can just ring.' : '.'}`;
}
