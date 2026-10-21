// Song helpers (ideas 14–19): melody coach, strum patterns, hook builder, lyric stress fitter,
// modulation routes, arrangement layers. All read key/mode, chords, time signature, Style and tuning.
// Framework-free; see docs/dialectic/14–19.
import { Chord, chordPcs, chordSymbol, triadClass } from './chords';
import { mod, pc, parseNote } from './notes';
import { Key, MODE_BY_ID, diatonicChords, key as mkKey, scalePcs, tonicChoices, tonicPc } from './scales';
import type { BeatNote } from './hum';
import type { Tuning } from './tunings';
import { tuningTonics } from './styleProfiles';
import type { Rand } from './earGym';

// ───────────────────────── #14 melody coach ─────────────────────────
export interface CoachTrait { id: 'smooth' | 'range' | 'repeat' | 'landing' | 'home'; label: string; left: string; right: string; value: number }
export interface CoachReport { traits: CoachTrait[]; tip: string; bar: number | null }
/** Number-free melody traits + one tip. `melody` beats are absolute; bar i starts at i * beatsPerBar. */
export function melodyCoach(melody: BeatNote[], chords: Chord[], k: Key, beatsPerBar: number): CoachReport | null {
  const ns = [...melody].sort((a, b) => a.beat - b.beat);
  if (ns.length < 4) return null;
  const ivs = ns.slice(1).map((n, i) => n.midi - ns[i]!.midi);
  const moves = ivs.filter((d) => d !== 0);
  const steps = moves.filter((d) => Math.abs(d) <= 2).length;
  const smooth = moves.length ? steps / moves.length : 1;
  const midis = ns.map((n) => n.midi);
  const range = Math.max(...midis) - Math.min(...midis);
  // range: ideal 7..16 semitones
  const rangeV = range < 5 ? range / 10 : range <= 16 ? 0.6 + 0.4 * Math.min(1, (range - 5) / 7) : Math.max(0.2, 1 - (range - 16) / 12);
  // repetition: share of 3-interval cells that recur (by contour+interval)
  const cells = ivs.slice(0, -2).map((_, i) => ivs.slice(i, i + 3).join(','));
  const counts = new Map<string, number>(); cells.forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1));
  const repeated = cells.length ? cells.filter((c) => counts.get(c)! > 1).length / cells.length : 0;
  // landing: notes at bar ends / longest note per bar on chord tones
  const barOf = (n: BeatNote) => Math.floor(n.beat / beatsPerBar);
  const lastPerBar = new Map<number, BeatNote>(); ns.forEach((n) => lastPerBar.set(barOf(n), n));
  const lands = [...lastPerBar.entries()].map(([b, n]) => { const c = chords[b % Math.max(1, chords.length)]; return c ? chordPcs(c).includes(mod(n.midi, 12)) : true; });
  const landing = lands.length ? lands.filter(Boolean).length / lands.length : 1;
  const last = ns.at(-1)!;
  const homeV = mod(last.midi - tonicPc(k), 12) === 0 ? 1 : chordPcs(diatonicChords(k)[0]!).includes(mod(last.midi, 12)) ? 0.6 : 0.2;
  // unrecovered leaps (leap > 4 followed by same-direction move)
  let badLeap: number | null = null;
  ivs.forEach((d, i) => { const nx = ivs[i + 1]; if (badLeap === null && Math.abs(d) > 4 && nx !== undefined && Math.sign(nx) === Math.sign(d) && nx !== 0) badLeap = i + 1; });
  const traits: CoachTrait[] = [
    { id: 'smooth', label: 'Moves by steps', left: 'jumpy', right: 'smooth', value: smooth },
    { id: 'range', label: 'Range', left: 'narrow', right: 'wide', value: Math.min(1, range / 19) },
    { id: 'repeat', label: 'Repeats an idea', left: 'always new', right: 'catchy repeats', value: Math.min(1, repeated * 1.6) },
    { id: 'landing', label: 'Lands on chord notes', left: 'floats', right: 'lands', value: landing },
    { id: 'home', label: 'Ends at home', left: 'open', right: 'resolved', value: homeV },
  ];
  const quality: Record<CoachTrait['id'], number> = { smooth: smooth >= 0.5 ? 1 : smooth * 2, range: rangeV, repeat: Math.min(1, repeated * 1.6 + 0.2), landing, home: homeV };
  if (badLeap !== null && quality.smooth > 0.6) quality.smooth = 0.55;
  const worst = (Object.keys(quality) as CoachTrait['id'][]).sort((a, b) => quality[a] - quality[b])[0]!;
  const barN = (n: BeatNote) => barOf(n) + 1;
  let tip = 'Nice shape — try singing it with words to test it.'; let bar: number | null = null;
  if (badLeap !== null) { const n = ns[badLeap]!; bar = barN(n); tip = `Bar ${bar} leaps and keeps going the same way — after a big leap, step back the other way; it makes the jump feel intentional.`; }
  else if (quality[worst] < 0.75) {
    if (worst === 'smooth') { const n = badLeap !== null ? ns[badLeap]! : ns[1 + ivs.findIndex((d) => Math.abs(d) > 4)]!; bar = barN(n); tip = `Bar ${bar} jumps a lot — after a big leap, step back the other way; it makes the jump feel intentional.`; }
    else if (worst === 'range') { tip = range < 5 ? 'It stays in a very small range — let one phrase climb higher for a peak moment.' : 'The range is very wide and hard to sing — keep most notes within about an octave.'; }
    else if (worst === 'repeat') tip = 'Every bar is new — repeat your best 3–4 note idea (maybe a step higher) so listeners can latch on.';
    else if (worst === 'landing') { const i = lands.findIndex((x) => !x); bar = [...lastPerBar.keys()][i]! + 1; tip = `Bar ${bar} ends on a note outside its chord — ending phrases on chord notes makes them feel settled.`; }
    else tip = 'It ends away from home — fine for a verse, but end on the home note to make it feel finished.';
  }
  return { traits, tip, bar };
}

// ───────────────────────── #15 strum patterns ─────────────────────────
export type Stroke = 'D' | 'U' | 'd' | 'u' | '-' ; // capital = accented, '-' = rest/miss
export interface StrumPattern { id: string; name: string; how: string; num: number[]; sub: 2 | 4 | 3; strokes: Stroke[] }
export const STRUMS: StrumPattern[] = [
  { id: 'rock8', name: 'Straight 8ths', how: 'Down on every beat, up in between — drive with the downs.', num: [4], sub: 2, strokes: ['D', 'u', 'd', 'u', 'D', 'u', 'd', 'u'] },
  { id: 'folk', name: 'Folk “D-DU-UDU”', how: 'Skip the down on beat 3 — keep the hand moving anyway.', num: [4], sub: 2, strokes: ['D', '-', 'd', 'u', '-', 'u', 'd', 'u'] },
  { id: 'chug', name: 'Palm-muted chug', how: 'All downstrokes, palm resting on the strings; accent the 1.', num: [4, 5, 7], sub: 2, strokes: ['D', 'd', 'd', 'd', 'D', 'd', 'd', 'd'] },
  { id: 'punk', name: 'Punk all-downs', how: 'Fast downstrokes only — the stiffness is the sound.', num: [4], sub: 2, strokes: ['D', 'd', 'D', 'd', 'D', 'd', 'D', 'd'] },
  { id: 'skank', name: 'Reggae skank', how: 'Short choppy strum only on the off-beats (the “and”s).', num: [4], sub: 2, strokes: ['-', 'U', '-', 'U', '-', 'U', '-', 'U'] },
  { id: 'funk16', name: 'Funk 16ths', how: 'Hand moves in 16ths; only some hit — accent the “e” and “a”.', num: [4], sub: 4, strokes: ['D', '-', 'd', 'U', '-', 'u', 'D', '-', 'd', '-', 'D', 'u', '-', 'U', 'd', 'u'] },
  { id: 'shuffle', name: 'Blues shuffle', how: 'Long-short swing: down on the beat, light up just before the next.', num: [4], sub: 3, strokes: ['D', '-', 'u', 'D', '-', 'u', 'D', '-', 'u', 'D', '-', 'u'] },
  { id: 'arp', name: 'Gentle arpeggio', how: 'Pick the chord one string at a time — for ballads and intros.', num: [3, 4, 6], sub: 2, strokes: ['D', 'd', 'd', 'd', 'd', 'd', 'd', 'd'] },
  { id: 'comp', name: 'Jazz “Charleston”', how: 'Short chord on 1, another on the “and” of 2 — then leave space.', num: [4], sub: 2, strokes: ['D', '-', '-', 'U', '-', '-', '-', '-'] },
  { id: 'rumba', name: 'Latin / rumba', how: 'Strum 1, the “and” of 2, and 4 — the clave-ish push.', num: [4], sub: 2, strokes: ['D', '-', '-', 'U', '-', '-', 'D', '-'] },
  { id: 'waltz', name: 'Waltz', how: 'Strong bass on 1, two lighter strums on 2 and 3.', num: [3, 6], sub: 2, strokes: ['D', '-', 'd', 'u', 'd', 'u'] },
];
const STRUM_FOR: Record<string, string> = {
  metal: 'chug', tool: 'chug', metallica: 'chug', 'black-sabbath': 'chug', meshuggah: 'chug', deftones: 'chug', opeth: 'chug', 'dream-theater': 'chug', 'animals-as-leaders': 'chug', 'nine-inch-nails': 'chug', prog: 'chug', 'king-crimson': 'chug',
  punk: 'punk', nirvana: 'punk', 'sonic-youth': 'punk',
  reggae: 'skank', funk: 'funk16', 'snarky-puppy': 'funk16', edm: 'rock8',
  folk: 'folk', 'joni-mitchell': 'folk', 'the-beatles': 'folk', 'rolling-stones': 'rock8',
  pop: 'folk', indie: 'rock8', rock: 'rock8', 'led-zeppelin': 'rock8', queen: 'rock8', rush: 'rock8',
  blues: 'shuffle', jazz: 'comp', coltrane: 'comp', 'steely-dan': 'comp',
  latin: 'rumba', flamenco: 'rumba',
  cinematic: 'arp', 'sigur-ros': 'arp', debussy: 'arp', messiaen: 'arp', herrmann: 'arp', 'bach-chorale': 'arp', gospel: 'arp', rnb: 'arp', lofi: 'arp', radiohead: 'arp', 'pink-floyd': 'arp', portishead: 'arp', bjork: 'arp',
};
export function strumsFor(num: number): StrumPattern[] { return STRUMS.filter((s) => s.num.includes(num)); }
export function suggestedStrum(styleId: string | null, num: number): StrumPattern {
  const fit = strumsFor(num);
  const want = STRUM_FOR[styleId ?? ''];
  return fit.find((s) => s.id === want) ?? fit.find((s) => s.id === (num % 3 === 0 ? 'waltz' : 'folk')) ?? fit[0] ?? STRUMS[0]!;
}
/** Hit times (in beats) of a pattern over one bar, with velocity. Arp splits the chord into single notes upstream. */
export function strumHits(p: StrumPattern, beatsPerBar: number): Array<{ beat: number; accent: boolean; up: boolean }> {
  const per = p.strokes.length / beatsPerBar;
  return p.strokes.map((s, i) => ({ s, beat: i / per })).filter((x) => x.s !== '-').map((x) => ({ beat: x.beat, accent: x.s === 'D' || x.s === 'U', up: x.s.toLowerCase() === 'u' }));
}

// ───────────────────────── #16 hook builder ─────────────────────────
export interface Hook { name: string; how: string; notes: BeatNote[] }
const CELLS: Array<{ name: string; beats: number[]; durs: number[] }> = [
  { name: 'Straight', beats: [0, 1, 2, 3], durs: [1, 1, 1, 1] },
  { name: 'Syncopated', beats: [0, 0.5, 1.5, 2.5], durs: [0.5, 1, 1, 1.5] },
  { name: 'Long-short', beats: [0, 1.5, 2, 3], durs: [1.5, 0.5, 1, 1] },
];
function chordToneNear(c: Chord, target: number): number {
  const pcs = chordPcs(c); let best = target; let bd = 99;
  for (let m = target - 6; m <= target + 6; m++) if (pcs.includes(mod(m, 12)) && Math.abs(m - target) < bd) { bd = Math.abs(m - target); best = m; }
  return best;
}
function scaleStep(m: number, k: Key, dir: number): number { const s = scalePcs(k); let x = m; do { x += dir; } while (!s.includes(mod(x, 12))); return x; }
/** 3 seed motifs over the first two chords: chord tones on beats, scale passing tones between. */
export function makeHooks(chords: Chord[], k: Key, beatsPerBar: number, rand: Rand = Math.random): Hook[] {
  const c1 = chords[0] ?? diatonicChords(k)[0]!;
  const base = 60 + mod(tonicPc(k) - 60, 12) + (mod(tonicPc(k) - 60, 12) > 6 ? -12 : 0) + 4;
  return CELLS.map((cell, ci) => {
    const start = chordToneNear(c1, base + Math.floor(rand() * 5) - 2);
    const dir = ci === 1 ? -1 : 1;
    const motif: BeatNote[] = cell.beats.filter((b) => b < beatsPerBar).map((b, i) => {
      const on = Number.isInteger(b);
      const m = i === 0 ? start : on ? chordToneNear(c1, start + dir * i * 2) : scaleStep(start + dir * (i - 1) * 2, k, dir);
      return { midi: m, beat: b, dur: cell.durs[i]! };
    });
    return { name: cell.name, how: ['Even and singable.', 'Pushes off the beat — feels modern.', 'Long note then quick ones — a call.'][ci]!, notes: motif };
  });
}
export type HookVariation = 'repeat' | 'sequence' | 'invert' | 'shift';
export const HOOK_VARIATIONS: Array<{ id: HookVariation; label: string; why: string }> = [
  { id: 'repeat', label: 'Repeat', why: 'Say it twice — repetition is what makes a hook stick.' },
  { id: 'sequence', label: 'Answer a step higher', why: 'Same shape, one step up — familiar but moving.' },
  { id: 'invert', label: 'Turn it upside down', why: 'Ups become downs — an answer to the first phrase.' },
  { id: 'shift', label: 'Shift the rhythm', why: 'Same notes, half a beat later — a playful push.' },
];
/** Two-bar hook: bar 1 = motif, bar 2 = variation fitted to chord 2's tones on the downbeat. */
export function varyHook(motif: BeatNote[], v: HookVariation, k: Key, next: Chord | undefined, beatsPerBar: number): BeatNote[] {
  const first = motif[0]!.midi;
  let bar2: BeatNote[];
  if (v === 'repeat') bar2 = motif.map((n) => ({ ...n }));
  else if (v === 'sequence') bar2 = motif.map((n) => ({ ...n, midi: scaleStep(n.midi, k, 1) }));
  else if (v === 'invert') bar2 = motif.map((n) => { const want = first - (n.midi - first); const s = scalePcs(k); let m = want; while (!s.includes(mod(m, 12))) m -= 1; return { ...n, midi: m }; });
  else bar2 = motif.map((n) => ({ ...n, beat: Math.min(beatsPerBar - 0.5, n.beat + 0.5), dur: Math.max(0.5, Math.min(n.dur, beatsPerBar - n.beat - 0.5)) }));
  if (next && bar2[0]) bar2[0] = { ...bar2[0], midi: chordToneNear(next, bar2[0].midi) };
  return [...motif.map((n) => ({ ...n })), ...bar2.map((n) => ({ ...n, beat: n.beat + beatsPerBar }))];
}

// ───────────────────────── #17 lyric stress ─────────────────────────
const WEAK = new Set(('a an the and or but nor so yet of in on at to for from by with as into onto upon than that this these those ' +
  'i me my mine you your yours he him his she her hers it its we us our they them their is am are was were be been being ' +
  'do does did have has had will would shall should can could may might must not no if then when while where who whom whose ' +
  'what which how all some any each both just up out off over oh ooh yeah la da na').split(' '));
const VOWELS = /[aeiouy]+/g;
/** Rough English syllable split (vowel groups; silent final e; -le endings). */
export function syllabify(word: string): string[] {
  const w = word.toLowerCase().replace(/[^a-z']/g, '');
  if (!w) return [];
  let groups = w.match(VOWELS)?.length ?? 1;
  if (/[^aeiouy]e$/.test(w) && !/[^aeiouy]le$/.test(w) && groups > 1) groups--;
  if (/(ed)$/.test(w) && !/[td]ed$/.test(w) && groups > 1) groups--;
  if (groups <= 1) return [word];
  // split evenly by vowel-group boundaries on the original word
  const parts: string[] = []; let cur = ''; let seen = 0; const lw = word;
  for (let i = 0; i < lw.length; i++) {
    cur += lw[i];
    const isV = /[aeiouy]/i.test(lw[i]!); const nextV = /[aeiouy]/i.test(lw[i + 1] ?? '');
    if (isV && !nextV && seen < groups - 1) {
      // keep one consonant for next syllable if two follow
      const rest = lw.slice(i + 1); const cons = rest.match(/^[^aeiouy]*/i)![0];
      if (!/[aeiouy]/i.test(rest)) continue;
      const take = cons.length >= 2 ? 1 : 0;
      cur += cons.slice(0, take); i += take;
      parts.push(cur); cur = ''; seen++;
    }
  }
  if (cur) parts.push(cur);
  return parts.length ? parts : [word];
}
export interface Syllable { text: string; word: number; stress: boolean }
/** Guess stresses: function words weak; -tion/-sion → syllable before; weak suffixes; else first syllable. */
export function guessStress(line: string): Syllable[] {
  const words = line.split(/\s+/).filter(Boolean);
  const out: Syllable[] = [];
  words.forEach((w, wi) => {
    const syl = syllabify(w); const lw = w.toLowerCase().replace(/[^a-z']/g, '');
    if (syl.length === 1) { out.push({ text: syl[0]!, word: wi, stress: !WEAK.has(lw) }); return; }
    let s = 0;
    if (/(tion|sion|cian)s?$/.test(lw)) s = syl.length - 2;
    else if (/^(a|be|re|de|un|for|with|to|in|en|ex|com|con|dis|mis|pre)/.test(lw) && syl.length === 2 && !/(ing|er|ly|ness|y)$/.test(lw)) s = 1;
    syl.forEach((t, i) => out.push({ text: t, word: wi, stress: i === s }));
  });
  return out;
}
export interface PlacedSyl extends Syllable { slot: number; strong: boolean; clash: boolean }
/** Place syllables on 8th-note slots so stresses land on strong beats (1 & 3 in 4/4; 1 otherwise). */
export function fitStress(syls: Syllable[], beatsPerBar: number): PlacedSyl[] {
  const strongBeat = (slot: number) => { const beat = slot / 2; const inBar = beat % beatsPerBar; return Number.isInteger(beat) && (inBar === 0 || (beatsPerBar === 4 && inBar === 2)); };
  const out: PlacedSyl[] = [];
  // Leading weak syllables become a pickup just before the first downbeat (like “I | WANT to…”).
  const lead = syls.findIndex((x) => x.stress);
  const pick = lead > 0 ? Math.min(lead, beatsPerBar * 2 - 1) : 0;
  let slot = pick ? beatsPerBar * 2 - pick : 0;
  syls.forEach((s, i) => {
    if (s.stress) {
      // advance to the next strong slot if it's within 3 slots, else next beat
      let t = slot; while (!strongBeat(t) && t - slot < 4) t++;
      slot = strongBeat(t) ? t : (slot % 2 ? slot + 1 : slot);
    }
    const strong = strongBeat(slot);
    out.push({ ...s, slot, strong, clash: (s.stress && !strong && slot % 2 === 1) || (!s.stress && strong && i > 0 && !!syls[i - 1] && !syls[i - 1]!.stress && !!syls[i + 1]?.stress) });
    slot += 1;
  });
  return out;
}

// ───────────────────────── #18 modulation ─────────────────────────
export interface ModTarget { tonic: string; label: string; easy: boolean }
export function modulationTargets(k: Key, tuning: Tuning | null): ModTarget[] {
  const t = tonicPc(k);
  const choices = tonicChoices(k.mode);
  const name = (semi: number) => choices[mod(t + semi, 12)]!;
  const easy = tuning ? tuningTonics(tuning).map((x) => mod(x, 12)) : [];
  const fam = MODE_BY_ID[k.mode].family;
  const list: Array<[number, string]> = [[1, 'Half-step lift — the classic last chorus'], [2, 'Whole-step lift — big and bright'], [5, 'Up a 4th — warm, natural'], [7, 'Up a 5th — energetic'], [fam === 'major' ? 9 : 3, fam === 'major' ? 'Relative minor home — moody turn' : 'Relative major home — sun comes out']];
  return list.map(([s, label]) => ({ tonic: name(s), label, easy: easy.includes(mod(t + s, 12)) }));
}
export interface ModRoute { kind: 'pivot' | 'dominant' | 'jump'; name: string; why: string; chords: Chord[] }
export function modulationRoutes(k: Key, toTonic: string, last?: Chord): ModRoute[] {
  const to = mkKey(toTonic, k.mode);
  const fromD = diatonicChords(k); const toD = diatonicChords(to);
  const home = toD[0]!;
  const fifth = parseNote(tonicChoices('major')[mod(tonicPc(to) + 7, 12)]!)!;
  const V7: Chord = { root: fifth, quality: '7' };
  const routes: ModRoute[] = [];
  const shared = fromD.filter((c) => triadClass(c.quality) !== 'dim' && toD.some((d) => chordSymbol(d) === chordSymbol(c)) && chordSymbol(c) !== chordSymbol(home));
  const pivot = shared.find((c) => toD.findIndex((d) => chordSymbol(d) === chordSymbol(c)) === 1 || toD.findIndex((d) => chordSymbol(d) === chordSymbol(c)) === 3) ?? shared[0];
  if (pivot) routes.push({ kind: 'pivot', name: 'Shared chord (smoothest)', why: `${chordSymbol(pivot, true)} belongs to both keys, so the ear doesn’t notice the door until it’s through it.`, chords: [pivot, V7, home] });
  routes.push({ kind: 'dominant', name: 'Its own 5 chord (clear)', why: `${chordSymbol(V7, true)} points straight at ${chordSymbol(home, true)} — an unmistakable “new home”.`, chords: [V7, home] });
  routes.push({ kind: 'jump', name: 'Just jump (bold)', why: 'No preparation — the blunt pop key-change lift. Works best right at a section start.', chords: [home] });
  void last;
  return routes;
}

// ───────────────────────── #19 arrangement layers ─────────────────────────
export type LayerId = 'pad' | 'arp' | 'bass' | 'pulse';
export const LAYERS: Array<{ id: LayerId; name: string; role: string }> = [
  { id: 'pad', name: 'Pad', role: 'glue — long held chords' },
  { id: 'arp', name: 'Arp', role: 'motion — chord notes one at a time' },
  { id: 'bass', name: 'Bass', role: 'foundation — root on the beat' },
  { id: 'pulse', name: 'Pulse', role: 'drive — short chord stabs' },
];
const BUSY = new Set(['edm', 'funk', 'snarky-puppy', 'metal', 'tool', 'meshuggah', 'dream-theater', 'animals-as-leaders', 'punk', 'nine-inch-nails']);
const SPARSE = new Set(['cinematic', 'sigur-ros', 'debussy', 'lofi', 'portishead', 'gospel', 'bach-chorale', 'jazz', 'coltrane']);
export function arpDensity(styleId: string | null): 1 | 2 | 4 { return BUSY.has(styleId ?? '') ? 4 : SPARSE.has(styleId ?? '') ? 1 : 2; }
export interface LayerEvent { layer: LayerId; kind: 'note' | 'chord'; midi?: number; chord?: Chord; beat: number; dur: number }
export function arrangeLayers(chords: Chord[], beatsPerBar: number, styleId: string | null, tuning: Tuning | null, on: LayerId[]): LayerEvent[] {
  const ev: LayerEvent[] = [];
  const dens = arpDensity(styleId);
  const floor = tuning?.strings[0] ?? 40;
  chords.forEach((c, b) => {
    const t0 = b * beatsPerBar;
    if (on.includes('pad')) ev.push({ layer: 'pad', kind: 'chord', chord: c, beat: t0, dur: beatsPerBar * 0.98 });
    if (on.includes('pulse')) for (let i = 0; i < beatsPerBar; i++) ev.push({ layer: 'pulse', kind: 'chord', chord: c, beat: t0 + i + 0.5, dur: 0.22 });
    if (on.includes('bass')) {
      const root = floor + mod(pc(c.bass ?? c.root) - floor, 12) + (floor < 40 ? 0 : 0);
      for (let i = 0; i < beatsPerBar; i += 2) ev.push({ layer: 'bass', kind: 'note', midi: i === 2 && !c.bass ? root + 7 : root, beat: t0 + i, dur: 1.8 });
    }
    if (on.includes('arp')) {
      const pcs = chordPcs(c); const base = 60 + mod(pcs[0]! - 60, 12) - (mod(pcs[0]! - 60, 12) > 7 ? 12 : 0);
      const tones = pcs.map((p) => base + mod(p - pcs[0]!, 12)); tones.push(base + 12);
      const step = 1 / dens;
      for (let i = 0; i * step < beatsPerBar; i++) ev.push({ layer: 'arp', kind: 'note', midi: tones[i % tones.length]!, beat: t0 + i * step, dur: step * 0.9 });
    }
  });
  return ev;
}
