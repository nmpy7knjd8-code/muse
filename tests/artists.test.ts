import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chordPcs, chordSymbol, loadTryIt, normalizeArtists, pc } from '../src/core';
import { loadKB } from './helpers';

const raw = JSON.parse(readFileSync(resolve(process.cwd(), 'public/artists.json'), 'utf8'));
const file = normalizeArtists(raw)!;
const kb = loadKB('theory_kb.json');
const rawKb = JSON.parse(readFileSync(resolve(process.cwd(), 'public/theory_kb.json'), 'utf8'));

describe('Artist Lens data', () => {
  it('loads 15 artists, TOOL first, with sources resolving every citation', () => {
    expect(file.artists.length).toBe(15);
    expect(file.artists[0].id).toBe('tool');
    for (const a of file.artists) {
      const ids = new Set(a.sources.map((s) => s.id));
      for (const t of a.techniques) for (const s of t.sourceIds) expect(ids.has(s), `${a.id}/${t.id} → ${s}`).toBe(true);
      for (const w of a.works) for (const s of w.sourceIds) expect(ids.has(s), `${a.id}/${w.title} → ${s}`).toBe(true);
      expect(a.sources.every((s) => /^https?:\/\//.test(s.url))).toBe(true);
    }
  });
  it('technique chips reference real KB items and moods use KB mood ids', () => {
    const idsOf = (k: string) => new Set<string>(rawKb[k].map((m: { id: string }) => m.id));
    const ids: Record<string, Set<string>> = { chordMove: idsOf('chordMoves'), melodicMove: idsOf('melodicMoves'), mode: idsOf('modes'), progression: idsOf('progressions') };
    const moods = new Set(kb.moodVocabulary.map((m) => m.id));
    let n = 0;
    for (const a of file.artists) {
      for (const t of a.techniques) for (const r of t.kbRefs) { expect(ids[r.kind].has(r.id), `${r.kind}:${r.id}`).toBe(true); n++; }
      for (const m of a.moodProfile) expect(moods.has(m.mood), m.mood).toBe(true);
    }
    expect(n).toBeGreaterThan(50);
  });
  it('every Try-it progression parses, in its own key', () => {
    let total = 0;
    for (const a of file.artists) for (const t of a.tryIt) {
      const l = loadTryIt(t)!;
      expect(l, t.label).not.toBeNull();
      expect(l.failed, `${a.id}: ${t.label}`).toEqual([]);
      expect(l.chords.length).toBe(t.roman.length);
      total++;
    }
    expect(total).toBe(20);
  });
  it('applies the pedal/held bass to the listed chords only (and not when it is already the root)', () => {
    const tool = file.artists[0];
    const t = tool.tryIt.find((x) => x.label.startsWith('Phrygian-dominant'))!;
    const l = loadTryIt(t)!;
    // D phrygian dominant: I5 bII5 I5 bII5 bVI5 bII5 I — pedal D under the first four chords
    expect(l.chords.map((c) => chordSymbol(c))).toEqual(['D5', 'Eb5/D', 'D5', 'Eb5/D', 'Bb5', 'Eb5', 'D']);
    for (const [i, c] of l.chords.entries()) if (t.pedal!.chordIndices.includes(i)) expect(pc(c.bass ?? c.root)).toBe(2);
    expect(chordPcs(l.chords[1])).toContain(3);
  });
});
