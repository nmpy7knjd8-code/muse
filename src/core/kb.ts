// Theory knowledge-base types + tolerant normaliser.
// Primary schema: /workspace/muse-app/research/theory/theory_kb.json (meta, moodVocabulary,
// chordQualities, chordMoves, progressions, melodicMoves, modes). Unknown/extra fields are ignored;
// malformed entries are dropped instead of failing the whole load.
import { QualityId, parseQuality } from './chords';
import { parseDegreeLabel, mod } from './notes';
import { parseRoman } from './roman';
import { ModeId, key as mkKey } from './scales';

export type Consensus = 'high' | 'medium' | 'low';

export interface KbMood {
  id: string;
  label: string;
  description?: string;
  valence?: number;
  arousal?: number;
  /** -1..1 (dark..bright), optional in older KBs */
  brightness?: number;
  /** 0..1, optional in older KBs */
  tension?: number;
  color?: string;
  synonyms?: string[];
}

export interface KbChordRef {
  roman: string;
  root: number; // semitones above tonic (relativeTo=key) or above current chord root (relativeTo=currentChord)
  quality: QualityId;
}

export interface KbChordMove {
  id: string;
  name: string;
  category: string;
  keyMode: 'major' | 'minor' | 'any';
  relativeTo: 'key' | 'currentChord';
  from: KbChordRef | null;
  to: KbChordRef;
  moods: string[];
  description: string;
  consensus: Consensus;
  consensusNote?: string;
  neoRiemannian?: string | null;
  tags: string[];
  sources: Array<{ title: string; url: string }>;
}

export interface KbMelodicMove {
  id: string;
  name: string;
  category: string;
  relativeTo: 'key' | 'currentNote' | 'currentChord';
  moods: string[];
  description: string;
  consensus: Consensus;
  scaleDegree?: string;
  semitonesFromTonic?: number;
  intervalSemitones?: number;
  direction?: string;
  semitonesAboveChordRoot?: number;
  fromDegree?: number; // as semitone offset from tonic
  toDegree?: number;
  mode?: ModeId | string;
  tendency?: string | null;
  stability?: string;
  solfege?: string;
}

export interface KbMode {
  id: string;
  modeId?: ModeId;
  name: string;
  intervals: number[];
  moods: string[];
  description: string;
  characteristicNotes: string[];
  brightnessRank?: number;
}

export interface KbProgression {
  id: string;
  name: string;
  keyMode: string;
  chords: KbChordRef[];
  moods: string[];
  description: string;
}

export interface TheoryKB {
  meta: { title: string; version: string; isSeed: boolean; notes?: string[]; caveats?: string[] };
  moodVocabulary: KbMood[];
  chordMoves: KbChordMove[];
  melodicMoves: KbMelodicMove[];
  modes: KbMode[];
  progressions: KbProgression[];
}

export const CONSENSUS_WEIGHT: Record<Consensus, number> = { high: 1, medium: 0.7, low: 0.4 };

const KB_MODE_MAP: Record<string, ModeId> = {
  ionian: 'major', major: 'major', aeolian: 'minor', minor: 'minor', dorian: 'dorian', phrygian: 'phrygian',
  lydian: 'lydian', mixolydian: 'mixolydian', locrian: 'locrian', harmonic_minor: 'harmonicMinor',
  harmonicMinor: 'harmonicMinor', melodic_minor: 'melodicMinor', melodicMinor: 'melodicMinor',
  phrygian_dominant: 'phrygianDominant', lydian_dominant: 'lydianDominant',
};
export function kbModeToModeId(id: string): ModeId | undefined {
  return KB_MODE_MAP[id];
}

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const str = (v: Json, d = ''): string => (typeof v === 'string' ? v : v == null ? d : String(v));
const num = (v: Json): number | undefined => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && isFinite(Number(v)) ? Number(v) : undefined);
const arr = (v: Json): Json[] => (Array.isArray(v) ? v : []);
const strs = (v: Json): string[] => arr(v).map((x) => (typeof x === 'string' ? x : str(x?.id ?? x?.name))).filter(Boolean).map((s) => s.toLowerCase());

function consensus(v: Json): Consensus {
  if (typeof v === 'number') return v >= 0.75 ? 'high' : v >= 0.45 ? 'medium' : 'low';
  const s = str(v).toLowerCase();
  if (s.startsWith('h')) return 'high';
  if (s.startsWith('l')) return 'low';
  return 'medium';
}

const C_MAJOR = mkKey('C', 'major');

function chordRef(v: Json): KbChordRef | null {
  if (!v) return null;
  if (typeof v === 'string') {
    const c = parseRoman(v, C_MAJOR);
    if (!c) return null;
    const NAT = [0, 2, 4, 5, 7, 9, 11];
    return { roman: v, root: mod(NAT[c.root.letter] + c.root.acc, 12), quality: c.quality };
  }
  const q = parseQuality(str(v.quality, 'maj'));
  let root = num(v.root);
  if (root === undefined && v.roman) return chordRef(str(v.roman));
  if (root === undefined || !q) return null;
  return { roman: str(v.roman), root: mod(root, 12), quality: q };
}

function degree(v: Json): number | undefined {
  if (v == null) return undefined;
  if (typeof v === 'number') return mod(v, 12);
  return parseDegreeLabel(str(v).replace(/♮/g, '').split(' ')[0]) ?? undefined;
}

export function normalizeKB(raw: Json): TheoryKB {
  const r = raw ?? {};
  const metaRaw = r.meta ?? {};
  const isSeed = Boolean(metaRaw.seed ?? r.seed ?? /seed/i.test(str(metaRaw.title) + str(metaRaw.version) + str(r.source)));
  const moodVocabulary: KbMood[] = arr(r.moodVocabulary)
    .map((m: Json) => (typeof m === 'string' ? { id: m.toLowerCase(), label: m } : m))
    .filter((m: Json) => m && (m.id || m.name))
    .map((m: Json) => ({
      id: str(m.id ?? m.name).toLowerCase(),
      label: str(m.label ?? m.name ?? m.id),
      description: m.description,
      valence: num(m.valence),
      arousal: num(m.arousal),
      brightness: num(m.brightness),
      tension: num(m.tension),
      color: typeof m.color === 'string' ? m.color : undefined,
      synonyms: strs(m.synonyms),
    }));

  const chordMoves: KbChordMove[] = [];
  for (const m of arr(r.chordMoves)) {
    try {
      let from = chordRef(m.from);
      let to = chordRef(m.to);
      // flat-schema fallback: romanNumeral "I → IV"
      if ((!from || !to) && typeof m.romanNumeral === 'string' && /→|->/.test(m.romanNumeral)) {
        const [a, b] = m.romanNumeral.split(/→|->/).map((x: string) => x.trim());
        from = from ?? chordRef(a);
        to = to ?? chordRef(b);
      }
      if (!to || /varies/i.test(str(m.to?.roman))) continue;
      const relativeTo = str(m.relativeTo, 'key') === 'currentChord' ? 'currentChord' : 'key';
      const km = str(m.keyMode, 'any').toLowerCase();
      chordMoves.push({
        id: str(m.id, `move_${chordMoves.length}`),
        name: str(m.name, str(m.romanNumeral)),
        category: str(m.category, 'other'),
        keyMode: km === 'major' || km === 'minor' ? km : 'any',
        relativeTo,
        from,
        to,
        moods: strs(m.moods),
        description: str(m.description),
        consensus: consensus(m.consensus),
        consensusNote: m.consensusNote ?? undefined,
        neoRiemannian: m.neoRiemannian ?? null,
        tags: strs(m.tags),
        sources: arr(m.sources).filter((s: Json) => s && s.url).map((s: Json) => ({ title: str(s.title, s.url), url: str(s.url) })),
      });
    } catch {
      /* skip malformed entry */
    }
  }

  const melodicMoves: KbMelodicMove[] = arr(r.melodicMoves)
    .filter((m: Json) => m && m.id)
    .map((m: Json) => ({
      id: str(m.id),
      name: str(m.name),
      category: str(m.category, 'other'),
      relativeTo: (['key', 'currentNote', 'currentChord'].includes(m.relativeTo) ? m.relativeTo : 'key') as KbMelodicMove['relativeTo'],
      moods: strs(m.moods),
      description: str(m.description),
      consensus: consensus(m.consensus),
      scaleDegree: m.scaleDegree ?? undefined,
      semitonesFromTonic: num(m.semitonesFromTonic),
      intervalSemitones: num(m.intervalSemitones),
      direction: m.direction ?? undefined,
      semitonesAboveChordRoot: num(m.semitonesAboveChordRoot),
      fromDegree: degree(m.fromDegree),
      toDegree: degree(m.toDegree),
      mode: m.mode ? KB_MODE_MAP[m.mode] ?? m.mode : undefined,
      tendency: m.tendency ?? null,
      stability: m.stability ?? undefined,
      solfege: m.solfege ?? undefined,
    }));

  const modes: KbMode[] = arr(r.modes)
    .filter((m: Json) => m && (m.id || m.name))
    .map((m: Json) => ({
      id: str(m.id ?? m.name),
      modeId: KB_MODE_MAP[str(m.id)],
      name: str(m.name ?? m.id),
      intervals: arr(m.intervals).map(Number).filter((x) => isFinite(x)),
      moods: strs(m.moods),
      description: str(m.description),
      characteristicNotes: arr(m.characteristicNotes).map(String),
      brightnessRank: num(m.brightnessRank),
    }));

  const progressions: KbProgression[] = arr(r.progressions)
    .filter((p: Json) => p && Array.isArray(p.chords))
    .map((p: Json) => ({
      id: str(p.id),
      name: str(p.name),
      keyMode: str(p.keyMode, 'any'),
      chords: arr(p.chords).map(chordRef).filter((c): c is KbChordRef => !!c),
      moods: strs(p.moods),
      description: str(p.description),
    }));

  return {
    meta: {
      title: str(metaRaw.title, 'Theory KB'),
      version: str(metaRaw.version, '0'),
      isSeed,
      notes: arr(metaRaw.notes).map(String),
      caveats: arr(metaRaw.caveats).map(String),
    },
    moodVocabulary,
    chordMoves,
    melodicMoves,
    modes,
    progressions,
  };
}
