# 4 · Adaptive difficulty with spaced review

## Thesis
Every game keeps a chess-style skill rating (as in Chord Crush) and re-serves misses on a schedule: tomorrow, then 3 days, then a week.

## Critique
- **Educator:**
  - A rating is opaque to a beginner and rating numbers clash with Garrett's number-free design.
  - Spaced repetition works (Hua 2015, Memphis: spacing helps interval learning, more for larger intervals). But the unit must be the *item* (e.g. "♭6 in minor", "vi↔IV swap"), not the game.
  - Pure review queues can starve new material: mix due items with new ones.
- **UX:**
  - Show progress as words and number-free bars, consistent with the polarity bars.
  - Storage must be local (offline) and resettable.
- **Mobile:** add no settings; it should just work.

## Synthesis
- **Engine:** `earGym.ts` uses Leitner boxes per item, with review gaps of 0 · 10 min · 1 d · 3 d · 7 d · 21 d.
  - A miss sends the item back to box 1.
  - Selection takes a due item about 40% of the time, otherwise the weakest or a new item from the current stage.
- **Level:** recent accuracy over the last 10 answers per game picks easy or close questions (no rating numbers shown).
- **UI:**
  - "Due for review: N" appears as a soft chip. The one count shown is a count, not a score.
  - Each game gets a number-free bar: "learning → solid".
  - A Reset button is included.
- **Storage:** `localStorage` key `muse.gym`.

## Post-build review (local + live Playwright, 390px and 1280px; screenshots in /workspace/audit/wave-1/)
- **Checked:**
  - After one round per game, `muse.gym` holds per-item ids (degree:major:3, swap:♭III>♭VII, name:minor:♭VI, bass:minor:b6, sing:minor:b3).
  - The 'This game' bar moves.
  - Reset clears everything.
- **Critique:** "Due for review: N" only appears after 10 minutes, so it's invisible in a first session.
  - **Accepted as intended:** due items surface quietly about 40% of the time.
