# 8 · Break it, fix it

## Thesis
Muse gives you a 4-bar progression with something wrong (e.g. an ending that doesn't resolve). You fix it using the full chord palette.

## Critique
- **Educator:**
  - "Something wrong" must be audible, not a rulebook violation. Rock and modal music happily end on ♭VII, so calling that "wrong" contradicts the Style coherence we ship. Frame each puzzle as a *goal* ("make it feel finished"), not an error.
  - Several fixes can be valid. Grade the goal (does it end on home after a strong approach?), not one answer key.
  - A full palette is too many options for a beginner. Offer the key's chords plus 1–2 colour chords.
- **UX:**
  - Edits must stay in a sandbox. Your real bars change only through "Use this", with undo.
  - Every puzzle needs Hear-before and Hear-after.
- **Mobile:** a 4-bar strip plus a chip grid fits in the drawer. Tap a bar, then tap a chord.

## Synthesis
- **Puzzle kinds** (each generated in the current key and mode):
  - **finish:** ends away from home → make it feel finished.
  - **clash:** one out-of-key chord sticks out → make it blend.
  - **stuck:** never leaves home → give it somewhere to go.
  - **lift:** the third bar repeats the first → make the middle lift.
- **Checkers** grade the goal; any valid fix passes.
- **Choices:** the key's chords, without the diminished chord.
- **Feedback:** what changed and why it works, in plain words.
- **Style note:** for styles whose profile is modal (TOOL, Zeppelin…), the finish goal accepts a ♭VII or ♭II approach as well as V. The feedback names the style.

## Post-build review (Playwright at 390px and 1280px; screenshots in /workspace/audit/wave-2/)
- **Checked:** the "Make it feel finished" puzzle in C gave C G Am F. Putting C in bar 4 gave "It ends home, but vi → home is weak. Try the 5 or 4 chord before it." That shows goal-based grading working, not an answer key.
- **Critique:** the puzzle base comes from the style progression, so with Style = Any every puzzle starts from the same loop.
  - **Accepted for now:** four puzzle kinds rotate, and randomness varies the broken bar.
- **Tests:** every puzzle starts unsolved, a sensible fix solves it, and ♭VII→I passes only for modal styles.
