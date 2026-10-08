import { describe, expect, it } from 'vitest';
import { loadKB } from './helpers';
import {
  SuggestionEngine, parseChord, key, noteRelation, melodyFit, REL_FIT,
  insertNote, insertBassNote, insertRest, setSlotChord, chordTargetIndex, activeSlotIndex, activeBassSlotIndex,
  nextNoteBeat, nextBassBeat, labelSlot, labelBassSlot, timelineEvents, harmPreviewEvents,
  melodyOf, bassOf, chordsOf, removeNoteAt, removeBassAt, clearSlotChord,
  toMidiTimeline, timelineText, noteDurations, slotBass, isRest, isSounding,
  defaultPartMeters, clampSlotsToPartMeters, pulseStep, slotsPerPartBar, partPulseSec,
} from '../src/core';

const ch = (s: string) => parseChord(s)!;
const kb = loadKB('theory_kb.json');
const eng = new SuggestionEngine(kb);

describe('noteRelation', () => {
  it('labels chord tones, tensions, avoids and clashes', () => {
    expect(noteRelation(60, ch('C')).kind).toBe('chord'); // C
    expect(noteRelation(64, ch('C')).label).toBe('3');
    expect(noteRelation(62, ch('C')).kind).toBe('tension'); // 9
    expect(noteRelation(65, ch('C')).kind).toBe('avoid'); // 11 over maj
    expect(noteRelation(63, ch('C')).kind).toBe('clash'); // ♭3 vs maj3
    expect(noteRelation(68, ch('G7')).kind).toBe('tension'); // Ab = ♭9 on G7
    expect(noteRelation(62, ch('Am')).kind).toBe('tension'); // D = 11 over Am
  });
  it('attaches KB moods when available', () => {
    const r = noteRelation(66, ch('C'), kb); // F# = ♯11
    expect(r.kind).toBe('tension');
    expect(r.label).toBe('♯11');
    expect(r.kbId).toBe('ct_s11');
  });
  it('melodyFit prefers chord tones on strong beats', () => {
    const tones = [{ midi: 60, beat: 0 }, { midi: 64, beat: 2 }];
    const clash = [{ midi: 63, beat: 0 }, { midi: 63, beat: 2 }];
    expect(melodyFit(tones, ch('C'))).toBeGreaterThan(melodyFit(clash, ch('C')));
    expect(REL_FIT.chord).toBeGreaterThan(REL_FIT.tension);
  });
});

describe('timeline slots', () => {
  it('inserts melody notes beat-by-beat and spills into N.C. bars', () => {
    let slots = setSlotChord([], 0, ch('C'));
    for (const m of [60, 62, 64, 65, 67]) slots = insertNote(slots, m).slots;
    expect(slots).toHaveLength(2);
    expect(slots[0].notes.map((n) => n.beat)).toEqual([0, 1, 2, 3]);
    expect(slots[1].chord).toBeNull();
    expect(slots[1].notes).toHaveLength(1);
    expect(activeSlotIndex(slots)).toBe(1);
    expect(nextNoteBeat(slots)).toBe(1);
    expect(melodyOf(slots)).toEqual([60, 62, 64, 65, 67]);
  });
  it('chordTargetIndex prefers harmonizing a pending N.C. melody', () => {
    let slots = insertNote([], 67).slots;
    slots = insertNote(slots, 69).slots;
    expect(chordTargetIndex(slots)).toBe(0);
    slots = setSlotChord(slots, 0, ch('C'));
    expect(chordTargetIndex(slots)).toBe(1);
    expect(chordsOf(slots).map((c) => c.quality)).toEqual(['maj']);
  });
  it('labels notes against the chord under them', () => {
    let slots = setSlotChord([], 0, ch('G7'));
    slots = insertNote(slots, 62).slots; // D = 5
    slots = insertNote(slots, 68).slots; // Ab = ♭9
    const labeled = labelSlot(slots[0], kb);
    expect(labeled[0].relation?.kind).toBe('chord');
    expect(labeled[1].relation?.kind).toBe('tension');
    expect(labeled[1].relation?.label).toBe('♭9');
  });
  it('removeNoteAt and clearSlotChord prune empty N.C. bars', () => {
    let slots = setSlotChord([], 0, ch('C'));
    slots = insertNote(slots, 60).slots;
    slots = clearSlotChord(slots, 0);
    expect(slots[0].chord).toBeNull();
    expect(slots[0].notes).toHaveLength(1);
    slots = removeNoteAt(slots, 0, 0);
    expect(slots).toHaveLength(0);
  });
  it('timelineEvents schedules chords and melody on a shared grid', () => {
    let slots = setSlotChord([], 0, ch('C'));
    slots = insertNote(slots, 72).slots;
    slots = setSlotChord(slots, 1, ch('G'));
    const ev = timelineEvents(slots, { beatSec: 0.5 });
    expect(ev.chords).toHaveLength(2);
    expect(ev.notes).toHaveLength(1);
    expect(ev.notes[0].at).toBe(0);
    expect(ev.total).toBe(4); // 2 bars × 4 beats × 0.5s
    expect(noteDurations(slots[0].notes)[0]).toBe(4);
  });
  it('timelineEvents startIndex plays from a mid-timeline bar', () => {
    let slots = setSlotChord([], 0, ch('C'));
    slots = setSlotChord(slots, 1, ch('Am'));
    slots = setSlotChord(slots, 2, ch('F'));
    slots = setSlotChord(slots, 3, ch('G'));
    const full = timelineEvents(slots, { beatSec: 0.5, chordOnlyStep: 1 });
    expect(full.chords).toHaveLength(4);
    expect(full.total).toBe(4);
    const from2 = timelineEvents(slots, { beatSec: 0.5, chordOnlyStep: 1, startIndex: 2 });
    expect(from2.chords.map((c) => c.index)).toEqual([2, 3]);
    expect(from2.chords[0]!.at).toBe(0);
    expect(from2.chords[1]!.at).toBe(1);
    expect(from2.total).toBe(2);
    // Melody from a later bar stays relative to the slice origin
    let lined = setSlotChord([], 0, ch('C'));
    lined = insertNote(lined, 72).slots;
    lined = setSlotChord(lined, 1, ch('G'));
    lined = insertNote(lined, 67, 1).slots; // bar 1
    const mid = timelineEvents(lined, { beatSec: 0.5, startIndex: 1 });
    expect(mid.chords.map((c) => c.index)).toEqual([1]);
    expect(mid.chords[0]!.at).toBe(0);
    expect(mid.notes).toHaveLength(1);
    expect(mid.notes[0]!.index).toBe(1);
    expect(mid.notes[0]!.at).toBe(0);
    expect(mid.total).toBe(2); // one remaining bar
  });
  it('inserts bass notes on a separate lane without touching melody', () => {
    let slots = setSlotChord([], 0, ch('C'));
    slots = insertNote(slots, 72).slots;
    for (const m of [36, 43, 48]) slots = insertBassNote(slots, m).slots;
    expect(slots[0].notes.map((n) => n.midi)).toEqual([72]);
    expect(slotBass(slots[0]).map((n) => n.midi)).toEqual([36, 43, 48]);
    expect(slotBass(slots[0]).map((n) => n.beat)).toEqual([0, 1, 2]);
    expect(bassOf(slots)).toEqual([36, 43, 48]);
    expect(activeBassSlotIndex(slots)).toBe(0);
    expect(nextBassBeat(slots)).toBe(3);
    const labeled = labelBassSlot(slots[0], kb);
    expect(labeled[0].relation?.kind).toBe('chord'); // C root
    expect(labeled[1].relation?.kind).toBe('chord'); // G = 5
  });
  it('bass spills into the next bar and removeBassAt prunes empty N.C.', () => {
    let slots = setSlotChord([], 0, ch('Am'));
    for (const m of [33, 40, 45, 52, 57]) slots = insertBassNote(slots, m).slots;
    expect(slots).toHaveLength(2);
    expect(slots[1].chord).toBeNull();
    expect(slotBass(slots[1])).toHaveLength(1);
    slots = removeBassAt(slots, 1, 0);
    expect(slots).toHaveLength(1);
    const ev = timelineEvents(slots, { beatSec: 0.5 });
    expect(ev.bass).toHaveLength(4);
    expect(ev.bass[0].at).toBe(0);
  });
  it('harmPreviewEvents overlays melody on one pending bar', () => {
    const notes = [{ midi: 64, beat: 0 }, { midi: 67, beat: 2 }];
    const prev = harmPreviewEvents(notes, { beatSec: 0.5 });
    expect(prev.total).toBe(2); // 4 beats × 0.5s
    expect(prev.chordDur).toBeCloseTo(1.9);
    expect(prev.notes).toHaveLength(2);
    expect(prev.notes[0].at).toBe(0);
    expect(prev.notes[1].at).toBe(1);
    expect(prev.notes[0].dur).toBeCloseTo(0.95); // 2 beats × 0.5s × 0.95
  });
  it('insertRest advances the pulse without sounding; export skips rests', () => {
    let slots = setSlotChord([], 0, ch('C'));
    slots = insertNote(slots, 60).slots;
    slots = insertRest(slots, 'notes').slots;
    slots = insertNote(slots, 64).slots;
    expect(slots[0].notes.map((n) => n.midi)).toEqual([60, null, 64]);
    expect(slots[0].notes.map((n) => n.beat)).toEqual([0, 1, 2]);
    expect(isRest(slots[0].notes[1]!)).toBe(true);
    expect(isSounding(slots[0].notes[0]!)).toBe(true);
    expect(melodyOf(slots)).toEqual([60, 64]);
    const ev = timelineEvents(slots, { beatSec: 0.5 });
    expect(ev.notes).toHaveLength(2);
    expect(ev.notes.map((n) => n.beat)).toEqual([0, 2]);
    const txt = timelineText(key('C'), slots);
    expect(txt).toMatch(/rest@2/);
  });
  it('subdivision packs half-pulse notes and rests', () => {
    let slots = setSlotChord([], 0, ch('C'));
    slots = insertNote(slots, 60, undefined, 4, 2).slots;
    slots = insertRest(slots, 'notes', undefined, 4, 2).slots;
    slots = insertNote(slots, 62, undefined, 4, 2).slots;
    expect(slots[0].notes.map((n) => n.beat)).toEqual([0, 0.5, 1]);
    expect(nextNoteBeat(slots, 4, 2)).toBe(1.5);
    expect(pulseStep(2)).toBe(0.5);
    expect(slotsPerPartBar({ timeSig: { num: 4, den: 4 }, subdiv: 2 })).toBe(8);
  });
  it('polyrhythm maps part pulses onto the master bar wall-clock', () => {
    const master = { num: 4, den: 4 };
    const parts = defaultPartMeters(master);
    parts.melody = { timeSig: { num: 3, den: 4 }, subdiv: 1 };
    let slots = setSlotChord([], 0, ch('C'));
    slots = insertNote(slots, 72, undefined, 3, 1).slots;
    slots = insertNote(slots, 74, undefined, 3, 1).slots;
    slots = insertNote(slots, 76, undefined, 3, 1).slots;
    const ev = timelineEvents(slots, { beatSec: 0.5, timeSig: master, partMeters: parts });
    // Master bar = 2s; melody pulses = 2/3 s → notes at 0, 2/3, 4/3
    expect(ev.total).toBe(2);
    expect(ev.notes).toHaveLength(3);
    expect(ev.notes[0]!.at).toBeCloseTo(0);
    expect(ev.notes[1]!.at).toBeCloseTo(2 / 3);
    expect(ev.notes[2]!.at).toBeCloseTo(4 / 3);
    expect(partPulseSec(2, parts.melody)).toBeCloseTo(2 / 3);
  });
  it('clampSlotsToPartMeters respects each lane’s capacity', () => {
    const parts = defaultPartMeters({ num: 4, den: 4 });
    parts.melody = { timeSig: { num: 3, den: 4 }, subdiv: 1 };
    parts.bass = { timeSig: { num: 4, den: 4 }, subdiv: 2 };
    // Overfill a single bar, then clamp: melody keeps 3, bass keeps 8 half-pulses
    const slots = [{
      chord: ch('Am'),
      notes: [60, 62, 64, 65, 67].map((midi, i) => ({ midi, beat: i })),
      bass: [36, 38, 40, 41, 43, 45, 47, 48, 50].map((midi, i) => ({ midi, beat: i * 0.5 })),
    }];
    const clamped = clampSlotsToPartMeters(slots, parts);
    expect(clamped[0]!.notes).toHaveLength(3);
    expect(clamped[0]!.notes.map((n) => n.beat)).toEqual([0, 1, 2]);
    expect(slotBass(clamped[0]!)).toHaveLength(8);
    expect(slotBass(clamped[0]!)[1]!.beat).toBe(0.5);
  });
});

describe('harmonize + export', () => {
  it('ranks chords that fit a pending melody above clashes', () => {
    const notes = [{ midi: 64, beat: 0 }, { midi: 67, beat: 1 }, { midi: 71, beat: 2 }]; // E G B → Cmaj / Em / Am
    const s = eng.suggestChords({ key: key('C'), progression: [], harmonize: notes, adventure: 0.2, limit: 20 });
    expect(s[0].harmony).not.toBeNull();
    const top = s.slice(0, 5).map((x) => x.id);
    expect(top.some((id) => ['C', 'Am', 'Em', 'Cmaj7'].includes(id))).toBe(true);
    const c = s.find((x) => x.id === 'C')!;
    const clashy = s.find((x) => x.id === 'Cm' || x.id === 'Ab');
    if (clashy) expect(c.harmony!.fit).toBeGreaterThan(clashy.harmony!.fit);
  });
  it('note suggestions expose relation to the current chord', () => {
    const s = eng.suggestNotes({ key: key('C'), melody: [60], chord: ch('C'), beat: 0, limit: 12 });
    expect(s.every((n) => n.relation !== undefined)).toBe(true);
    const root = s.find((n) => n.midi % 12 === 0);
    expect(root?.relation?.kind).toBe('chord');
  });
  it('MIDI and text exports include both lanes', () => {
    let slots = setSlotChord([], 0, ch('C'));
    slots = insertNote(slots, 72).slots;
    slots = setSlotChord(slots, 1, ch('G'));
    const bytes = toMidiTimeline(slots);
    expect(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])).toBe('MThd');
    expect(bytes[8]).toBe(0); expect(bytes[9]).toBe(1); // format 1
    expect(bytes[10]).toBe(0); expect(bytes[11]).toBe(2); // two tracks
    const txt = timelineText(key('C'), slots);
    expect(txt).toContain('Bar 1: C');
    expect(txt).toMatch(/C\d@1/);
    expect(txt).toContain('Bar 2: G');
  });
  it('MIDI export adds a third track when a bass lane is present', () => {
    let slots = setSlotChord([], 0, ch('C'));
    slots = insertNote(slots, 72).slots;
    slots = insertBassNote(slots, 36).slots;
    const bytes = toMidiTimeline(slots);
    expect(bytes[10]).toBe(0); expect(bytes[11]).toBe(3); // chords + melody + bass
    const txt = timelineText(key('C'), slots);
    expect(txt).toMatch(/bass .*C\d@1/);
  });
});
