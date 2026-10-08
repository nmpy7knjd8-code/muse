// Unified timeline: each chord slot (one bar) can hold melody notes at simple beat positions.
// Bar length comes from the active time signature (default 4/4 → 4 beats).
// A slot may have no chord yet ("N.C."): its notes are a melody waiting to be harmonized.
import { Chord } from './chords';
import { NoteRelation, noteRelation } from './noteRelation';
import type { TheoryKB } from './kb';
import { DEFAULT_BPM, DEFAULT_TIME_SIG, TimeSig, beatSecFromBpm, beatsPerBar as bpb } from './meter';

export interface TimelineNote { midi: number; beat: number }
export interface TimelineSlot { chord: Chord | null; notes: TimelineNote[]; locked?: boolean }
/** @deprecated use beatsPerBar(timeSig) — kept so older call sites default to 4/4. */
export const BEATS_PER_SLOT = 4;
/** @deprecated use beatsPerBar(timeSig) */
export const NOTES_PER_SLOT = 4;

/** Duration (in beats) of each note: until the next note, or the end of the slot. */
export function noteDurations(notes: TimelineNote[], beats = BEATS_PER_SLOT): number[] {
  return notes.map((n, i) => Math.max(0.25, (notes[i + 1]?.beat ?? beats) - n.beat));
}

/** Where the next melody note goes: the slot after the last one holding notes (or that slot if it has room). */
export function activeSlotIndex(slots: TimelineSlot[], beats = BEATS_PER_SLOT): number {
  let last = -1;
  slots.forEach((s, i) => { if (s.notes.length) last = i; });
  if (last < 0) return 0;
  return slots[last].notes.length < beats ? last : last + 1;
}

/** Add a melody note at `index` (default: active slot); a full slot spills into the next one (created as N.C.). */
export function insertNote(
  slots: TimelineSlot[],
  midi: number,
  index = activeSlotIndex(slots),
  beats = BEATS_PER_SLOT,
): { slots: TimelineSlot[]; index: number } {
  const out = slots.map((s) => ({ ...s, notes: [...s.notes] }));
  let i = Math.max(0, index);
  while (out[i] && out[i].notes.length >= beats) i++;
  while (out.length <= i) out.push({ chord: null, notes: [] });
  const notes = out[i].notes;
  const beat = notes.length ? Math.min(beats - 1, notes[notes.length - 1].beat + 1) : 0;
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

/** Beat the next melody note will land on in the active slot. */
export function nextNoteBeat(slots: TimelineSlot[], beats = BEATS_PER_SLOT): number {
  const i = activeSlotIndex(slots, beats);
  const notes = slots[i]?.notes ?? [];
  if (!notes.length) return 0;
  return Math.min(beats - 1, notes[notes.length - 1].beat + 1);
}

/** When the meter shrinks, keep at most `beats` notes per bar (re-packed on beats 0..beats-1). */
export function clampSlotsToMeter(slots: TimelineSlot[], beats: number): TimelineSlot[] {
  return pruneEmpty(slots.map((s) => {
    const notes = [...s.notes]
      .sort((a, b) => a.beat - b.beat)
      .slice(0, beats)
      .map((n, i) => ({ midi: n.midi, beat: i }));
    return { ...s, notes };
  }));
}

export const melodyOf = (slots: TimelineSlot[]) => slots.flatMap((s) => s.notes.map((n) => n.midi));
export const chordsOf = (slots: TimelineSlot[]) => slots.filter((s) => s.chord).map((s) => s.chord as Chord);

export interface LabeledNote extends TimelineNote { dur: number; relation: NoteRelation | null }
/** Each melody note labelled against the chord under it (null relation = no chord yet). */
export function labelSlot(slot: TimelineSlot, kb?: TheoryKB | null, beats = BEATS_PER_SLOT): LabeledNote[] {
  const d = noteDurations(slot.notes, beats);
  return slot.notes.map((n, i) => ({ ...n, dur: d[i], relation: slot.chord ? noteRelation(n.midi, slot.chord, kb) : null }));
}

export interface TimelineEvents {
  chords: Array<{ index: number; chord: Chord; at: number; dur: number }>;
  notes: Array<{ midi: number; at: number; dur: number; index: number; beat: number }>;
  total: number;
}
/** Timing for playback/export. With no melody anywhere, chords keep a quicker one-per-step feel. */
export function timelineEvents(
  slots: TimelineSlot[],
  o: { beatSec?: number; bpm?: number; chordOnlyStep?: number; timeSig?: TimeSig } = {},
): TimelineEvents {
  const beats = bpb(o.timeSig ?? DEFAULT_TIME_SIG);
  const hasMelody = slots.some((s) => s.notes.length);
  const beat = o.beatSec ?? beatSecFromBpm(o.bpm ?? DEFAULT_BPM);
  // Chord-only browsing stays snappier than a full bar (~2.14 beats at the active tempo).
  const step = hasMelody ? beat * beats : o.chordOnlyStep ?? beat * 2.14;
  const ev: TimelineEvents = { chords: [], notes: [], total: slots.length * step };
  slots.forEach((s, i) => {
    if (s.chord) ev.chords.push({ index: i, chord: s.chord, at: i * step, dur: step * 0.95 });
    const d = noteDurations(s.notes, beats);
    s.notes.forEach((n, j) => ev.notes.push({ midi: n.midi, at: i * step + n.beat * beat, dur: d[j] * beat * 0.95, index: i, beat: n.beat }));
  });
  return ev;
}

/** One-bar preview: chord under a pending (N.C.) melody — same grid as timelineEvents. */
export function harmPreviewEvents(
  notes: TimelineNote[],
  o: { beatSec?: number; bpm?: number; timeSig?: TimeSig } = {},
): { notes: Array<{ midi: number; at: number; dur: number; beat: number }>; chordDur: number; total: number } {
  const beats = bpb(o.timeSig ?? DEFAULT_TIME_SIG);
  const beat = o.beatSec ?? beatSecFromBpm(o.bpm ?? DEFAULT_BPM);
  const total = beat * beats;
  const d = noteDurations(notes, beats);
  return {
    chordDur: total * 0.95,
    total,
    notes: notes.map((n, j) => ({ midi: n.midi, at: n.beat * beat, dur: d[j] * beat * 0.95, beat: n.beat })),
  };
}
