import { describe, expect, it } from 'vitest';
import {
  analyzeConnections, bridgeSummary, formatSequence, linkHintMidi, parseChord, key,
  setSlotChord, insertNote, insertBassNote, voiceLeading, pianoVoicing,
} from '../src/core';

const ch = (s: string) => parseChord(s)!;

describe('linkHintMidi', () => {
  it('prefers a pitch class shared by both chords near the anchor', () => {
    // C and Am share C and E
    const m = linkHintMidi(ch('C'), ch('Am'), 64)!;
    expect([0, 4]).toContain(m % 12);
    expect(Math.abs(m - 64)).toBeLessThanOrEqual(7);
  });
  it('falls back to arrival chord tones when nothing is shared', () => {
    const m = linkHintMidi(ch('C'), ch('F#'), 60)!; // C E G vs F# A# C♯ — no shared pcs
    expect([6, 10, 1]).toContain(m % 12);
  });
});

describe('analyzeConnections', () => {
  it('builds voice-leading bridges between consecutive chords', () => {
    let slots = setSlotChord([], 0, ch('C'));
    slots = setSlotChord(slots, 1, ch('Am'));
    slots = setSlotChord(slots, 2, ch('F'));
    const conn = analyzeConnections(slots, key('C'));
    expect(conn.bridges).toHaveLength(2);
    expect(conn.bridges[0]!.fromSymbol).toBe('C');
    expect(conn.bridges[0]!.toSymbol).toBe('Am');
    expect(conn.bridges[0]!.voiceLines.length).toBeGreaterThanOrEqual(3);
    expect(conn.bridges[0]!.commonToneCount).toBeGreaterThanOrEqual(2);
    expect(conn.bridges[0]!.totalMotion).toBeGreaterThanOrEqual(0);
    expect(conn.hasContent).toBe(true);
    // Matches the same pairing as a direct voiceLeading call on the voice-led chain.
    const v0 = pianoVoicing(ch('C'));
    const v1 = pianoVoicing(ch('Am'), v0);
    expect(conn.bridges[0]!.voiceLines).toEqual(voiceLeading(v0, v1));
  });

  it('records within-bar melody steps and a melody bridge across the change', () => {
    let slots = setSlotChord([], 0, ch('C'));
    slots = insertNote(slots, 64).slots; // E
    slots = insertNote(slots, 67).slots; // G
    slots = setSlotChord(slots, 1, ch('Am'));
    slots = insertNote(slots, 69, 1).slots; // A into bar 2
    const conn = analyzeConnections(slots, key('C'));
    const bar0 = conn.bars[0]!;
    expect(bar0.withinMelody).toHaveLength(1);
    expect(bar0.withinMelody[0]!.delta).toBe(3);
    expect(bar0.melody.map((n) => n.relationLabel)).toEqual(['3', '5']);
    const bridge = conn.bridges[0]!;
    expect(bridge.melodyBridge).not.toBeNull();
    expect(bridge.melodyBridge!.from).toBe(67);
    expect(bridge.melodyBridge!.to).toBe(69);
    expect(bridge.melodyBridge!.kind).toBe('whole');
    expect(bridgeSummary(bridge)).toMatch(/common tone/);
  });

  it('tracks bass sequence separately from melody', () => {
    let slots = setSlotChord([], 0, ch('C'));
    slots = insertBassNote(slots, 36).slots;
    slots = insertBassNote(slots, 43).slots;
    slots = setSlotChord(slots, 1, ch('G'));
    slots = insertBassNote(slots, 43, 1).slots;
    const conn = analyzeConnections(slots, key('C'));
    expect(conn.bars[0]!.withinBass[0]!.delta).toBe(7);
    expect(conn.bridges[0]!.bassBridge!.delta).toBe(0);
    expect(conn.bridges[0]!.bassBridge!.kind).toBe('common');
  });

  it('formatSequence renders held and stepped intervals', () => {
    const spell = (m: number) => (m === 60 ? 'C4' : m === 64 ? 'E4' : 'G4');
    expect(formatSequence([60, 64, 67], spell)).toBe('C4 —(+4)→ E4 —(+3)→ G4');
    expect(formatSequence([60, 60], spell)).toBe('C4 —(held)→ C4');
  });
});
