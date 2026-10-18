import { describe, expect, it } from 'vitest';
import { loadKB } from './helpers';
import { SuggestionEngine, key, segmentHum, quantizeHum, tapsToNotes, humSpans, harmonizeHum, chordPcs, chordSymbol, type PitchFrame } from '../src/core';

const eng = new SuggestionEngine(loadKB('theory_kb.json'));
/** Synthetic pitch track: each [midi, seconds] held, 30 fps, with jitter and a dropout. */
function track(notes: Array<[number | null, number]>): PitchFrame[] {
  const out: PitchFrame[] = []; let t = 0;
  for (const [m, d] of notes) for (let i = 0; i < Math.round(d * 30); i++, t += 1 / 30) out.push({ t, midi: m == null ? null : m + Math.sin(i) * 0.2 });
  return out;
}

describe('hum to harmony (idea 4)', () => {
  it('segments a wobbly pitch track into notes, dropping blips and folding octave slips', () => {
    const fr = track([[60, 0.5], [null, 0.1], [64, 0.5], [76, 0.07], [64, 0.2], [67, 0.5], [79, 0.3], [67, 0.4]]);
    fr[5] = { t: fr[5]!.t, midi: 72 }; // one-frame octave glitch inside the first note
    const notes = segmentHum(fr);
    // 76 blip (70 ms) dropped → the two 64s merge; 79 octave slip folded to 67 → one long 67
    expect(notes.map((n) => n.midi)).toEqual([60, 64, 67]);
    expect(notes[0]!.dur).toBeGreaterThan(0.4);
    expect(notes[2]!.dur).toBeGreaterThan(1.1);
  });
  it('quantises to a half-beat grid relative to the first note', () => {
    const q = quantizeHum([{ midi: 60, start: 1.0, dur: 0.45 }, { midi: 62, start: 1.52, dur: 0.2 }, { midi: 64, start: 2.05, dur: 0.9 }], 0.5);
    expect(q).toEqual([{ midi: 60, beat: 0, dur: 1 }, { midi: 62, beat: 1, dur: 0.5 }, { midi: 64, beat: 2, dur: 2 }]);
  });
  it('aligns to a click-track origin and drops pickup notes before it; taps become notes', () => {
    const q = quantizeHum([{ midi: 59, start: 0.1, dur: 0.2 }, { midi: 60, start: 1.26, dur: 0.5 }], 0.5, 0.5, 1.0);
    expect(q).toEqual([{ midi: 60, beat: 0.5, dur: 1 }]);
    expect(tapsToNotes([{ midi: 60, t: 0 }, { midi: 62, t: 0.5 }], 0.4)).toEqual([{ midi: 60, start: 0, dur: 0.5 }, { midi: 62, start: 0.5, dur: 0.4 }]);
  });
  it('splits into bar spans with bar-relative beats', () => {
    const s = humSpans([{ midi: 60, beat: 0, dur: 1 }, { midi: 62, beat: 4.5, dur: 1 }, { midi: 64, beat: 9, dur: 2 }], 4);
    expect(s).toHaveLength(3);
    expect(s[1]).toEqual([{ midi: 62, beat: 0.5, dur: 1 }]);
  });
  it('gives three different-mood harmonisations whose chords contain the strong-beat melody notes', () => {
    // "Twinkle" opening in C: C C G G A A G — F F E E D D C
    const mel = [60, 60, 67, 67, 69, 69, 67, 67, 65, 65, 64, 64, 62, 62, 60, 60].map((m, i) => ({ midi: m, beat: i, dur: 1 }));
    const res = harmonizeHum(eng, key('C'), mel, { beatsPerBar: 4 });
    expect(res).toHaveLength(3);
    expect(new Set(res.map((r) => r.mood)).size).toBe(3);
    expect(new Set(res.map((r) => r.chords.map((c) => chordSymbol(c)).join(' '))).size).toBe(3);
    for (const r of res) {
      expect(r.chords).toHaveLength(4);
      expect(r.fit).toBeGreaterThan(0.5);
    }
    const best = [...res].sort((a, b) => b.fit - a.fit)[0]!;
    const hits = best.chords.filter((c, i) => chordPcs(c).includes(mel[i * 4]!.midi % 12)).length;
    expect(hits).toBeGreaterThanOrEqual(3);
  });
  it('half-bar spans double the chord rate', () => {
    const mel = [64, 62, 60, 62, 64, 64, 64, 64].map((m, i) => ({ midi: m, beat: i, dur: 1 }));
    expect(harmonizeHum(eng, key('C'), mel, { beatsPerBar: 4, span: 2 })[0]!.chords).toHaveLength(4);
    expect(harmonizeHum(eng, key('C'), [], {})).toEqual([]);
  });
});
