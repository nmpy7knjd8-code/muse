# 16 · Hook builder

## Thesis
Muse proposes 2-bar motifs over your loop, which you vary by repeating, moving or flipping them.

## Critique
- **Educator:**
  - Repetition with variation is the core of hooks (Pattison; Hooktheory's analyses of chorus melodies). Proposals should be built from chord tones on strong beats with passing tones between, so they fit the harmony.
  - "Flip" (inversion) is abstract. Label each variation by what it does ("answer it a step higher").
- **UX:**
  - Generated melodies must go into the existing melody lane. They can't live only in the tool.
  - It must keep your chords, and undo must work.
- **Mobile:** show 3 proposals as cards with Hear and Use.

## Synthesis
- **Hooks tab:** 3 seed motifs from `makeHooks()`: rhythm cells (straight, syncopated, long-short) with chord tones on downbeats.
- **Variations per seed:** "Repeat", "Answer a step higher" (sequence), "Turn it upside down" (inversion), "Shift the rhythm".
- **Actions:** each card has Hear (over your first 2 bars) and "Put in bars 1–2". The latter uses `useBars`, keeps your chords and is undo-able.

## Post-build review (Playwright at 390px and 1280px; screenshots in /workspace/audit/wave-3/)
- **Found (serious):** "Put in bars 1–2" built bars from `gymLoop`. After a key change made the bars look out of key, it replaced the whole song with a reggae style loop.
- **Fixed:**
  - Hooks now use *your* chords whenever you have 2 or more bars.
  - Putting a hook rewrites only bars 1–2's melody and keeps every other bar's chords and melody.
  - Verified: bars stayed C | G | Am | F | A♭7 | D♭.
