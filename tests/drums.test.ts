import { describe, expect, it } from 'vitest';
import {
  DRUM_PATTERNS, cycleDrumArtic, defaultPartMeters, drumPatternById, drumTabAscii,
  drumVel, parseChord, setSlotChord, setSlotDrums, slotDrums, timelineEvents, toggleDrumHit,
  activeAt, normalizeArtists,
} from '../src/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('drum kit & patterns', () => {
  it('ships starter grooves with simultaneous-capable hits', () => {
    expect(DRUM_PATTERNS.length).toBeGreaterThanOrEqual(6);
    const rock = drumPatternById('backbeat-rock')!;
    expect(rock.hits.some((h) => h.voice === 'BD' && h.beat === 0)).toBe(true);
    expect(rock.hits.some((h) => h.voice === 'SD' && h.beat === 1)).toBe(true);
    expect(rock.hits.some((h) => h.voice === 'HH')).toBe(true);
    // Beat 0 has hat + kick together (layered / simultaneous).
    const onOne = rock.hits.filter((h) => h.beat === 0).map((h) => h.voice).sort();
    expect(onOne).toContain('BD');
    expect(onOne).toContain('HH');
  });

  it('toggles and cycles articulations on the grid', () => {
    let hits = toggleDrumHit([], 'SD', 1);
    expect(hits).toHaveLength(1);
    hits = cycleDrumArtic(hits, 'SD', 1);
    expect(hits[0]!.artic).toBe('ghost');
    expect(drumVel(hits[0]!)).toBeLessThan(0.4);
    hits = cycleDrumArtic(hits, 'SD', 1);
    expect(hits[0]!.artic).toBe('accent');
    hits = cycleDrumArtic(hits, 'SD', 1);
    expect(hits).toHaveLength(0);
  });

  it('renders ASCII tab with stacked columns', () => {
    const rock = drumPatternById('backbeat-rock')!;
    const tab = drumTabAscii(rock.hits, 4, 2);
    expect(tab).toMatch(/HH\|/);
    expect(tab).toMatch(/SD\|/);
    expect(tab).toMatch(/BD\|/);
    expect(tab.split('\n').length).toBeGreaterThanOrEqual(4);
  });
});

describe('drums on the timeline', () => {
  it('schedules simultaneous drum hits at the same `at` with chords', () => {
    let slots = setSlotChord([], 0, parseChord('C')!);
    const rock = drumPatternById('backbeat-rock')!;
    slots = setSlotDrums(slots, 0, rock.hits);
    expect(slotDrums(slots[0]!)).toHaveLength(rock.hits.length);

    const parts = defaultPartMeters({ num: 4, den: 4 });
    parts.drums = { timeSig: { num: 4, den: 4 }, subdiv: 2 };
    const ev = timelineEvents(slots, { bpm: 120, partMeters: parts });
    expect(ev.drums.length).toBe(rock.hits.length);
    expect(ev.chords).toHaveLength(1);

    const at0 = ev.drums.filter((d) => Math.abs(d.at) < 1e-6).map((d) => d.voice).sort();
    expect(at0).toEqual(['BD', 'HH']);

    const active = activeAt(ev, 0.01);
    expect(active.drums.map((d) => d.voice).sort()).toEqual(['BD', 'HH']);
  });

  it('default part meters include a 16th-grid drums lane', () => {
    const pm = defaultPartMeters();
    expect(pm.drums.subdiv).toBe(4);
    expect(pm.drums.timeSig).toEqual({ num: 4, den: 4 });
  });
});

describe('Artist Lens drum try-its (TOOL)', () => {
  it('TOOL ships Carey how-to try-its with drumPatternId', () => {
    const raw = JSON.parse(readFileSync(resolve(process.cwd(), 'public/artists.json'), 'utf8'));
    const file = normalizeArtists(raw)!;
    const tool = file.artists.find((a) => a.id === 'tool')!;
    expect(tool.techniques.some((t) => t.id === 'tool-carey-pocket')).toBe(true);
    const withDrums = tool.tryIt.filter((t) => t.drumPatternId);
    expect(withDrums.length).toBeGreaterThanOrEqual(2);
    for (const t of withDrums) {
      expect(drumPatternById(t.drumPatternId!)).toBeTruthy();
      expect(t.howToPlay && t.howToPlay.length).toBeGreaterThan(80);
    }
    expect(tool.listeningGuide.some((g) => /Carey lens/i.test(g.title))).toBe(true);
  });
});
