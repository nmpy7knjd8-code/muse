import { describe, expect, it } from 'vitest';
import {
  parseChord, pianoVoicing, pianoFingering, voiceLeading, closeVoicings, guitarVoicings, isPlayable, shapeMatchesChord,
  shapePcs, assignFingers, QUALITIES, parseNote, chordSymbol, neoRiemannianPath, fifthsIndex, fifthsDistance, fifthsMoveLabel, fifthsStepTag, tonnetzPc, tonnetzCoord,
} from '../src/core';

const ch = (s: string) => parseChord(s)!;

describe('piano voicing', () => {
  it('voices C in root position near middle C', () => {
    expect(pianoVoicing(ch('C'))).toEqual([60, 64, 67]);
  });
  it('voice-leads to the nearest inversion', () => {
    const c = [60, 64, 67];
    expect(pianoVoicing(ch('F'), c)).toEqual([60, 65, 69]);
    expect(pianoVoicing(ch('G'), c)).toEqual([59, 62, 67]);
    expect(pianoVoicing(ch('Am'), c)).toEqual([60, 64, 69]);
  });
  it('drops the fifth from 5-note chords', () => {
    const v = pianoVoicing(ch('G9'));
    expect(v).toHaveLength(4);
    expect(v.map((n) => n % 12).sort((a, b) => a - b)).toEqual([5, 7, 9, 11]); // G B F A (no D)
  });
  it('all close voicings stay in range', () => {
    for (const v of closeVoicings(ch('Bbmaj7'))) {
      expect(v[0]).toBeGreaterThanOrEqual(52);
      expect(v[v.length - 1]).toBeLessThanOrEqual(79);
    }
  });
});

describe('piano fingering', () => {
  it.each([
    [[60, 64, 67], 'R', [1, 3, 5]], // root position
    [[64, 67, 72], 'R', [1, 2, 5]], // 1st inversion
    [[67, 72, 76], 'R', [1, 3, 5]], // 2nd inversion
    [[60, 64, 67], 'L', [5, 3, 1]],
    [[67, 72, 76], 'L', [5, 2, 1]],
    [[60, 64, 67, 70], 'R', [1, 2, 3, 5]],
    [[60], 'R', [1]],
  ])('%j %s → %j', (notes, hand, fingers) => {
    expect(pianoFingering(notes as number[], hand as 'R' | 'L')).toEqual(fingers);
  });
});

describe('voice leading', () => {
  it('C → Am holds two common tones and moves G up a whole step', () => {
    const lines = voiceLeading([60, 64, 67], [60, 64, 69]);
    expect(lines.map((l) => l.kind)).toEqual(['common', 'common', 'whole']);
  });
  it('G7 → C resolves B up by half step and F down by half step', () => {
    const lines = voiceLeading([59, 62, 65, 67], [60, 64, 67]);
    const b = lines.find((l) => l.from === 59)!;
    const f = lines.find((l) => l.from === 65)!;
    expect(b.delta).toBe(1);
    expect(f.delta).toBe(-1);
  });
});

describe('guitar voicings', () => {
  it('uses the open shapes for open chords', () => {
    expect(guitarVoicings(ch('C'))[0].frets).toEqual([null, 3, 2, 0, 1, 0]);
    expect(guitarVoicings(ch('G'))[0].frets).toEqual([3, 2, 0, 0, 0, 3]);
    expect(guitarVoicings(ch('Em'))[0].frets).toEqual([0, 2, 2, 0, 0, 0]);
  });
  it('builds E- and A-shape barres', () => {
    const f = guitarVoicings(ch('F'))[0];
    expect(f.frets).toEqual([1, 3, 3, 2, 1, 1]);
    expect(f.barre).toMatchObject({ fret: 1, from: 0, to: 5, finger: 1 });
    const bm = guitarVoicings(ch('Bm'))[0];
    expect(bm.frets).toEqual([null, 2, 4, 4, 3, 2]);
    expect(bm.barre?.fret).toBe(2);
  });
  it('every quality on every root yields a playable, correct shape (≤4-fret span, ≤4 fingers)', () => {
    const roots = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
    let count = 0;
    for (const q of QUALITIES) for (const r of roots) {
      const c = { root: parseNote(r)!, quality: q.id };
      const shapes = guitarVoicings(c);
      expect(shapes.length, chordSymbol(c)).toBeGreaterThan(0);
      for (const s of shapes) {
        expect(isPlayable(s), `${chordSymbol(c)} ${s.frets}`).toBe(true);
        expect(shapeMatchesChord(s, c, !!s.partial), `${chordSymbol(c)} ${s.frets}`).toBe(true);
        const fretted = s.frets.filter((f): f is number => f !== null && f > 0);
        if (fretted.length) expect(Math.max(...fretted) - Math.min(...fretted)).toBeLessThanOrEqual(3);
        expect(new Set(s.fingers.filter((f) => f && f > 0)).size).toBeLessThanOrEqual(4);
        count++;
      }
    }
    expect(count).toBeGreaterThan(QUALITIES.length * 12);
  });
  it('slash chords put the bass note lowest', () => {
    const s = guitarVoicings(ch('G/B'))[0];
    expect(shapePcs(s)[0]).toBe(11);
  });
  it('rejects unplayable shapes', () => {
    expect(isPlayable({ frets: [1, 6, null, null, null, null], fingers: [1, 4, null, null, null, null], baseFret: 1, label: '', source: 'generated' })).toBe(false); // 6-fret stretch
    expect(isPlayable({ frets: [1, 2, 3, 4, 5, null], fingers: [1, 2, 3, 4, 4, null], baseFret: 1, label: '', source: 'generated' })).toBe(false); // finger reused on 2 frets
    expect(assignFingers([1, 2, 3, 4, 2, 3])).toBeNull(); // needs 5+ fingers
  });
});

describe('relationships', () => {
  it('neo-Riemannian paths', () => {
    expect(neoRiemannianPath(ch('C'), ch('Cm'))).toBe('P');
    expect(neoRiemannianPath(ch('C'), ch('Am'))).toBe('R');
    expect(neoRiemannianPath(ch('C'), ch('Em'))).toBe('L');
    expect(neoRiemannianPath(ch('C'), ch('Ab'))!.length).toBe(2);
    expect(neoRiemannianPath(ch('C'), ch('Bdim'))).toBeNull();
  });
  it('circle of fifths', () => {
    expect(fifthsIndex(7)).toBe(1);
    expect(fifthsIndex(5)).toBe(11);
    expect(fifthsDistance(0, 7)).toBe(1);
    expect(fifthsDistance(0, 5)).toBe(-1);
    expect(fifthsDistance(0, 6)).toBe(-6);
    expect(fifthsMoveLabel(0, 7)).toMatch(/brighter|dominant|home/i);
    expect(fifthsMoveLabel(0, 5)).toMatch(/open|relax|subdominant/i);
    expect(fifthsMoveLabel(0, 0)).toMatch(/same place|no circle move/i);
    expect(fifthsStepTag(0, 7)).toBe('+1');
    expect(fifthsStepTag(0, 5)).toBe('-1');
    expect(fifthsStepTag(0, 0)).toBe('home');
    expect(fifthsStepTag(0, 6)).toBe('opp');
  });
  it('tonnetz coordinates', () => {
    const g = tonnetzCoord(7);
    expect(tonnetzPc(0, g.x, g.y)).toBe(7);
    expect(tonnetzPc(0, 0, 1)).toBe(4);
  });
});
