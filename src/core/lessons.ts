// Lessons (ideas 8–13): break-it-fix-it puzzles, one-idea missions, concept detection ("theory unlocked"),
// scale-degree colours, same-song-every-key and mode morph. All read the current key/mode (+ Style /
// tuning where relevant). Framework-free; see docs/dialectic/08–13.
import { Chord, chordPcs, chordSymbol, triadClass } from './chords';
import { mod, pc, parseNote, type NoteName } from './notes';
import { Key, MODE_BY_ID, ModeId, diatonicChords, key as mkKey, scalePcs, tonicChoices, tonicPc } from './scales';
import { analyzeRoman, romanOf } from './roman';
import { styleProfile } from './styleProfiles';
import { STYLE_BY_ID, styleProgressions } from './styles';
import { transposeName } from './session';
import { tuningTonics } from './styleProfiles';
import type { Tuning } from './tunings';
import type { Rand } from './earGym';

const fam = (k: Key) => MODE_BY_ID[k.mode].family;
const sym = (c: Chord) => chordSymbol(c);
const isHome = (c: Chord, k: Key) => pc(c.root) === tonicPc(k) && !c.bass;
const off = (c: Chord, k: Key) => mod(pc(c.root) - tonicPc(k), 12);
const inKey = (c: Chord, k: Key) => { const s = scalePcs(k); return chordPcs(c).every((p) => s.includes(p)); };

// ───────────────────────── #10 concepts ─────────────────────────
export type ConceptId = 'authentic' | 'plagal' | 'deceptive' | 'half' | 'borrowed' | 'secondary' | 'sus' | 'seventh' | 'power' | 'modalColour';
export interface ConceptDef { id: ConceptId; name: string; plain: string }
export const CONCEPTS: ConceptDef[] = [
  { id: 'authentic', name: 'Strong landing (authentic cadence)', plain: 'The chord built on step 5 going to home. The strongest “we’ve arrived” feeling in music.' },
  { id: 'plagal', name: 'Amen landing (plagal cadence)', plain: 'Step 4 going to home — a softer, warmer arrival (the “A-men” at the end of hymns).' },
  { id: 'deceptive', name: 'Fake-out (deceptive move)', plain: 'Step 5 sets up home, then it lands on the sad 6 chord instead. A surprise that keeps the song going.' },
  { id: 'half', name: 'Question mark (half cadence)', plain: 'Ending a phrase on the 5 chord. It sounds like a question that wants an answer.' },
  { id: 'borrowed', name: 'Borrowed chord', plain: 'A chord taken from the opposite mood of the same home note — like a sad chord dropped into a happy song.' },
  { id: 'secondary', name: 'Secondary dominant', plain: 'A chord that points strongly at another chord (not home) — a little “mini home” for a moment.' },
  { id: 'sus', name: 'Suspended chord', plain: 'A chord with its middle note swapped for a neighbour — open and unresolved, it wants to settle.' },
  { id: 'seventh', name: 'Seventh chord', plain: 'A chord with an extra note stacked on top — richer, jazzier, a bit more tension.' },
  { id: 'power', name: 'Power chord', plain: 'Just the root and fifth — no happy/sad note, so it’s neutral, heavy and great with distortion.' },
  { id: 'modalColour', name: 'Mode colour', plain: 'A chord that shows off a mode’s signature note — like the ♭VII that gives rock its Mixolydian swagger.' },
];
export const CONCEPT_BY_ID = Object.fromEntries(CONCEPTS.map((c) => [c.id, c])) as Record<ConceptId, ConceptDef>;

/** Concepts present in the bars, with the bar indexes where each shows up. */
export function detectConcepts(chords: Chord[], k: Key): Partial<Record<ConceptId, number[]>> {
  const out: Partial<Record<ConceptId, number[]>> = {};
  const add = (id: ConceptId, i: number) => { (out[id] ??= []).includes(i) || out[id]!.push(i); };
  const major = fam(k) === 'major';
  chords.forEach((c, i) => {
    const rn = analyzeRoman(c, k);
    const o = off(c, k);
    const cls = triadClass(c.quality);
    if (cls === 'sus') add('sus', i);
    if (cls === 'power') add('power', i);
    if (/7|9|ø|11|13/.test(c.quality) && cls !== 'sus') add('seventh', i);
    if (rn.secondary) add('secondary', i);
    else if (!rn.diatonic && cls !== 'power') {
      // modal colour vs borrowed (a parallel-mode chord)
      if (major && o === 10 && cls === 'maj') add('modalColour', i);
      else if (!major && o === 5 && cls === 'maj') add('modalColour', i);
      else if (!major && o === 7 && cls === 'maj') { /* raised-7 V in minor: normal, not borrowed */ }
      else {
        const parallel = mkKey(noteStr(k.tonic), major ? 'minor' : 'major');
        if (chordPcs(c).every((p) => scalePcs(parallel).includes(p))) add('borrowed', i);
      }
    }
    const prev = chords[i - 1];
    if (prev) {
      const po = off(prev, k); const pcls = triadClass(prev.quality);
      const prevDom = po === 7 && (pcls === 'maj' || pcls === 'sus' || pcls === 'power');
      if (prevDom && isHome(c, k)) add('authentic', i);
      if (po === 5 && isHome(c, k)) add('plagal', i);
      if (prevDom && o === (major ? 9 : 8)) add('deceptive', i);
    }
  });
  const last = chords.at(-1);
  if (last && chords.length >= 2 && off(last, k) === 7 && ['maj', 'power', 'sus'].includes(triadClass(last.quality))) add('half', chords.length - 1);
  return out;
}
function noteStr(n: NoteName): string { return 'CDEFGAB'[n.letter]! + (n.acc > 0 ? '#'.repeat(n.acc) : 'b'.repeat(-n.acc)); }

/** Concepts newly introduced by an edit (present now, not before, not yet seen). */
export function newConcepts(before: Chord[], after: Chord[], k: Key, seen: string[]): ConceptId[] {
  const a = detectConcepts(after, k); const b = detectConcepts(before, k);
  return (Object.keys(a) as ConceptId[]).filter((id) => !b[id] && !seen.includes(id));
}
/** A short example of a concept realised in this key (to hear on the card). */
export function conceptExample(id: ConceptId, k: Key): Chord[] {
  const d = diatonicChords(k);
  const R = (semi: number, q: Chord['quality']): Chord => ({ root: rootAt(k, semi), quality: q });
  const I = d[0]!; const IV = d[3]!; const V = R(7, 'maj'); const vi = d[5]!;
  switch (id) {
    case 'authentic': return [I, IV, V, I];
    case 'plagal': return [I, IV, I];
    case 'deceptive': return [I, V, fam(k) === 'major' ? vi : R(8, 'maj')];
    case 'half': return [I, IV, V];
    case 'borrowed': return fam(k) === 'major' ? [I, IV, R(5, 'min'), I] : [I, IV, R(0, 'maj')];
    case 'secondary': return [I, R(2, '7'), V, I];
    case 'sus': return [I, R(7, 'sus4'), V, I];
    case 'seventh': return [{ ...I, quality: fam(k) === 'major' ? 'maj7' : 'm7' }, { ...IV, quality: fam(k) === 'major' ? 'maj7' : 'm7' }];
    case 'power': return [R(0, '5'), R(10, '5'), R(5, '5'), R(0, '5')];
    case 'modalColour': return fam(k) === 'major' ? [I, R(10, 'maj'), IV, I] : [I, R(5, 'maj'), I];
  }
}
function rootAt(k: Key, semi: number): NoteName {
  const target = mod(tonicPc(k) + semi, 12);
  const steps = [0, 2, 4, 5, 7, 9, 11];
  const NAT = [0, 2, 4, 5, 7, 9, 11];
  // spell on the scale-degree letter: exact, else flat, else sharp
  for (const want of [0, -1, 1]) {
    for (let d = 0; d < 7; d++) {
      if (mod(semi - steps[d]! + 6, 12) - 6 !== want) continue;
      const letter = (k.tonic.letter + d) % 7;
      const acc = mod(target - NAT[letter]! + 6, 12) - 6;
      if (Math.abs(acc) <= 1) return { letter, acc };
    }
  }
  return parseNote(['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][target]!)!;
}

// ───────────────────────── #11 degree colours ─────────────────────────
/** Fixed colour per scale step (1 home violet … 7); null when the root is outside the mode. */
export const DEGREE_COLORS = ['#b79cff', '#7fb4ff', '#6fd1c0', '#8fd17a', '#ffd166', '#ff9f6b', '#ff7aa8'];
export function degreeColor(c: Chord, k: Key): string | null {
  const ivs = MODE_BY_ID[k.mode].intervals;
  const i = ivs.indexOf(off(c, k));
  return i >= 0 ? DEGREE_COLORS[i]! : null;
}

// ───────────────────────── #8 break it, fix it ─────────────────────────
export type PuzzleKind = 'finish' | 'clash' | 'stuck' | 'lift';
export interface Puzzle { kind: PuzzleKind; goal: string; hint: string; chords: Chord[]; choices: Chord[] }
const GOALS: Record<PuzzleKind, [string, string]> = {
  finish: ['Make it feel finished.', 'Try changing the last bar to home, and make the bar before it pull there.'],
  clash: ['One chord sticks out. Make it blend.', 'Listen for the bar that sounds “wrong-ish” and swap it for a chord from the key.'],
  stuck: ['It never leaves home. Give it somewhere to go.', 'Change bar 2 or 3 to any other chord, then come back home.'],
  lift: ['The middle doesn’t lift. Make bar 3 feel different from bar 1.', 'Bar 3 repeats bar 1 — pick a chord that moves away.'],
};
/** Modal-cadence styles (profile prefers a non-major/minor mode) accept ♭VII / ♭II approaches. */
function modalStyle(styleId: string | null | undefined): boolean {
  const p = styleProfile(styleId);
  return !!p && p.modes.slice(0, 2).some((m) => !['major', 'minor', 'harmonicMinor'].includes(m));
}
export function makePuzzle(kind: PuzzleKind, k: Key, styleId: string | null, rand: Rand = Math.random): Puzzle {
  const d = diatonicChords(k);
  const base = styleProgressions(styleId ? STYLE_BY_ID[styleId] : null, k).map((p) => p.chords).find((cs) => cs.length >= 4 && isHome(cs[0]!, k) && cs.slice(0, 4).every((c) => inKey(c, k)))?.slice(0, 4)
    ?? [d[0]!, d[3]!, d[4]!, d[0]!];
  let chords = [...base];
  if (kind === 'finish') {
    chords = [...base.slice(0, 3), [d[1]!, d[3]!, d[5]!][Math.floor(rand() * 3)]!];
    if (isHome(chords[2]!, k)) chords[2] = d[3]!;
  } else if (kind === 'clash') {
    const i = 1 + Math.floor(rand() * 2);
    const outs = [1, 6, 3, 8, 10].map((s) => ({ root: rootAt(k, s), quality: 'maj' as const })).filter((c) => !inKey(c, k) && !analyzeRoman(c, k).secondary);
    chords[i] = outs[Math.floor(rand() * outs.length)] ?? { root: rootAt(k, 6), quality: 'maj' };
  } else if (kind === 'stuck') chords = [d[0]!, d[0]!, d[0]!, d[0]!];
  else chords = [base[0]!, base[1]!, base[0]!, base[3]!];
  const choices = d.filter((c) => c.quality !== 'dim' && triadClass(c.quality) !== 'dim');
  return { kind, goal: GOALS[kind][0], hint: GOALS[kind][1], chords, choices };
}
export interface PuzzleCheck { ok: boolean; why: string }
export function checkPuzzle(p: Puzzle, now: Chord[], k: Key, styleId: string | null = null): PuzzleCheck {
  const last = now.at(-1)!; const pen = now.at(-2)!;
  switch (p.kind) {
    case 'finish': {
      if (!isHome(last, k)) return { ok: false, why: 'The last bar isn’t home yet.' };
      const o = off(pen, k);
      const strong = [7, 5, 11].includes(o) || (modalStyle(styleId) && [10, 1].includes(o));
      if (!strong) return { ok: false, why: `It ends home, but ${romanOf(pen, k)} → home is weak. Try the 5 or 4 chord before it.` };
      const style = styleId && modalStyle(styleId) && [10, 1].includes(o) ? ` — a classic ${STYLE_BY_ID[styleId]?.name ?? ''} landing` : '';
      return { ok: true, why: `${romanOf(pen, k)} → ${romanOf(last, k)} lands home${style}. That pull is what makes it feel finished.` };
    }
    case 'clash': {
      const bad = now.findIndex((c) => !inKey(c, k));
      return bad < 0 ? { ok: true, why: 'Every chord now uses notes from the key, so nothing sticks out.' } : { ok: false, why: `Bar ${bad + 1} still uses a note outside the key.` };
    }
    case 'stuck': {
      const moved = now.slice(1, 3).some((c) => !isHome(c, k));
      if (!moved) return { ok: false, why: 'Bars 2–3 are still home.' };
      return isHome(now[3]!, k) ? { ok: true, why: 'Leaving home and coming back is what gives a progression its shape.' } : { ok: true, why: 'It moves now — bonus: end on home to make it feel complete.' };
    }
    case 'lift': {
      if (sym(now[2]!) === sym(now[0]!)) return { ok: false, why: 'Bar 3 still repeats bar 1.' };
      return { ok: true, why: `${romanOf(now[2]!, k)} in bar 3 gives the middle somewhere new to go before it returns.` };
    }
  }
}

// ───────────────────────── #9 missions ─────────────────────────
export interface Mission { id: string; title: string; hint: string; learn: string; check: (cs: Chord[], k: Key) => boolean }
export function missions(k: Key): Mission[] {
  const major = fam(k) === 'major';
  const has = (cs: Chord[], id: ConceptId) => !!detectConcepts(cs, k)[id];
  return [
    { id: 'unfinished', title: 'Make it sound unfinished', hint: 'End on any chord that isn’t home — the 5 chord is the most “question-like”.', learn: 'Ending away from home leaves the listener hanging — great for verses that lead into a chorus.', check: (cs) => cs.length >= 2 && !isHome(cs.at(-1)!, k) },
    { id: 'finished', title: 'Make it feel finished', hint: 'End on home, with the 5 or 4 chord right before it.', learn: 'A strong chord right before home is what makes an ending feel final.', check: (cs) => has(cs, 'authentic') || has(cs, 'plagal') },
    { id: 'borrow', title: major ? 'Borrow one sad chord' : 'Borrow one bright chord', hint: major ? 'In the palette’s “Extra colour” row, try iv or ♭VI.' : 'In the palette’s “Extra colour” row, try IV or the major I.', learn: 'Borrowing from the opposite mood is how songs get bittersweet moments.', check: (cs) => has(cs, 'borrowed') || has(cs, 'modalColour') },
    { id: 'sus', title: 'Use a sus chord that settles', hint: 'Add a sus4 chord, then the plain chord on the same root.', learn: 'Sus chords hang in the air; resolving them gives a gentle “ahh”.', check: (cs) => cs.some((c, i) => triadClass(c.quality) === 'sus' && cs[i + 1] && pc(cs[i + 1]!.root) === pc(c.root) && triadClass(cs[i + 1]!.quality) !== 'sus') },
    { id: 'secondary', title: 'Point at a chord that isn’t home', hint: 'Use a “Secondaries” chord from the palette right before its target.', learn: 'Secondary dominants make any chord feel like a mini-destination.', check: (cs) => has(cs, 'secondary') },
    { id: 'seventh', title: 'Add a richer chord', hint: 'Pick any chord from the “7ths (richer)” row.', learn: 'Sevenths add one extra note on top — instant warmth or jazz.', check: (cs) => has(cs, 'seventh') },
    { id: 'home2', title: 'Come home twice', hint: 'Make home appear in the middle and at the end.', learn: 'Returning home mid-way splits a progression into two phrases — call and answer.', check: (cs) => cs.filter((c, i) => i > 0 && isHome(c, k)).length >= 2 },
    { id: 'loop4', title: 'Four different chords in a loop', hint: 'Fill 4 bars with 4 different chords from the key.', learn: 'Most pop songs are 4 different chords looping — variety with repetition.', check: (cs) => cs.length >= 4 && new Set(cs.slice(0, 4).map(sym)).size === 4 },
  ];
}

// ───────────────────────── #12 same song, every key ─────────────────────────
export interface KeyOption { tonic: string; current: boolean; easy: boolean }
export function keyRing(k: Key, tuning: Tuning | null): KeyOption[] {
  const easy = tuning ? tuningTonics(tuning).map((x) => mod(x, 12)) : [];
  return tonicChoices(k.mode).map((t) => ({ tonic: t, current: pc(parseNote(t)!) === tonicPc(k), easy: easy.includes(pc(parseNote(t)!)) }));
}
export function transposeChords(cs: Chord[], from: NoteName, to: NoteName): Chord[] {
  return cs.map((c) => ({ ...c, root: transposeName(c.root, from, to), ...(c.bass ? { bass: transposeName(c.bass, from, to) } : {}) }));
}

// ───────────────────────── #13 mode morph ─────────────────────────
export const BRIGHTNESS: ModeId[] = ['lydian', 'major', 'mixolydian', 'dorian', 'minor', 'phrygian', 'locrian'];
/** The one note that differs between neighbouring modes on the ladder (plain words). */
export function modeStepNote(from: ModeId, to: ModeId): string | null {
  const a = MODE_BY_ID[from].intervals; const b = MODE_BY_ID[to].intervals;
  const diffs = a.map((x, i) => ({ i, d: b[i]! - x })).filter((x) => x.d !== 0);
  if (diffs.length !== 1) return diffs.length ? `${diffs.length} notes change` : null;
  const { i, d } = diffs[0]!;
  const ord = ['home', '2nd', '3rd', '4th', '5th', '6th', '7th'][i]!;
  return `${d < 0 ? 'Lower' : 'Raise'} the ${ord}${d < 0 ? ' — a shade darker' : ' — a shade brighter'}.`;
}
/** Re-realise chords in another mode on the same tonic, step-by-step (bar on step 4 stays on step 4). */
export function morphChords(cs: Chord[], k: Key, to: ModeId): Chord[] {
  const from = MODE_BY_ID[k.mode].intervals;
  const target = diatonicChords({ ...k, mode: to });
  const target7 = diatonicChords({ ...k, mode: to }, true);
  return cs.map((c) => {
    const i = from.indexOf(off(c, k));
    if (i < 0) return c;
    const sev = /7|9/.test(c.quality);
    return { ...(sev ? target7[i]! : target[i]!), ...(c.bass ? {} : {}) };
  });
}
