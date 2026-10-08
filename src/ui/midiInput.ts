// MIDI keyboard input: Web MIDI note-on/off → melody notes or held-chord recognition.
// Same ListenStatus / callbacks shape as mic Listen so App can swap sources without branching logic.
// No mic / AudioSession changes — MIDI is device I/O only.
import { HoldTracker, chromaFromMidis, matchChord, type ChordMatch } from '../core';
import type { ListenStatus, ListenTarget } from './listen';

export interface MidiOptions {
  target: () => ListenTarget;
  onNote: (midi: number) => void;
  onChord: (m: ChordMatch) => void;
  onStatus: (s: ListenStatus) => void;
  noteName: (midi: number) => string;
  chordName: (m: ChordMatch) => string;
  noteHoldMs?: number;
  chordHoldMs?: number;
  minChordConfidence?: number;
}

export interface MidiSession { stop(): void }

type MidiPortLike = {
  type: string;
  state: string;
  name?: string | null;
  onmidimessage: ((ev: { data: Uint8Array }) => void) | null;
};

type MidiAccessLike = {
  inputs: { forEach(cb: (port: MidiPortLike) => void): void };
  onstatechange: ((ev: { port?: MidiPortLike | null }) => void) | null;
};

export function midiErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const s = raw.toLowerCase();
  if (s.includes('not supported') || s.includes('requestmidiaccess') || s.includes('undefined')) {
    return 'MIDI needs a browser with Web MIDI (Chrome/Edge desktop, or Safari 18+). Plug in a USB/Bluetooth keyboard and try again.';
  }
  if (s.includes('notallowed') || s.includes('permission') || s.includes('denied') || s.includes('security')) {
    return 'MIDI permission denied — allow MIDI access for this site, then try again.';
  }
  return raw || 'MIDI keyboard unavailable';
}

export function midiSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof (navigator as Navigator & { requestMIDIAccess?: unknown }).requestMIDIAccess === 'function';
}

async function requestAccess(): Promise<MidiAccessLike> {
  const nav = navigator as Navigator & { requestMIDIAccess?: (o?: { sysex?: boolean }) => Promise<unknown> };
  if (!nav.requestMIDIAccess) throw new Error('Web MIDI is not supported in this browser.');
  return (await nav.requestMIDIAccess({ sysex: false })) as MidiAccessLike;
}

function forEachInput(access: MidiAccessLike, fn: (port: MidiPortLike) => void): void {
  access.inputs.forEach(fn);
}

function inputCount(access: MidiAccessLike): number {
  let n = 0;
  forEachInput(access, () => { n += 1; });
  return n;
}

export async function startMidiInput(o: MidiOptions): Promise<MidiSession> {
  const access = await requestAccess();
  const held = new Map<number, number>(); // midi → velocity
  const notes = new HoldTracker<number>(o.noteHoldMs ?? 40, 80);
  const chords = new HoldTracker<ChordMatch>(o.chordHoldMs ?? 220, 160);
  const minConf = o.minChordConfidence ?? 0.55;
  let lastTarget: ListenTarget = o.target();
  let lastStatus = 0;
  let running = true;
  let timer = 0;

  const status = (s: ListenStatus, now: number, force = false) => {
    if (force || now - lastStatus > 90) { lastStatus = now; o.onStatus(s); }
  };

  const tick = () => {
    if (!running) return;
    const now = performance.now();
    const target = o.target();
    if (target !== lastTarget) { notes.reset(); chords.reset(); lastTarget = target; }
    const midis = [...held.keys()];
    const level = midis.length ? Math.min(1, midis.length / 6) : 0;

    if (target === 'melody') {
      // Melody: HoldTracker emits each pitch once per press; tick keeps feeding until hold clears.
      if (!midis.length) {
        notes.push(null, null, now);
        status({ state: inputCount(access) ? 'quiet' : 'listening', label: null, confidence: 0, hold: 0, level: 0 }, now);
        return;
      }
      const latest = midis[midis.length - 1];
      const got = notes.push(String(latest), latest, now);
      if (got !== null) o.onNote(got);
      status({
        state: 'listening',
        label: o.noteName(latest),
        confidence: 1,
        hold: notes.progress(now),
        level,
      }, now, got !== null);
      return;
    }

    // Chords: match held pitch classes; require ≥2 notes.
    if (midis.length < 2) {
      chords.push(null, null, now);
      const single = midis.length === 1 ? o.noteName(midis[0]).replace(/\d+$/, '') : null;
      status({
        state: midis.length ? 'listening' : (inputCount(access) ? 'quiet' : 'listening'),
        label: single ? `${single} (hold a chord…)` : null,
        confidence: 0,
        hold: 0,
        level,
      }, now);
      return;
    }
    const m = matchChord(chromaFromMidis(midis));
    const ok = m !== null && m.kind === 'chord' && m.confidence >= minConf;
    const got = chords.push(ok ? `${m!.root}:${m!.quality}` : null, ok ? m : null, now);
    if (got) o.onChord(got);
    status({
      state: 'listening',
      label: m ? (m.kind === 'chord' ? o.chordName(m) : `${o.noteName(60 + m.root).replace(/\d+$/, '')} (single note)`) : null,
      confidence: m?.confidence ?? 0,
      hold: ok ? chords.progress(now) : 0,
      level,
    }, now, got !== null);
  };

  const onMessage = (ev: { data: Uint8Array }) => {
    if (!running || !ev.data || ev.data.length < 2) return;
    const statusByte = ev.data[0] & 0xf0;
    const data1 = ev.data[1];
    const data2 = ev.data.length > 2 ? ev.data[2] : 0;
    const now = performance.now();
    // note-on with vel 0 = note-off
    if (statusByte === 0x90 && data2 > 0) {
      held.set(data1, data2);
      if (o.target() === 'melody') {
        const got = notes.push(String(data1), data1, now);
        if (got !== null) o.onNote(got);
        status({
          state: 'listening',
          label: o.noteName(data1),
          confidence: 1,
          hold: notes.progress(now),
          level: Math.min(1, held.size / 6),
        }, now, got !== null);
      }
    } else if (statusByte === 0x80 || (statusByte === 0x90 && data2 === 0)) {
      held.delete(data1);
      if (o.target() === 'melody' && !held.size) notes.push(null, null, now);
    }
  };

  const bind = (port: MidiPortLike) => {
    if (port.type !== 'input') return;
    port.onmidimessage = onMessage as MidiPortLike['onmidimessage'];
  };

  forEachInput(access, bind);
  access.onstatechange = (ev) => {
    if (ev.port?.type === 'input' && ev.port.state === 'connected') bind(ev.port);
  };

  timer = window.setInterval(tick, 33);
  o.onStatus({
    state: inputCount(access) ? 'quiet' : 'listening',
    label: inputCount(access) ? null : 'waiting for MIDI keyboard…',
    confidence: 0,
    hold: 0,
    level: 0,
  });

  return {
    stop() {
      if (!running) return;
      running = false;
      window.clearInterval(timer);
      forEachInput(access, (p) => { p.onmidimessage = null; });
      access.onstatechange = null;
      held.clear();
      notes.reset();
      chords.reset();
    },
  };
}
