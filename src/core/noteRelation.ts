// How a melody note relates to the chord under it: chord tone / tension (9, 11, ♯11, 13, altered) /
// avoid note / clash. Labels follow jazz chord-scale convention: an "avoid" note sits a semitone above a
// chord tone (a ♭9 against it, e.g. natural 11 over a major chord); a "clash" contradicts the chord's quality
// (major 3rd over a minor chord, maj7 against ♭7, ♮5 against ♭5/♯5). Each label links to the theory KB's
// melodic data (chord-tone / tension entries) for its mood words and explanation.
import { Chord, chordPcs } from './chords';
import type { KbMelodicMove, TheoryKB } from './kb';
import { mod, pc } from './notes';

export type RelKind = 'chord' | 'tension' | 'avoid' | 'clash';
export interface NoteRelation {
  kind: RelKind;
  /** interval label relative to the chord root: R, 3, ♭3, 5, ♭7, 7, 9, ♭9, ♯9, 11, ♯11, 13, ♭13, 6 … */
  label: string;
  /** semitones above the chord root */
  interval: number;
  why: string;
  kbId?: string;
  moods: string[];
}

export const REL_COLORS: Record<RelKind, string> = { chord: '#4fd1a5', tension: '#7fb2ff', avoid: '#f0a050', clash: '#ef5b5b' };
export const REL_LABEL: Record<RelKind, string> = { chord: 'chord tone', tension: 'tension', avoid: 'avoid', clash: 'clash' };
/** Contribution of a note's relation to how well a chord harmonizes it (−1..1). HEURISTIC. */
export const REL_FIT: Record<RelKind, number> = { chord: 1, tension: 0.55, avoid: -0.35, clash: -1 };

interface ChordShape { has: (i: number) => boolean; maj3: boolean; min3: boolean; dom: boolean; b7: boolean; maj7: boolean; p5: boolean; sus: boolean }
function shape(c: Chord): ChordShape {
  const r = pc(c.root);
  const iv = new Set(chordPcs(c).filter((p) => !c.bass || p !== pc(c.bass) || chordPcs({ ...c, bass: undefined }).includes(p)).map((p) => mod(p - r, 12)));
  const has = (i: number) => iv.has(i);
  const maj3 = has(4), min3 = has(3) && !has(4);
  return { has, maj3, min3, dom: maj3 && has(10), b7: has(10), maj7: has(11), p5: has(7), sus: !has(3) && !has(4) };
}

function chordToneLabel(i: number, s: ChordShape, c: Chord): string {
  switch (i) {
    case 0: return 'R';
    case 1: return '♭9';
    case 2: return s.sus ? '2' : '9';
    case 3: return s.maj3 ? '♯9' : '♭3';
    case 4: return '3';
    case 5: return s.sus ? '4' : '11';
    case 6: return c.quality === 'maj7#11' ? '♯11' : '♭5';
    case 7: return '5';
    case 8: return c.quality === 'aug' || c.quality === 'aug7' ? '♯5' : '♭13';
    case 9: return c.quality === 'dim7' ? '°7' : '6';
    case 10: return '♭7';
    default: return '7';
  }
}

const KB_FOR: Record<string, string> = {
  R: 'ct_root', '3': 'ct_3', '♭3': 'ct_3', '5': 'ct_5', '9': 'ct_9', '♭9': 'ct_b9', '♯9': 'ct_s9', '♯11': 'ct_s11', '♭13': 'ct_b13',
};

/** Relation of `midi` (or a pitch class) to `chord`. Pass the KB to attach mood words / explanations. */
export function noteRelation(midi: number, chord: Chord, kb?: TheoryKB | null): NoteRelation {
  const i = mod(mod(midi, 12) - pc(chord.root), 12);
  const s = shape(chord);
  const inChord = chordPcs(chord).includes(mod(midi, 12));
  let kind: RelKind, label: string, why: string, kbId: string | undefined;
  if (inChord) {
    kind = 'chord';
    label = chordToneLabel(i, s, chord);
    why = label === 'R' ? 'the root — fully at rest' : `the chord's ${label}`;
    if (label === '♭7' && s.dom) kbId = 'ct_b7_dom';
    else if (label === '7') kbId = 'ct_maj7';
    else if (label === '6') kbId = 'ct_6';
    else kbId = KB_FOR[label];
  } else {
    // non-chord tone
    const semitoneAboveChordTone = s.has(mod(i - 1, 12));
    switch (i) {
      case 2: kind = 'tension'; label = '9'; why = 'the 9th — adds colour without fighting the chord'; kbId = 'ct_9'; break;
      case 9:
        kind = 'tension';
        label = s.dom ? '13' : s.min3 ? '13' : '6';
        why = s.dom ? 'the 13th — a warm dominant colour' : s.min3 ? 'the 13th (Dorian 6th) over a minor chord' : 'the added 6th — warm, nostalgic';
        kbId = s.dom ? 'ct_13' : s.min3 ? undefined : 'ct_6';
        if (!s.dom && s.min3 && s.has(8)) { kind = 'clash'; why = 'major 6th against the chord\'s ♭6'; }
        break;
      case 6:
        if (s.maj3) { kind = 'tension'; label = '♯11'; why = 'the ♯11 — Lydian shimmer over a major or dominant chord'; kbId = 'ct_s11'; }
        else if (s.p5) { kind = 'avoid'; label = '♭5'; why = 'a ♭5 rubbing against the chord\'s 5th'; }
        else { kind = 'tension'; label = '♯11'; why = 'the ♯11'; kbId = 'ct_s11'; }
        break;
      case 5:
        if (s.maj3) { kind = 'avoid'; label = '11'; why = 'natural 11 sits a semitone above the 3rd — fine passing, rubs if held'; kbId = 'ct_11_maj'; }
        else { kind = 'tension'; label = '11'; why = 'the 11th — open, modal colour over a minor chord'; kbId = 'ct_11_min'; }
        break;
      case 1:
        if (s.dom) { kind = 'tension'; label = '♭9'; why = 'the ♭9 — dark altered-dominant tension that wants to resolve'; kbId = 'ct_b9'; }
        else { kind = 'avoid'; label = '♭9'; why = 'a semitone above the root — a harsh ♭9 outside a dominant chord'; kbId = 'ct_b9'; }
        break;
      case 3:
        if (s.dom) { kind = 'tension'; label = '♯9'; why = 'the ♯9 — bluesy altered tension'; kbId = 'ct_s9'; }
        else if (s.maj3) { kind = 'clash'; label = '♭3'; why = 'minor 3rd against the chord\'s major 3rd — a blues rub at best'; kbId = 'ct_s9'; }
        else { kind = 'tension'; label = '♭3'; why = 'a minor 3rd over a sus/power chord — darkens it'; }
        break;
      case 4:
        if (s.min3) { kind = 'clash'; label = '3'; why = 'major 3rd against the chord\'s minor 3rd'; }
        else { kind = 'tension'; label = '3'; why = 'the 3rd the sus chord was holding back'; }
        break;
      case 7:
        kind = 'clash'; label = '5'; why = 'a perfect 5th against the chord\'s altered 5th'; break;
      case 8:
        if (s.dom) { kind = 'tension'; label = '♭13'; why = 'the ♭13 — dark dominant colour'; kbId = 'ct_b13'; }
        else if (s.p5) { kind = 'avoid'; label = '♭13'; why = 'a ♭6 a semitone above the 5th — leans hard back down'; kbId = 'ct_b13'; }
        else { kind = 'tension'; label = '♯5'; why = 'a raised 5th colour'; }
        break;
      case 10:
        if (s.maj7) { kind = 'clash'; label = '♭7'; why = '♭7 against the chord\'s major 7th'; }
        else { kind = 'tension'; label = '♭7'; why = s.maj3 ? 'the ♭7 — turns it bluesy/dominant' : 'the ♭7 — a soft minor-7th colour'; kbId = s.maj3 ? 'ct_b7_dom' : undefined; }
        break;
      case 11:
        if (s.b7) { kind = 'clash'; label = '7'; why = 'major 7th against the chord\'s ♭7'; }
        else if (s.min3) { kind = 'tension'; label = '7'; why = 'major 7th over minor — dark, film-noir colour'; }
        else { kind = 'tension'; label = '7'; why = 'the major 7th — dreamy, yearning'; kbId = 'ct_maj7'; }
        break;
      default:
        kind = semitoneAboveChordTone ? 'avoid' : 'tension'; label = String(i); why = 'non-chord tone';
    }
  }
  const m: KbMelodicMove | undefined = kbId && kb ? kb.melodicMoves.find((x) => x.id === kbId) : undefined;
  return { kind, label, interval: i, why, kbId: m ? m.id : kbId, moods: m ? m.moods : [] };
}

export interface MelodyFitNote { midi: number; beat: number; dur?: number }
/**
 * Beat weight for ranking: downbeat strongest; secondary accents follow the meter
 * (beat 3 in 4/4, beat 4 in 5/4, dotted-quarter groups in x/8).
 */
export function beatWeight(beat: number, strong: number[] = [0, 2]): number {
  if (beat === strong[0]) return 1.5;
  if (strong.includes(beat)) return 1.2;
  return Number.isInteger(beat) ? 1 : 0.75;
}

/** How well `chord` harmonizes `notes` (−1..1): duration × metric-weighted mean of relation fits. */
export function melodyFit(notes: MelodyFitNote[], chord: Chord): number {
  if (!notes.length) return 0;
  let s = 0, w = 0;
  for (const n of notes) {
    const wt = beatWeight(n.beat) * Math.min(2, Math.max(0.5, n.dur ?? 1));
    s += wt * REL_FIT[noteRelation(n.midi, chord).kind];
    w += wt;
  }
  return s / w;
}
