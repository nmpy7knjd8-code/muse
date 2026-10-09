// Unified timeline: each chord slot (one master bar) can hold melody, bass, and/or drum hits.
// Master bar length comes from the session time signature. Each part (chords / melody / bass / drums)
// can use its own PartMeter so pulses fill the same wall-clock bar (polyrhythm) with optional
// subdivisions and rests for precise timing.
import { Chord } from './chords';
import { NoteRelation, noteRelation } from './noteRelation';
import type { TheoryKB } from './kb';
import type { DrumHit } from './drums';
import {
  DEFAULT_BPM, DEFAULT_PART_METER, DEFAULT_TIME_SIG, PartMeter, PartMeters, TimeSig,
  beatSecFromBpm, beatsPerBar as bpb, defaultPartMeters, partPulseSec, pulseStep, slotsPerPartBar,
} from './meter';

/** One timed event on a lane. `midi: null` is a rest (takes time, no sound). */
export interface TimelineNote {
  midi: number | null;
  /** Start in part-pulses (may be fractional when subdiv > 1). */
  beat: number;
  /** Optional length in part-pulses; default = until next event / end of bar. */
  dur?: number;
}

export interface TimelineSlot {
  chord: Chord | null;
  notes: TimelineNote[];
  /** Optional composed bass line for this bar (beat-aligned like melody). */
  bass?: TimelineNote[];
  /** Optional drum / percussion hits for this bar (column-aligned = simultaneous). */
  drums?: DrumHit[];
  locked?: boolean;
}
/** @deprecated use beatsPerBar(timeSig) — kept so older call sites default to 4/4. */
export const BEATS_PER_SLOT = 4;
/** @deprecated use beatsPerBar(timeSig) */
export const NOTES_PER_SLOT = 4;

export const isRest = (n: TimelineNote): boolean => n.midi == null;
export const isSounding = (n: TimelineNote): n is TimelineNote & { midi: number } => n.midi != null;

export function slotBass(slot: TimelineSlot): TimelineNote[] {
  return slot.bass ?? [];
}

/** Duration (in part-pulses) of each note/rest: explicit dur, else until the next event / end. */
export function noteDurations(notes: TimelineNote[], beats = BEATS_PER_SLOT): number[] {
  return notes.map((n, i) => {
    if (n.dur != null && n.dur > 0) return n.dur;
    return Math.max(pulseStep(4), (notes[i + 1]?.beat ?? beats) - n.beat);
  });
}

export function slotDrums(slot: TimelineSlot): DrumHit[] {
  return slot.drums ?? [];
}

function cloneSlots(slots: TimelineSlot[]): TimelineSlot[] {
  return slots.map((s) => ({
    ...s,
    notes: s.notes.map((n) => ({ ...n })),
    bass: slotBass(s).map((n) => ({ ...n })),
    drums: slotDrums(s).map((n) => ({ ...n })),
  }));
}

function laneActiveIndex(slots: TimelineSlot[], lane: 'notes' | 'bass', capacity: number): number {
  let last = -1;
  slots.forEach((s, i) => {
    const n = lane === 'notes' ? s.notes : slotBass(s);
    if (n.length) last = i;
  });
  if (last < 0) return 0;
  const cur = lane === 'notes' ? slots[last].notes : slotBass(slots[last]);
  return cur.length < capacity ? last : last + 1;
}

/** Where the next melody note goes: the slot after the last one holding notes (or that slot if it has room). */
export function activeSlotIndex(slots: TimelineSlot[], beats = BEATS_PER_SLOT, subdiv: PartMeter['subdiv'] = 1): number {
  return laneActiveIndex(slots, 'notes', beats * subdiv);
}

/** Where the next bass note goes (same packing rules as melody). */
export function activeBassSlotIndex(slots: TimelineSlot[], beats = BEATS_PER_SLOT, subdiv: PartMeter['subdiv'] = 1): number {
  return laneActiveIndex(slots, 'bass', beats * subdiv);
}

function insertLaneEvent(
  slots: TimelineSlot[],
  midi: number | null,
  lane: 'notes' | 'bass',
  index: number | undefined,
  beats: number,
  subdiv: PartMeter['subdiv'] = 1,
): { slots: TimelineSlot[]; index: number } {
  const capacity = beats * subdiv;
  const step = pulseStep(subdiv);
  const out = cloneSlots(slots);
  let i = Math.max(0, index ?? laneActiveIndex(slots, lane, capacity));
  while (out[i] && (lane === 'notes' ? out[i].notes : slotBass(out[i])).length >= capacity) i++;
  while (out.length <= i) out.push({ chord: null, notes: [], bass: [], drums: [] });
  const notes = lane === 'notes' ? out[i].notes : (out[i].bass ?? (out[i].bass = []));
  const beat = notes.length
    ? Math.min(beats - step, Math.round((notes[notes.length - 1]!.beat + step) / step) * step)
    : 0;
  notes.push({ midi, beat });
  return { slots: out, index: i };
}

/** Add a melody note at `index` (default: active slot); a full slot spills into the next one (created as N.C.). */
export function insertNote(
  slots: TimelineSlot[],
  midi: number,
  index = activeSlotIndex(slots),
  beats = BEATS_PER_SLOT,
  subdiv: PartMeter['subdiv'] = 1,
): { slots: TimelineSlot[]; index: number } {
  return insertLaneEvent(slots, midi, 'notes', index, beats, subdiv);
}

/** Add a bass note on the bass lane (same beat packing as melody). */
export function insertBassNote(
  slots: TimelineSlot[],
  midi: number,
  index = activeBassSlotIndex(slots),
  beats = BEATS_PER_SLOT,
  subdiv: PartMeter['subdiv'] = 1,
): { slots: TimelineSlot[]; index: number } {
  return insertLaneEvent(slots, midi, 'bass', index, beats, subdiv);
}

/** Insert a rest on the melody or bass lane (advances the pulse cursor, no sound). */
export function insertRest(
  slots: TimelineSlot[],
  lane: 'notes' | 'bass' = 'notes',
  index?: number,
  beats = BEATS_PER_SLOT,
  subdiv: PartMeter['subdiv'] = 1,
): { slots: TimelineSlot[]; index: number } {
  const active = lane === 'notes' ? activeSlotIndex(slots, beats, subdiv) : activeBassSlotIndex(slots, beats, subdiv);
  return insertLaneEvent(slots, null, lane, index ?? active, beats, subdiv);
}

/** Set the chord of slot `index` (appends a slot when index === length). */
export function setSlotChord(slots: TimelineSlot[], index: number, chord: Chord): TimelineSlot[] {
  const out = cloneSlots(slots);
  if (index >= out.length) out.push({ chord, notes: [], bass: [], drums: [] });
  else out[index] = { ...out[index], chord };
  return out;
}

/** Clear the chord of a slot, leaving its melody/bass/drums as N.C. (no-op when locked). */
export function clearSlotChord(slots: TimelineSlot[], index: number): TimelineSlot[] {
  if (!slots[index] || slots[index].locked) return slots;
  return pruneEmpty(slots.map((s, i) => (i === index
    ? { ...s, chord: null, notes: [...s.notes], bass: [...slotBass(s)], drums: [...slotDrums(s)] }
    : s)));
}

/** Replace drum hits for a bar (creates the bar as N.C. when needed). */
export function setSlotDrums(slots: TimelineSlot[], index: number, drums: DrumHit[]): TimelineSlot[] {
  const out = cloneSlots(slots);
  while (out.length <= index) out.push({ chord: null, notes: [], bass: [], drums: [] });
  out[index] = { ...out[index], drums: drums.map((h) => ({ ...h })) };
  return pruneEmpty(out);
}

/** Clear drums on a bar. */
export function clearSlotDrums(slots: TimelineSlot[], index: number): TimelineSlot[] {
  if (!slots[index]) return slots;
  return pruneEmpty(slots.map((s, i) => (i === index ? { ...s, drums: [] } : s)));
}

/** Remove one melody note; drops empty chordless unlocked slots. */
export function removeNoteAt(slots: TimelineSlot[], slotIndex: number, noteIndex: number): TimelineSlot[] {
  if (!slots[slotIndex]) return slots;
  const out = cloneSlots(slots);
  out[slotIndex] = { ...out[slotIndex], notes: out[slotIndex].notes.filter((_, j) => j !== noteIndex) };
  return pruneEmpty(out);
}

/** Remove one bass note; drops empty chordless unlocked slots. */
export function removeBassAt(slots: TimelineSlot[], slotIndex: number, noteIndex: number): TimelineSlot[] {
  if (!slots[slotIndex]) return slots;
  const out = cloneSlots(slots);
  out[slotIndex] = { ...out[slotIndex], bass: slotBass(out[slotIndex]).filter((_, j) => j !== noteIndex) };
  return pruneEmpty(out);
}

/** Remove a whole slot (no-op when locked). */
export function removeSlot(slots: TimelineSlot[], index: number): TimelineSlot[] {
  if (!slots[index] || slots[index].locked) return slots;
  return slots.filter((_, i) => i !== index);
}

/** Drop trailing/interior empty chordless unlocked slots. */
export function pruneEmpty(slots: TimelineSlot[]): TimelineSlot[] {
  return slots.filter((s) => s.chord || s.notes.length > 0 || slotBass(s).length > 0 || slotDrums(s).length > 0 || s.locked);
}

/** Where a new chord goes: the first chordless slot that already has melody (harmonize it), else a new slot. */
export function chordTargetIndex(slots: TimelineSlot[]): number {
  const i = slots.findIndex((s) => !s.chord && s.notes.some(isSounding));
  return i >= 0 ? i : slots.length;
}

/** Beat the next melody note will land on in the active slot. */
export function nextNoteBeat(
  slots: TimelineSlot[],
  beats = BEATS_PER_SLOT,
  subdiv: PartMeter['subdiv'] = 1,
): number {
  const step = pulseStep(subdiv);
  const i = activeSlotIndex(slots, beats, subdiv);
  const notes = slots[i]?.notes ?? [];
  if (!notes.length) return 0;
  return Math.min(beats - step, Math.round((notes[notes.length - 1]!.beat + step) / step) * step);
}

/** Beat the next bass note will land on in the active bass slot. */
export function nextBassBeat(
  slots: TimelineSlot[],
  beats = BEATS_PER_SLOT,
  subdiv: PartMeter['subdiv'] = 1,
): number {
  const step = pulseStep(subdiv);
  const i = activeBassSlotIndex(slots, beats, subdiv);
  const notes = slots[i] ? slotBass(slots[i]) : [];
  if (!notes.length) return 0;
  return Math.min(beats - step, Math.round((notes[notes.length - 1]!.beat + step) / step) * step);
}

/** When the meter shrinks, keep at most `capacity` events per bar (re-packed on the grid). */
export function clampSlotsToMeter(
  slots: TimelineSlot[],
  beats: number,
  subdiv: PartMeter['subdiv'] = 1,
): TimelineSlot[] {
  const capacity = beats * subdiv;
  const step = pulseStep(subdiv);
  return pruneEmpty(slots.map((s) => {
    const pack = (notes: TimelineNote[]) => [...notes]
      .sort((a, b) => a.beat - b.beat)
      .slice(0, capacity)
      .map((n, i) => ({ ...n, beat: i * step }));
    const packDrums = (drums: DrumHit[]) => [...drums]
      .filter((h) => h.beat < beats)
      .map((h) => ({ ...h, beat: Math.round(h.beat / step) * step }))
      .filter((h) => h.beat <= beats - step + 1e-9);
    return { ...s, notes: pack(s.notes), bass: pack(slotBass(s)), drums: packDrums(slotDrums(s)) };
  }));
}

/** Clamp melody/bass/drums lanes to their part meters (chords stay on the master bar grid). */
export function clampSlotsToPartMeters(slots: TimelineSlot[], parts: PartMeters): TimelineSlot[] {
  const melCap = slotsPerPartBar(parts.melody);
  const bassCap = slotsPerPartBar(parts.bass);
  const melStep = pulseStep(parts.melody.subdiv);
  const bassStep = pulseStep(parts.bass.subdiv);
  const drumStep = pulseStep(parts.drums.subdiv);
  const melBeats = bpb(parts.melody.timeSig);
  const bassBeats = bpb(parts.bass.timeSig);
  const drumBeats = bpb(parts.drums.timeSig);
  return pruneEmpty(slots.map((s) => {
    const packMel = [...s.notes].sort((a, b) => a.beat - b.beat).slice(0, melCap)
      .map((n, i) => ({ ...n, beat: Math.min(melBeats - melStep, i * melStep) }));
    const packBass = [...slotBass(s)].sort((a, b) => a.beat - b.beat).slice(0, bassCap)
      .map((n, i) => ({ ...n, beat: Math.min(bassBeats - bassStep, i * bassStep) }));
    const packDrums = [...slotDrums(s)]
      .filter((h) => h.beat < drumBeats)
      .map((h) => ({ ...h, beat: Math.min(drumBeats - drumStep, Math.round(h.beat / drumStep) * drumStep) }));
    return { ...s, notes: packMel, bass: packBass, drums: packDrums };
  }));
}

export const melodyOf = (slots: TimelineSlot[]) =>
  slots.flatMap((s) => s.notes.filter(isSounding).map((n) => n.midi));
export const bassOf = (slots: TimelineSlot[]) =>
  slots.flatMap((s) => slotBass(s).filter(isSounding).map((n) => n.midi));
export const chordsOf = (slots: TimelineSlot[]) => slots.filter((s) => s.chord).map((s) => s.chord as Chord);

export interface LabeledNote extends TimelineNote { dur: number; relation: NoteRelation | null }
/** Each melody note labelled against the chord under it (null relation = rest or no chord yet). */
export function labelSlot(slot: TimelineSlot, kb?: TheoryKB | null, beats = BEATS_PER_SLOT): LabeledNote[] {
  const d = noteDurations(slot.notes, beats);
  return slot.notes.map((n, i) => ({
    ...n,
    dur: d[i]!,
    relation: isSounding(n) && slot.chord ? noteRelation(n.midi, slot.chord, kb) : null,
  }));
}

/** Bass notes labelled against the chord (root/fifth feel “in”; others are colour). */
export function labelBassSlot(slot: TimelineSlot, kb?: TheoryKB | null, beats = BEATS_PER_SLOT): LabeledNote[] {
  const bass = slotBass(slot);
  const d = noteDurations(bass, beats);
  return bass.map((n, i) => ({
    ...n,
    dur: d[i]!,
    relation: isSounding(n) && slot.chord ? noteRelation(n.midi, slot.chord, kb) : null,
  }));
}

export interface TimelineEvents {
  chords: Array<{ index: number; chord: Chord; at: number; dur: number }>;
  notes: Array<{ midi: number; at: number; dur: number; index: number; beat: number }>;
  bass: Array<{ midi: number; at: number; dur: number; index: number; beat: number }>;
  drums: Array<{ voice: DrumHit['voice']; at: number; dur: number; vel: number; artic: DrumHit['artic']; midi?: number; index: number; beat: number }>;
  total: number;
}

/** Timing for playback/export. Part meters map each lane’s pulses onto the master bar (polyrhythm).
 *  Rests occupy time but are omitted from note/bass event lists. Same-beat drum hits share `at` (simultaneous). */
export function timelineEvents(
  slots: TimelineSlot[],
  o: {
    beatSec?: number;
    bpm?: number;
    chordOnlyStep?: number;
    timeSig?: TimeSig;
    startIndex?: number;
    partMeters?: PartMeters;
  } = {},
): TimelineEvents {
  const master = o.timeSig ?? DEFAULT_TIME_SIG;
  const masterBeats = bpb(master);
  const parts = o.partMeters ?? defaultPartMeters(master);
  const hasLine = slots.some((s) => s.notes.length || slotBass(s).length || slotDrums(s).length);
  const beat = o.beatSec ?? beatSecFromBpm(o.bpm ?? DEFAULT_BPM);
  // Chord-only browsing stays snappier than a full bar (~2.14 beats at the active tempo).
  const step = hasLine ? beat * masterBeats : o.chordOnlyStep ?? beat * 2.14;
  const start = Math.max(0, Math.min(o.startIndex ?? 0, slots.length));
  const t0 = start * step;
  const melPulse = partPulseSec(step, parts.melody);
  const bassPulse = partPulseSec(step, parts.bass);
  const drumPulse = partPulseSec(step, parts.drums);
  const melBeats = bpb(parts.melody.timeSig);
  const bassBeats = bpb(parts.bass.timeSig);
  const ev: TimelineEvents = { chords: [], notes: [], bass: [], drums: [], total: Math.max(0, slots.length - start) * step };
  slots.forEach((s, i) => {
    if (i < start) return;
    if (s.chord) ev.chords.push({ index: i, chord: s.chord, at: i * step - t0, dur: step * 0.95 });
    const dMel = noteDurations(s.notes, melBeats);
    s.notes.forEach((n, j) => {
      if (!isSounding(n)) return;
      ev.notes.push({
        midi: n.midi,
        at: i * step + n.beat * melPulse - t0,
        dur: dMel[j]! * melPulse * 0.95,
        index: i,
        beat: n.beat,
      });
    });
    const bass = slotBass(s);
    const dBass = noteDurations(bass, bassBeats);
    bass.forEach((n, j) => {
      if (!isSounding(n)) return;
      ev.bass.push({
        midi: n.midi,
        at: i * step + n.beat * bassPulse - t0,
        dur: dBass[j]! * bassPulse * 0.95,
        index: i,
        beat: n.beat,
      });
    });
    // Drum one-shots: short dur; stacked voices at the same beat share the same `at`.
    for (const h of slotDrums(s)) {
      const vel = h.vel ?? (h.artic === 'ghost' ? 0.28 : h.artic === 'accent' ? 0.95 : 0.78);
      ev.drums.push({
        voice: h.voice,
        at: i * step + h.beat * drumPulse - t0,
        dur: Math.min(0.22, drumPulse * 0.9),
        vel,
        artic: h.artic,
        midi: h.midi,
        index: i,
        beat: h.beat,
      });
    }
  });
  return ev;
}

/** One-bar preview: chord under a pending (N.C.) melody — same grid as timelineEvents. */
export function harmPreviewEvents(
  notes: TimelineNote[],
  o: { beatSec?: number; bpm?: number; timeSig?: TimeSig; partMeter?: PartMeter } = {},
): { notes: Array<{ midi: number; at: number; dur: number; beat: number }>; chordDur: number; total: number } {
  const master = o.timeSig ?? DEFAULT_TIME_SIG;
  const pm = o.partMeter ?? DEFAULT_PART_METER;
  const beat = o.beatSec ?? beatSecFromBpm(o.bpm ?? DEFAULT_BPM);
  const total = beat * bpb(master);
  const pulse = partPulseSec(total, pm);
  const laneBeats = bpb(pm.timeSig);
  const d = noteDurations(notes, laneBeats);
  return {
    chordDur: total * 0.95,
    total,
    notes: notes.flatMap((n, j) => (
      isSounding(n)
        ? [{ midi: n.midi, at: n.beat * pulse, dur: d[j]! * pulse * 0.95, beat: n.beat }]
        : []
    )),
  };
}
