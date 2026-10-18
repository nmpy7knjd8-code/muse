// Shared contract between App and the lazy-loaded tool pages in the drawer.
import type { ArtistsFile, Chord, Key, MoodLexicon, MoodProfile, SuggestionEngine, TensionStyleId, TimelineSlot, TimeSig } from '../../core';

export type ToolId =
  | 'arc' | 'ear' | 'song' | 'hum' | 'cadence' | 'sections' | 'blend' | 'taste' | 'practice' | 'release';

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
}
