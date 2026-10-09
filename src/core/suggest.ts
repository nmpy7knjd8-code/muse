// Suggestion engine: ranks next chords / next melody notes and labels each with mood evidence
// drawn from the theory KB. Framework-free so it can be ported to Swift later.
import { Chord, QualityId, chordPcs, chordSymbol, chordsEqual, triadClass } from './chords';
import { CONSENSUS_WEIGHT, Consensus, KbChordMove, KbMelodicMove, TheoryKB, kbModeToModeId } from './kb';
import { MoodLexicon, MoodWeight, mergeMoods } from './moods';
import { degreeLabel, intervalName, midiName, mod, pc, spell } from './notes';
import { RomanNumeral, analyzeRoman, parseRoman } from './roman';
import { Key, MODE_BY_ID, diatonicChords, inScale, keyName, spellInKey } from './scales';
import { VoiceLine, commonTones, pianoVoicing, voiceLeading, voiceLeadingCost } from './voicing';
import { neoRiemannianPath } from './relations';
import { NoteRelation, REL_FIT, beatWeight, melodyFit, noteRelation } from './noteRelation';
import { TimeSig, strongBeats } from './meter';
import { CandidateTension, TENSION_GAIN, TENSION_MAX, TensionSettings, TensionStyleId, candidateTension, moodTarget, progressionTension, tooEarlyToResolve } from './harmonyTension';
import { MoodDimensions, MoodProfile, ProfileMatch, characteristicOffsets, chordFeatures, chordFitsMode, isEmptyProfile, matchProfile, noteFeatures, profileFromMoods } from './profile';

export type Rarity = 'common' | 'colorful' | 'adventurous';

export interface Evidence {
  id: string;
  name: string;
  description: string;
  consensus: Consensus;
  /** direct = the KB move starts from the current chord; general = KB says something about the target chord in this key */
  strength: 'direct' | 'general' | 'heuristic';
  moods: string[];
  category: string;
}

export interface ChordSuggestion {
  id: string;
  chord: Chord;
  symbol: string;
  roman: string;
  romanInfo: RomanNumeral;
  moods: MoodWeight[];
  primaryMood: string;
  why: string;
  evidence: Evidence[];
  score: number;
  commonness: number;
  rarity: Rarity;
  diatonic: boolean;
  commonTones: number;
  voicing: number[];
  voiceLines: VoiceLine[];
  nrt: string | null;
  moodShift: { arrow: string; text: string } | null;
  moodMatch: number;
  features: MoodDimensions;
  match: ProfileMatch | null;
  /** tension model: level of this chord after the progression, debt after it, ranking adjustment + reasons */
  tension: CandidateTension | null;
  /** when harmonizing melody notes: fit (−1..1) and each note's relation to this chord */
  harmony: { fit: number; relations: NoteRelation[] } | null;
  /**
   * Under a tense mood (ominous, etc.): grounding/release option that sounds good
   * but is not strongly mood-aligned. Soft-lifted into Best fit with a light UI chip.
   */
  breathe?: boolean;
  /** Internal 0..~1.5 quality used to pick breathe options. */
  breatheScore?: number;
}

export interface NoteSuggestion {
  id: string;
  midi: number;
  name: string;
  degree: string;
  interval: number;
  moods: MoodWeight[];
  primaryMood: string;
  why: string;
  evidence: Evidence[];
  score: number;
  commonness: number;
  rarity: Rarity;
  isChordTone: boolean;
  inScale: boolean;
  moodMatch: number;
  features: MoodDimensions;
  match: ProfileMatch | null;
  /** relation to the current chord (chord tone / tension / avoid / clash) */
  relation: NoteRelation | null;
}

export interface ChordSuggestOptions {
  key: Key;
  progression: Chord[];
  targetMoods?: string[];
  /** blended target (moods + dimensions + modes); takes precedence over targetMoods */
  profile?: MoodProfile | null;
  /** 0 = safe/common … 1 = adventurous/unusual */
  adventure?: number;
  limit?: number;
  /** tension budget style (default pop); null disables the tension advisor */
  tensionStyle?: TensionStyleId | null;
  /**
   * Per-chord melody MIDIs aligned with `progression` (same stretch the Tension curve uses).
   * Folded into debt/build so Best fit doesn’t resolve before recent notes have earned it.
   */
  tensionMelody?: Array<number[] | undefined>;
  /** melody notes the chord must harmonize (reharmonization): ranked by fit + mood + context */
  harmonize?: Array<{ midi: number; beat: number; dur?: number }>;
}

export interface NoteSuggestOptions {
  key: Key;
  melody: number[];
  chord?: Chord | null;
  /**
   * Recent chord stretch (e.g. last 4). Used so next-note ranking and “why” text
   * respect the arrival chord of the sequence, not only a single under-chord.
   */
  progression?: Chord[];
  targetMoods?: string[];
  profile?: MoodProfile | null;
  adventure?: number;
  limit?: number;
  /** beat position the note will land on: strong beats favour chord tones, weak beats tolerate tensions */
  beat?: number;
  /** meter used to decide which beats are strong (default 4/4 accents) */
  timeSig?: TimeSig;
}

/** Last up-to-4 chords for stretch-aware melody ranking / copy. */
function recentStretch(prog: Chord[] | undefined, under: Chord | null): Chord[] {
  const raw = (prog?.length ? prog : under ? [under] : []).slice(-4);
  if (!raw.length) return [];
  // Prefer the explicit under-chord as the stretch end when both are present.
  if (under && !chordsEqual(raw[raw.length - 1]!, under)) return [...raw.slice(0, -1), under].slice(-4);
  return raw;
}

function stretchSymbols(stretch: Chord[]): string {
  return stretch.map((c) => chordSymbol(c, true)).join('–');
}

// Functional-harmony transition priors (offset of chord root above tonic → next offset).
const PRIOR_MAJOR: Record<number, Record<number, number>> = {
  0: { 5: 0.8, 7: 0.8, 9: 0.7, 2: 0.5, 4: 0.3, 11: 0.2 },
  2: { 7: 0.9, 11: 0.5, 5: 0.35, 0: 0.3, 9: 0.2, 4: 0.2 },
  4: { 9: 0.8, 5: 0.6, 2: 0.4, 0: 0.25 },
  5: { 7: 0.8, 0: 0.7, 2: 0.5, 9: 0.35, 11: 0.3, 4: 0.2 },
  7: { 0: 0.95, 9: 0.6, 5: 0.4, 4: 0.2, 2: 0.2 },
  9: { 5: 0.8, 2: 0.7, 7: 0.5, 0: 0.35, 4: 0.3 },
  11: { 0: 0.9, 4: 0.3, 9: 0.2 },
};
const PRIOR_MINOR: Record<number, Record<number, number>> = {
  0: { 5: 0.8, 7: 0.7, 8: 0.7, 10: 0.6, 3: 0.5, 2: 0.3 },
  2: { 7: 0.9, 0: 0.3, 3: 0.3 },
  3: { 8: 0.6, 5: 0.6, 10: 0.6, 7: 0.3 },
  5: { 7: 0.8, 0: 0.7, 10: 0.4, 8: 0.3 },
  7: { 0: 0.95, 8: 0.5 },
  8: { 10: 0.7, 5: 0.6, 7: 0.6, 3: 0.4, 0: 0.3 },
  10: { 0: 0.7, 3: 0.7, 8: 0.4 },
};
const START_PRIOR: Record<number, number> = { 0: 1, 5: 0.5, 7: 0.5, 9: 0.4, 8: 0.35, 2: 0.25, 3: 0.3, 10: 0.3 };

const INTERVAL_PRIOR: Record<number, number> = { 0: 0.35, 1: 0.85, 2: 0.9, 3: 0.65, 4: 0.6, 5: 0.5, 6: 0.15, 7: 0.45, 8: 0.25, 9: 0.3, 10: 0.15, 11: 0.1, 12: 0.3 };

const SEMIS_TO_STEPS = [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6];
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const firstSentence = (s: string) => {
  const m = /^(.*?[.!?])(\s|$)/.exec(s);
  return (m ? m[1] : s).trim();
};

function isTriadQuality(q: QualityId) {
  return q === 'maj' || q === 'min' || q === 'dim' || q === 'aug';
}
/** KB quality matches a concrete chord quality: exact, or KB gives a triad and the chord shares its triad class. */
function qualityMatches(kbQ: QualityId, q: QualityId): boolean {
  if (kbQ === q) return true;
  return isTriadQuality(kbQ) && triadClass(kbQ) === triadClass(q) && (q === kbQ || !isTriadQuality(q));
}
function rarityOf(c: number): Rarity {
  return c >= 0.55 ? 'common' : c >= 0.3 ? 'colorful' : 'adventurous';
}

type AddChord = (c: Chord, ev?: Evidence) => void;

/** Heuristic evidence so pool-only colour chords still get a short "why" line (kept low so they don't outrank solid functional moves when adventure is safe). */
function colourEv(id: string, name: string, description: string, moods: string[]): Evidence {
  return { id, name, description, consensus: 'low', strength: 'heuristic', moods, category: 'colour' };
}

/**
 * Richer next-chord candidates: diatonic extensions, secondary dominants, borrowed modal
 * colour, and (with more adventure) altered / tritone-sub / leading-tone options.
 */
function addComplexCandidates(add: AddChord, k: Key, fam: 'major' | 'minor', adventure: number): void {
  const t = pc(k.tonic);
  const R = (off: number, q: QualityId): Chord => ({ root: spellInKey(k, mod(t + off, 12)), quality: q });
  const put = (c: Chord, ev?: Evidence) => add(c, ev);

  // Core colour always available (ranking still prefers common moves when adventure is low)
  put(R(7, '7'), colourEv('ext_V7', 'V7', 'The dominant seventh — the classic pull home.', ['tense', 'hopeful']));
  if (fam === 'minor') put(R(7, 'maj'), colourEv('ext_V', 'V major', 'Raised leading-tone dominant in minor.', ['tense', 'hopeful']));

  if (fam === 'major') {
    put(R(0, 'maj7'), colourEv('ext_Imaj7', 'Imaj7', 'Major seventh on the tonic — dreamy rest.', ['dreamy', 'warm']));
    put(R(0, '6'), colourEv('ext_I6', 'I6', 'Added sixth — warm, nostalgic tonic colour.', ['warm', 'nostalgic']));
    put(R(0, 'add9'), colourEv('ext_Iadd9', 'Iadd9', 'Add9 keeps the triad open and bright.', ['bright', 'floating']));
    put(R(2, 'm7'), colourEv('ext_iim7', 'ii7', 'Supertonic seventh — soft pre-dominant.', ['hopeful', 'warm']));
    put(R(2, 'm9'), colourEv('ext_iim9', 'ii9', 'ii9 — jazzier pre-dominant colour.', ['dreamy', 'jazzy']));
    put(R(5, 'maj7'), colourEv('ext_IVmaj7', 'IVmaj7', 'IV major seventh — open, hopeful.', ['hopeful', 'dreamy']));
    put(R(5, 'add9'), colourEv('ext_IVadd9', 'IVadd9', 'IV add9 — wide, ringing subdominant.', ['bright', 'floating']));
    put(R(7, '9'), colourEv('ext_V9', 'V9', 'Dominant ninth — richer pull than V7.', ['tense', 'bright']));
    put(R(7, '7sus4'), colourEv('ext_V7sus', 'V7sus4', 'Suspended dominant — holds the third back.', ['floating', 'tense']));
    put(R(9, 'm7'), colourEv('ext_vim7', 'vi7', 'Relative-minor seventh — soft, reflective.', ['melancholy', 'warm']));
    put(R(9, 'm9'), colourEv('ext_vim9', 'vi9', 'vi9 — bittersweet minor colour.', ['bittersweet', 'dreamy']));
    // Borrowed / modal
    put(R(10, 'maj'), colourEv('ext_bVII', '♭VII', 'Borrowed ♭VII — rock and Mixolydian colour.', ['earthy', 'epic']));
    put(R(10, '7'), colourEv('ext_bVII7', '♭VII7', '♭VII7 — bluesy pull back toward I.', ['earthy', 'tense']));
    put(R(8, 'maj'), colourEv('ext_bVI', '♭VI', 'Borrowed ♭VI — dark, cinematic lift.', ['dark', 'epic']));
    put(R(8, 'maj7'), colourEv('ext_bVImaj7', '♭VImaj7', '♭VI major seventh — filmic warmth.', ['dreamy', 'bittersweet']));
    put(R(5, 'min'), colourEv('ext_iv', 'iv', 'Minor iv in major — bittersweet borrowed colour.', ['bittersweet', 'melancholy']));
    put(R(3, 'maj'), colourEv('ext_bIII', '♭III', 'Borrowed ♭III — parallel-minor sunshine.', ['warm', 'epic']));
    // Secondaries
    put(R(2, '7'), colourEv('ext_V7ofV', 'V7/V', 'Secondary dominant into V — brightens the approach.', ['tense', 'hopeful']));
    put(R(4, '7'), colourEv('ext_V7ofvi', 'V7/vi', 'Secondary dominant into vi.', ['tense', 'yearning']));
    put(R(9, '7'), colourEv('ext_V7ofii', 'V7/ii', 'Secondary dominant into ii.', ['tense', 'hopeful']));
    put(R(11, '7'), colourEv('ext_V7ofiii', 'V7/iii', 'Secondary dominant into iii.', ['tense', 'bright']));
    put(R(0, '7'), colourEv('ext_I7', 'I7', 'Tonic dominant seventh — blues / gospel turnaround fuel.', ['earthy', 'warm']));
  } else {
    put(R(0, 'm7'), colourEv('ext_im7', 'i7', 'Minor seventh tonic — soft, settled.', ['melancholy', 'warm']));
    put(R(0, 'm9'), colourEv('ext_im9', 'i9', 'i9 — darker minor colour.', ['dark', 'dreamy']));
    put(R(0, 'mMaj7'), colourEv('ext_imMaj7', 'i(maj7)', 'Minor-major seventh — noir tonic.', ['dark', 'tense']));
    put(R(2, 'm7b5'), colourEv('ext_iiø7', 'iiø7', 'Half-diminished ii — classic minor pre-dominant.', ['tense', 'melancholy']));
    put(R(3, 'maj7'), colourEv('ext_IIImaj7', '♭IIImaj7', '♭III major seventh — relative-major warmth.', ['warm', 'hopeful']));
    put(R(5, 'm7'), colourEv('ext_ivm7', 'iv7', 'iv7 — soft minor subdominant.', ['melancholy', 'peaceful']));
    put(R(7, '9'), colourEv('ext_V9min', 'V9', 'Dominant ninth in minor — sharp pull home.', ['tense', 'bright']));
    put(R(8, 'maj7'), colourEv('ext_bVImaj7min', '♭VImaj7', '♭VI major seventh — wide minor colour.', ['dreamy', 'epic']));
    put(R(10, '7'), colourEv('ext_bVII7min', '♭VII7', '♭VII7 — Mixolydian / rock exit in minor.', ['earthy', 'epic']));
    put(R(10, 'maj'), colourEv('ext_bVIImin', '♭VII', '♭VII — open modal lift.', ['earthy', 'bright']));
    put(R(11, 'dim7'), colourEv('ext_viio7', 'vii°7', 'Leading-tone diminished seventh — dense pull to i.', ['tense', 'dark']));
    put(R(2, '7'), colourEv('ext_V7ofVmin', 'V7/V', 'Secondary dominant into V.', ['tense', 'hopeful']));
  }

  if (adventure >= 0.2) {
    put(R(1, '7'), colourEv('ext_bII7', '♭II7', 'Tritone substitute for V7 — jazz side-slip home.', ['jazzy', 'uncanny']));
    put(R(7, '7b9'), colourEv('ext_V7b9', 'V7♭9', 'Altered dominant — dark tension into the tonic.', ['tense', 'dark']));
    put(R(7, '7#9'), colourEv('ext_V7s9', 'V7♯9', '♯9 dominant — bluesy / Hendrix colour.', ['tense', 'earthy']));
    put(R(0, 'sus2'), colourEv('ext_Isus2', 'Isus2', 'Suspended second — open, floating tonic.', ['floating', 'peaceful']));
    put(R(0, 'sus4'), colourEv('ext_Isus4', 'Isus4', 'Suspended fourth — wants to resolve to the third.', ['floating', 'tense']));
    if (fam === 'major') put(R(0, 'maj7#11'), colourEv('ext_Imaj7s11', 'Imaj7♯11', 'Lydian tonic — bright sharp-11 shimmer.', ['mystical', 'bright']));
  }
  if (adventure >= 0.45) {
    put(R(6, '7'), colourEv('ext_sIV7', '♯IV7', 'Sharp-IV dominant — distant, searching colour.', ['tense', 'uncanny']));
    put(R(3, '7'), colourEv('ext_bIII7', '♭III7', '♭III7 — chromatic mediant energy.', ['epic', 'tense']));
    put(R(8, '7'), colourEv('ext_bVI7', '♭VI7', '♭VI7 — dramatic chromatic colour.', ['dark', 'epic']));
    put(R(1, 'maj'), colourEv('ext_bII', '♭II', 'Neapolitan flavour — dark pre-dominant.', ['dark', 'solemn']));
    put(R(6, 'dim7'), colourEv('ext_sIVo7', '♯iv°7', 'Common-tone / passing diminished colour.', ['tense', 'uncanny']));
    put(R(4, 'aug'), colourEv('ext_IIIaug', 'III+', 'Augmented mediant — unstable lift.', ['uncanny', 'tense']));
    if (fam === 'major') {
      put(R(11, 'dim7'), colourEv('ext_viio7maj', 'vii°7', 'Leading-tone diminished seventh into I.', ['tense', 'dark']));
      put(R(2, '7b9'), colourEv('ext_V7b9ofV', 'V7♭9/V', 'Altered secondary into V.', ['tense', 'jazzy']));
    }
  }
}

export function voiceProgression(chords: Chord[]): number[][] {
  const out: number[][] = [];
  let prev: number[] | undefined;
  for (const c of chords) {
    const v = pianoVoicing(c, prev);
    out.push(v);
    prev = v;
  }
  return out;
}

/** weight of melody fit when harmonizing notes (fit is −1..1). HEURISTIC. */
export const HARMONIZE_GAIN = 2.2;
/** Chord suggestions: mood can move ranking a lot (user asked for a feeling). */
/** Strong enough that an active mood visibly restacks Best-fit. */
const MOOD_GAIN = 5.2;
/**
 * Note suggestions: mood only tints — harmonic/melodic fit must stay primary so the list
 * isn't clustered by aesthetic tag (e.g. all “mystical” notes first while clashes beat chord tones).
 */
const NOTE_MOOD_GAIN = 0.85;
/** How strongly chord-tone / colour / clash relation moves a note’s rank (−1..1 → score). */
const NOTE_FIT_GAIN = 1.55;
/** Absolute fit values cluster (most chords fit a blend a bit), so also reward fit relative to the other candidates. */
function moodContrast(list: { score: number; moodMatch: number }[], gain = MOOD_GAIN): void {
  if (list.length < 2) return;
  const lo = Math.min(...list.map((x) => x.moodMatch)), hi = Math.max(...list.map((x) => x.moodMatch));
  if (hi - lo < 1e-6) return;
  for (const x of list) x.score += gain * 0.6 * ((x.moodMatch - lo) / (hi - lo) - 0.5);
}

/** Mood-target tension at/above this → surface grounding “breathe” options. HEURISTIC. */
const BREATHE_TENSION_GATE = 0.65;
/**
 * How well a candidate grounds / releases under a tense mood request.
 * Favours stability, cadence, debt paydown — not mood match. HEURISTIC.
 */
function breatheQuality(opts: {
  features: MoodDimensions;
  tension: CandidateTension | null;
  cadence: number;
  resolveSec: number;
  tonicHome: boolean;
  relativeCalm: boolean;
  diatonic: boolean;
}): number {
  let q = 0.3 * (opts.features.stability ?? 0) + 0.22 * (1 - (opts.features.tension ?? 0.5));
  if (opts.tension) {
    q += 0.35 * Math.max(0, opts.tension.adjust) + 0.22 * opts.tension.release;
  }
  q += Math.max(0, opts.cadence) * 0.55 + Math.max(0, opts.resolveSec) * 0.35;
  if (opts.tonicHome) q += 0.28;
  if (opts.relativeCalm) q += 0.14;
  if (opts.diatonic) q += 0.1;
  return q;
}

/**
 * Under a high-tension mood, keep the mood-ranked top intact, then inject up to 3
 * grounding “breathe” chords (marked for a light UI chip) so the list has somewhere to land.
 */
function injectBreatheOptions(out: ChordSuggestion[], moodTension: number | null, limit: number): ChordSuggestion[] {
  out.sort((a, b) => b.score - a.score);
  if (moodTension == null || moodTension < BREATHE_TENSION_GATE || out.length < 4) {
    return out.slice(0, limit);
  }
  const moodSorted = out.map((s) => s.moodMatch).sort((a, b) => a - b);
  const moodMedian = moodSorted[Math.floor(moodSorted.length / 2)] ?? 0.5;
  const topKeep = Math.min(3, out.length);
  const top = out.slice(0, topKeep);
  const topIds = new Set(top.map((s) => s.id));
  const key = (s: ChordSuggestion) =>
    (s.breatheScore ?? 0) - 0.45 * s.moodMatch + (s.diatonic ? 0.12 : 0);
  const picks = out
    .filter((s) => !topIds.has(s.id) && (s.breatheScore ?? 0) >= 0.28 && s.moodMatch <= moodMedian + 0.08)
    .sort((a, b) => key(b) - key(a))
    .slice(0, 3);
  for (const s of picks) {
    s.breathe = true;
    if (!/^Breathe —/.test(s.why)) {
      s.why = `Breathe — grounds the phrase without chasing the mood. ${s.why}`;
    }
  }
  const pickIds = new Set(picks.map((s) => s.id));
  const rest = out.filter((s) => !topIds.has(s.id) && !pickIds.has(s.id));
  return [...top, ...picks, ...rest].slice(0, limit);
}

/** Soft identity for variety: same root + triad class (C ≈ Cmaj7 ≈ C6). */
function chordFamilyId(c: Chord): string {
  return `${pc(c.root)}:${triadClass(c.quality)}`;
}

/**
 * Prefer not looping recent chords. Tonic returns are lightly taxed only so cadences home still win.
 * HEURISTIC — keeps the suggestion list moving without rewriting functional priors.
 */
function recentVarietyAdjust(chord: Chord, prog: Chord[], k: Key): number {
  if (prog.length < 2) return 0;
  const hist = prog.slice(0, -1);
  const fam = chordFamilyId(chord);
  let dist = -1;
  for (let i = hist.length - 1; i >= 0; i--) {
    if (chordFamilyId(hist[i]) === fam) {
      dist = hist.length - 1 - i;
      break;
    }
  }
  if (dist < 0 || dist > 3) return 0;
  const mag = dist === 0 ? 0.42 : dist === 1 ? 0.22 : dist === 2 ? 0.12 : 0.06;
  const tonicHome = pc(chord.root) === pc(k.tonic) && (triadClass(chord.quality) === 'maj' || triadClass(chord.quality) === 'min');
  return -(tonicHome ? mag * 0.4 : mag);
}

/**
 * When the current chord is a secondary dominant, prefer landing on its target root.
 * Priors already help by root offset; this lifts the whole resolution family (V, V7…).
 * HEURISTIC.
 */
function secondaryResolveBonus(cur: Chord | undefined, chord: Chord, k: Key): number {
  if (!cur) return 0;
  const rn = analyzeRoman(cur, k);
  if (!rn.secondary) return 0;
  const targetPc = mod(pc(cur.root) - 7, 12);
  if (pc(chord.root) !== targetPc) return 0;
  const plain = chord.quality === 'maj' || chord.quality === 'min';
  return plain ? 0.4 : 0.28;
}

/**
 * Single-step neo-Riemannian moves (P/L/R) are especially smooth common-tone transforms.
 * Tiny nudge on top of the voice-leading term — nrt is already computed for display. HEURISTIC.
 */
function nrtSmoothBonus(nrt: string | null): number {
  if (!nrt) return 0;
  if (nrt.length === 1) return 0.1;
  if (nrt.length === 2) return 0.04;
  return 0;
}

/**
 * Descending-fifth / ascending-fourth root motion is the backbone of functional sequences.
 * Priors cover diatonic cases; a light bonus still helps chromatic / secondary chains. HEURISTIC.
 */
function fallingFifthBonus(cur: Chord | undefined, chord: Chord): number {
  if (!cur) return 0;
  const asc = mod(pc(chord.root) - pc(cur.root), 12);
  if (asc === 5) return 0.16; // root up a fourth = falling fifth
  return 0;
}

/** Sounding bass PC (slash bass when present, else root). */
function bassPcOf(c: Chord): number {
  return c.bass ? pc(c.bass) : pc(c.root);
}

function isDomQuality(q: QualityId): boolean {
  return q === 'maj' || q === '7' || q === '9' || q === '7b9' || q === '7#9' || q === '7sus4';
}

/** V / V7 / vii°(7) in the key — the dominant-function pillars of a cadence. */
function isKeyDominant(chord: Chord, k: Key): boolean {
  const off = mod(pc(chord.root) - pc(k.tonic), 12);
  if (off === 7 && isDomQuality(chord.quality)) return true;
  if (off === 11 && (chord.quality === 'dim' || chord.quality === 'dim7' || chord.quality === 'm7b5')) return true;
  return false;
}

/**
 * Cadence grammar (mokuren / Common-Practice / pop practice):
 * after a key dominant, prefer authentic I/i, then deceptive vi/♭VI.
 * Caps stay small so adventure / mood / harmonize can still override. HEURISTIC.
 */
function cadenceBonus(cur: Chord | undefined, chord: Chord, k: Key, adventure: number): number {
  if (!cur || !isKeyDominant(cur, k)) return 0;
  const fam = MODE_BY_ID[k.mode].family;
  const nextOff = mod(pc(chord.root) - pc(k.tonic), 12);
  const plain = chord.quality === 'maj' || chord.quality === 'min';
  const softTonic = plain || chord.quality === 'maj7' || chord.quality === 'm7' || chord.quality === '6' || chord.quality === 'add9';
  // Authentic: V → I / i (Picardy maj in minor still counts as home).
  if (nextOff === 0 && softTonic) return plain ? 0.38 : 0.26;
  // Deceptive: V → vi (major) or ♭VI (minor) — classic misdirection.
  const dec = fam === 'major' ? 9 : 8;
  if (nextOff === dec && (chord.quality === 'min' || chord.quality === 'maj' || chord.quality === 'm7' || chord.quality === 'maj7')) {
    return adventure >= 0.2 ? 0.18 : 0.1;
  }
  return 0;
}

/**
 * Predominant → dominant: IV / ii (and minor iv / ii°) naturally aim at V.
 * Priors already help; a light lift makes the grammar audible in the top ranks. HEURISTIC.
 */
function predominantToDominantBonus(cur: Chord | undefined, chord: Chord, k: Key): number {
  if (!cur) return 0;
  const t = pc(k.tonic);
  const from = mod(pc(cur.root) - t, 12);
  const to = mod(pc(chord.root) - t, 12);
  if (to !== 7 || !isDomQuality(chord.quality)) return 0;
  if (from === 5 || from === 2) return 0.14; // IV/ii → V
  if (MODE_BY_ID[k.mode].family === 'minor' && (from === 5 || from === 3)) return 0.12;
  return 0;
}

/**
 * Launch applied dominants from stable homes (I, IV, vi…) — V/V and V/ii are the workhorses
 * (Hooktheory secondary practice; Scaler-style “tension before resolve”). HEURISTIC.
 */
function secondaryPrepareBonus(cur: Chord | undefined, chord: Chord, k: Key, adventure: number): number {
  if (!cur || adventure < 0.15) return 0;
  const rn = analyzeRoman(chord, k);
  if (!rn.secondary || !rn.secondary.startsWith('V')) return 0;
  const curOff = mod(pc(cur.root) - pc(k.tonic), 12);
  // Good launch pads: tonic, subdominant, submediant (and minor ♭VI / ♭III colour).
  if (![0, 5, 9, 8, 3].includes(curOff)) return 0;
  if (/\/V$/.test(rn.secondary)) return 0.22; // V/V
  if (/\/(ii|II|i|I)$/.test(rn.secondary)) return 0.18; // V/ii (or V/i in minor labelling)
  if (/\/(vi|VI)$/.test(rn.secondary)) return 0.14;
  return 0.1;
}

/**
 * Bass-line motion (slash-aware): stepwise and 4th/5th basses glue changes; big leaps tax.
 * Complements root fallingFifthBonus when inversion / slash differs from root. HEURISTIC.
 */
function bassMotionBonus(cur: Chord | undefined, chord: Chord): number {
  if (!cur) return 0;
  const from = bassPcOf(cur);
  const to = bassPcOf(chord);
  const asc = mod(to - from, 12);
  const step = Math.min(asc, 12 - asc);
  if (step === 0) return 0.05; // pedal / shared bass
  if (step === 1 || step === 2) return 0.14; // stepwise
  if (asc === 5 || asc === 7) return 0.1; // fourth / fifth
  if (step >= 6) return -0.06; // tritone-or-worse leap in the bass
  return 0;
}

/**
 * Jazz guide-tone continuity: reward when 3rds/7ths of adjacent chords connect by step
 * (shell-voicing / guide-tone line practice). Gated to tensionStyle === 'jazz'. HEURISTIC.
 */
function guideToneBonus(cur: Chord | undefined, chord: Chord, style: TensionStyleId | null | undefined): number {
  if (!cur || style !== 'jazz') return 0;
  const guidePcs = (c: Chord): number[] => {
    const r = pc(c.root);
    return chordPcs(c).filter((p) => {
      const d = mod(p - r, 12);
      return d === 3 || d === 4 || d === 10 || d === 11;
    });
  };
  const a = guidePcs(cur);
  const b = guidePcs(chord);
  if (!a.length || !b.length) return 0;
  let hits = 0;
  for (const from of a) {
    for (const to of b) {
      const d = Math.min(mod(to - from, 12), mod(from - to, 12));
      if (d <= 2) hits++;
    }
  }
  return hits >= 2 ? 0.16 : hits === 1 ? 0.08 : 0;
}

/**
 * Tiny boosts for ubiquitous pop / jazz skeletons (Hookpad “Magic Chord” spirit —
 * corpus-common continuations) without overriding functional priors. HEURISTIC.
 */
function stockProgressionBonus(prog: Chord[], chord: Chord, k: Key): number {
  if (prog.length < 2) return 0;
  const t = pc(k.tonic);
  const a = mod(pc(prog[prog.length - 2]!.root) - t, 12);
  const b = mod(pc(prog[prog.length - 1]!.root) - t, 12);
  const c = mod(pc(chord.root) - t, 12);
  const fam = MODE_BY_ID[k.mode].family;
  // Axis / pop: I–V–vi → IV
  if (a === 0 && b === 7 && c === 5) return 0.2;
  // I–vi–IV → V
  if (a === 0 && b === 9 && c === 7) return 0.2;
  // vi–IV–I → V
  if (a === 9 && b === 5 && c === 0) return 0.12;
  if (a === 9 && b === 5 && c === 7) return 0.18;
  // Jazz turnaround fragment: ii–V → I
  if (a === 2 && b === 7 && c === 0) return 0.22;
  // Andalusian / natural-minor cascade: i–♭VII–♭VI → V or ♭VII
  if (fam === 'minor') {
    if (a === 0 && b === 10 && c === 8) return 0.16;
    if (a === 10 && b === 8 && c === 7) return 0.14;
  }
  return 0;
}

/**
 * Mode-characteristic chords (Mixolydian ♭VII, Dorian IV, Phrygian ♭II, Lydian II)
 * get a light lift when the key is that mode — priors are maj/min-family only. HEURISTIC.
 */
function modalColourBonus(chord: Chord, k: Key): number {
  const mode = k.mode;
  if (mode === 'major' || mode === 'minor' || mode === 'harmonicMinor' || mode === 'melodicMinor') return 0;
  const off = mod(pc(chord.root) - pc(k.tonic), 12);
  if (mode === 'mixolydian' && off === 10 && (chord.quality === 'maj' || chord.quality === '7')) return 0.2;
  if (mode === 'dorian' && off === 5 && (chord.quality === 'maj' || chord.quality === '7')) return 0.16;
  if ((mode === 'phrygian' || mode === 'phrygianDominant') && off === 1) return 0.18;
  if ((mode === 'lydian' || mode === 'lydianDominant') && off === 2 && (chord.quality === 'maj' || chord.quality === '7')) return 0.14;
  return 0;
}

/**
 * Mild exact-symbol cooldown on top of family variety — Cmaj7 after Cmaj7 is more loop-y
 * than C after Cmaj7. Tonic home still lightly taxed only. HEURISTIC.
 */
function exactRepeatAdjust(chord: Chord, prog: Chord[], k: Key): number {
  if (prog.length < 1) return 0;
  const sym = chordSymbol(chord);
  const last = chordSymbol(prog[prog.length - 1]!);
  if (sym !== last) return 0;
  // suggestChords already skips equal-to-current; this catches near-repeat via enharmonic / when harmonizing.
  const tonicHome = pc(chord.root) === pc(k.tonic);
  return tonicHome ? -0.08 : -0.18;
}

const CHORD_PAIR_RE = /\b[A-G][#b♭♯]?[a-z0-9#b♭♯°ø+]*\s*(?:→|->)\s*[A-G][#b♭♯]?[a-z0-9#b♭♯°ø+]*/;

export class SuggestionEngine {
  readonly lexicon: MoodLexicon;
  constructor(readonly kb: TheoryKB) {
    this.lexicon = new MoodLexicon(kb);
  }

  private family(k: Key) {
    return MODE_BY_ID[k.mode].family;
  }

  private modeOk(m: KbChordMove, k: Key) {
    return m.keyMode === 'any' || m.keyMode === this.family(k);
  }

  private evidenceFrom(m: KbChordMove | KbMelodicMove, strength: Evidence['strength']): Evidence {
    return { id: m.id, name: m.name, description: m.description, consensus: m.consensus, strength, moods: m.moods, category: m.category };
  }

  /** Realise a key-relative KB chord reference in a key (spelling from the roman numeral when possible). */
  private realizeKeyRef(ref: { roman: string; root: number; quality: QualityId }, k: Key): Chord {
    const rootPc = mod(pc(k.tonic) + ref.root, 12);
    const clean = ref.roman.replace(/\(.*?\)/g, '').trim();
    const parsed = parseRoman(clean.split('/')[0], k);
    const root = parsed && pc(parsed.root) === rootPc && Math.abs(parsed.root.acc) <= 1 ? parsed.root : spellInKey(k, rootPc);
    const chord: Chord = { root, quality: ref.quality };
    if (/\/(I|i)$/.test(clean) && ref.root !== 0) chord.bass = k.tonic;
    return chord;
  }

  private realizeRelative(cur: Chord, semis: number, quality: QualityId, k: Key): Chord {
    const rootPc = mod(pc(cur.root) + semis, 12);
    let root = spell(cur.root.letter + SEMIS_TO_STEPS[mod(semis, 12)], rootPc);
    // Scale tones keep the key's spelling; avoid double accidentals and odd names (Fb, Cb, E#, B#).
    const odd = (root.acc < 0 && (root.letter === 0 || root.letter === 3)) || (root.acc > 0 && (root.letter === 2 || root.letter === 6));
    if (Math.abs(root.acc) > 1 || odd || inScale(k, rootPc)) root = spellInKey(k, rootPc);
    return { root, quality };
  }

  /** KB moves that describe arriving on `chord` in key `k` (independent of the previous chord). */
  generalEvidence(chord: Chord, k: Key): Evidence[] {
    const off = mod(pc(chord.root) - pc(k.tonic), 12);
    return this.kb.chordMoves
      .filter((m) => m.relativeTo === 'key' && this.modeOk(m, k) && m.to.root === off && qualityMatches(m.to.quality, chord.quality))
      .sort((a, b) => CONSENSUS_WEIGHT[b.consensus] - CONSENSUS_WEIGHT[a.consensus])
      .slice(0, 3)
      .map((m) => this.evidenceFrom(m, 'general'));
  }

  /** KB moves that go from `from` to `to` in key `k`. */
  directEvidence(from: Chord, to: Chord, k: Key): Evidence[] {
    const t = pc(k.tonic);
    const offFrom = mod(pc(from.root) - t, 12);
    const offTo = mod(pc(to.root) - t, 12);
    const rel = mod(pc(to.root) - pc(from.root), 12);
    const out: Evidence[] = [];
    for (const m of this.kb.chordMoves) {
      if (!m.from) continue;
      if (m.relativeTo === 'key') {
        if (!this.modeOk(m, k)) continue;
        if (m.from.root === offFrom && qualityMatches(m.from.quality, from.quality) && m.to.root === offTo && qualityMatches(m.to.quality, to.quality)) out.push(this.evidenceFrom(m, 'direct'));
      } else if (qualityMatches(m.from.quality, from.quality) && m.to.root === rel && m.to.quality === to.quality && !(rel === 0 && from.quality === to.quality)) {
        out.push(this.evidenceFrom(m, 'direct'));
      }
    }
    return out;
  }

  private moodsFromEvidence(ev: Evidence[], chord: Chord): MoodWeight[] {
    const hasDirect = ev.some((e) => e.strength === 'direct');
    const lists = ev.map((e) => {
      const w = CONSENSUS_WEIGHT[e.consensus] * (e.strength === 'direct' ? 1 : e.strength === 'general' ? (hasDirect ? 0.25 : 0.5) : 0.3);
      return e.moods.map((id, i) => ({ id, weight: w * (1 - i * 0.12) }));
    });
    let moods = mergeMoods(lists, this.lexicon);
    if (!moods.length) {
      const cls = triadClass(chord.quality);
      const h: Record<string, string> = { maj: 'bright', min: 'melancholy', dim: 'tense', aug: 'uncanny', sus: 'floating', power: 'earthy' };
      moods = [{ id: h[cls] ?? 'floating', weight: 0.2 }];
    }
    return moods;
  }

  /** Mood profile of a chord in context (used for the "current" side of mood-shift arrows). */
  chordMoods(chord: Chord, k: Key, previous?: Chord): MoodWeight[] {
    const ev = [...(previous ? this.directEvidence(previous, chord, k) : []), ...this.generalEvidence(chord, k)];
    return this.moodsFromEvidence(ev, chord);
  }

  private resolveProfile(opts: { profile?: MoodProfile | null; targetMoods?: string[] }): MoodProfile | null {
    if (opts.profile && !isEmptyProfile(opts.profile)) {
      const moods = Object.fromEntries(Object.entries(opts.profile.moods).map(([k, v]) => [this.lexicon.canonical(k), v]));
      return { ...opts.profile, moods };
    }
    if (opts.targetMoods?.length) return profileFromMoods(opts.targetMoods.map((m) => this.lexicon.canonical(m)));
    return null;
  }

  /** Profile fit (0..1) of a chord in key k, given its moods — used by mood journeys and maps. */
  scoreAgainst(profile: MoodProfile, chord: Chord, k: Key, moods?: MoodWeight[]): number {
    const m = moods ?? this.chordMoods(chord, k);
    const rn = analyzeRoman(chord, k);
    const commonness = rn.diatonic ? 0.7 : 0.3;
    const f = chordFeatures(chord, k, m, commonness, rn.diatonic, this.lexicon);
    return matchProfile(profile, m, f, this.lexicon, (md) => chordFitsMode(chord, k, md)).total;
  }

  suggestChords(opts: ChordSuggestOptions): ChordSuggestion[] {
    const k = opts.key;
    const a = clamp01(opts.adventure ?? 0.35);
    const profile = this.resolveProfile(opts);
    const prog = opts.progression;
    const cur = prog.length ? prog[prog.length - 1] : undefined;
    const prev = prog.length > 1 ? prog[prog.length - 2] : undefined;
    const t = pc(k.tonic);
    const fam = this.family(k);

    const pool = new Map<string, { chord: Chord; evidence: Evidence[] }>();
    const harm = opts.harmonize?.length ? opts.harmonize : null;
    const add = (c: Chord, ev?: Evidence) => {
      if (cur && !harm && chordsEqual(c, cur)) return;
      const id = chordSymbol(c);
      let e = pool.get(id);
      if (!e) pool.set(id, (e = { chord: c, evidence: [] }));
      if (ev && !e.evidence.some((x) => x.id === ev.id)) e.evidence.push(ev);
    };

    diatonicChords(k).forEach((c) => add(c));
    // Sevenths, secondaries, borrowed colour, and jazzier extensions — always in the pool so
    // the adventure slider / mood target can surface them (not only when harmonizing melody).
    diatonicChords(k, true).forEach((c) => add(c));
    addComplexCandidates(add, k, fam, a);
    // a requested mode (e.g. "Dorian" while in C major) contributes its borrowed (non-key) triads
    if (profile?.modes.length) {
      const keyPcs = new Set(diatonicChords(k).flatMap((c) => chordPcs(c)));
      for (const m of profile.modes) {
        if (m === k.mode) continue;
        for (const c of diatonicChords({ tonic: k.tonic, mode: m })) if (chordPcs(c).some((p) => !keyPcs.has(p)) && c.quality !== 'dim') add(c);
        for (const c of diatonicChords({ tonic: k.tonic, mode: m }, true)) if (chordPcs(c).some((p) => !keyPcs.has(p))) add(c);
      }
    }

    for (const m of this.kb.chordMoves) {
      if (!m.from) continue;
      if (m.relativeTo === 'key') {
        if (!this.modeOk(m, k) || !cur) continue;
        const offCur = mod(pc(cur.root) - t, 12);
        if (m.from.root === offCur && qualityMatches(m.from.quality, cur.quality)) add(this.realizeKeyRef(m.to, k), this.evidenceFrom(m, 'direct'));
      } else if (cur && qualityMatches(m.from.quality, cur.quality)) {
        if (m.to.root === 0 && m.to.quality === cur.quality) continue;
        add(this.realizeRelative(cur, m.to.root, m.to.quality, k), this.evidenceFrom(m, 'direct'));
      }
    }
    // With no current chord, offer a few colourful KB targets as starting points too
    if (!cur) {
      for (const m of this.kb.chordMoves) {
        if (m.relativeTo !== 'key' || !this.modeOk(m, k) || m.consensus === 'low' || m.to.root === 0) continue;
        const c = this.realizeKeyRef(m.to, k);
        if (!c.bass) add(c);
      }
    }

    const voicings = voiceProgression(prog);
    const prevVoicing = voicings.length ? voicings[voicings.length - 1] : undefined;
    const curMoods = cur ? this.chordMoods(cur, k, prev) : [];
    const priorTable = fam === 'major' ? PRIOR_MAJOR : PRIOR_MINOR;
    const tSettings: TensionSettings | null = opts.tensionStyle === null ? null : { style: opts.tensionStyle ?? 'pop', adventure: a, target: moodTarget(profile) };
    // Share the Tension curve’s recent stretch (chords + optional melody notes per bar).
    const tSteps = prog.map((chord, i) => {
      const mel = opts.tensionMelody?.[i];
      return mel?.length ? { chord, melody: mel } : { chord };
    });
    const tState = tSettings ? progressionTension(tSteps, k, tSettings) : null;
    const withholdHome = tState ? tooEarlyToResolve(tState) : false;

    // Cap scoring work: keep evidenced / diatonic / functional candidates first, then colour.
    let poolList = [...pool.values()];
    if (poolList.length > 56) {
      const dia = new Set(diatonicChords(k, true).map((c) => chordSymbol(c)));
      poolList.sort((a, b) => {
        const rank = (e: { chord: Chord; evidence: Evidence[] }) =>
          (e.evidence.some((x) => x.strength === 'direct') ? 4 : 0)
          + (e.evidence.length ? 2 : 0)
          + (dia.has(chordSymbol(e.chord)) ? 1 : 0);
        return rank(b) - rank(a);
      });
      poolList = poolList.slice(0, 56);
    }

    const out: ChordSuggestion[] = [];
    for (const { chord, evidence } of poolList) {
      const general = this.generalEvidence(chord, k).filter((g) => !evidence.some((e) => e.id === g.id));
      // key-relative direct moves read best as the headline ("why"), then chord-relative colour moves
      const keyRel = new Set(this.kb.chordMoves.filter((m) => m.relativeTo === 'key').map((m) => m.id));
      const direct = [...evidence].sort((x, y) => Number(keyRel.has(y.id)) - Number(keyRel.has(x.id)) || CONSENSUS_WEIGHT[y.consensus] - CONSENSUS_WEIGHT[x.consensus]);
      // KB text uses C-based examples ("C→Am"); rewrite them to the actual move for chord-relative evidence
      if (cur) for (const e of direct) if (!keyRel.has(e.id)) e.description = e.description.replace(CHORD_PAIR_RE, `${chordSymbol(cur, true)}→${chordSymbol(chord, true)}`);
      const allEv = [...direct, ...general];
      const rn = analyzeRoman(chord, k);
      const off = rn.offset;
      // harmonic-minor dominant / leading-tone chords count as "in key" for minor-family keys
      const functional = rn.diatonic || (fam === 'minor' && ((off === 7 && (chord.quality === 'maj' || chord.quality === '7')) || (off === 11 && (chord.quality === 'dim' || chord.quality === 'dim7'))));
      const prior = cur ? priorTable[mod(pc(cur.root) - t, 12)]?.[off] ?? (rn.diatonic ? 0.2 : 0.1) : START_PRIOR[off] ?? 0.15;
      const directW = evidence.reduce((s, e) => Math.max(s, CONSENSUS_WEIGHT[e.consensus]), 0);
      const commonness = clamp01(0.5 * prior + (functional ? 0.3 : 0) + 0.2 * directW);
      const kbStrength = Math.min(1.2, evidence.reduce((s, e) => s + CONSENSUS_WEIGHT[e.consensus] * 0.6, 0)) + Math.min(0.4, general.length * 0.15);
      const voicing = pianoVoicing(chord, prevVoicing);
      const ct = cur ? commonTones(cur, chord) : 0;
      const vl = prevVoicing ? voiceLeadingCost(prevVoicing, voicing) : 0;
      const smooth = ct * 0.08 - vl * 0.015;
      const moods = this.moodsFromEvidence(allEv, chord);
      const features = chordFeatures(chord, k, moods, commonness, rn.diatonic, this.lexicon);
      const tension = tState ? candidateTension(tState, cur ?? null, chord, k, harm?.map((n) => n.midi)) : null;
      const harmony = harm ? { fit: melodyFit(harm, chord), relations: harm.map((n) => noteRelation(n.midi, chord, this.kb)) } : null;
      // the tension model (context-aware: distance from home, pull, roughness, motion) refines the lookup-table tension
      if (tension) features.tension = clamp01(0.5 * features.tension + 0.5 * clamp01(tension.level / TENSION_MAX));
      const pm = profile ? matchProfile(profile, moods, features, this.lexicon, (m) => chordFitsMode(chord, k, m)) : null;
      const match = pm?.total ?? 0;
      const moodBonus = pm ? MOOD_GAIN * match - MOOD_GAIN * 0.35 : 0;
      // Safe end of the slider still prefers plain triads as the headline; colour/7ths fill out the list.
      const plainTriad = chord.quality === 'maj' || chord.quality === 'min' || chord.quality === 'dim';
      const simplicity = (1 - a) * (plainTriad ? 0.35 : chord.quality === '7' || chord.quality === 'm7' || chord.quality === 'maj7' ? 0.12 : 0);
      // Empty progression: land on the plain tonic triad first (extensions still appear below).
      const startBias = !cur && plainTriad && off === 0 ? 1.1 : 0;
      const nrt = cur ? neoRiemannianPath(cur, chord) : null;
      // Light grammar / variety terms — additive only; do not replace priors, KB, or tension.
      // Cadence / secondary / bass / stock / modal / jazz guide-tones: theory-solid nudges
      // inspired by Common-Practice scoring (mokuren), Genkhord FUNCTION mode, Hookpad Magic Chord.
      const variety = recentVarietyAdjust(chord, prog, k) + exactRepeatAdjust(chord, prog, k);
      const resolveSec = secondaryResolveBonus(cur, chord, k);
      const prepareSec = secondaryPrepareBonus(cur, chord, k, a);
      const nrtBonus = nrtSmoothBonus(nrt);
      const fifths = fallingFifthBonus(cur, chord);
      // Soft-gate authentic/deceptive cadences while the recent stretch is still building.
      const cadenceRaw = cadenceBonus(cur, chord, k, a);
      const cadence = withholdHome ? cadenceRaw * 0.28 : cadenceRaw;
      const predDom = predominantToDominantBonus(cur, chord, k);
      const bass = bassMotionBonus(cur, chord);
      const stockRaw = stockProgressionBonus(prog, chord, k);
      // ii–V→I / vi–IV–I stock landings on tonic also wait until debt earns them.
      const stockHome = withholdHome && mod(pc(chord.root) - t, 12) === 0;
      const stock = stockHome ? stockRaw * 0.3 : stockRaw;
      const modal = modalColourBonus(chord, k);
      const guides = guideToneBonus(cur, chord, opts.tensionStyle);
      const tonicHome = off === 0 && (plainTriad || chord.quality === 'maj7' || chord.quality === 'm7' || chord.quality === '6' || chord.quality === 'add9');
      const relativeCalm = fam === 'major' && off === 9 && (chord.quality === 'min' || chord.quality === 'm7');
      const breatheScore = breatheQuality({
        features, tension, cadence, resolveSec, tonicHome, relativeCalm, diatonic: rn.diatonic,
      });
      const score = kbStrength * 0.8 + smooth + (1 - a) * commonness * 1.6 + a * (1 - commonness) * 1.6
        + moodBonus + simplicity + startBias + variety + resolveSec + prepareSec + nrtBonus + fifths
        + cadence + predDom + bass + stock + modal + guides
        + (tension && prog.length ? TENSION_GAIN * tension.adjust : 0)
        + (harmony ? HARMONIZE_GAIN * harmony.fit : 0);
      const top = allEv[0];
      const roman = rn.secondary ?? rn.text;
      let why = top
        ? `${top.strength === 'direct' ? '' : `${roman}: `}${firstSentence(top.description)}`
        : `${rn.diatonic ? 'In this key' : 'Outside the plain key'}: ${roman} in ${keyName(k)}.`;
      if (tension?.reasons.includes('too early to resolve — keep the build going') && mod(pc(chord.root) - t, 12) === 0) {
        why = `Keep the build going — ${why}`;
      } else if (cadence >= 0.26) why = `Cadence home — ${why}`;
      else if (cadence >= 0.1) why = `Deceptive turn — ${why}`;
      else if (stock >= 0.18) why = `Common continuation — ${why}`;
      else if (prepareSec >= 0.18) why = `Secondary setup — ${why}`;
      else if (predDom >= 0.12) why = `Toward the dominant — ${why}`;
      if (harmony) {
        const n = harmony.relations.length, ct = harmony.relations.filter((r) => r.kind === 'chord').length;
        const bad = harmony.relations.filter((r) => r.kind === 'clash' || r.kind === 'avoid').length;
        why = `Melody fit — ${harmony.relations.map((r) => r.label).join(' · ')}: ${ct}/${n} notes sit in the chord${bad ? `, ${bad} rub${bad > 1 ? 's' : ''}` : ''}. ${why}`;
      }
      out.push({
        id: chordSymbol(chord),
        chord,
        symbol: chordSymbol(chord, true),
        roman,
        romanInfo: rn,
        moods,
        primaryMood: moods[0]?.id ?? 'floating',
        why,
        evidence: allEv,
        score,
        commonness,
        rarity: rarityOf(commonness),
        diatonic: rn.diatonic,
        commonTones: ct,
        voicing,
        voiceLines: prevVoicing ? voiceLeading(prevVoicing, voicing) : [],
        nrt,
        moodShift: cur ? this.lexicon.shift(curMoods, moods) : null,
        moodMatch: match,
        features,
        match: pm,
        tension,
        harmony,
        breatheScore,
      });
    }
    const mt = profile ? moodTarget(profile) : null;
    // Soften mood restacking slightly under high-tension requests (still mood-led).
    if (profile) moodContrast(out, mt != null && mt >= BREATHE_TENSION_GATE ? MOOD_GAIN * 0.85 : MOOD_GAIN);
    return injectBreatheOptions(out, mt, opts.limit ?? 16);
  }

  suggestNotes(opts: NoteSuggestOptions): NoteSuggestion[] {
    const k = opts.key;
    const a = clamp01(opts.adventure ?? 0.35);
    const profile = this.resolveProfile(opts);
    const mel = opts.melody;
    const last = mel.length ? mel[mel.length - 1] : undefined;
    const before = mel.length > 1 ? mel[mel.length - 2] : undefined;
    const stretch = recentStretch(opts.progression, opts.chord ?? null);
    const chord = opts.chord ?? (stretch.length ? stretch[stretch.length - 1]! : null);
    const penult = stretch.length >= 2 ? stretch[stretch.length - 2]! : null;
    const stretchTxt = stretch.length >= 2 ? stretchSymbols(stretch) : null;
    const finalSym = chord ? chordSymbol(chord, true) : null;
    const finalRn = chord ? analyzeRoman(chord, k) : null;
    const t = pc(k.tonic);
    const fam = this.family(k);
    const centre = last ?? (chord ? pianoVoicing(chord)[pianoVoicing(chord).length - 1] : 67);
    const chordSet = new Set(chord ? chordPcs(chord) : []);
    const penultSet = new Set(penult ? chordPcs(penult) : []);
    const mm = this.kb.melodicMoves;
    const chromaticOffsets = new Set(mm.filter((m) => m.semitonesFromTonic !== undefined).map((m) => m.semitonesFromTonic!));

    const out: NoteSuggestion[] = [];
    for (let midi = Math.max(48, centre - 12); midi <= Math.min(88, centre + 12); midi++) {
      const off = mod(midi - t, 12);
      const scaleTone = inScale(k, midi);
      if (!scaleTone && !(chromaticOffsets.has(off) && Math.abs(midi - centre) <= 7)) continue;
      const iv = last === undefined ? 0 : midi - last;
      if (last === undefined && Math.abs(midi - centre) > 7) continue;
      const ev: Evidence[] = [];
      const push = (m: KbMelodicMove) => ev.push(this.evidenceFrom(m, 'direct'));

      // scale-degree colour of the landing note
      const sd = mm.filter((m) => m.category === 'scale-degree' && m.semitonesFromTonic === off);
      const sdFiltered = sd.filter((m) => {
        const minorOnly = /in minor/i.test(m.scaleDegree ?? m.name);
        if (minorOnly) return fam === 'minor';
        if (fam === 'minor' && sd.some((o) => /in minor/i.test(o.scaleDegree ?? o.name))) return false;
        return true;
      });
      if (sdFiltered.length > 1) {
        const pref = sdFiltered.find((m) => (fam === 'minor' ? /♭|b/.test(m.scaleDegree ?? '') : !/♭|b\d/.test(m.scaleDegree ?? '')));
        if (pref) push(pref);
      } else if (sdFiltered.length === 1) push(sdFiltered[0]);
      // mode colour (only when that mode is selected)
      for (const m of mm) if (m.category === 'mode-color' && m.semitonesFromTonic === off && (m.mode === k.mode || kbModeToModeId(String(m.mode)) === k.mode)) push(m);
      // melodic interval from the previous note
      if (last !== undefined) {
        const im = mm.find((m) => m.category === 'interval' && m.intervalSemitones === iv);
        if (im) push(im);
        // resolutions (fromDegree → toDegree)
        const lastOff = mod(last - t, 12);
        for (const m of mm) if (m.fromDegree !== undefined && m.toDegree !== undefined && m.fromDegree === lastOff && m.toDegree === off && (m.intervalSemitones === undefined || Math.abs(m.intervalSemitones) === Math.abs(iv))) push(m);
      }
      // relation to the current chord
      let quality = 0;
      let isChordTone = false;
      if (chord) {
        const above = mod(midi - pc(chord.root), 12);
        isChordTone = chordSet.has(mod(midi, 12));
        const cls = triadClass(chord.quality);
        const dominant = ['7', '9', '7b9', '7#9', '7sus4', 'aug7'].includes(chord.quality);
        for (const m of mm) {
          if (m.category !== 'chord-tone' && m.category !== 'tension') continue;
          const n = m.name.toLowerCase();
          if (m.semitonesAboveChordRoot === undefined) {
            if (/3rd/.test(n) && isChordTone && (above === 3 || above === 4)) push(m);
            continue;
          }
          if (m.semitonesAboveChordRoot !== above) continue;
          if (m.category === 'chord-tone' && !isChordTone) continue;
          const needMajor = /over a major/.test(n);
          const needDom = /dominant/.test(n);
          const needMinor = /over a minor/.test(n);
          if (needMajor && needDom) { if (cls !== 'maj') continue; }
          else if (needDom && !dominant) continue;
          else if (needMajor && (cls !== 'maj' || dominant)) continue;
          else if (needMinor && cls !== 'min') continue;
          push(m);
        }
      }

      const relation = chord ? noteRelation(midi, chord, this.kb) : null;
      const isResolution = ev.some((e) => e.category === 'resolution');
      // beat-aware colour: only when the UI says where the note will land. Strong beats favour
      // chord tones; tensions are freer on weak beats / with more adventure. Resolutions (e.g. leading
      // tone → tonic over V7) keep their tendency boost and are not re-penalized as avoids.
      if (relation && opts.beat !== undefined && !isResolution) {
        const bw = beatWeight(opts.beat, opts.timeSig ? strongBeats(opts.timeSig) : [0, 2]);
        if (relation.kind === 'chord') quality += 0.35 * bw;
        else if (relation.kind === 'tension') quality += 0.12 * a - 0.08 * bw;
        else if (relation.kind === 'avoid') quality -= (0.45 - 0.15 * a) * bw;
        else quality -= (0.85 - 0.25 * a) * bw;
      }
      const absIv = Math.abs(iv);
      const ip = last === undefined ? 0.5 : INTERVAL_PRIOR[absIv] ?? 0.05;
      const commonness = clamp01(0.5 * ip + (scaleTone ? 0.3 : 0) + (isChordTone ? 0.2 : chord ? 0 : 0.1));
      // Classic tendency tones (leading tone → tonic, etc.) outrank static chord tones of the V chord.
      if (isResolution) quality += 1.75;
      if (isChordTone) quality += 0.35;
      else if (!isResolution && relation?.kind === 'clash') quality -= 0.45;
      else if (!isResolution && relation?.kind === 'avoid') quality -= 0.2;
      if (before !== undefined && last !== undefined) {
        const prevIv = last - before;
        if (Math.abs(prevIv) >= 5 && Math.sign(iv) === -Math.sign(prevIv) && absIv <= 2 && absIv > 0) quality += 0.4; // gap fill
      }
      // Approach from below/above into a chord tone (common melodic practice).
      if (last !== undefined && isChordTone && absIv > 0 && absIv <= 2) quality += 0.12;
      // Neighbor tone: step away from a chord tone then back is handled by gap-fill; reward landing back.
      if (before !== undefined && last !== undefined && isChordTone) {
        const left = last - before;
        if (Math.abs(left) <= 2 && left !== 0 && iv === -left) quality += 0.1;
      }
      if (absIv > 9) quality -= 0.3;
      // Stretch-aware ranking: favour notes that belong to the arrival (final) chord of the recent sequence,
      // and tones that were held through the stretch — not only “whatever the last bar was.”
      const midiPc = mod(midi, 12);
      if (stretch.length >= 2 && chord) {
        const held = stretch.filter((c) => chordPcs(c).includes(midiPc)).length;
        if (held >= Math.ceil(stretch.length * 0.6)) quality += 0.22; // pedal / common tone through the phrase
        if (penult && chordSet.has(midiPc) && !penultSet.has(midiPc)) quality += 0.28; // new colour of the arrival chord
        if (penult && !chordSet.has(midiPc) && penultSet.has(midiPc) && relation && (relation.kind === 'clash' || relation.kind === 'avoid')) {
          quality -= 0.18; // leftover from the previous chord that fights the arrival
        }
        // Cadential arrival: if the stretch ends on V (or V7), tonic-scale-degree notes get a nudge toward home.
        if (finalRn && finalRn.offset === 7 && off === 0) quality += 0.2;
        // Predominant → dominant arrivals: chord tones of V over IV/ii feel like the phrase goal.
        if (penult && finalRn && finalRn.offset === 7) {
          const penOff = analyzeRoman(penult, k).offset;
          if ((penOff === 5 || penOff === 2) && chordSet.has(midiPc)) quality += 0.15;
        }
      }
      // Primary fit signal: how the note sits on the under-chord (or in the key when no chord).
      // Resolutions are “fit” musically even when the arrival is not a chord tone of V.
      const fit = isResolution ? 0.95 : relation ? REL_FIT[relation.kind] : (scaleTone ? 0.4 : -0.25);
      const moods = mergeMoods(
        ev.map((e) => {
          const catW = e.category === 'resolution' ? 1 : e.category === 'scale-degree' ? 0.7 : e.category === 'mode-color' ? 0.8 : e.category === 'interval' ? 0.45 : 0.6;
          return e.moods.map((id, i) => ({ id, weight: CONSENSUS_WEIGHT[e.consensus] * catW * (1 - i * 0.12) }));
        }),
        this.lexicon,
      );
      if (!moods.length) moods.push({ id: scaleTone ? 'floating' : 'tense', weight: 0.2 });
      const features = noteFeatures(off, iv, isChordTone, scaleTone, commonness, moods, this.lexicon);
      const pm = profile ? matchProfile(profile, moods, features, this.lexicon, (m) => (MODE_BY_ID[m].intervals.map((x) => mod(t + x, 12)).includes(mod(midi, 12)) ? (characteristicOffsets(m).includes(off) ? 1 : 0.5) : 0)) : null;
      const match = pm?.total ?? 0;
      // Mood is a light tint only — never enough to bury chord tones under clashy “aesthetic” matches.
      const moodBonus = pm ? NOTE_MOOD_GAIN * match - NOTE_MOOD_GAIN * 0.35 : 0;
      const score = quality + NOTE_FIT_GAIN * fit + (1 - a) * commonness * 1.6 + a * (1 - commonness) * 1.6 + moodBonus;
      const name = midiName(midi, spellInKey(k, midi));
      const deg = degreeLabel(off).replace('b', '♭').replace('#', '♯');
      const motion = last === undefined ? `Start on ${deg}` : iv === 0 ? 'Repeat' : `${iv > 0 ? 'Up' : 'Down'} a ${intervalName(iv)}`;
      const sdEv = ev.find((e) => e.category === 'scale-degree' || e.category === 'mode-color');
      const resEv = ev.find((e) => e.category === 'resolution');
      const tenEv = ev.find((e) => e.category === 'tension' || e.category === 'chord-tone');
      const bits: string[] = [`${motion}${last === undefined ? '' : ` to ${deg}`}`];
      // Prefer a why that names the arrival chord of the recent stretch (e.g. end of C–Am–F–G).
      if (stretchTxt && finalSym && relation) {
        const role =
          relation.kind === 'chord' ? `${relation.label} of ${finalSym}`
            : relation.kind === 'tension' ? `colour over ${finalSym}`
              : relation.kind === 'avoid' ? `rubs over ${finalSym} if held`
                : `clashes ${finalSym}`;
        bits.push(`${role} (end of ${stretchTxt})`);
        if (relation.why && relation.kind !== 'chord') bits.push(firstSentence(relation.why));
      } else if (stretchTxt && finalSym) {
        bits.push(`toward ${finalSym} at the end of ${stretchTxt}`);
        if (resEv) bits.push(resEv.name);
        else if (tenEv) bits.push(tenEv.name.replace(/ \(.*\)/, ''));
        else if (sdEv) bits.push(firstSentence(sdEv.description));
      } else {
        if (resEv) bits.push(resEv.name);
        else if (tenEv) bits.push(tenEv.name.replace(/ \(.*\)/, ''));
        else if (sdEv) bits.push(firstSentence(sdEv.description));
        if (isResolution) bits.push('resolves a tendency tone');
        else if (relation) bits.push(relation.kind === 'chord' ? 'sits in the chord' : relation.kind === 'tension' ? 'colour over the chord' : relation.kind === 'avoid' ? 'rubs if held' : 'clashes the chord');
      }
      if (stretchTxt && finalSym && isResolution) bits.push('resolves a tendency tone');
      out.push({
        id: `n${midi}`,
        midi,
        name,
        degree: deg,
        interval: iv,
        moods,
        primaryMood: moods[0].id,
        why: bits.join(' — '),
        evidence: ev,
        score,
        commonness,
        rarity: rarityOf(commonness),
        isChordTone,
        inScale: scaleTone,
        moodMatch: match,
        features,
        match: pm,
        relation,
      });
    }
    // Light relative mood tint only (chords still use full MOOD_GAIN contrast).
    if (profile) moodContrast(out, NOTE_MOOD_GAIN);
    // Best fit first; break ties toward chord tones / higher fit, not mood.
    out.sort((x, y) => y.score - x.score || Number(y.isChordTone) - Number(x.isChordTone) || (y.relation ? REL_FIT[y.relation.kind] : 0) - (x.relation ? REL_FIT[x.relation.kind] : 0));
    return out.slice(0, opts.limit ?? 10);
  }
}

