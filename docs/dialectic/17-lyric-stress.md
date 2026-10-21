# 17 · Lyric stress fitter

## Thesis
Type a line; Muse places its stressed syllables on strong beats.

## Critique
- **Educator:**
  - Stress-on-strong-beat ("prosody") is the most common beginner mistake (Pattison's *Writing Better Lyrics*).
  - Automatic syllable stress in English is hard. A dictionary such as CMUdict is about 3 MB, which is too big for an offline PWA.
  - A heuristic with a small exception list is honest if Muse lets you tap a syllable to flip its stress.
- **UX:**
  - Show the line as syllables on a beat grid, with stressed syllables in bold.
  - Mark any stressed syllable on a weak beat in amber, with a one-line fix.
- **Mobile:** a 4-beat grid per bar, wrapping. Tap to toggle stress.

## Synthesis
- **Lyrics tab:** `syllabify()` + `guessStress()`:
  - About 150 common function words are unstressed.
  - Suffix rules: -tion/-sion → the syllable before; -ly/-ness/-ing/-ed unstressed.
  - Otherwise the first syllable of 2-syllable nouns is stressed.
- **Fitting:** `fitStress()` places syllables on 8th-note slots so stresses land on beats 1 and 3 (or 1 in 3/4), with up to two weak syllables between.
- **Display:** the grid, plus amber marks if a stress still falls weak, and "Hear the rhythm" (sung on chord tones of your bars).
- **Editing:** tap any syllable to flip its stress; the fit recomputes.

## Post-build review (Playwright at 390px and 1280px; screenshots in /workspace/audit/wave-3/)
- **Found:**
  - "Tonight" was stressed on "To".
  - Lines starting with weak words wasted the downbeat.
  - The warning said "stressed syllable off the beat" even when the amber cell was a weak syllable on a strong beat.
- **Fixed:**
  - Added the to- prefix rule.
  - Leading weak syllables become a pickup ("I | WANT to HOLD your HAND" now has 0 clashes; unit test added).
  - The warning now covers both cases in plain words.
- **Limitation (stated in the UI):** stress is a guess; tap a syllable to flip it.
