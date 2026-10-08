// Unified timeline: each chord slot (4 beats) can hold melody notes at simple beat positions.
// A slot may have no chord yet ("N.C."): its notes are a melody waiting to be harmonized.
import { Chord } from './chords';
import { NoteRelation, noteRelation } from './noteRelation';
import type { TheoryKB } from './kb';

export interface TimelineNote { midi: number; beat: number }
export interface TimelineSlot { chord: Chord | null; notes: TimelineNote[]; locked?: boolean }
export const BEATS_PER_SLOT = 4;
/** notes per slot before input moves on to the next slot (one per beat keeps positions simple) */
export const NOTES_PER_SLOT = 4;

/** Duration (in beats) of each note: until the next note, or the end of the slot. */
export function noteDurations(notes: TimelineNote[]): number[] {
  return notes.map((n, i) => Math.max(0.25, (notes[i + 1]?.beat ?? BEATS_PER_SLOT) - n.beat));
}

/** Where the next melody note goes: the slot after the last one holding notes (or that slot if it has room). */
export function activeSlotIndex(slots: TimelineSlot[]): number {
  let last = -1;
  slots.forEach((s, i) => { if (s.notes.length) last = i; });
  if (last < 0) return 0;
  return slots[last].notes.length < NOTES_PER_SLOT ? last : last + 1;
}

/** Add a melody note at `index` (default: active slot); a full slot spills into the next one (created as N.C.). */
export function insertNote(slots: TimelineSlot[], midi: number, index = activeSlotIndex(slots)): { slots: TimelineSlot[]; index: number } {
  const out = slots.map((s) => ({ ...s, notes: [...s.notes] }));
  let i = Math.max(0, index);
  while (out[i] && out[i].notes.length >= NOTES_PER_SLOT) i++;
  while (out.length <= i) out.push({ chord: null, notes: [] });
  const notes = out[i].notes;
  const beat = notes.length ? Math.min(BEATS_PER_SLOT - 1, notes[notes.length - 1].beat + 1) : 0;
  notes.push({ midi, beat });
  return { slots: out, index: i };
}

/** Set the chord of slot `index` (appends a slot when index === length). */
export function setSlotChord(slots: TimelineSlot[], index: number, chord: Chord): TimelineSlot[] {
  const out = slots.map((s) => ({ ...s }));
  if (index >= out.length) out.push({ chord, notes: [] });
  else out[index] = { ...out[index], chord };
  return out;
}

/** Clear the chord of a slot, leaving its melody as N.C. (no-op when locked). */
export function clearSlotChord(slots: TimelineSlot[], index: number): TimelineSlot[] {
  if (!slots[index] || slots[index].locked) return slots;
  return pruneEmpty(slots.map((s, i) => (i === index ? { ...s, chord: null } : s)));
}

/** Remove one melody note; drops empty chordless unlocked slots. */
export function removeNoteAt(slots: TimelineSlot[], slotIndex: number, noteIndex: number): TimelineSlot[] {
  if (!slots[slotIndex]) return slots;
  const out = slots.map((s, i) => (i === slotIndex ? { ...s, notes: s.notes.filter((_, j) => j !== noteIndex) } : { ...s, notes: [...s.notes] }));
  return pruneEmpty(out);
}

/** Remove a whole slot (no-op when locked). */
export function removeSlot(slots: TimelineSlot[], index: number): TimelineSlot[] {
  if (!slots[index] || slots[index].locked) return slots;
  return slots.filter((_, i) => i !== index);
}

/** Drop trailing/interior empty chordless unlocked slots. */
export function pruneEmpty(slots: TimelineSlot[]): TimelineSlot[] {
  return slots.filter((s) => s.chord || s.notes.length > 0 || s.locked);
}

/** Where a new chord goes: the first chordless slot that already has melody (harmonize it), else a new slot. */
export function chordTargetIndex(slots: TimelineSlot[]): number {
  const i = slots.findIndex((s) => !s.chord && s.notes.length > 0);
  return i >= 0 ? i : slots.length;
}

/** Beat (0..3) the next melody note will land on in the active slot. */
export function nextNoteBeat(slots: TimelineSlot[]): number {
  const i = activeSlotIndex(slots);
  const notes = slots[i]?.notes ?? [];
  if (!notes.length) return 0;
  return Math.min(BEATS_PER_SLOT - 1, notes[notes.length - 1].beat + 1);
}

export const melodyOf = (slots: TimelineSlot[]) => slots.flatMap((s) => s.notes.map((n) => n.midi));
export const chordsOf = (slots: TimelineSlot[]) => slots.filter((s) => s.chord).map((s) => s.chord as Chord);

export interface LabeledNote extends TimelineNote { dur: number; relation: NoteRelation | null }
/** Each melody note labelled against the chord under it (null relation = no chord yet). */
export function labelSlot(slot: TimelineSlot, kb?: TheoryKB | null): LabeledNote[] {
  const d = noteDurations(slot.notes);
  return slot.notes.map((n, i) => ({ ...n, dur: d[i], relation: slot.chord ? noteRelation(n.midi, slot.chord, kb) : null }));
}

export interface TimelineEvents {
  chords: Array<{ index: number; chord: Chord; at: number; dur: number }>;
  notes: Array<{ midi: number; at: number; dur: number; index: number; beat: number }>;
  total: number;
}
/** Timing for playback/export. With no melody anywhere, chords keep a quicker one-per-step feel. */
export function timelineEvents(slots: TimelineSlot[], o: { beatSec?: number; chordOnlyStep?: number } = {}): TimelineEvents {
  const hasMelody = slots.some((s) => s.notes.length);
  const beat = o.beatSec ?? 0.42;
  const step = hasMelody ? beat * BEATS_PER_SLOT : o.chordOnlyStep ?? 0.9;
  const ev: TimelineEvents = { chords: [], notes: [], total: slots.length * step };
  slots.forEach((s, i) => {
    if (s.chord) ev.chords.push({ index: i, chord: s.chord, at: i * step, dur: step * 0.95 });
    const d = noteDurations(s.notes);
    s.notes.forEach((n, j) => ev.notes.push({ midi: n.midi, at: i * step + n.beat * beat, dur: d[j] * beat * 0.95, index: i, beat: n.beat }));
  });
  return ev;
}
