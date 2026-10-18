// Section builder: measure how different two sections feel (contrast meter) and build a new section
// (chorus / bridge / pre-chorus / verse) that contrasts with the current one by a chosen amount.
// Framework-free.
import { Chord, chordSymbol } from './chords';
import { mergeMoods } from './moods';
import { pc } from './notes';
import { analyzeRoman } from './roman';
import { Key, diatonicChords } from './scales';
import { colourPaletteChords, secondaryPaletteChords } from './palette';
import type { SuggestionEngine } from './suggest';
import { progressionTension, type TensionStyleId } from './harmonyTension';

export interface SectionProfile {
  brightness: number; // 0 dark … 1 bright (mood valence)
  energy: number; // 0 calm … 1 intense (mood arousal)
  tension: number; // mean tension-model level
  endTension: number; // level of the last chord
  colour: number; // share of out-of-key chords
  roots: Set<number>;
  start: number; // root pc of the first chord
}
export interface ContrastParts { brightness: number; energy: number; tension: number; colour: number; roots: number; start: number }
export interface SectionContrast { score: number; parts: ContrastParts; words: string[]; verdict: string }

export function sectionProfile(engine: SuggestionEngine, k: Key, chords: Chord[], style: TensionStyleId = 'pop'): SectionProfile {
  const lex = engine.lexicon;
  const moods = mergeMoods(chords.map((c, i) => engine.chordMoods(c, k, i ? chords[i - 1] : undefined)), lex);
  const cen = lex.centroid(moods) ?? { valence: 0, arousal: 0.5 };
  const levels = chords.length ? progressionTension(chords, k, { style, adventure: 0.4, target: null }).points.map((p) => p.level) : [0];
  return {
    brightness: Math.max(0, Math.min(1, (cen.valence + 1) / 2)),
    energy: Math.max(0, Math.min(1, cen.arousal)),
    tension: levels.reduce((s, l) => s + l, 0) / levels.length,
    endTension: levels[levels.length - 1] ?? 0,
    colour: chords.length ? chords.filter((c) => !analyzeRoman(c, k).diatonic).length / chords.length : 0,
    roots: new Set(chords.map((c) => pc(c.root))),
    start: chords.length ? pc(chords[0]!.root) : -1,
  };
}

const W: ContrastParts = { brightness: 0.2, energy: 0.15, tension: 0.2, colour: 0.1, roots: 0.25, start: 0.1 };

export function sectionContrast(a: SectionProfile, b: SectionProfile): SectionContrast {
  const c01 = (v: number) => Math.max(0, Math.min(1, v));
  const inter = [...a.roots].filter((r) => b.roots.has(r)).length;
  const union = new Set([...a.roots, ...b.roots]).size || 1;
  const parts: ContrastParts = {
    brightness: c01(Math.abs(a.brightness - b.brightness) / 0.3),
    energy: c01(Math.abs(a.energy - b.energy) / 0.25),
    tension: c01(Math.abs(a.tension - b.tension) / 0.2),
    colour: c01(Math.abs(a.colour - b.colour) / 0.4),
    roots: 1 - inter / union,
    start: a.start === b.start ? 0 : 1,
  };
  const score = (Object.keys(W) as Array<keyof ContrastParts>).reduce((s, key) => s + W[key] * parts[key], 0);
  const words: string[] = [];
  if (b.brightness - a.brightness > 0.06) words.push('brighter'); else if (a.brightness - b.brightness > 0.06) words.push('darker');
  if (b.energy - a.energy > 0.05) words.push('more intense'); else if (a.energy - b.energy > 0.05) words.push('calmer');
  if (b.tension - a.tension > 0.04) words.push('more tension'); else if (a.tension - b.tension > 0.04) words.push('more settled');
  if (b.colour - a.colour > 0.15) words.push('more colour');
  if (parts.roots > 0.6) words.push('new chords'); else if (parts.roots < 0.25) words.push('same chords');
  if (parts.start) words.push('new starting chord');
  // Bands match the meter's pole labels (same < 0.15 ≤ related < 0.35 ≤ new < 0.75 ≤ different song).
  const verdict = score < 0.15 ? 'Feels like the same section' : score < 0.35 ? 'Related — a gentle lift' : score < 0.75 ? 'Clearly a new section' : 'A big contrast — almost a different song';
  return { score, parts, words, verdict };
}

export type SectionRole = 'prechorus' | 'chorus' | 'bridge' | 'verse';
export const SECTION_ROLES: Record<SectionRole, { label: string; target: number; dir: 'build' | 'lift' | 'away' | 'drop'; blurb: string }> = {
  prechorus: { label: 'Pre-chorus', target: 0.3, dir: 'build', blurb: 'Related, but climbing — ends wanting to resolve.' },
  chorus: { label: 'Chorus', target: 0.45, dir: 'lift', blurb: 'Brighter and bigger, lands solidly.' },
  bridge: { label: 'Bridge', target: 0.7, dir: 'away', blurb: 'Somewhere new — fresh chords, away from home.' },
  verse: { label: 'Verse', target: 0.4, dir: 'drop', blurb: 'Back down — calmer, more conversational.' },
};

export interface BuiltSection { chords: Chord[]; contrast: SectionContrast; profile: SectionProfile; score: number }

/** Build up to `count` distinct sections whose contrast with `base` sits near `target` (0..1). */
export function buildSection(
  engine: SuggestionEngine, k: Key, base: Chord[],
  opts: { role?: SectionRole; target?: number; length?: number; style?: TensionStyleId; adventure?: number; count?: number } = {},
): BuiltSection[] {
  const role = SECTION_ROLES[opts.role ?? 'chorus'];
  const target = opts.target ?? role.target;
  const length = Math.max(2, Math.min(8, opts.length ?? 4));
  const style = opts.style ?? 'pop';
  const adventure = opts.adventure ?? 0.4;
  const baseProf = sectionProfile(engine, k, base, style);
  const tonic = diatonicChords(k)[0]!;
  const starts = new Map<string, Chord>();
  for (const c of [...diatonicChords(k), ...diatonicChords(k, true).slice(0, 7), ...(target > 0.5 ? [...colourPaletteChords(k).slice(0, 3), ...secondaryPaletteChords(k).slice(0, 1)] : [])]) {
    if (c.quality === 'dim' || c.quality === 'm7b5') continue;
    starts.set(chordSymbol(c), c);
  }
  // Each start chord → a greedy-but-sampled continuation through the suggestion engine.
  const cands: Chord[][] = [];
  const memo = new Map<string, ReturnType<SuggestionEngine['suggestChords']>>();
  const adv = role.dir === 'away' ? Math.max(adventure, 0.45) : adventure;
  const suggest = (prog: Chord[]) => {
    const ctx = prog.slice(-2);
    const id = ctx.map((c) => chordSymbol(c)).join(' ');
    let r = memo.get(id);
    if (!r) { r = engine.suggestChords({ key: k, progression: ctx, adventure: adv, limit: 8, tensionStyle: null }); memo.set(id, r); }
    return r;
  };
  for (const s of starts.values()) {
    for (const pick of [0, 1]) {
      const seq: Chord[] = [s];
      while (seq.length < length) {
        const sugg = suggest([...base.slice(-2), ...seq]);
        const last = seq[seq.length - 1]!;
        // new root each bar (C → Cmaj7 reads as the same chord), no repeats inside the section
        const fresh = sugg.filter((x) => !seq.some((c) => chordSymbol(c) === x.symbol) && pc(x.chord.root) !== pc(last.root));
        const choice = (fresh[Math.min(pick + (seq.length % 2), fresh.length - 1)] ?? sugg[0]);
        if (!choice) break;
        seq.push(choice.chord);
      }
      cands.push(seq);
    }
  }
  const scored: BuiltSection[] = cands.map((chords) => {
    const prof = sectionProfile(engine, k, chords, style);
    const contrast = sectionContrast(baseProf, prof);
    let score = -2.5 * Math.abs(contrast.score - target);
    // Some colour is good; a section made mostly of outside chords stops sounding like the same song.
    score -= 2 * Math.max(0, prof.colour - (role.dir === 'away' ? 0.5 : 0.25));
    const startsHome = pc(chords[0]!.root) === pc(tonic.root);
    if (role.dir === 'lift') score += 0.8 * (prof.brightness - baseProf.brightness) + 0.6 * (prof.energy - baseProf.energy) + (startsHome || pc(chords[0]!.root) === (pc(tonic.root) + 5) % 12 ? 0.15 : 0);
    const endOff = (pc(chords[chords.length - 1]!.root) - pc(tonic.root) + 12) % 12;
    if (role.dir === 'build') score += 1.2 * (prof.endTension - prof.tension) + 0.6 * (prof.tension - baseProf.tension) - (startsHome ? 0.2 : 0) + (endOff === 7 || endOff === 5 ? 0.35 : 0);
    if (role.dir === 'away') score += (startsHome ? -0.5 : 0.1) + 0.5 * contrast.parts.roots;
    if (role.dir === 'drop') score += 0.8 * (baseProf.energy - prof.energy) + 0.6 * (baseProf.tension - prof.tension);
    return { chords, contrast, profile: prof, score };
  }).sort((a, b) => b.score - a.score);
  const out: BuiltSection[] = [];
  const seen = new Set<string>();
  for (const s of scored) {
    const id = s.chords.map((c) => chordSymbol(c)).join(' ');
    const startRoot = pc(s.chords[0]!.root);
    if (seen.has(id) || out.some((o) => pc(o.chords[0]!.root) === startRoot)) continue;
    seen.add(id); out.push(s);
    if (out.length >= (opts.count ?? 3)) break;
  }
  return out;
}
