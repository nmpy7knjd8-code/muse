// Offline free-text → MoodProfile interpreter (lexicon based), plus the pluggable MoodInterpreter interface.
import type { TheoryKB } from './kb';
import { CONTRAST, INTENSIFIERS, LEXICON_LINES, NEGATORS, STOPWORDS } from './lexiconData';
import { DIM_KEYS, DimKey, MoodDimensions, MoodProfile, normalizeWeights } from './profile';
import { MODES, ModeId } from './scales';

export interface LexEntry {
  term: string;
  moods: Record<string, number>;
  dims: Partial<MoodDimensions>;
  modes: ModeId[];
  source: 'builtin' | 'kb' | 'external';
}

export interface MoodInterpreter {
  readonly id: string;
  readonly label: string;
  available(): boolean;
  interpret(text: string): Promise<MoodProfile>;
}

const DIM_LETTERS: Record<string, DimKey> = { b: 'brightness', v: 'valence', t: 'tension', c: 'chromaticism', s: 'stability', e: 'energy' };
const MODE_IDS = new Set<string>(MODES.map((m) => m.id));

export function parseLexiconLines(text: string): LexEntry[] {
  const out: LexEntry[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    const colon = line.lastIndexOf(' : ');
    if (colon < 0) continue;
    const terms = line.slice(0, colon).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const [moodPart = '', dimPart = '', modePart = ''] = line.slice(colon + 3).split('|').map((s) => s.trim());
    const moods: Record<string, number> = {};
    for (const tok of moodPart.split(/\s+/).filter(Boolean)) {
      const [id, w] = tok.split('=');
      moods[id] = Number(w ?? 1);
    }
    const dims: Partial<MoodDimensions> = {};
    for (const tok of dimPart.split(/\s+/).filter(Boolean)) {
      const [k, v] = tok.split('=');
      if (DIM_LETTERS[k]) dims[DIM_LETTERS[k]] = Number(v);
    }
    const modes = modePart.split(/\s+/).filter((m) => MODE_IDS.has(m)) as ModeId[];
    for (const term of terms) out.push({ term, moods, dims, modes, source: 'builtin' });
  }
  return out;
}

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Tolerant import of an external lexicon (e.g. research/theory/mood_lexicon.json). Accepts an array or an
 * object with entries/descriptors/terms/lexicon; each entry may carry term|descriptor|word|label|id,
 * synonyms|aliases, moods|coreMoods|mapsTo|maps_to (ids, {id:w} or [{mood,weight}]), valence, arousal,
 * brightness, tension, chromaticism/unusualness, stability, modes.
 */
export function parseExternalLexicon(raw: Json, knownMoods: Set<string>): LexEntry[] {
  let list: Json[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw && typeof raw === 'object') {
    const key = ['entries', 'descriptors', 'terms', 'lexicon', 'moods', 'items'].find((k) => Array.isArray(raw[k]));
    if (key) list = raw[key];
    else list = Object.entries(raw).filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v)).map(([k, v]) => ({ term: k, ...(v as object) }));
  }
  const num = (v: Json) => (typeof v === 'number' && isFinite(v) ? v : undefined);
  const anyNeg = (k: string) => list.some((e) => typeof e?.[k] === 'number' && e[k] < 0);
  const arousalSigned = anyNeg('arousal');
  const tensionSigned = anyNeg('tension');
  const out: LexEntry[] = [];
  for (const e of list) {
    if (!e || typeof e !== 'object') continue;
    const term = String(e.term ?? e.descriptor ?? e.word ?? e.label ?? e.name ?? e.id ?? '').trim().toLowerCase();
    if (!term) continue;
    const moods: Record<string, number> = {};
    const mm = e.moods ?? e.coreMoods ?? e.core_moods ?? e.mapsTo ?? e.maps_to ?? e.mood ?? e.coreMood;
    if (typeof mm === 'string') moods[mm.toLowerCase()] = 1;
    else if (Array.isArray(mm)) mm.forEach((m: Json, i: number) => {
      if (typeof m === 'string') moods[m.toLowerCase()] = 1 - i * 0.15;
      else if (m && (m.id || m.mood)) moods[String(m.id ?? m.mood).toLowerCase()] = num(m.weight) ?? 1;
    });
    else if (mm && typeof mm === 'object') for (const [k, v] of Object.entries(mm)) if (typeof v === 'number') moods[k.toLowerCase()] = v;
    if (knownMoods.has(term) && !Object.keys(moods).length) moods[term] = 1;
    for (const k of Object.keys(moods)) if (knownMoods.size && !knownMoods.has(k)) delete moods[k];
    const dims: Partial<MoodDimensions> = {};
    const valence = num(e.valence);
    const arousal = num(e.arousal);
    const brightness = num(e.brightness);
    const tension = num(e.tension);
    if (valence !== undefined) dims.valence = Math.max(-1, Math.min(1, valence));
    if (brightness !== undefined) dims.brightness = Math.max(-1, Math.min(1, brightness));
    else if (valence !== undefined) dims.brightness = Math.max(-1, Math.min(1, valence * 0.8));
    if (arousal !== undefined) dims.energy = arousalSigned ? (arousal + 1) / 2 : arousal;
    if (tension !== undefined) dims.tension = tensionSigned ? (tension + 1) / 2 : tension;
    const chrom = num(e.chromaticism ?? e.unusualness ?? e.complexity);
    if (chrom !== undefined) dims.chromaticism = chrom;
    const stab = num(e.stability ?? e.resolution);
    if (stab !== undefined) dims.stability = stab;
    const modes = (Array.isArray(e.modes) ? e.modes : []).map((m: Json) => String(m)).filter((m: string) => MODE_IDS.has(m)) as ModeId[];
    if (!Object.keys(moods).length && !Object.keys(dims).length) continue;
    const terms = [term, ...(Array.isArray(e.synonyms ?? e.aliases) ? (e.synonyms ?? e.aliases) : []).map((s: Json) => String(s).toLowerCase())];
    for (const t of terms) out.push({ term: t, moods, dims, modes, source: 'external' });
  }
  return out;
}

const normalizeTerm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();

export class MoodTextLexicon {
  private map = new Map<string, LexEntry>();
  private maxWords = 1;
  readonly known = new Set<string>();

  constructor(entries: LexEntry[]) {
    for (const e of entries) this.add(e);
  }

  add(e: LexEntry) {
    const k = normalizeTerm(e.term);
    const existing = this.map.get(k);
    // merge duplicates: higher-precedence source (external > kb > builtin) wins per field, dims are unioned
    const rank = { builtin: 0, kb: 1, external: 2 } as const;
    if (existing) {
      const [hi, lo] = rank[existing.source] > rank[e.source] ? [existing, e] : [e, existing];
      this.map.set(k, {
        term: k,
        moods: Object.keys(hi.moods).length ? hi.moods : lo.moods,
        dims: { ...lo.dims, ...hi.dims },
        modes: hi.modes.length ? hi.modes : lo.modes,
        source: hi.source,
      });
    } else this.map.set(k, { ...e, term: k });
    this.maxWords = Math.max(this.maxWords, k.split(/[\s-]+/).length);
  }

  get size() {
    return this.map.size;
  }

  lookup(term: string): LexEntry | undefined {
    const k = normalizeTerm(term);
    return this.map.get(k) ?? this.map.get(k.replace(/-/g, ' ')) ?? this.map.get(k.replace(/ /g, '-'));
  }

  /** Lookup with light stemming: darker→dark, foggiest→fog, haunting→haunt… */
  lookupStem(word: string): { entry: LexEntry; comparative: boolean } | undefined {
    const direct = this.lookup(word);
    if (direct) return { entry: direct, comparative: false };
    const rules: Array<[RegExp, string, boolean]> = [
      [/ier$/, 'y', true], [/iest$/, 'y', true], [/([a-z])\1er$/, '$1', true], [/er$/, '', true], [/er$/, 'e', true], [/est$/, '', true],
      [/ly$/, '', false], [/ness$/, '', false], [/ing$/, '', false], [/ing$/, 'e', false], [/ed$/, '', false], [/ed$/, 'e', false],
      [/s$/, '', false], [/y$/, '', false], [/ful$/, '', false],
    ];
    for (const [re, rep, comparative] of rules) {
      if (!re.test(word)) continue;
      const e = this.lookup(word.replace(re, rep));
      if (e) return { entry: e, comparative };
    }
    return undefined;
  }

  /** Build from built-in table + KB mood vocabulary (ids, labels, synonyms) + optional external lexicon JSON. */
  static build(kb?: TheoryKB | null, external?: Json): MoodTextLexicon {
    const entries: LexEntry[] = parseLexiconLines(LEXICON_LINES);
    const known = new Set((kb?.moodVocabulary ?? []).map((m) => m.id));
    for (const m of kb?.moodVocabulary ?? []) {
      const dims: Partial<MoodDimensions> = {};
      if (m.valence !== undefined) { dims.valence = m.valence; dims.brightness = m.valence * 0.8; }
      if (m.arousal !== undefined) dims.energy = m.arousal;
      const terms = [m.id, m.label.toLowerCase(), ...m.label.toLowerCase().split(' / '), ...(m.synonyms ?? [])];
      for (const t of new Set(terms)) entries.push({ term: t, moods: { [m.id]: 1 }, dims, modes: [], source: 'kb' });
    }
    if (external) entries.push(...parseExternalLexicon(external, known));
    const lex = new MoodTextLexicon(entries);
    known.forEach((k) => lex.known.add(k));
    return lex;
  }

  /** Parse free text into a MoodProfile. Handles phrases, intensifiers, negation and contrast ("but"). */
  interpret(text: string): MoodProfile {
    const clean = normalizeTerm(text).replace(/[^a-z0-9'\- ,.;!?&+]/g, ' ');
    const clauses = clean.split(/[,.;!?&+]|\band\b|\bwith\b/).map((c) => c.trim()).filter(Boolean);
    const moodAcc: Record<string, number> = {};
    const dimAcc: Record<string, { sum: number; w: number }> = {};
    const modeAcc: Record<string, number> = {};
    const unknown: string[] = [];
    let contrastBoost = 1;

    const apply = (e: LexEntry, weight: number, negated: boolean, comparative: boolean) => {
      const w = weight * (comparative ? 1.2 : 1);
      if (!negated) {
        for (const [id, mw] of Object.entries(e.moods)) moodAcc[id] = (moodAcc[id] ?? 0) + mw * w;
        for (const m of e.modes) modeAcc[m] = (modeAcc[m] ?? 0) + w;
      }
      for (const d of DIM_KEYS) {
        let v = e.dims[d];
        if (v === undefined) continue;
        if (negated) v = d === 'brightness' || d === 'valence' ? -v * 0.6 : 1 - v;
        const dw = negated ? w * 0.7 : w;
        const cur = dimAcc[d] ?? { sum: 0, w: 0 };
        cur.sum += v * dw;
        cur.w += dw;
        dimAcc[d] = cur;
      }
    };

    for (const clause of clauses) {
      const words = clause.split(/\s+/).filter(Boolean);
      let mult = 1;
      let negate = 0; // number of words the negation still applies to
      for (let i = 0; i < words.length; ) {
        const w = words[i];
        if (CONTRAST.has(w)) { contrastBoost = 1.25; i++; continue; }
        if (NEGATORS.has(w) && w !== 'less') { negate = 3; i++; continue; }
        // phrase match (longest first)
        let matched = false;
        for (let n = Math.min(this.maxWords, words.length - i); n >= 1; n--) {
          const phrase = words.slice(i, i + n).join(' ');
          if (n === 1 && (INTENSIFIERS[phrase] !== undefined || STOPWORDS.has(phrase)) && !this.lookup(phrase)) break;
          const hit = n > 1 ? (this.lookup(phrase) ? { entry: this.lookup(phrase)!, comparative: false } : undefined) : this.lookupStem(phrase);
          if (hit) {
            apply(hit.entry, mult * contrastBoost, negate > 0, hit.comparative);
            mult = 1;
            negate = 0;
            i += n;
            matched = true;
            break;
          }
        }
        if (matched) continue;
        if (w === 'less') { mult *= 0.5; i++; continue; }
        if (INTENSIFIERS[w] !== undefined) { mult *= INTENSIFIERS[w]; i++; continue; }
        if (!STOPWORDS.has(w) && w !== 'too' && w.length > 1 && !/^\d+$/.test(w)) unknown.push(w);
        if (negate > 0) negate--;
        i++;
      }
    }

    let moods = normalizeWeights(moodAcc);
    // keep the strongest 4 moods above 8 %
    moods = normalizeWeights(Object.fromEntries(Object.entries(moods).sort((a, b) => b[1] - a[1]).slice(0, 4).filter(([, v]) => v >= 0.08)));
    const dims: Partial<MoodDimensions> = {};
    for (const d of DIM_KEYS) {
      const a = dimAcc[d];
      if (a && a.w > 0) dims[d] = Math.round((a.sum / a.w) * 100) / 100;
    }
    const modes = Object.entries(modeAcc).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([m]) => m as ModeId);
    return { moods, dims, modes, text, source: 'lexicon', unknown };
  }
}

export class LexiconInterpreter implements MoodInterpreter {
  readonly id = 'lexicon';
  readonly label = 'Offline lexicon';
  constructor(readonly lexicon: MoodTextLexicon) {}
  available() {
    return true;
  }
  interpretSync(text: string): MoodProfile {
    return this.lexicon.interpret(text);
  }
  async interpret(text: string): Promise<MoodProfile> {
    return this.lexicon.interpret(text);
  }
}
