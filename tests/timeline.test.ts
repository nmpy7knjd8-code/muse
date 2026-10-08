import { describe, expect, it } from 'vitest';
import { loadKB } from './helpers';
import {
  SuggestionEngine, parseChord, key, noteRelation, melodyFit, REL_FIT,
  insertNote, setSlotChord, chordTargetIndex, activeSlotIndex, nextNoteBeat,
  labelSlot, timelineEvents, melodyOf, chordsOf, removeNoteAt, clearSlotChord,
  toMidiTimeline, timelineText, noteDurations,
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
});
