// Session autosave + transpose helpers. Framework-free (no DOM/React).
import { Chord, QUALITY_BY_ID } from './chords';
import { DrumHit } from './drums';
import { PartMeters } from './meter';
import { NoteName, mod, pc, spell, defaultSpelling } from './notes';
import { TimelineNote, TimelineSlot } from './timeline';

export const SESSION_KEY = 'muse.session';
export const SESSION_VERSION = 1;

export interface SavedSession {
  v: number;
  slots: TimelineSlot[];
  grooveHits: DrumHit[];
  partMeters?: PartMeters;
  /** Style lens id (styles.ts) — omitted for “Any style”. */
  style?: string;
  /** Guitar tuning id (tunings.ts) — omitted for standard. */
  tuning?: string;
  savedAt?: number;
}

export function serializeSession(s: { slots: TimelineSlot[]; grooveHits: DrumHit[]; partMeters?: PartMeters; style?: string | null; tuning?: string | null }, now = Date.now()): string {
  const out: SavedSession = { v: SESSION_VERSION, slots: s.slots, grooveHits: s.grooveHits, partMeters: s.partMeters, savedAt: now };
  if (s.style) out.style = s.style;
  if (s.tuning && s.tuning !== 'standard') out.tuning = s.tuning;
  return JSON.stringify(out);
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const okName = (n: unknown): n is NoteName => isObj(n) && isNum(n.letter) && n.letter >= 0 && n.letter <= 6 && isNum(n.acc) && Math.abs(n.acc) <= 2;

function cleanChord(c: unknown): Chord | null | undefined {
  if (c === null) return null;
  if (!isObj(c) || !okName(c.root) || typeof c.quality !== 'string' || !(c.quality in QUALITY_BY_ID)) return undefined;
  const chord: Chord = { root: { letter: c.root.letter, acc: c.root.acc }, quality: c.quality as Chord['quality'] };
  if (c.bass !== undefined) { if (!okName(c.bass)) return undefined; chord.bass = { letter: c.bass.letter, acc: c.bass.acc }; }
  return chord;
}
function cleanNotes(a: unknown): TimelineNote[] | undefined {
  if (!Array.isArray(a)) return undefined;
  return a.filter((n): n is TimelineNote => isObj(n) && isNum(n.beat) && n.beat >= 0 && (n.midi === null || (isNum(n.midi) && n.midi >= 0 && n.midi <= 127)) && (n.dur === undefined || (isNum(n.dur) && n.dur > 0)))
    .map((n) => (n.dur === undefined ? { midi: n.midi, beat: n.beat } : { midi: n.midi, beat: n.beat, dur: n.dur }));
}
function cleanHits(a: unknown): DrumHit[] | undefined {
  if (!Array.isArray(a)) return undefined;
  return a.filter((h): h is DrumHit => isObj(h) && typeof h.voice === 'string' && isNum(h.beat) && h.beat >= 0 && (h.vel === undefined || isNum(h.vel)));
}
function cleanMeters(m: unknown): PartMeters | undefined {
  if (!isObj(m)) return undefined;
  for (const id of ['chords', 'melody', 'bass', 'drums']) {
    const p = m[id];
    if (!isObj(p) || !isObj(p.timeSig) || !isNum(p.timeSig.num) || !isNum(p.timeSig.den) || !isNum(p.subdiv)) return undefined;
  }
  return m as unknown as PartMeters;
}

/** Parse a saved session defensively; returns null for missing/corrupt/unknown-version data. Bad bars are dropped. */
export function deserializeSession(raw: string | null | undefined): SavedSession | null {
  if (!raw) return null;
  let d: unknown;
  try { d = JSON.parse(raw); } catch { return null; }
  if (!isObj(d) || d.v !== SESSION_VERSION || !Array.isArray(d.slots)) return null;
  const slots: TimelineSlot[] = [];
  for (const s of d.slots) {
    if (!isObj(s)) continue;
    const chord = cleanChord(s.chord ?? null);
    const notes = cleanNotes(s.notes ?? []);
    if (chord === undefined || notes === undefined) continue;
    const slot: TimelineSlot = { chord, notes };
    const bass = s.bass === undefined ? undefined : cleanNotes(s.bass);
    if (bass) slot.bass = bass;
    const drums = s.drums === undefined ? undefined : cleanHits(s.drums);
    if (drums) slot.drums = drums;
    if (s.locked === true) slot.locked = true;
    slots.push(slot);
  }
  return {
    v: SESSION_VERSION,
    slots,
    grooveHits: cleanHits(d.grooveHits) ?? [],
    partMeters: cleanMeters(d.partMeters),
    ...(typeof d.style === 'string' && d.style.length <= 40 ? { style: d.style } : {}),
    ...(typeof d.tuning === 'string' && d.tuning.length <= 40 ? { tuning: d.tuning } : {}),
    savedAt: isNum(d.savedAt) ? d.savedAt : undefined,
  };
}

/** Signed semitone move from one tonic to another, nearest way (−5..+6). */
export function tonicShift(from: NoteName, to: NoteName): number {
  const up = mod(pc(to) - pc(from), 12);
  return up > 6 ? up - 12 : up;
}

/** Move a spelled note by the same letter + semitone interval as from→to (keeps diatonic spelling). */
export function transposeName(n: NoteName, from: NoteName, to: NoteName): NoteName {
  const semis = mod(pc(to) - pc(from), 12);
  const out = spell(n.letter + (to.letter - from.letter), pc(n) + semis);
  return Math.abs(out.acc) > 1 ? defaultSpelling(pc(out)) : out;
}

/** Transpose every chord, melody and bass note from key tonic `from` to `to`. Drums are untouched. */
export function transposeSlots(slots: TimelineSlot[], from: NoteName, to: NoteName): TimelineSlot[] {
  const shift = tonicShift(from, to);
  const mv = (ns: TimelineNote[]) => ns.map((n) => (n.midi == null ? n : { ...n, midi: Math.max(0, Math.min(127, n.midi + shift)) }));
  return slots.map((s) => ({
    ...s,
    chord: s.chord ? { ...s.chord, root: transposeName(s.chord.root, from, to), ...(s.chord.bass ? { bass: transposeName(s.chord.bass, from, to) } : {}) } : null,
    notes: mv(s.notes),
    ...(s.bass ? { bass: mv(s.bass) } : {}),
  }));
}

/** Replace the progression but keep locked bars where they are; incoming bars fill the unlocked positions in order. */
export function replaceKeepingLocked(current: TimelineSlot[], incoming: TimelineSlot[]): TimelineSlot[] {
  const out: TimelineSlot[] = [];
  let q = 0;
  for (let i = 0; i < current.length || q < incoming.length; i++) {
    const cur = current[i];
    if (cur?.locked) out.push(cur);
    else if (q < incoming.length) out.push(incoming[q++]!);
  }
  return out;
}
