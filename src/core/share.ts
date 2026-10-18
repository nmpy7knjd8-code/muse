// Share links (idea 11): encode the whole progression (key, tempo, meter, bars with melody/bass/drums)
// into a compact base64url string for the URL hash (#s=…). Decoding re-validates through
// deserializeSession, so a hand-edited link can't inject bad data.
import { DrumHit } from './drums';
import { PartMeters, TimeSig, clampBpm, defaultPartMeters, parseMeter, timeSigLabel } from './meter';
import { parseNote } from './notes';
import { MODE_BY_ID, ModeId } from './scales';
import { SESSION_VERSION, SavedSession, deserializeSession } from './session';
import { TimelineNote, TimelineSlot } from './timeline';

export const SHARE_VERSION = 1;
export const SHARE_PARAM = 's';

export interface SharePayload {
  tonic: string;
  mode: ModeId;
  bpm: number;
  timeSig: TimeSig;
  slots: TimelineSlot[];
  grooveHits?: DrumHit[];
  partMeters?: PartMeters;
}

type CNote = Array<number>;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const packNotes = (ns: TimelineNote[]): CNote => ns.flatMap((n) => [n.midi ?? -1, r3(n.beat), n.dur === undefined ? 0 : r3(n.dur)]);
const unpackNotes = (a: unknown): unknown[] => {
  if (!Array.isArray(a)) return [];
  const out: unknown[] = [];
  for (let i = 0; i + 2 < a.length; i += 3) {
    const [m, b, d] = [a[i], a[i + 1], a[i + 2]];
    out.push(d === 0 ? { midi: m === -1 ? null : m, beat: b } : { midi: m === -1 ? null : m, beat: b, dur: d });
  }
  return out;
};
const packHits = (hs: DrumHit[]) => hs.map((h) => (h.vel === undefined ? [h.voice, r3(h.beat)] : [h.voice, r3(h.beat), r3(h.vel)]));
const unpackHits = (a: unknown): unknown[] => (Array.isArray(a) ? a.filter(Array.isArray).map((h) => (h.length > 2 ? { voice: h[0], beat: h[1], vel: h[2] } : { voice: h[0], beat: h[1] })) : []);

function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s: string): string | null {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
    const bin = atob(b64);
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch { return null; }
}

export function encodeShare(p: SharePayload): string {
  const s = p.slots.map((sl) => {
    const c = sl.chord;
    const cc = c ? [c.root.letter, c.root.acc, c.quality, ...(c.bass ? [c.bass.letter, c.bass.acc] : [])] : 0;
    const row: unknown[] = [cc, packNotes(sl.notes)];
    if (sl.bass?.length || sl.drums?.length || sl.locked) row.push(sl.bass ? packNotes(sl.bass) : 0);
    if (sl.drums?.length || sl.locked) row.push(sl.drums ? packHits(sl.drums) : 0);
    if (sl.locked) row.push(1);
    return row;
  });
  const out: Record<string, unknown> = { v: SHARE_VERSION, k: p.tonic, m: p.mode, b: p.bpm, t: timeSigLabel(p.timeSig), s };
  if (p.grooveHits?.length) out.g = packHits(p.grooveHits);
  // Part meters only when they differ from the defaults for this time signature (keeps links short).
  if (p.partMeters && JSON.stringify(p.partMeters) !== JSON.stringify(defaultPartMeters(p.timeSig))) out.p = p.partMeters;
  return b64urlEncode(JSON.stringify(out));
}

export function decodeShare(code: string): SharePayload | null {
  if (!code || code.length > 60000) return null;
  const raw = b64urlDecode(code);
  if (!raw) return null;
  let d: Record<string, unknown>;
  try { d = JSON.parse(raw); } catch { return null; }
  if (!d || typeof d !== 'object' || d.v !== SHARE_VERSION || !Array.isArray(d.s)) return null;
  const tonic = typeof d.k === 'string' && parseNote(d.k) ? d.k : null;
  const mode = typeof d.m === 'string' && d.m in MODE_BY_ID ? (d.m as ModeId) : null;
  const timeSig = typeof d.t === 'string' ? parseMeter(d.t) : null;
  if (!tonic || !mode || !timeSig) return null;
  const bpm = clampBpm(typeof d.b === 'number' && Number.isFinite(d.b) ? d.b : 120);
  const slots = (d.s as unknown[]).slice(0, 256).map((row) => {
    if (!Array.isArray(row)) return null;
    const [cc, n, b, dr, l] = row;
    const chord = Array.isArray(cc)
      ? { root: { letter: cc[0], acc: cc[1] }, quality: cc[2], ...(cc.length > 3 ? { bass: { letter: cc[3], acc: cc[4] } } : {}) }
      : null;
    return { chord, notes: unpackNotes(n), ...(Array.isArray(b) ? { bass: unpackNotes(b) } : {}), ...(Array.isArray(dr) ? { drums: unpackHits(dr) } : {}), ...(l === 1 ? { locked: true } : {}) };
  }).filter(Boolean);
  const sess: SavedSession | null = deserializeSession(JSON.stringify({ v: SESSION_VERSION, slots, grooveHits: unpackHits(d.g), partMeters: d.p }));
  if (!sess || (!sess.slots.length && slots.length)) return null;
  return { tonic, mode, bpm, timeSig, slots: sess.slots, grooveHits: sess.grooveHits, partMeters: sess.partMeters };
}

/** Full link: base URL (hash/query stripped of any previous share) + #s=code. */
export function shareUrl(base: string, p: SharePayload): string {
  return `${base.split('#')[0]}#${SHARE_PARAM}=${encodeShare(p)}`;
}
/** Pull the share code out of a location hash ("#s=…"), or null. */
export function readShareHash(hash: string): string | null {
  const m = /^#?(?:.*&)?s=([A-Za-z0-9_-]+)/.exec(hash || '');
  return m ? m[1]! : null;
}
