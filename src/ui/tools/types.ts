// Shared contract between App and the lazy-loaded tool pages in the drawer.
import type { Tuning, BeatNote, TasteState, ArtistsFile, Chord, Key, MoodLexicon, MoodProfile, SuggestionEngine, TensionStyleId, TimelineSlot, TimeSig } from '../../core';

export type ToolId =
  | 'arc' | 'ear' | 'song' | 'hum' | 'cadence' | 'sections' | 'blend' | 'taste' | 'practice' | 'release' | 'gym' | 'lessons' | 'helpers' | 'songs' | 'tuner' | 'progress';

export interface ToolProps {
  engine: SuggestionEngine;
  k: Key;
  lex: MoodLexicon;
  chords: Chord[];
  slots: TimelineSlot[];
  artists: ArtistsFile | null;
  profile: MoodProfile | null;
  adventure: number;
  tStyle: TensionStyleId;
  /** Current Style (null = any) and guitar tuning — tools must stay coherent with them. */
  styleId: string | null;
  /** Colour-by-step toggle (#11). */
  degColors: boolean;
  setDegColors: (on: boolean) => void;
  /** Transpose the whole song (chords, melody, bass) to this tonic and set the key (#12). */
  transposeSong: (tonic: string) => void;
  tuning: Tuning;
  beatSec: number;
  timeSig: TimeSig;
  /** Audition one chord (preview voice — never silences ▶ Play). */
  playChord: (c: Chord) => void;
  /** Audition a short sequence, `step` seconds per chord. */
  playChords: (cs: Chord[], step?: number) => void;
  /** Replace the timeline with these chords (locked bars stay; undo available). */
  useChords: (cs: Chord[], label: string) => void;
  /** Append these chords after the current bars. */
  appendChords: (cs: Chord[], label: string) => void;
  /** Switch the session key (used by Song analysis when loading a song). */
  setKey: (tonic: string, mode: Key['mode']) => void;
  flash: (msg: string) => void;
  close: () => void;
  openTool: (id: ToolId) => void;
  /** Timeline melody as absolute beats (bar i starts at i * beatsPerBar). */
  melody: BeatNote[];
  /** Replace the timeline with chords + optional melody per bar (beats relative to the bar). */
  useBars: (bars: Array<{ chord: Chord; notes?: BeatNote[] }>, label: string) => void;
  /** Low-level scheduling for tools that play in time (hum, practice). Times are seconds after `origin`. */
  audio: {
    origin: () => number;
    now: () => number | null;
    chord: (c: Chord, at: number, dur: number, origin?: number) => void;
    note: (midi: number, at: number, dur: number, origin?: number) => void;
    click: (at: number, accent: boolean, origin?: number) => void;
    stop: () => void;
    isPlaying: () => boolean;
  };
  /** Taste learning state (thumbs on suggestion cards). */
  taste: TasteState;
  tasteOn: boolean;
  setTasteOn: (on: boolean) => void;
  resetTaste: () => void;
  /** Open Artist Lens focused on one artist. */
  openArtist: (id: string) => void;
}
