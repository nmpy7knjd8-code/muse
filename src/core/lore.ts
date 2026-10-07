// "Lore, not science": historical/folk associations (Schubart's key characters, Scriabin, etc.).
// Loaded from public/lore.json at runtime; shown only when the user turns Lore mode on.
import { Chord, chordPcs } from './chords';
import { mod, parseNote, pc } from './notes';
import { Key } from './scales';

export interface LoreEntry {
  id: string;
  kind: 'key' | 'chord' | 'mode' | 'interval' | 'general';
  title: string;
  text: string;
  source: string;
  /** for kind=key: e.g. "D major"; for mode: mode id; for chord: pitch-class set relative to root, e.g. [0,6,10,4,9,2] */
  key?: string;
  mode?: string;
  intervals?: number[];
  caution?: string;
}

export interface LoreFile {
  disclaimer: string;
  entries: LoreEntry[];
}

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export function normalizeLore(raw: Json): LoreFile {
  const entries = (Array.isArray(raw?.entries) ? raw.entries : Array.isArray(raw) ? raw : [])
    .filter((e: Json) => e && e.id && e.title && e.text)
    .map((e: Json) => ({ ...e, kind: e.kind ?? 'general', source: e.source ?? 'unknown' }));
  return { disclaimer: String(raw?.disclaimer ?? 'Lore, not science.'), entries };
}

function keyMatches(entryKey: string, k: Key): boolean {
  const m = /^\s*([A-G][#b♯♭]?)\s+(major|minor)\s*$/i.exec(entryKey);
  if (!m) return false;
  const t = parseNote(m[1]);
  if (!t) return false;
  const fam = m[2].toLowerCase();
  return pc(t) === pc(k.tonic) && ((fam === 'major' && k.mode === 'major') || (fam === 'minor' && k.mode === 'minor'));
}

/** Lore entries relevant to the current key and (optionally) a chord. */
export function findLore(lore: LoreFile, k: Key, chord?: Chord): LoreEntry[] {
  const out: LoreEntry[] = [];
  for (const e of lore.entries) {
    if (e.kind === 'key' && e.key && keyMatches(e.key, k)) out.push(e);
    else if (e.kind === 'mode' && e.mode === k.mode) out.push(e);
    else if ((e.kind === 'chord' || e.kind === 'interval') && chord && e.intervals?.length) {
      const rel = new Set(chordPcs(chord).map((p) => mod(p - pc(chord.root), 12)));
      // entry matches when the chord contains all of the entry's intervals
      if (e.intervals.every((i) => rel.has(mod(i, 12)))) out.push(e);
    }
  }
  return out;
}
