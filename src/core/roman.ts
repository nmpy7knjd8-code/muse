// Roman-numeral analysis and realisation.
// Convention: accidentals are relative to the MAJOR scale of the tonic (Berklee/pop style),
// so in A minor F major is "bVI" and G major is "bVII" — consistent across all modes and
// identical to how the theory KB expresses key-relative moves (root = semitones above tonic).
import { Chord, QUALITY_BY_ID, QualityId, chordPcs, parseQuality, triadClass } from './chords';
import { MAJOR_STEPS, NoteName, accidentalString, mod, parseAccidentals, pc, spell } from './notes';
import { Key, diatonicChords, scalePcs } from './scales';

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

export interface RomanNumeral {
  degree: number; // 1..7
  acc: number; // relative to the major scale
  quality: QualityId;
  /** Semitones of the chord root above the tonic. */
  offset: number;
  text: string;
  /** Secondary-function label like "V7/V", if applicable. */
  secondary?: string;
  diatonic: boolean;
}

const NUMERAL_SUFFIX: Record<QualityId, string> = {
  maj: '', min: '', dim: '°', aug: '+', sus2: 'sus2', sus4: 'sus4', '5': '5', '7': '7', maj7: 'maj7', m7: '7',
  m7b5: 'ø7', dim7: '°7', mMaj7: '(maj7)', '7sus4': '7sus4', aug7: '+7', '6': '6', m6: '6', add9: 'add9', madd9: 'add9',
  '9': '9', maj9: 'maj9', m9: '9', '7b9': '7♭9', '7#9': '7♯9', 'maj7#11': 'maj7♯11',
};

export function numeralText(degree: number, acc: number, quality: QualityId): string {
  const cls = triadClass(quality);
  const base = NUMERALS[degree - 1];
  const upper = cls === 'maj' || cls === 'aug' || cls === 'sus' || cls === 'power';
  return accidentalString(acc, true) + (upper ? base : base.toLowerCase()) + NUMERAL_SUFFIX[quality];
}

export function analyzeRoman(chord: Chord, k: Key): RomanNumeral {
  const t = pc(k.tonic);
  const degree = mod(chord.root.letter - k.tonic.letter, 7) + 1;
  const expected = mod(t + MAJOR_STEPS[degree - 1], 12);
  const acc = mod(pc(chord.root) - expected + 6, 12) - 6;
  const offset = mod(pc(chord.root) - t, 12);
  const scale = scalePcs(k);
  const diatonic = chordPcs(chord).every((p) => scale.includes(p));
  const rn: RomanNumeral = { degree, acc, quality: chord.quality, offset, text: numeralText(degree, acc, chord.quality), diatonic };
  // Secondary dominant: non-diatonic major/dominant chord whose root is a P5 above a diatonic, non-diminished chord (not the tonic).
  const cls = triadClass(chord.quality);
  if (!diatonic && cls === 'maj' && (chord.quality === 'maj' || chord.quality === '7' || chord.quality === '9' || chord.quality === '7b9')) {
    const targetPc = mod(pc(chord.root) - 7, 12);
    const dia = diatonicChords(k);
    const idx = dia.findIndex((c) => pc(c.root) === targetPc);
    if (idx > 0 && triadClass(dia[idx].quality) !== 'dim') {
      const target = numeralText(idx + 1, mod(pc(dia[idx].root) - t - MAJOR_STEPS[idx] + 6, 12) - 6, dia[idx].quality);
      rn.secondary = `V${chord.quality === 'maj' ? '' : NUMERAL_SUFFIX[chord.quality]}/${target}`;
    }
  }
  return rn;
}

/**
 * Parse a roman numeral ("bVI", "♭VII7", "V7/V", "viiø7", "ii°", "N", "IVmaj7") and realise it as a chord in `k`.
 * Inversion figures (6, 64, 6/4, 65, 43, 42) and parenthesised comments are ignored.
 */
export function parseRoman(text: string, k: Key): Chord | null {
  let s = text.trim().replace(/\(.*?\)/g, (m) => (m === '(maj7)' ? m : '')).replace(/\s+/g, '');
  if (!s) return null;
  if (/^N6?$/.test(s)) s = 'bII';
  // Secondary function: "X/Y"
  const slash = s.indexOf('/');
  if (slash > 0) {
    const head = s.slice(0, slash);
    const tail = s.slice(slash + 1);
    // inversion figure like 6/4 — treat as figure, not secondary
    if (!/^\d/.test(tail)) {
      const target = parseRoman(tail, k);
      if (!target) return null;
      const tk: Key = { tonic: target.root, mode: 'major' };
      return parseRoman(head, tk);
    }
    // figured-bass inversion: I6/4 -> I, V6/5 / V4/3 / V4/2 -> V7
    s = /^(5|3|2)$/.test(tail) ? head.replace(/[64]$/, '7') : head.replace(/6$/, '');
  }
  const m = /^([#♯b♭]*)(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(.*)$/.exec(s);
  if (!m) return null;
  const acc = parseAccidentals(m[1]);
  if (acc === null) return null;
  const numeral = m[2];
  const upper = numeral === numeral.toUpperCase();
  const degree = NUMERALS.indexOf(numeral.toUpperCase()) + 1;
  let suffix = m[3].replace(/^(64|6\/4|65|6\/5|43|4\/3|42|4\/2)$/, '').replace(/♭/g, 'b').replace(/♯/g, '#');
  if (suffix === '6' && !upper) suffix = '6'; // treat as added sixth (pop usage)
  const quality = romanQuality(upper, suffix);
  if (!quality) return null;
  const rootPc = mod(pc(k.tonic) + MAJOR_STEPS[degree - 1] + acc, 12);
  const root: NoteName = spell(k.tonic.letter + degree - 1, rootPc);
  return { root, quality };
}

function romanQuality(upper: boolean, suffix: string): QualityId | null {
  const sfx = suffix.replace(/^o/, '°');
  switch (sfx) {
    case '': return upper ? 'maj' : 'min';
    case '°': case 'dim': return 'dim';
    case '°7': case 'dim7': return 'dim7';
    case 'ø': case 'ø7': case 'm7b5': return 'm7b5';
    case '+': case 'aug': return 'aug';
    case '+7': return 'aug7';
    case '7': return upper ? '7' : 'm7';
    case '9': return upper ? '9' : 'm9';
    case '6': return upper ? '6' : 'm6';
    case 'maj7': case 'M7': case 'Δ7': case 'Δ': return upper ? 'maj7' : 'mMaj7';
    case '(maj7)': return 'mMaj7';
    case 'add9': case 'add2': return upper ? 'add9' : 'madd9';
  }
  const q = parseQuality(sfx);
  if (q) return q;
  return null;
}

export function romanOf(chord: Chord, k: Key): string {
  const r = analyzeRoman(chord, k);
  return r.secondary ?? r.text;
}

export function qualityDisplayName(q: QualityId): string {
  return QUALITY_BY_ID[q].name;
}
