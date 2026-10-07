// MoodProfile: weights over the mood vocabulary + continuous musical dimensions + preferred modes.
// Every chord / melodic move is described by the same dimensions (MoveFeatures) so arbitrary blends rank.
import { Chord, chordPcs, triadClass } from './chords';
import { MoodLexicon, MoodWeight } from './moods';
import { mod, pc } from './notes';
import { Key, MODE_BY_ID, ModeId } from './scales';

export interface MoodDimensions {
  /** -1 dark … +1 bright */
  brightness: number;
  /** -1 negative … +1 positive emotional valence (from the mood vocabulary) */
  valence: number;
  /** 0 relaxed … 1 tense */
  tension: number;
  /** 0 plain/diatonic … 1 chromatic/unusual */
  chromaticism: number;
  /** 0 unresolved/open … 1 resolved/at home */
  stability: number;
  /** 0 calm … 1 energetic (arousal) */
  energy: number;
}
export type DimKey = keyof MoodDimensions;
export const DIM_KEYS: DimKey[] = ['brightness', 'valence', 'tension', 'chromaticism', 'stability', 'energy'];
export const DIM_RANGE: Record<DimKey, [number, number]> = {
  brightness: [-1, 1], valence: [-1, 1], tension: [0, 1], chromaticism: [0, 1], stability: [0, 1], energy: [0, 1],
};

export interface MoodProfile {
  /** mood id → weight (normalised to sum 1 when non-empty) */
  moods: Record<string, number>;
  /** target values for the dimensions the user cares about (others undefined = don't care) */
  dims: Partial<MoodDimensions>;
  /** preferred modes (relative to the current tonic) */
  modes: ModeId[];
  /** original text, if any */
  text?: string;
  source: 'lexicon' | 'llm' | 'manual' | 'preset';
  /** words the interpreter did not understand */
  unknown?: string[];
}

export const EMPTY_PROFILE: MoodProfile = { moods: {}, dims: {}, modes: [], source: 'manual' };

export function isEmptyProfile(p?: MoodProfile | null): boolean {
  return !p || (!Object.keys(p.moods).length && !Object.keys(p.dims).length && !p.modes.length);
}

export function normalizeWeights(m: Record<string, number>): Record<string, number> {
  const entries = Object.entries(m).filter(([, w]) => w > 0.0001);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  return total ? Object.fromEntries(entries.map(([k, w]) => [k, w / total])) : {};
}

export function profileFromMoods(ids: string[]): MoodProfile {
  return { moods: normalizeWeights(Object.fromEntries(ids.map((i) => [i, 1]))), dims: {}, modes: [], source: 'preset' };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ---- feature extraction (data-driven; tunable via applyFeatureMapping) ----
export interface FeatureConfig {
  /** chord quality id → tension 0..1 */
  qualityTension: Record<string, number>;
  /** triad class (maj/min/dim/aug/sus/power) → structural brightness -1..1 */
  triadBrightness: Record<string, number>;
  /** brightness per step sharpward on the circle of fifths (relative to the tonic) */
  fifthsBrightnessPerStep: number;
  /** semitone offset of chord root above tonic → functional tension 0..1 */
  functionTension: Record<number, number>;
  functionTensionDefault: number;
  /** melody: semitone offset above tonic → brightness -1..1 */
  degreeBrightness: Record<number, number>;
  /** melody: offsets that are tendency tones (extra tension) */
  tendencyTones: number[];
  /** mood ids that count as tension / stability evidence */
  tenseMoods: string[];
  stableMoods: string[];
  mix: {
    brightnessFromMood: number; // vs structure
    tensionQuality: number; tensionFunction: number; tensionMoods: number;
    chromaRarity: number; chromaNonDiatonic: number; chromaFifths: number;
    stabilityHome: number;
  };
  /** weights of the three match terms */
  match: { mood: number; dims: number; mode: number };
  /** relative importance of each dimension in the dims term */
  dimWeights: Record<DimKey, number>;
}

export const DEFAULT_FEATURE_CONFIG: FeatureConfig = {
  qualityTension: {
    maj: 0.1, min: 0.15, '5': 0.1, sus2: 0.3, sus4: 0.4, '6': 0.15, m6: 0.3, add9: 0.2, madd9: 0.25, maj7: 0.25, m7: 0.25,
    maj9: 0.3, m9: 0.3, '7': 0.6, '9': 0.55, '7sus4': 0.5, mMaj7: 0.65, m7b5: 0.7, dim: 0.75, aug: 0.7, aug7: 0.75,
    dim7: 0.9, '7b9': 0.9, '7#9': 0.85, 'maj7#11': 0.4,
  },
  triadBrightness: { maj: 0.35, min: -0.35, dim: -0.5, aug: 0.05, sus: 0.1, power: 0 },
  fifthsBrightnessPerStep: 0.06,
  functionTension: { 0: 0, 7: 0.7, 11: 0.7, 1: 0.5, 6: 0.6 },
  functionTensionDefault: 0.3,
  degreeBrightness: { 0: 0.1, 1: -0.7, 2: 0.2, 3: -0.5, 4: 0.5, 5: 0, 6: 0.6, 7: 0.2, 8: -0.6, 9: 0.35, 10: -0.3, 11: 0.4 },
  tendencyTones: [1, 5, 11],
  tenseMoods: ['tense', 'ominous', 'dramatic', 'yearning', 'surprising', 'uncanny'],
  stableMoods: ['resolved', 'warm', 'triumphant'],
  mix: {
    brightnessFromMood: 0.5,
    tensionQuality: 0.5, tensionFunction: 0.25, tensionMoods: 0.25,
    chromaRarity: 0.55, chromaNonDiatonic: 0.3, chromaFifths: 0.15,
    stabilityHome: 0.45,
  },
  match: { mood: 0.55, dims: 0.35, mode: 0.15 },
  dimWeights: { brightness: 1, valence: 0.7, tension: 1, chromaticism: 1, stability: 0.8, energy: 0.6 },
};

let activeConfig: FeatureConfig = DEFAULT_FEATURE_CONFIG;
export function getFeatureConfig(): FeatureConfig {
  return activeConfig;
}
export function setFeatureConfig(c: FeatureConfig) {
  activeConfig = c;
}

const STRENGTH: Record<string, number> = { strong: 1, high: 1, moderate: 0.7, medium: 0.7, weak: 0.4, low: 0.4 };
const DEGREE_LABELS: Record<string, number> = { '1': 0, b2: 1, '2': 2, b3: 3, '3': 4, '4': 5, '#4': 6, b5: 6, '5': 7, b6: 8, '6': 9, b7: 10, '7': 11 };

/**
 * Merge a feature→mood mapping (e.g. research/aesthetics/feature_mood_mapping.json) into a config.
 * Accepts either { config: Partial<FeatureConfig> } / a partial config object, or a list of
 * { feature, dimension, effect|value|direction, strength|evidence } rules where feature is like
 * "quality:dim7", "triad:min", "degree:b6", "fifths", "function:7", and dimension is one of the DimKeys
 * (aliases: unusualness→chromaticism, arousal→energy, resolution→stability). Unknown rules are ignored.
 */
export function applyFeatureMapping(raw: unknown, base: FeatureConfig = DEFAULT_FEATURE_CONFIG): { config: FeatureConfig; applied: number; ignored: number } {
  const cfg: FeatureConfig = JSON.parse(JSON.stringify(base));
  let applied = 0, ignored = 0;
  const r = raw as Record<string, unknown> | unknown[] | null;
  if (!r) return { config: cfg, applied, ignored };
  const partial = !Array.isArray(r) ? ((r as Record<string, unknown>).config ?? (r as Record<string, unknown>).featureConfig) : undefined;
  if (partial && typeof partial === 'object') {
    for (const [k, v] of Object.entries(partial as Record<string, unknown>)) {
      if (k in cfg && v && typeof v === 'object' && !Array.isArray(v)) { Object.assign((cfg as unknown as Record<string, object>)[k], v); applied++; }
      else if (k in cfg && typeof v === 'number') { (cfg as unknown as Record<string, number>)[k] = v; applied++; }
      else ignored++;
    }
  }
  const list = Array.isArray(r) ? r : (['rules', 'mappings', 'features', 'entries'].map((k) => (r as Record<string, unknown>)[k]).find(Array.isArray) as unknown[] | undefined) ?? [];
  const dimAlias: Record<string, DimKey> = { unusualness: 'chromaticism', novelty: 'chromaticism', arousal: 'energy', resolution: 'stability', darkness: 'brightness' };
  for (const item of list) {
    const e = item as Record<string, unknown>;
    const feature = String(e.feature ?? e.id ?? '').trim();
    let dim = String(e.dimension ?? e.dim ?? '').trim();
    const invert = dim === 'darkness';
    dim = dimAlias[dim] ?? dim;
    let effect = typeof e.effect === 'number' ? e.effect : typeof e.value === 'number' ? e.value : e.direction === '+' || e.direction === 'up' ? 0.5 : e.direction === '-' || e.direction === 'down' ? -0.5 : NaN;
    if (!feature || !isFinite(effect) || !(DIM_KEYS as string[]).includes(dim)) { ignored++; continue; }
    if (invert) effect = -effect;
    const strength = STRENGTH[String(e.strength ?? e.evidence ?? e.evidenceStrength ?? 'medium').toLowerCase()] ?? 0.7;
    const [kind, arg = ''] = feature.split(':');
    const blend = (old: number | undefined, nv: number) => (old === undefined ? nv : old * (1 - strength) + nv * strength);
    if (kind === 'quality' && dim === 'tension') { cfg.qualityTension[arg] = blend(cfg.qualityTension[arg], effect); applied++; }
    else if (kind === 'triad' && dim === 'brightness') { cfg.triadBrightness[arg] = blend(cfg.triadBrightness[arg], effect); applied++; }
    else if (kind === 'degree' && dim === 'brightness' && DEGREE_LABELS[arg.replace('♭', 'b').replace('♯', '#')] !== undefined) {
      const off = DEGREE_LABELS[arg.replace('♭', 'b').replace('♯', '#')];
      cfg.degreeBrightness[off] = blend(cfg.degreeBrightness[off], effect); applied++;
    } else if (kind === 'fifths' && dim === 'brightness') { cfg.fifthsBrightnessPerStep = blend(cfg.fifthsBrightnessPerStep, effect); applied++; }
    else if (kind === 'function' && dim === 'tension' && isFinite(Number(arg))) { cfg.functionTension[Number(arg)] = blend(cfg.functionTension[Number(arg)], effect); applied++; }
    else ignored++;
  }
  return { config: cfg, applied, ignored };
}

function moodFraction(moods: MoodWeight[], set: string[]): number {
  const total = moods.reduce((s, m) => s + m.weight, 0) || 1;
  return moods.filter((m) => set.includes(m.id)).reduce((s, m) => s + m.weight, 0) / total;
}

/** Signed circle-of-fifths distance (sharpward positive), -6..6. */
function fifths(a: number, b: number): number {
  const v = mod(mod(b - a, 12) * 7, 12);
  return v > 6 ? v - 12 : v;
}

export function chordFeatures(
  chord: Chord, k: Key, moods: MoodWeight[], commonness: number, diatonic: boolean, lex: MoodLexicon, cfg: FeatureConfig = activeConfig,
): MoodDimensions {
  const t = pc(k.tonic);
  const off = mod(pc(chord.root) - t, 12);
  const cls = triadClass(chord.quality);
  const centroid = lex.centroid(moods);
  const fd = fifths(t, pc(chord.root));
  const structBright = clamp((cfg.triadBrightness[cls] ?? 0) + fd * cfg.fifthsBrightnessPerStep, -1, 1);
  const mb = cfg.mix.brightnessFromMood;
  const brightness = clamp(centroid ? mb * centroid.brightness + (1 - mb) * structBright : structBright, -1, 1);
  const valence = clamp(centroid ? centroid.valence : structBright, -1, 1);
  const qualT = cfg.qualityTension[chord.quality] ?? 0.3;
  const funcT = cfg.functionTension[off] ?? cfg.functionTensionDefault;
  const m = cfg.mix;
  // mood contribution: KB per-mood tension when available, else the share of "tense" moods
  const moodT = centroid?.tension ?? moodFraction(moods, cfg.tenseMoods);
  const tension = clamp(m.tensionQuality * qualT + m.tensionFunction * funcT + m.tensionMoods * moodT, 0, 1);
  const chromaticism = clamp(m.chromaRarity * (1 - commonness) + (diatonic ? 0 : m.chromaNonDiatonic) + m.chromaFifths * (Math.abs(fd) / 6), 0, 1);
  const home = off === 0 && cls === (MODE_BY_ID[k.mode].family === 'major' ? 'maj' : 'min') ? m.stabilityHome : 0;
  const stability = clamp(0.7 - tension * 0.8 + home + 0.15 * moodFraction(moods, cfg.stableMoods), 0, 1);
  const energy = clamp(centroid ? centroid.arousal : 0.4 + tension * 0.3, 0, 1);
  return { brightness, valence, tension, chromaticism, stability, energy };
}

export function noteFeatures(
  offsetFromTonic: number, interval: number, isChordTone: boolean, inScale: boolean, commonness: number, moods: MoodWeight[], lex: MoodLexicon, cfg: FeatureConfig = activeConfig,
): MoodDimensions {
  const centroid = lex.centroid(moods);
  const off = mod(offsetFromTonic, 12);
  const sb = (cfg.degreeBrightness[off] ?? 0) + (interval > 0 ? 0.1 : interval < 0 ? -0.1 : 0);
  const mb = cfg.mix.brightnessFromMood;
  const brightness = clamp(centroid ? mb * centroid.brightness + (1 - mb) * sb : sb, -1, 1);
  const valence = clamp(centroid ? centroid.valence : sb, -1, 1);
  const leading = cfg.tendencyTones.includes(off) ? 0.3 : 0;
  const tension = clamp((isChordTone ? 0.1 : 0.45) + leading + (Math.abs(interval) === 6 || Math.abs(interval) >= 10 ? 0.3 : 0) + 0.2 * moodFraction(moods, cfg.tenseMoods), 0, 1);
  const chromaticism = clamp(0.5 * (1 - commonness) + (inScale ? 0 : 0.45), 0, 1);
  const stability = clamp((off === 0 ? 0.5 : 0) + (isChordTone ? 0.35 : 0) + (off === 7 || off === 4 || off === 3 ? 0.15 : 0) + 0.2 - tension * 0.3, 0, 1);
  const energy = clamp(centroid ? 0.6 * centroid.arousal + 0.4 * Math.min(1, Math.abs(interval) / 9) : Math.min(1, Math.abs(interval) / 9), 0, 1);
  return { brightness, valence, tension, chromaticism, stability, energy };
}

const MAJOR_IV = [0, 2, 4, 5, 7, 9, 11];
const MINOR_IV = [0, 2, 3, 5, 7, 8, 10];
/** Notes that distinguish a mode from its plain major/minor parent (e.g. Lydian ♯4, Dorian ♮6). */
export function characteristicOffsets(mode: ModeId): number[] {
  const md = MODE_BY_ID[mode];
  const parent = md.family === 'major' ? MAJOR_IV : MINOR_IV;
  return md.intervals.filter((i) => !parent.includes(i));
}

/**
 * How well a chord expresses `mode` on the key's tonic: 1 = fits and contains the mode's characteristic
 * note, 0.5 = fits but is generic, 0 = contains notes outside the mode.
 */
export function chordModeFit(chord: Chord, k: Key, mode: ModeId): number {
  const t = pc(k.tonic);
  const scale = MODE_BY_ID[mode].intervals.map((i) => mod(t + i, 12));
  const pcs = chordPcs(chord);
  if (!pcs.every((p) => scale.includes(p))) return 0;
  // When the wanted mode differs from the key's mode, its colour = the notes the key doesn't have
  // (C major + "Dorian" → E♭, B♭). Chords that sound those notes express the mode; the rest are generic.
  const keyScale = MODE_BY_ID[k.mode].intervals.map((i) => mod(t + i, 12));
  const colour = scale.filter((p) => !keyScale.includes(p));
  if (colour.length) return pcs.some((p) => colour.includes(p)) ? 1 : 0.4;
  const ch = characteristicOffsets(mode).map((i) => mod(t + i, 12));
  return !ch.length || pcs.some((p) => ch.includes(p)) ? 1 : 0.5;
}
export function chordFitsMode(chord: Chord, k: Key, mode: ModeId): number {
  return chordModeFit(chord, k, mode);
}

export interface ProfileMatch {
  total: number; // 0..1
  mood: number | null;
  dims: number | null;
  mode: number | null;
}

/**
 * How well a candidate (its moods + dimension features) fits a profile, 0..1.
 * Mood term uses valence/arousal similarity so near-synonyms partially match.
 */
export function matchProfile(
  profile: MoodProfile, moods: MoodWeight[], features: MoodDimensions, lex: MoodLexicon, fitsMode?: (m: ModeId) => number | boolean,
): ProfileMatch {
  let mood: number | null = null;
  const pm = Object.entries(profile.moods);
  if (pm.length && moods.length) {
    const total = moods.reduce((s, m) => s + m.weight, 0) || 1;
    let acc = 0;
    for (const [target, w] of pm) {
      let exact = 0, sim = 0;
      for (const m of moods) {
        const s = lex.similarity(target, m.id);
        if (s >= 0.999) exact = Math.max(exact, 0.65 + 0.35 * Math.min(1, (m.weight / total) * 2));
        sim += (m.weight / total) * s;
      }
      acc += w * Math.max(exact, sim * 0.8);
    }
    mood = clamp(acc, 0, 1);
  }
  const cfg = activeConfig;
  let dims: number | null = null;
  const dk = DIM_KEYS.filter((d) => profile.dims[d] !== undefined);
  if (dk.length) {
    let s = 0, ws = 0;
    for (const d of dk) {
      const [lo, hi] = DIM_RANGE[d];
      const diff = Math.abs((profile.dims[d] as number) - features[d]) / (hi - lo);
      const w = cfg.dimWeights[d] ?? 1;
      s += w * (1 - Math.min(1, diff * 1.6));
      ws += w;
    }
    dims = ws ? s / ws : null;
  }
  let mode: number | null = null;
  if (profile.modes.length && fitsMode) mode = Math.max(...profile.modes.map((m) => Number(fitsMode(m))));
  const parts: Array<[number | null, number]> = [[mood, cfg.match.mood], [dims, cfg.match.dims], [mode, cfg.match.mode]];
  const used = parts.filter(([v]) => v !== null) as Array<[number, number]>;
  const wsum = used.reduce((s, [, w]) => s + w, 0);
  const total = wsum ? used.reduce((s, [v, w]) => s + v * w, 0) / wsum : 0;
  return { total, mood, dims, mode };
}

/** Human-readable chips: "melancholy 60%", "triumphant 40%", "darker", "more tense", "Lydian". */
export function describeProfile(p: MoodProfile, lex?: MoodLexicon): string[] {
  const chips = Object.entries(p.moods)
    .sort((a, b) => b[1] - a[1])
    .map(([id, w]) => `${lex ? lex.label(id).toLowerCase() : id} ${Math.round(w * 100)}%`);
  const d = p.dims;
  if (d.brightness !== undefined) chips.push(d.brightness <= -0.15 ? 'darker' : d.brightness >= 0.15 ? 'brighter' : 'neutral colour');
  else if (d.valence !== undefined) chips.push(d.valence <= -0.15 ? 'darker' : d.valence >= 0.15 ? 'brighter' : 'neutral colour');
  if (d.tension !== undefined) chips.push(d.tension >= 0.55 ? 'more tense' : d.tension <= 0.3 ? 'relaxed' : 'some tension');
  if (d.chromaticism !== undefined) chips.push(d.chromaticism >= 0.55 ? 'unusual' : d.chromaticism <= 0.3 ? 'plain' : 'a little colour');
  if (d.stability !== undefined) chips.push(d.stability >= 0.6 ? 'resolved' : d.stability <= 0.35 ? 'unresolved' : 'open');
  if (d.energy !== undefined) chips.push(d.energy >= 0.6 ? 'energetic' : d.energy <= 0.35 ? 'calm' : 'moderate energy');
  for (const m of p.modes) chips.push(MODE_BY_ID[m].name.replace(/ \(.*\)/, ''));
  return chips;
}
