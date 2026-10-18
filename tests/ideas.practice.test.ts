import { describe, expect, it } from 'vitest';
import { key, parseChord, classifyNote, practiceSchedule, practicePos, barStart, PracticeScorer, chordToneHint } from '../src/core';

const C = (s: string) => parseChord(s)!;

describe('play-along practice (idea 10)', () => {
  it('classifies notes against the chord and key', () => {
    const k = key('C');
    expect(classifyNote(64, C('C'), k)).toBe('chord');
    expect(classifyNote(62, C('C'), k)).toBe('scale');
    expect(classifyNote(63, C('C'), k)).toBe('outside');
    expect(classifyNote(52.3, C('Am'), k)).toBe('chord'); // rounds to E
    expect(classifyNote(64, C('C/E'), k)).toBe('chord');
  });
  it('schedules a count-in then looping bars', () => {
    const s = practiceSchedule({ beatSec: 0.5, beatsPerBar: 4, bars: 2, countInBars: 1, loops: 2 });
    expect(practicePos(s, 0.2)).toMatchObject({ countIn: true, beat: 0 });
    expect(practicePos(s, 1.6)).toMatchObject({ countIn: true, beat: 3 });
    expect(practicePos(s, 2.0)).toMatchObject({ countIn: false, loop: 0, bar: 0, beat: 0 });
    expect(practicePos(s, 4.6)).toMatchObject({ loop: 0, bar: 1, beat: 1 });
    expect(practicePos(s, 6.1)).toMatchObject({ loop: 1, bar: 0 });
    expect(practicePos(s, 10.1).done).toBe(true);
    expect(barStart(s, 1, 1)).toBe(8);
    expect(practicePos(practiceSchedule({ beatSec: 0.5, beatsPerBar: 4, bars: 2, loops: null }), 1000).done).toBe(false);
  });
  it('scores chord tones fully, in-key notes half, outside notes zero', () => {
    const sc = new PracticeScorer([C('C'), C('G')], key('C'));
    for (let i = 0; i < 10; i++) sc.push(0, 60);
    for (let i = 0; i < 5; i++) sc.push(1, 69);
    for (let i = 0; i < 5; i++) sc.push(1, 70);
    sc.push(0, null); sc.push(5, 60);
    const r = sc.result();
    expect(r.heard).toBe(20);
    expect(r.bars[0]).toMatchObject({ chord: 10, frames: 10 });
    expect(r.bars[1]).toMatchObject({ scale: 5, outside: 5 });
    expect(r.total).toBe(Math.round(100 * (10 + 2.5) / 20));
    expect(sc.weakest()).toBe(1);
    expect(new PracticeScorer([C('C')], key('C')).result()).toMatchObject({ total: 0, heard: 0 });
  });
  it('gives chord-tone hints', () => {
    expect(chordToneHint(C('Am'))).toBe('A, C or E');
  });
});
