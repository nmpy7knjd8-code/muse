# 15 · Rhythm and strum patterns

## Thesis
Pick a style's strum or comping rhythm and hear it under your chords.

## Critique
- **Educator:**
  - Rhythm is what most defines genre for beginners (Yousician and Chordify both teach strums first).
  - Patterns must match the time signature: a 4/4 strum in 3/4 is wrong.
  - Show the pattern as a visual of down/up arrows on beat slots, because that's how guitar teachers notate strums.
- **Coherence:** the Style picker already exists. Preselect that style's typical feel:
  - TOOL: palm-muted 8ths
  - reggae: offbeat skank
  - folk: D-DU-UDU
  - funk: 16ths
  - ballads: arpeggio
- **UX:** this is a preview of feel. It shouldn't silently change the session's drum groove or playback.

## Synthesis
- **Strum tab:** about 8 patterns, each with strokes per pulse (D/U/accent/rest), the time signatures it fits, and the styles it suits. A pattern is suggested for the current Style and time signature.
- **Display:** a row of arrows (↓ ↑ ·) with accents highlighted. "Hear over my chords" plays your first 4 bars strummed.
- **Tip:** "Muted up-strokes keep your hand moving."

## Post-build review (Playwright at 390px and 1280px; screenshots in /workspace/audit/wave-3/)
- **Checked:**
  - Style = reggae preselects "Reggae skank (suits your style)", shown as · ↑ · ↑ … with beat ticks.
  - TOOL → chug, and 3/4 → waltz (unit tests).
  - "Hear over my chords" plays your first 4 bars.
- **Critique:** the rest dots are small.
  - **Kept:** the copy explains "keep your hand moving… just miss the strings".
