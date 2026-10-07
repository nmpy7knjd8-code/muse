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
import { NoteRelation, beatWeight, melodyFit, noteRelation } from './noteRelation';
import { CandidateTension, TENSION_GAIN, TENSION_MAX, TensionSettings, TensionStyleId, candidateTension, moodTarget, progressionTension } from './harmonyTension';
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
  /** melody notes the chord must harmonize (reharmonization): ranked by fit + mood + context */
  harmonize?: Array<{ midi: number; beat: number; dur?: number }>;
}

export interface NoteSuggestOptions {
  key: Key;
  melody: number[];
  chord?: Chord | null;
  targetMoods?: string[];
  profile?: MoodProfile | null;
  adventure?: number;
  limit?: number;
  /** beat position (0..3) the note will land on: strong beats favour chord tones, weak beats tolerate tensions */
  beat?: number;
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

/** How strongly an explicit mood target outranks plain functional likelihood. */
/** weight of melody fit when harmonizing notes (fit is −1..1). HEURISTIC. */
export const HARMONIZE_GAIN = 2.2;
const MOOD_GAIN = 3.6;
/** Absolute fit values cluster (most chords fit a blend a bit), so also reward fit relative to the other candidates. */
function moodContrast(list: { score: number; moodMatch: number }[]): void {
  if (list.length < 2) return;
  const lo = Math.min(...list.map((x) => x.moodMatch)), hi = Math.max(...list.map((x) => x.moodMatch));
  if (hi - lo < 1e-6) return;
  for (const x of list) x.score += MOOD_GAIN * 0.6 * ((x.moodMatch - lo) / (hi - lo) - 0.5);
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
    if (harm) diatonicChords(k, true).forEach((c) => add(c)); // 7ths can absorb a melody's 7th/9th
    // dominant seventh on V, and harmonic-minor V in minor-family keys
    add({ root: spellInKey(k, t + 7), quality: '7' });
    if (fam === 'minor') add({ root: spellInKey(k, t + 7), quality: 'maj' });
    // a requested mode (e.g. "Dorian" while in C major) contributes its borrowed (non-key) triads
    if (profile?.modes.length) {
      const keyPcs = new Set(diatonicChords(k).flatMap((c) => chordPcs(c)));
      for (const m of profile.modes) {
        if (m === k.mode) continue;
        for (const c of diatonicChords({ tonic: k.tonic, mode: m })) if (chordPcs(c).some((p) => !keyPcs.has(p)) && c.quality !== 'dim') add(c);
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
    const tState = tSettings ? progressionTension(prog, k, tSettings) : null;

    const out: ChordSuggestion[] = [];
    for (const { chord, evidence } of pool.values()) {
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
      const score = kbStrength * 0.8 + smooth + (1 - a) * commonness * 1.6 + a * (1 - commonness) * 1.6 + moodBonus + (tension && prog.length ? TENSION_GAIN * tension.adjust : 0) + (harmony ? HARMONIZE_GAIN * harmony.fit : 0);
      const top = allEv[0];
      const roman = rn.secondary ?? rn.text;
      let why = top
        ? `${top.strength === 'direct' ? '' : `${roman}: `}${firstSentence(top.description)}`
        : `${rn.diatonic ? 'Diatonic' : 'Chromatic'} ${roman} in ${keyName(k)}.`;
      if (harmony) {
        const n = harmony.relations.length, ct = harmony.relations.filter((r) => r.kind === 'chord').length;
        const bad = harmony.relations.filter((r) => r.kind === 'clash' || r.kind === 'avoid').length;
        why = `Melody → ${harmony.relations.map((r) => r.label).join(' · ')}: ${ct}/${n} chord tones${bad ? `, ${bad} rub${bad > 1 ? 's' : ''}` : ''}. ${why}`;
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
        nrt: cur ? neoRiemannianPath(cur, chord) : null,
        moodShift: cur ? this.lexicon.shift(curMoods, moods) : null,
        moodMatch: match,
        features,
        match: pm,
        tension,
        harmony,
      });
    }
    if (profile) moodContrast(out);
    out.sort((x, y) => y.score - x.score);
    return out.slice(0, opts.limit ?? 16);
  }

  suggestNotes(opts: NoteSuggestOptions): NoteSuggestion[] {
    const k = opts.key;
    const a = clamp01(opts.adventure ?? 0.35);
    const profile = this.resolveProfile(opts);
    const mel = opts.melody;
    const last = mel.length ? mel[mel.length - 1] : undefined;
    const before = mel.length > 1 ? mel[mel.length - 2] : undefined;
    const chord = opts.chord ?? null;
    const t = pc(k.tonic);
    const fam = this.family(k);
    const centre = last ?? (chord ? pianoVoicing(chord)[pianoVoicing(chord).length - 1] : 67);
    const chordSet = new Set(chord ? chordPcs(chord) : []);
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
      if (relation) {
        // strong beats want chord tones; tensions are colour (more welcome when adventurous); avoid/clash cost
        const bw = opts.beat !== undefined ? beatWeight(opts.beat) : 1;
        if (relation.kind === 'chord') quality += 0.1 * bw;
        else if (relation.kind === 'tension') quality += 0.15 * a - 0.05 * bw;
        else if (relation.kind === 'avoid') quality -= (0.35 - 0.15 * a) * bw;
        else quality -= (0.7 - 0.25 * a) * bw;
      }
      const absIv = Math.abs(iv);
      const ip = last === undefined ? 0.5 : INTERVAL_PRIOR[absIv] ?? 0.05;
      const commonness = clamp01(0.5 * ip + (scaleTone ? 0.3 : 0) + (isChordTone ? 0.2 : chord ? 0 : 0.1));
      if (ev.some((e) => e.category === 'resolution')) quality += 0.5;
      if (isChordTone) quality += 0.25;
      if (before !== undefined && last !== undefined) {
        const prevIv = last - before;
        if (Math.abs(prevIv) >= 5 && Math.sign(iv) === -Math.sign(prevIv) && absIv <= 2 && absIv > 0) quality += 0.4; // gap fill
      }
      if (absIv > 9) quality -= 0.3;
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
      const moodBonus = pm ? MOOD_GAIN * match - MOOD_GAIN * 0.35 : 0;
      const score = quality + (1 - a) * commonness * 1.6 + a * (1 - commonness) * 1.6 + moodBonus;
      const name = midiName(midi, spellInKey(k, midi));
      const deg = degreeLabel(off).replace('b', '♭').replace('#', '♯');
      const motion = last === undefined ? `Start on ${deg}` : iv === 0 ? 'Repeat' : `${iv > 0 ? 'Up' : 'Down'} a ${intervalName(iv)}`;
      const sdEv = ev.find((e) => e.category === 'scale-degree' || e.category === 'mode-color');
      const resEv = ev.find((e) => e.category === 'resolution');
      const tenEv = ev.find((e) => e.category === 'tension' || e.category === 'chord-tone');
      const bits = [`${motion}${last === undefined ? '' : ` to ${deg}`}`];
      if (resEv) bits.push(resEv.name);
      else if (tenEv) bits.push(tenEv.name.replace(/ \(.*\)/, ''));
      else if (sdEv) bits.push(firstSentence(sdEv.description));
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
    if (profile) moodContrast(out);
    out.sort((x, y) => y.score - x.score);
    return out.slice(0, opts.limit ?? 10);
  }
}

