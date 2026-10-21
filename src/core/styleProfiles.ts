// Style ↔ Tuning ↔ Key/Mode coherence model.
//
// MODEL (plain language)
//  • Every style has a profile: modes ranked by how typical they are, typical tonics, and usual tunings.
//  • Riff-based guitar styles (metal, TOOL, Metallica, Sabbath…) take their tonic from the tuning's lowest
//    string ("low"): the open low string is the home note you can pound without fretting — drop D → D,
//    C♯ standard → C♯, standard → E. Other styles list concrete tonics (keyboard/horn styles favour flat keys).
//  • Picking a style OFFERS its best combo (tuning → tonic → mode). Picking a tuning OFFERS tonics on its open
//    low strings. Changing key/mode never resets anything; it only adds a short note when the combo is unusual,
//    naming the closest typical mode. Highlighting already follows key + style + tuning (styles.ts).
//
// SOURCES (checked Oct 2026; see docs/style-coherence.md for notes on what each changed)
//  ht-*        Hooktheory TheoryTab artist key tables — hooktheory.com/theorytab/artist/<artist>
//              (tool, nirvana, black-sabbath, steely-dan, pink-floyd, deftones, radiohead, led-zeppelin)
//  musicradar  “Tool guitar lesson: 5 ways to play like Adam Jones” (drop D essential; occasional drop B)
//  musicscene  “Schism – harmonic breakdown” (D minor with Phrygian ♭II, drop D)
//  12notez / metallicaR  Metallica key counts: E minor most common
//  baylor      “Musical Process and the Structuring of Riffs in Metallica” (E-centred riffs, ♭II/♭V)
//  tunelit     Black Sabbath tunings album by album (C♯ standard from Master of Reality)
//  se-keys     music.stackexchange “best key for a guitar in standard tuning” (E, A, G, Em for open strings)
//  realbook    jazzguitar.be Real Book key statistics (F, E♭, C, B♭ most common)
//  moore       J. Moore (UCSD) “The Flamenco Key” (A Phrygian por medio more common than E por arriba)
//  flamencoexp flamencoexplained.com chord guide (por medio / por arriba, Granaína B, Taranta F♯)
//  gw-mu       Guitar World “Steely Dan Mu chord”; sdarchive songbook intro
//  joni        jonimitchell.com transcriptions by tuning (open D, open G)
//  sy          sonicyouth.com tuning tutorial (Teen Age Riot GGDDGG / GABDEG)
//  lens        Muse Artist Lens research (public/artists.json “Try it” exercises)
//  conv        Common-practice convention (not artist-specific)
import { MODE_BY_ID, ModeId, Key, keyName } from './scales';
import { mod, noteName, parseNote, pc } from './notes';
import { STYLE_BY_ID, STYLES, MusicStyle } from './styles';
import { Tuning, tuningById } from './tunings';

export interface StyleProfile {
  /** Modes, most typical first. */
  modes: ModeId[];
  /** Typical tonics (note names, most typical first) — or 'low' = the tuning's lowest open string. */
  tonics: string[] | 'low';
  /** Usual tunings, most typical first (ids from tunings.ts). */
  tunings: string[];
  src: string[];
}

const p = (modes: ModeId[], tonics: string[] | 'low', tunings: string[], src: string[]): StyleProfile => ({ modes, tonics, tunings, src });

export const STYLE_PROFILES: Record<string, StyleProfile> = {
  pop: p(['major', 'minor', 'mixolydian'], ['C', 'G', 'D', 'A', 'F'], ['standard'], ['conv']),
  rock: p(['major', 'mixolydian', 'minor', 'dorian'], ['E', 'A', 'D', 'G'], ['standard', 'halfDown'], ['se-keys', 'ht-led-zeppelin']),
  blues: p(['mixolydian', 'minor', 'dorian'], ['E', 'A', 'G', 'Bb'], ['standard'], ['se-keys', 'realbook']),
  jazz: p(['major', 'minor', 'dorian'], ['F', 'Eb', 'C', 'Bb'], ['standard'], ['realbook']),
  rnb: p(['major', 'minor', 'dorian'], ['Eb', 'Ab', 'F', 'Db'], ['standard'], ['conv']),
  funk: p(['mixolydian', 'dorian', 'minor'], ['E', 'A', 'D'], ['standard'], ['conv']),
  folk: p(['major', 'mixolydian', 'minor', 'dorian'], ['G', 'D', 'C', 'A'], ['standard', 'dadgad', 'openD'], ['se-keys', 'joni']),
  metal: p(['minor', 'phrygian', 'harmonicMinor', 'locrian'], 'low', ['standard', 'dropD', 'dropC', 'dropB', 'halfDown'], ['12notez', 'baylor', 'musicradar']),
  prog: p(['minor', 'dorian', 'lydian', 'major', 'phrygian'], ['E', 'D', 'A'], ['standard', 'dropD'], ['ht-tool', 'ht-pink-floyd']),
  punk: p(['major', 'minor', 'mixolydian'], ['E', 'A', 'D'], ['standard', 'halfDown'], ['conv']),
  indie: p(['major', 'minor', 'dorian', 'mixolydian'], ['D', 'A', 'G', 'E'], ['standard', 'openD'], ['ht-radiohead']),
  gospel: p(['major', 'minor'], ['Ab', 'Db', 'Eb', 'F'], ['standard'], ['conv']),
  lofi: p(['major', 'minor', 'dorian'], ['F', 'C', 'Eb'], ['standard'], ['conv']),
  edm: p(['minor', 'major'], ['A', 'F', 'C', 'G'], ['standard'], ['conv']),
  cinematic: p(['minor', 'major', 'harmonicMinor', 'lydian'], ['D', 'C', 'A'], ['standard'], ['conv']),
  latin: p(['major', 'minor', 'dorian'], ['F', 'C', 'D'], ['standard'], ['conv']),
  reggae: p(['major', 'minor'], ['G', 'A', 'C'], ['standard'], ['conv']),
  flamenco: p(['phrygianDominant', 'phrygian', 'harmonicMinor'], ['A', 'E', 'B', 'F#'], ['standard'], ['moore', 'flamencoexp']),
  tool: p(['minor', 'phrygian', 'dorian', 'phrygianDominant'], 'low', ['toolDropD', 'dropB'], ['ht-tool', 'musicradar', 'musicscene', 'lens']),
  radiohead: p(['major', 'minor', 'dorian', 'mixolydian', 'harmonicMinor', 'phrygian'], ['A', 'D', 'E', 'B'], ['standard'], ['ht-radiohead', 'lens']),
  'steely-dan': p(['major', 'mixolydian', 'minor', 'dorian'], ['G', 'C', 'A', 'E'], ['standard'], ['ht-steely-dan', 'gw-mu', 'lens']),
  'the-beatles': p(['major', 'mixolydian', 'minor'], ['E', 'G', 'C', 'D', 'A'], ['standard'], ['lens', 'conv']),
  'pink-floyd': p(['minor', 'dorian', 'major', 'phrygian'], ['E', 'D', 'G', 'B'], ['standard'], ['ht-pink-floyd', 'lens']),
  'led-zeppelin': p(['mixolydian', 'minor', 'dorian', 'major'], ['A', 'E'], ['standard', 'zeppDadgad'], ['ht-led-zeppelin', 'lens']),
  nirvana: p(['minor', 'mixolydian', 'dorian', 'major', 'phrygian'], ['F', 'C#', 'D'], ['nirvanaEb', 'dropD'], ['ht-nirvana']),
  metallica: p(['minor', 'phrygian', 'harmonicMinor'], 'low', ['standard', 'halfDown'], ['12notez', 'metallicaR', 'baylor']),
  'black-sabbath': p(['minor', 'dorian', 'phrygian', 'locrian', 'mixolydian'], 'low', ['sabbathCs', 'standard'], ['tunelit', 'ht-black-sabbath']),
  'rolling-stones': p(['major', 'mixolydian', 'minor'], ['G', 'A', 'E'], ['stonesOpenG', 'standard'], ['joni']),
  'joni-mitchell': p(['major', 'mixolydian', 'dorian'], ['D', 'G'], ['joniOpenD', 'openG'], ['joni']),
  'sonic-youth': p(['mixolydian', 'major', 'minor'], ['G'], ['sonicGGDDGG'], ['sy']),
  deftones: p(['minor', 'major', 'lydian', 'phrygian'], 'low', ['dropD'], ['ht-deftones', 'lens']),
  opeth: p(['minor', 'dorian', 'phrygian'], ['E', 'D'], ['standard', 'dropD'], ['lens']),
  'king-crimson': p(['minor', 'phrygian', 'lydian', 'major'], ['E', 'A'], ['standard'], ['lens']),
  meshuggah: p(['phrygian', 'minor', 'locrian'], 'low', ['dropB'], ['lens']),
  'animals-as-leaders': p(['phrygian', 'minor', 'lydian'], 'low', ['dropB'], ['lens']),
  'dream-theater': p(['minor', 'harmonicMinor', 'dorian', 'major'], ['E', 'D'], ['standard', 'dropD'], ['lens']),
  rush: p(['mixolydian', 'major', 'minor', 'lydian'], ['E', 'D', 'A'], ['standard'], ['lens']),
  queen: p(['major', 'mixolydian', 'minor'], ['Eb', 'Ab', 'F', 'C'], ['standard'], ['lens']),
  bjork: p(['lydian', 'major', 'minor'], ['Eb', 'C'], ['standard'], ['lens']),
  'sigur-ros': p(['major', 'lydian', 'minor'], ['E', 'D'], ['standard', 'dadgad'], ['lens']),
  portishead: p(['minor', 'harmonicMinor', 'dorian'], ['G', 'D', 'A'], ['standard'], ['lens']),
  'nine-inch-nails': p(['minor', 'lydian', 'dorian', 'phrygian'], ['A', 'D', 'E'], ['standard', 'dropD'], ['lens']),
  coltrane: p(['major', 'dorian', 'minor'], ['C', 'Bb', 'Eb', 'D'], ['standard'], ['lens', 'realbook']),
  'snarky-puppy': p(['dorian', 'minor', 'major', 'mixolydian'], ['D', 'E', 'F'], ['standard'], ['lens']),
  debussy: p(['major', 'lydian', 'minor'], ['Db', 'C', 'F#'], ['standard'], ['lens']),
  messiaen: p(['major', 'lydian'], ['C', 'F#'], ['standard'], ['lens']),
  herrmann: p(['harmonicMinor', 'minor'], ['D', 'C'], ['standard'], ['lens']),
  'bach-chorale': p(['major', 'minor'], ['G', 'D', 'A', 'F'], ['standard'], ['conv']),
};

export const styleProfile = (id: string | null | undefined): StyleProfile | null => (id ? STYLE_PROFILES[id] ?? null : null);

const sameStrings = (a: Tuning, b: Tuning) => a.strings.join() === b.strings.join();
const lowNote = (t: Tuning) => mod(t.strings[0]!, 12);
/** Conventional spelling for a pitch class in the given mode family (matches the top-bar picker). */
export function tonicName(pcv: number, mode: ModeId): string {
  const major = MODE_BY_ID[mode].family === 'major';
  return (major ? ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] : ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'])[mod(pcv, 12)]!;
}
const pretty = (s: string) => s.replace('#', '♯').replace(/^([A-G])b/, '$1♭');
const modeShort = (m: ModeId) => (m === 'major' ? 'major' : m === 'minor' ? 'minor' : MODE_BY_ID[m].name.replace(/ \(.*\)$/, ''));

export interface Combo { tonic: string; mode: ModeId; altMode?: ModeId; tuning: string; label: string }

/** Best key + mode + tuning for a style. Keeps the current tuning when it's one the style uses. */
export function styleCombo(styleId: string, current?: Tuning | null): Combo | null {
  const prof = styleProfile(styleId);
  const style = STYLE_BY_ID[styleId];
  if (!prof || !style) return null;
  const keep = current && prof.tunings.some((id) => sameStrings(tuningById(id), current));
  const tuning = keep ? current! : tuningById(prof.tunings[0]);
  const mode = prof.modes[0]!;
  const tonic = prof.tonics === 'low' ? tonicName(lowNote(tuning), mode) : prof.tonics[0]!;
  const altMode = prof.modes[1];
  const modeTxt = altMode && MODE_BY_ID[altMode].family === MODE_BY_ID[mode].family ? `${modeShort(mode)}/${modeShort(altMode)}` : modeShort(mode);
  const tId = keep ? current!.id : tuning.id;
  const tName = tuning.name.replace(/^.* — /, '');
  return { tonic, mode, altMode, tuning: tId, label: `${style.name}: ${pretty(tonic)} ${modeTxt} in ${tName}` };
}

/** Tonic pitch classes a tuning suits (its open low strings; open tunings: the open chord root). */
export function tuningTonics(t: Tuning): number[] {
  if (t.kind === 'standard') return [4, 9]; // E and A: open low strings
  const low = lowNote(t);
  const fifth = mod(t.strings[1]!, 12);
  if (t.kind === 'open') {
    const root = openChordRoot(t);
    return [...new Set([root ?? low, low])];
  }
  return [...new Set([low, fifth])];
}
function openChordRoot(t: Tuning): number | null {
  const pcs = new Set(t.strings.map((m) => mod(m, 12)));
  for (const r of pcs) if (pcs.has(mod(r + 7, 12)) && (pcs.has(mod(r + 4, 12)) || pcs.has(mod(r + 3, 12)))) return r;
  for (const r of pcs) if (pcs.has(mod(r + 7, 12))) return r;
  return null;
}

/** One-tap tonic suggestion when the current key doesn't use the tuning's open strings (null if it already does). */
export function tuningKeySuggestion(t: Tuning, k: Key): { tonic: string; label: string } | null {
  if (t.kind === 'standard') return null;
  const tonics = tuningTonics(t);
  if (tonics.includes(pc(k.tonic))) return null;
  const tonic = tonicName(tonics[0]!, k.mode);
  const why = t.kind === 'open' && openChordRoot(t) === tonics[0] ? `its open strings ring a ${pretty(tonic)} chord` : `its open low string is ${pretty(tonic)}`;
  return { tonic, label: `${t.name.replace(/^.* — /, '')} suits ${pretty(tonic)} — ${why}` };
}

/** How many scale steps differ between two modes (0 = same notes). */
function modeDistance(a: ModeId, b: ModeId): number {
  const A = MODE_BY_ID[a].intervals, B = MODE_BY_ID[b].intervals;
  return A.filter((x) => !B.includes(x)).length;
}

export type Fitness = 'typical' | 'sometimes' | 'unusual';
export interface Coherence {
  modeFit: Fitness;
  tonicFit: Fitness;
  /** short note when something's unusual (else null) */
  note: string | null;
  closestMode?: ModeId;
  /** plain-language “why this fits” */
  why: string;
}

export const MODE_FEEL: Record<ModeId, string> = {
  major: 'major is bright and settled',
  minor: 'minor is dark and serious',
  dorian: 'Dorian is minor with a hopeful raised 6th',
  phrygian: 'Phrygian’s note one fret above home (♭2) gives the menacing edge',
  lydian: 'Lydian’s raised 4th sounds bright and floating',
  mixolydian: 'Mixolydian is major with a bluesy ♭7',
  locrian: 'Locrian has no stable home chord — tense and unsettled',
  harmonicMinor: 'harmonic minor adds a dramatic leading tone',
  melodicMinor: 'melodic minor is smooth, jazzy minor',
  phrygianDominant: 'Phrygian dominant’s ♭2 over a major 3rd sounds Spanish / Middle-Eastern',
  lydianDominant: 'Lydian dominant is bright and bluesy at once',
};

/** Check key + mode against a style and tuning; never blocks anything, only explains. */
export function coherence(styleId: string | null | undefined, k: Key, t: Tuning): Coherence | null {
  const prof = styleProfile(styleId);
  const style = styleId ? STYLE_BY_ID[styleId] : undefined;
  const tonicPc = pc(k.tonic);
  const tonicTxt = pretty(noteName(k.tonic));
  const tTonics = tuningTonics(t);
  const onOpen = t.kind !== 'standard' && tTonics.includes(tonicPc);
  const tName = t.name.replace(/^.* — /, '');
  const tuningBit = onOpen
    ? (t.kind === 'open' && openChordRoot(t) === tonicPc ? `strumming the open strings of ${tName} already plays the home chord` : `the open low ${tonicTxt} string in ${tName} is home, so riffs can pound it without fretting`)
    : t.kind === 'standard' && (tonicPc === 4 || tonicPc === 9) ? `in standard tuning the open low ${tonicTxt} string is home` : '';
  if (!prof || !style) {
    if (!tuningBit) return null;
    return { modeFit: 'typical', tonicFit: onOpen ? 'typical' : 'sometimes', note: null, why: `${keyName(k)}: ${tuningBit}.` };
  }
  const rank = prof.modes.indexOf(k.mode);
  const modeFit: Fitness = rank === 0 || rank === 1 ? 'typical' : rank > 1 ? 'sometimes' : 'unusual';
  const closestMode = modeFit === 'unusual'
    ? [...prof.modes].sort((a, b) => modeDistance(k.mode, a) - modeDistance(k.mode, b) || prof.modes.indexOf(a) - prof.modes.indexOf(b))[0]
    : undefined;
  const wantTonics = prof.tonics === 'low' ? [lowNote(t)] : prof.tonics.map((n) => pc(parseNote(n)!));
  const tonicFit: Fitness = wantTonics.includes(tonicPc) ? 'typical' : (onOpen ? 'sometimes' : 'unusual');
  const notes: string[] = [];
  if (closestMode) notes.push(`${style.name} rarely uses ${modeShort(k.mode)}; closest fit: ${modeShort(closestMode)}`);
  if (tonicFit === 'unusual') {
    const want = pretty(tonicName(wantTonics[0]!, k.mode));
    notes.push(prof.tonics === 'low'
      ? `${style.name} usually sits on the tuning’s open low string (${want} in ${tName}) — ${tonicTxt} works, without the open-string drone`
      : `${style.name} is most often in ${prof.tonics.slice(0, 3).map(pretty).join(', ')} — ${tonicTxt} works too`);
  }
  const usual = rank === 0 ? `${style.name}’s most typical mode` : rank > 0 ? `a mode ${style.name} uses` : 'unusual for this style, but it still works';
  const why = `${tonicTxt} ${modeShort(k.mode)}${t.kind !== 'standard' ? ` in ${tName}` : ''}: ${MODE_FEEL[k.mode]} (${usual})${tuningBit ? `; ${tuningBit}` : ''}.`;
  return { modeFit, tonicFit, note: notes.length ? notes.join('. ') + '.' : null, closestMode, why };
}

export const PROFILED_STYLES = (): MusicStyle[] => STYLES.filter((s) => STYLE_PROFILES[s.id]);
