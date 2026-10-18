// Song analysis from a pasted chord sheet: parse chords out of lyrics/tab text, find the key,
// read the mood + tension the engine hears, and point at the closest Artist Lens artist.
// Framework-free.
import { Chord, chordSymbol, parseChord, QUALITY_BY_ID } from './chords';
import { detectKeys, type KeyCandidate } from './keyDetect';
import { mergeMoods, type MoodWeight } from './moods';
import { analyzeRoman, romanOf } from './roman';
import { keyName, type Key } from './scales';
import type { SuggestionEngine } from './suggest';
import type { Artist, ArtistsFile } from './artists';
import { progressionTension, type TensionStyleId } from './harmonyTension';

export interface SheetSection { name: string; start: number; end: number }
export interface ParsedSheet { chords: Chord[]; sections: SheetSection[]; skipped: string[] }

const SIMPLIFY: Array<[RegExp, string]> = [
  [/^m(?:in)?11$/, 'm9'], [/^m(?:in)?13$/, 'm9'], [/^(?:dom)?11$/, '9'], [/^(?:dom)?13$/, '9'], [/^maj1[13]$/, 'maj9'],
  [/^M1[13]$/, 'maj9'], [/^7sus2$/, 'sus2'], [/^add11$/, ''], [/^add4$/, 'sus4'], [/^6\/9$|^69$/, '6'], [/^m69$/, 'm6'],
  [/^m7b9$/, 'm7'], [/^7b5$/, '7'], [/^7#11$/, '7'], [/^7alt$/, '7#9'], [/^9sus4?$/, '7sus4'], [/^maj7#5$/, 'maj7'],
];

/** parseChord, plus a few common symbols the engine does not model (m11, 13, 6/9 …) simplified to a close relative. */
export function parseChordLoose(token: string): Chord | null {
  const t = token.trim().replace(/[,;.]+$/, '').replace(/^\(|\)$/g, '');
  if (!t || /^n\.?c\.?$/i.test(t)) return null;
  const direct = parseChord(t);
  if (direct) return direct;
  const m = /^([A-G](?:#|b|♯|♭)?)(.*?)(\/[A-G](?:#|b|♯|♭)?)?$/.exec(t.replace(/[()]/g, ''));
  if (!m) return null;
  const [, root, rest = '', bass = ''] = m;
  for (const [re, rep] of SIMPLIFY) if (re.test(rest)) return parseChord(root + rep + bass);
  return parseChord(root + rest) ?? null;
}

const BAR_TOKEN = /^(\|+|:?\|\|?:?|\/|-+|\.+)$/;
const REPEAT = /^\(?[x×]\s?(\d{1,2})\)?$|^\(?(\d{1,2})\s?[x×]\)?$/i;
const SECTION = /^\s*[[(]?\s*(intro|verse|pre-?chorus|chorus|bridge|outro|solo|interlude|hook|refrain|instrumental|coda|tag|break)\b[^\]):]*[\]):]?\s*:?\s*/i;

/** Pull the chord sequence out of a chord sheet (chords-over-lyrics, inline [ChordPro], or | bar | charts). */
export function parseChordSheet(text: string, maxChords = 256): ParsedSheet {
  const chords: Chord[] = [];
  const sections: SheetSection[] = [];
  const skipped = new Set<string>();
  let current: SheetSection | null = null;
  const openSection = (name: string) => {
    if (current) current.end = chords.length;
    current = { name: name.replace(/\s+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase()), start: chords.length, end: chords.length };
    sections.push(current);
  };
  for (const raw of text.split(/\r?\n/)) {
    if (chords.length >= maxChords) break;
    let line = raw.replace(/\t/g, ' ');
    const sec = SECTION.exec(line);
    if (sec) { openSection(sec[0].replace(/[[\]():]/g, '')); line = line.slice(sec[0].length); }
    if (!line.trim()) continue;
    // Inline ChordPro: [Am]lyrics [F]more → take the bracketed chords only.
    const pro = [...line.matchAll(/\[([^\]]{1,12})\]/g)].map((m) => m[1]!);
    if (pro.length) {
      const got = pro.map(parseChordLoose).filter((c): c is Chord => !!c);
      if (got.length >= Math.ceil(pro.length * 0.6)) { chords.push(...got); continue; }
    }
    const tokens = line.trim().split(/\s+/).flatMap((t) => t.split(/(?<=\S)\|(?=\S)|\|/)).filter(Boolean);
    let repeat = 1;
    const lineChords: Chord[] = [];
    let words = 0;
    for (const tok of tokens) {
      if (BAR_TOKEN.test(tok)) continue;
      const r = REPEAT.exec(tok);
      if (r) { repeat = Math.min(8, Number(r[1] ?? r[2]) || 1); continue; }
      if (tok === '%' && lineChords.length) { lineChords.push(lineChords[lineChords.length - 1]!); continue; }
      const c = parseChordLoose(tok);
      if (c) lineChords.push(c); else { words++; if (/^[A-G]/.test(tok) && tok.length <= 8) skipped.add(tok); }
    }
    const n = lineChords.length;
    if (!n || n / (n + words) < 0.6) continue; // a lyric line (that may contain "A" as a word)
    for (let i = 0; i < repeat && chords.length < maxChords; i++) chords.push(...lineChords.slice(0, maxChords - chords.length));
  }
  if (current) (current as SheetSection).end = chords.length;
  return { chords, sections: sections.filter((s) => s.end > s.start), skipped: [...skipped].slice(0, 8) };
}

export interface ArtistMatch { artist: Artist; score: number; shared: string[] }
export interface SongAnalysis {
  key: Key;
  keyConfidence: number;
  alternatives: KeyCandidate[];
  romans: string[];
  moods: MoodWeight[];
  levels: number[];
  peaks: number[];
  borrowed: Array<{ index: number; symbol: string; roman: string }>;
  loop: number | null;
  unique: number;
  polarity: Record<string, number>;
  artists: ArtistMatch[];
  summary: string;
}

/** Smallest repeating chord cycle (e.g. 4 for I–V–vi–IV over and over), or null if none. */
export function findLoop(chords: Chord[]): number | null {
  const s = chords.map((c) => chordSymbol(c));
  if (s.length < 4) return null;
  for (let p = 2; p <= Math.min(8, Math.floor(s.length / 2)); p++) {
    let ok = 0, total = 0;
    for (let i = p; i < s.length; i++) { total++; if (s[i] === s[i - p]) ok++; }
    if (ok / total >= 0.85) return p;
  }
  return null;
}

const COMPLEX = new Set(['7', 'maj7', 'm7', 'm7b5', 'dim7', 'mMaj7', '7sus4', 'aug7', '9', 'maj9', 'm9', '7b9', '7#9', 'maj7#11', 'dim', 'aug']);

/** Soft cosine between mood vectors (related moods count partly, via the lexicon's similarity). */
export function moodAffinity(engine: SuggestionEngine, a: MoodWeight[], b: MoodWeight[]): number {
  const lex = engine.lexicon;
  const dot = (x: MoodWeight[], y: MoodWeight[]) => {
    let s = 0;
    for (const i of x) for (const j of y) s += i.weight * j.weight * (i.id === j.id ? 1 : lex.similarity(i.id, j.id) * 0.5);
    return s;
  };
  const d = Math.sqrt(dot(a, a) * dot(b, b));
  return d ? Math.max(0, Math.min(1, dot(a, b) / d)) : 0;
}

export function analyzeSong(
  engine: SuggestionEngine, chords: Chord[], artists: ArtistsFile | null,
  opts: { key?: Key; style?: TensionStyleId } = {},
): SongAnalysis | null {
  if (!chords.length) return null;
  const lex = engine.lexicon;
  const cands = detectKeys(chords);
  const k = opts.key ?? cands[0]?.key;
  if (!k) return null;
  const romans = chords.map((c) => romanOf(c, k));
  const moods = mergeMoods(chords.map((c, i) => engine.chordMoods(c, k, i ? chords[i - 1] : undefined)), lex);
  const total = moods.reduce((s, m) => s + m.weight, 0) || 1;
  const shares = moods.map((m) => ({ id: m.id, weight: m.weight / total }));
  const levels = progressionTension(chords, k, { style: opts.style ?? 'pop', adventure: 0.4, target: null }).points.map((p) => p.level);
  const max = Math.max(...levels);
  const peaks = levels.map((l, i) => ({ l, i }))
    .filter(({ l, i }) => l >= max * 0.85 && (i === 0 || l >= levels[i - 1]!) && (i === levels.length - 1 || l >= levels[i + 1]!))
    .sort((a, b) => b.l - a.l).slice(0, 3).map((x) => x.i).sort((a, b) => a - b);
  const seen = new Set<string>();
  const borrowed: SongAnalysis['borrowed'] = [];
  chords.forEach((c, i) => {
    const rn = analyzeRoman(c, k);
    const sym = chordSymbol(c, true);
    // In minor, the raised-leading-tone V / V7 / vii° (harmonic minor) is home turf, not an outside colour.
    const triad = QUALITY_BY_ID[c.quality].triad;
    const harmonicMinor = k.mode === 'minor' && ((rn.offset === 7 && triad === 'maj') || (rn.offset === 11 && triad === 'dim'));
    if (!rn.diatonic && !harmonicMinor && !seen.has(sym)) { seen.add(sym); borrowed.push({ index: i, symbol: sym, roman: romans[i]! }); }
  });
  const unique = new Set(chords.map((c) => chordSymbol(c))).size;
  const loop = findLoop(chords);
  const mean = levels.reduce((s, l) => s + l, 0) / levels.length;
  const minorShare = chords.filter((c) => { const t = QUALITY_BY_ID[c.quality].triad; return t === 'min' || t === 'dim'; }).length / chords.length;
  const complexShare = chords.filter((c) => COMPLEX.has(c.quality)).length / chords.length;
  const outside = borrowed.length ? chords.filter((c) => borrowed.some((b) => b.symbol === chordSymbol(c, true))).length / chords.length : 0;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  // Leans toward each polarity's second pole (same convention as artists.json: 0 = first pole, 1 = second).
  const polarity: Record<string, number> = {
    tension_release: clamp(1 - mean / 0.45),
    consonance_dissonance: clamp(0.15 + complexShare * 0.6 + mean * 0.6),
    light_dark: clamp(0.2 + minorShare * 0.6 + (k.mode === 'major' ? 0 : 0.15)),
    simple_complex: clamp((unique - 3) / 8 + outside * 0.8 + complexShare * 0.3),
    expectation_surprise: clamp(outside * 1.6 + (loop ? 0 : 0.1)),
  };
  const matches: ArtistMatch[] = (artists?.artists ?? []).map((a) => {
    const am = a.moodProfile.map((m) => ({ id: lex.canonical(m.mood), weight: m.weight }));
    const mood = moodAffinity(engine, shares.slice(0, 8), am);
    const pols = a.polarities.filter((p) => p.id in polarity);
    const pol = pols.length ? 1 - pols.reduce((s, p) => s + Math.abs(p.lean - polarity[p.id]!), 0) / pols.length : 0.5;
    const top = new Set(shares.slice(0, 6).map((m) => m.id));
    return { artist: a, score: 0.7 * mood + 0.3 * pol, shared: am.filter((m) => top.has(m.id)).map((m) => m.id).slice(0, 3) };
  }).sort((x, y) => y.score - x.score).slice(0, 3);

  const label = (id: string) => lex.label(id).toLowerCase();
  const keyText = keyName(k, false);
  // 'tense'/'resolved' mostly describe chord function (every V is tense); prefer colour moods in the headline.
  const colour = shares.filter((m) => m.id !== 'tense' && m.id !== 'resolved');
  const head = (colour.length >= 2 ? colour : shares).slice(0, 2);
  const parts = [`Mostly ${head.map((m) => label(m.id)).join(' and ')} in ${keyText}`];
  if (loop) parts.push(`built on a ${loop}-chord loop`);
  if (borrowed.length) parts.push(`with ${borrowed.length === 1 ? 'one outside colour' : `${borrowed.length} outside colours`} (${borrowed.slice(0, 3).map((b) => b.symbol).join(', ')})`);
  const summary = parts.join(', ') + '.';
  return {
    key: k, keyConfidence: cands[0]?.confidence ?? 0, alternatives: cands.slice(1, 3), romans, moods: shares.slice(0, 6), levels, peaks,
    borrowed, loop, unique, polarity, artists: matches, summary,
  };
}
