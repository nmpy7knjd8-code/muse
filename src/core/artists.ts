// Artist Lens data (research/artists/artists.json): types, tolerant normalisation, and the "Try it"
// loader that turns an exercise's roman numerals (+ pedal/held bass) into chords in its key.
import { Chord, chordSymbol } from './chords';
import { parseMeter, TimeSig, timeSigLabel } from './meter';
import { parseDegreeLabel, parseNote, pc } from './notes';
import { parseRoman } from './roman';
import { Key, MODE_BY_ID, ModeId, spellInKey } from './scales';

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface ArtistKbRef { kind: 'chordMove' | 'melodicMove' | 'mode' | 'progression'; id: string }
export interface ArtistSource { id: string; title: string; url: string; type?: string; note?: string }
export interface ArtistTechnique {
  id: string; category: string; name: string; description: string; kbRefs: ArtistKbRef[]; moods: string[];
  evidence: string; sourceIds: string[]; tryInMuse?: string; polarities?: string[];
}
export interface ArtistWork { title: string; year?: number; release?: string; whatHappens: string; whyItFeels: string; techniqueIds: string[]; moods: string[]; listenFor: string[]; sourceIds: string[]; evidence?: string }
export interface ArtistTryIt {
  label: string; key: { tonic: string; mode: string }; roman: string[]; meter?: string; bassPedal?: string;
  pedal?: { degree: string; chordIndices: number[] }; melodyDegrees?: string[]; howToPlay?: string; moods: string[];
  kbRefs: ArtistKbRef[]; techniqueIds: string[]; original?: boolean;
}
export interface Artist {
  id: string; name: string; era?: string; origin?: string; genres: string[]; documentation?: string; hook: string; aestheticSummary: string;
  polarities: Array<{ id: string; how: string }>; techniques: ArtistTechnique[]; works: ArtistWork[];
  moodProfile: Array<{ mood: string; weight: number }>; tryIt: ArtistTryIt[]; listeningGuide: Array<{ step: number; title: string; what: string }>;
  relatedArtists: string[]; notes?: string[]; sources: ArtistSource[];
}
export interface ArtistsFile {
  meta: { title?: string; version?: string; tryItPolicy?: string; evidenceLevels: Record<string, string>; techniqueCategories?: string[] };
  polarities: Array<{ id: string; label: string; poles: [string, string] }>;
  artists: Artist[];
  techniqueChipIndex: Record<string, Array<{ artistId: string; techniqueId: string; name: string }>>;
}

const arr = (v: Json): Json[] => (Array.isArray(v) ? v : []);
const strs = (v: Json): string[] => arr(v).filter((x) => typeof x === 'string');
const str = (v: Json): string => (typeof v === 'string' ? v : '');

export function normalizeArtists(raw: Json): ArtistsFile | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.artists)) return null;
  const refs = (v: Json): ArtistKbRef[] => arr(v).filter((r) => r && typeof r.id === 'string' && typeof r.kind === 'string');
  const artists: Artist[] = raw.artists.filter((a: Json) => a && a.id && a.name).map((a: Json) => ({
    id: str(a.id), name: str(a.name), era: str(a.era), origin: str(a.origin), genres: strs(a.genres), documentation: str(a.documentation),
    hook: str(a.hook), aestheticSummary: str(a.aestheticSummary),
    polarities: arr(a.polarities).filter((p) => p && p.id).map((p) => ({ id: str(p.id), how: str(p.how) })),
    techniques: arr(a.techniques).filter((t) => t && t.id).map((t) => ({
      id: str(t.id), category: str(t.category) || 'other', name: str(t.name), description: str(t.description), kbRefs: refs(t.kbRefs),
      moods: strs(t.moods), evidence: str(t.evidence), sourceIds: strs(t.sourceIds), tryInMuse: t.tryInMuse ? str(t.tryInMuse) : undefined, polarities: strs(t.polarities),
    })),
    works: arr(a.works).filter((w) => w && w.title).map((w) => ({
      title: str(w.title), year: typeof w.year === 'number' ? w.year : undefined, release: str(w.release), whatHappens: str(w.whatHappens), whyItFeels: str(w.whyItFeels),
      techniqueIds: strs(w.techniqueIds), moods: strs(w.moods), listenFor: strs(w.listenFor), sourceIds: strs(w.sourceIds), evidence: str(w.evidence),
    })),
    moodProfile: arr(a.moodProfile).filter((m) => m && m.mood).map((m) => ({ mood: str(m.mood), weight: typeof m.weight === 'number' ? m.weight : 0.5 })),
    tryIt: arr(a.tryIt).filter((t) => t && t.key && Array.isArray(t.roman)).map((t) => ({
      label: str(t.label), key: { tonic: str(t.key.tonic), mode: str(t.key.mode) }, roman: strs(t.roman), meter: t.meter ? str(t.meter) : undefined,
      bassPedal: t.bassPedal ? str(t.bassPedal) : undefined,
      pedal: t.pedal && typeof t.pedal.degree === 'string' ? { degree: str(t.pedal.degree), chordIndices: arr(t.pedal.chordIndices).filter((i) => Number.isInteger(i)) } : undefined,
      melodyDegrees: t.melodyDegrees ? strs(t.melodyDegrees) : undefined, howToPlay: t.howToPlay ? str(t.howToPlay) : undefined,
      moods: strs(t.moods), kbRefs: refs(t.kbRefs), techniqueIds: strs(t.techniqueIds), original: t.original !== false,
    })),
    listeningGuide: arr(a.listeningGuide).filter((g) => g && g.title).map((g, i) => ({ step: typeof g.step === 'number' ? g.step : i + 1, title: str(g.title), what: str(g.what) })),
    relatedArtists: strs(a.relatedArtists), notes: strs(a.notes),
    sources: arr(a.sources).filter((s) => s && s.id).map((s) => ({ id: str(s.id), title: str(s.title), url: str(s.url), type: str(s.type), note: s.note ? str(s.note) : undefined })),
  }));
  return {
    meta: { title: str(raw.meta?.title), version: str(raw.meta?.version), tryItPolicy: str(raw.meta?.tryItPolicy), evidenceLevels: raw.meta?.evidenceLevels ?? {}, techniqueCategories: strs(raw.meta?.techniqueCategories) },
    polarities: arr(raw.polarities).filter((p) => p && p.id).map((p) => ({ id: str(p.id), label: str(p.label), poles: [str(p.poles?.[0]), str(p.poles?.[1])] as [string, string] })),
    artists,
    techniqueChipIndex: raw.techniqueChipIndex && typeof raw.techniqueChipIndex === 'object' ? raw.techniqueChipIndex : {},
  };
}

export interface LoadedTryIt {
  key: Key; tonic: string; mode: ModeId; chords: Chord[]; failed: string[];
  /** Parsed from the exercise meter string when possible (first N/D found). */
  timeSig: TimeSig | null;
  /** Original free-text meter note from the research data. */
  meterNote?: string;
}

/** The key of an exercise (tonic spelling preserved; unknown modes fall back to the major/minor family). */
export function tryItKey(t: ArtistTryIt): { key: Key; tonic: string; mode: ModeId } | null {
  const mode = (t.key.mode in MODE_BY_ID ? t.key.mode : /min|aeol/i.test(t.key.mode) ? 'minor' : 'major') as ModeId;
  const tonic = parseNote(t.key.tonic);
  return tonic ? { key: { tonic, mode }, tonic: t.key.tonic, mode } : null;
}

/** Roman numerals → chords; the pedal (held bass) degree becomes the bass of the listed chords. */
export function loadTryIt(t: ArtistTryIt): LoadedTryIt | null {
  const kk = tryItKey(t);
  if (!kk) return null;
  const { key: k } = kk;
  const failed: string[] = [];
  const pedalOff = t.pedal ? parseDegreeLabel(t.pedal.degree) : null;
  const pedalNote = pedalOff !== null ? spellInKey(k, pc(k.tonic) + pedalOff) : null;
  const chords: Chord[] = [];
  t.roman.forEach((r, i) => {
    const c = parseRoman(r, k);
    if (!c) { failed.push(r); return; }
    if (pedalNote && t.pedal!.chordIndices.includes(i) && pc(pedalNote) !== pc(c.root)) chords.push({ ...c, bass: pedalNote });
    else chords.push(c);
  });
  return {
    ...kk,
    chords,
    failed,
    timeSig: parseMeter(t.meter),
    meterNote: t.meter,
  };
}

export const tryItText = (l: LoadedTryIt) => {
  const chords = l.chords.map((c) => chordSymbol(c, true)).join(' – ');
  const meter = l.timeSig ? timeSigLabel(l.timeSig) : l.meterNote;
  return meter ? `${chords} · ${meter}` : chords;
};
