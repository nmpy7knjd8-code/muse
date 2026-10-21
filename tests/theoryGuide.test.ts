import { describe, expect, it } from 'vitest';
import { GLOSSARY, GUIDE_PEDAGOGY, EMPTY_GYM, chapterDone, guideChapters, key, parseGuideProgress, progressMap, scalePcs, chordPcs } from '../src/core';
import { TOOLS } from '../src/ui/tools/registry';

const TABS: Record<string, string[]> = { gym: ['degree', 'swap', 'name', 'bass', 'sing'], lessons: ['fix', 'missions', 'theory', 'keys', 'modes'], helpers: ['coach', 'strum', 'hooks', 'lyrics', 'mod', 'layers'] };
const toolIds = new Set(TOOLS.map((t) => t.id));

describe('theory guide', () => {
  for (const k of [key('C'), key('A', 'dorian'), key('F#', 'minor'), key('Bb', 'mixolydian')]) {
    const chs = guideChapters(k);
    it(`14 chapters in order, beginner → advanced (${k.tonic} ${k.mode})`, () => {
      expect(chs.map((c) => c.n)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
      expect(chs[13]!.id).toBe('glossary');
    });
    it('every concept chapter has playable sound, a quiz with valid answers, try-its and sources', () => {
      for (const c of chs.slice(0, 13)) {
        expect(c.sounds.length, c.id).toBeGreaterThan(0);
        for (const s of c.sounds) expect((s.chords?.length ?? 0) + (s.notes?.length ?? 0), c.id + s.label).toBeGreaterThan(0);
        for (const s of c.sounds) for (const ch of s.chords ?? []) expect(chordPcs(ch).length).toBeGreaterThan(1);
        expect(c.quiz.length, c.id).toBeGreaterThan(0);
        for (const q of c.quiz) { expect(q.answer).toBeGreaterThanOrEqual(0); expect(q.answer).toBeLessThan(q.options.length); expect(q.why.length).toBeGreaterThan(5); }
        expect(c.sources.length).toBeGreaterThan(0);
        for (const t of c.tries) { expect(toolIds.has(t.tool as never), t.tool).toBe(true); if (t.tab) expect(TABS[t.tool], t.tool).toContain(t.tab); }
      }
    });
    it('sounds are in the current tonic', () => {
      const tonic = scalePcs(k)[0]!;
      const run = chs.find((c) => c.id === 'scales')!.sounds[0]!.notes!;
      expect(((run[0]! % 12) + 12) % 12).toBe(tonic);
    });
  }
  it('pedagogy intro cites sources; glossary links to real chapters', () => {
    expect(GUIDE_PEDAGOGY.length).toBeGreaterThanOrEqual(7);
    for (const p of GUIDE_PEDAGOGY) expect(p.src.length).toBeGreaterThan(5);
    const ids = new Set(guideChapters(key('C')).map((c) => c.id));
    for (const g of GLOSSARY) expect(ids.has(g.ch), g.term).toBe(true);
  });
  it('progress: chapter done needs read + every quiz right; feeds Your progress', () => {
    const chs = guideChapters(key('C')); const c = chs[0]!;
    expect(parseGuideProgress('garbage')).toEqual({ read: [], quiz: {} });
    expect(chapterDone({ read: ['sound'], quiz: { sound: 1 } }, c)).toBe(false);
    expect(chapterDone({ read: ['sound'], quiz: { sound: 3 } }, c)).toBe(true);
    const base = { concepts: [], missions: [], gym: EMPTY_GYM, earRounds: 0, modesUsed: [] };
    const node = (g: string[]) => progressMap({ ...base, guide: g }).branches.find((b) => b.id === 'guide')!.nodes[0]!;
    expect(node([]).state).toBe('next');
    expect(node(['sound', 'scales', 'chords']).state).toBe('done');
  });
});
