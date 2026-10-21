# 21 · Find songs by chords you know

## Thesis
List songs (from the Artist Lens data) that use chords or a progression you've saved.

## Critique
- **Data:** Artist Lens has 23 "Try it" *technique* sketches, not songs with chords. Building on it would be dishonest.
  - Chordify's version works because it has a 36M-song catalogue built by audio analysis. That isn't feasible offline, and scraping chord sites isn't OK (licensing, untrusted data).
  - **Closest feasible version:** a small curated offline catalogue of famous songs' *progressions*. Chord progressions aren't copyrightable, and these are widely documented (Hooktheory TheoryTab stats, songbooks). Each entry is stored as Roman numerals plus original key, marked "simplified".
- **Educator:**
  - Matching must be key-independent: your I–V–vi–IV in E matches "Let It Be" in C. That relative view is the lesson ("same 4 chords as 20 hits").
  - Separately, "you can already play" = every chord shape the song needs is in your bars.
- **Coherence:** show each song realised in *your* key, with an "easy in your tuning" hint where the original key is tuning-friendly.
- **UX:** catalogue size will be modest (~30). Say so; don't pretend it's comprehensive.

## Synthesis
- **"Songs like yours" tool** (Tools group): `songMatches(chords, key)` ranks the catalogue:
  - **Same progression:** your loop contains the song's numerals in order, in any rotation.
  - **Shares N chords:** at least 3 numerals in common.
- **Each match shows:** the title and artist, the numerals, the chords in your key and in the original key, "Hear in my key", and "Load in my key" (undo-able).
- **Data:** about 30 songs in `src/core/songCatalog.ts`, with the source noted ("commonly documented progression, simplified").

## Post-build review (Playwright at 390px and 1280px; screenshots in /workspace/audit/wave-4/)
- **Checked:**
  - Bars E B C♯m A in E list Let It Be, Don't Stop Believin', With or Without You… as "Same progression", each shown in your key, with the original key and "easy in your tuning" where it applies.
  - "Load in my key" replaced the bars (with undo).
- **Found:** the "original" line compared a string to a note object, so it always showed even when the original key was the same as yours.
  - **Fixed:** it now compares pitch classes.
- **Honest scope:** the catalogue size and simplification are stated in the intro.
