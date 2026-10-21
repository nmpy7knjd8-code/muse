// Songs like yours (idea 21): a small curated OFFLINE catalogue of famous songs' chord progressions,
// stored as Roman numerals + original key. Progressions are not copyrightable and these are widely
// documented (Hooktheory TheoryTab, songbooks); each is SIMPLIFIED to its main loop.
// Matching is key-independent (relative), see docs/dialectic/21.
import { Chord, chordSymbol } from './chords';
import { key as mkKey, type Key, type ModeId } from './scales';
import { parseRoman, romanOf } from './roman';
import { pc, parseNote } from './notes';
import { tuningTonics } from './styleProfiles';
import type { Tuning } from './tunings';

export interface CatalogSong { title: string; artist: string; key: string; mode: ModeId; roman: string[]; part: string }
const S = (title: string, artist: string, k: string, mode: ModeId, roman: string, part = 'main loop'): CatalogSong => ({ title, artist, key: k, mode, roman: roman.split(' '), part });
export const SONG_CATALOG: CatalogSong[] = [
  S('Let It Be', 'The Beatles', 'C', 'major', 'I V vi IV', 'verse'),
  S('Don’t Stop Believin’', 'Journey', 'E', 'major', 'I V vi IV', 'verse'),
  S('With or Without You', 'U2', 'D', 'major', 'I V vi IV'),
  S('No Woman, No Cry', 'Bob Marley', 'C', 'major', 'I V vi IV'),
  S('Someone Like You', 'Adele', 'A', 'major', 'I V vi IV', 'verse'),
  S('Despacito', 'Luis Fonsi', 'D', 'major', 'vi IV I V'),
  S('Zombie', 'The Cranberries', 'E', 'minor', 'i bVI bIII bVII'),
  S('Stand by Me', 'Ben E. King', 'A', 'major', 'I vi IV V'),
  S('Every Breath You Take', 'The Police', 'A', 'major', 'I vi IV V', 'verse'),
  S('Hallelujah', 'Leonard Cohen', 'C', 'major', 'I vi I vi IV V', 'verse'),
  S('Knockin’ on Heaven’s Door', 'Bob Dylan', 'G', 'major', 'I V ii I V IV'),
  S('Wish You Were Here', 'Pink Floyd', 'G', 'major', 'IV V ii I', 'verse'),
  S('Sweet Home Alabama', 'Lynyrd Skynyrd', 'D', 'mixolydian', 'I bVII IV'),
  S('Sweet Child O’ Mine', 'Guns N’ Roses', 'D', 'mixolydian', 'I bVII IV I', 'verse'),
  S('Back in Black', 'AC/DC', 'E', 'mixolydian', 'I bVII IV', 'riff'),
  S('Hey Joe', 'Jimi Hendrix', 'E', 'major', 'bVI bIII bVII IV I'),
  S('All Along the Watchtower', 'Jimi Hendrix', 'C#', 'minor', 'i bVII bVI bVII'),
  S('Smells Like Teen Spirit', 'Nirvana', 'F', 'minor', 'i iv bIII bVI'),
  S('Mad World', 'Tears for Fears', 'F', 'minor', 'i bIII bVII IV', 'verse'),
  S('Sultans of Swing', 'Dire Straits', 'D', 'minor', 'i bVII bVI V', 'verse'),
  S('Hotel California', 'Eagles', 'B', 'minor', 'i V bVII IV bIII bVI iv V', 'verse'),
  S('Get Lucky', 'Daft Punk', 'A', 'major', 'ii IV vi V'),
  S('Creep', 'Radiohead', 'G', 'major', 'I III IV iv'),
  S('Riptide', 'Vance Joy', 'C', 'major', 'vi V I'),
  S('Brown Eyed Girl', 'Van Morrison', 'G', 'major', 'I IV I V'),
  S('Twist and Shout', 'The Beatles', 'D', 'major', 'I IV V V'),
  S('La Bamba', 'Ritchie Valens', 'C', 'major', 'I IV V IV'),
  S('Blowin’ in the Wind', 'Bob Dylan', 'D', 'major', 'IV V I vi', 'verse'),
  S('Hey Jude', 'The Beatles', 'F', 'major', 'I V V7 I IV I V I', 'verse'),
  S('Canon in D', 'Pachelbel', 'D', 'major', 'I V vi iii IV I IV V'),
  S('Paranoid', 'Black Sabbath', 'E', 'minor', 'i bVII bVI i', 'riff (simplified)'),
  S('Wonderwall', 'Oasis', 'F#', 'minor', 'i bIII bVII IV', 'verse (simplified)'),
];

export interface SongMatch { song: CatalogSong; kind: 'same' | 'shares'; shared: string[]; inMyKey: Chord[]; original: Chord[]; easy: boolean }
const norm = (r: string) => r.replace(/♭/g, 'b').replace(/♯/g, '#').replace(/7$/, '');
function numerals(chords: Chord[], k: Key): string[] { return chords.map((c) => norm(romanOf(c, k))); }
function containsRotation(hay: string[], needle: string[]): boolean {
  if (!needle.length || hay.length < needle.length) return false;
  const h = [...hay, ...hay].join(' ');
  const uniq = needle.filter((x, i) => needle.indexOf(x) === i);
  const n = needle.join(' ');
  for (let r = 0; r < needle.length; r++) {
    const rot = [...needle.slice(r), ...needle.slice(0, r)].join(' ');
    if (` ${h} `.includes(` ${rot} `)) return true;
  }
  return uniq.length >= 3 && ` ${h} `.includes(` ${n} `);
}
/** Rank catalogue songs vs your bars (key-independent). Mode family must match for shared-chord matches. */
export function songMatches(chords: Chord[], k: Key, tuning?: Tuning | null): SongMatch[] {
  if (chords.length < 2) return [];
  const mine = numerals(chords, k);
  const set = new Set(mine);
  const easyPcs = tuning ? tuningTonics(tuning).map((x) => ((x % 12) + 12) % 12) : [];
  const out: SongMatch[] = [];
  for (const s of SONG_CATALOG) {
    const sk = mkKey(s.key, s.mode);
    const songNum = s.roman.map(norm);
    const minorish = (r: string) => /^b?[iv]/.test(r) && !/^b?[IV]/.test(r);
    const famMatch = minorish(songNum[0]!) === minorish(mine[0]!) || songNum.some((r) => set.has(r));
    const same = containsRotation(mine, songNum);
    const shared = [...new Set(songNum.filter((r) => set.has(r)))];
    if (!same && (shared.length < 3 || !famMatch)) continue;
    const inMyKey = s.roman.map((r) => parseRoman(r, { ...k, mode: s.mode === 'mixolydian' && k.mode === 'major' ? 'major' : k.mode })).filter(Boolean) as Chord[];
    const original = s.roman.map((r) => parseRoman(r, sk)).filter(Boolean) as Chord[];
    out.push({ song: s, kind: same ? 'same' : 'shares', shared, inMyKey, original, easy: easyPcs.includes(pc(parseNote(s.key)!)) });
  }
  return out.sort((a, b) => Number(b.kind === 'same') - Number(a.kind === 'same') || b.shared.length - a.shared.length);
}
export const songChordText = (cs: Chord[]) => cs.map((c) => chordSymbol(c, true)).join(' ');
