# 13 · Mode morph

## Thesis
A slider morphs your loop from Lydian to Locrian one note at a time, naming the note that changed.

## Critique
- **Educator:**
  - Ordering modes bright→dark (Lydian, Ionian, Mixolydian, Dorian, Aeolian, Phrygian, Locrian) is a recognised teaching device (the "modal brightness" ladder). Neighbours differ by exactly one note, so each step really is one note. Name it ("the 7th dropped").
  - Map chords by scale step (bar on step 4 stays on step 4), so the *same song* is heard in each mode.
  - Locrian makes the home chord diminished. Warn that it rarely feels like home.
- **Coherence:** if a Style is set, show the existing coherence note ("TOOL rarely uses Lydian; closest fit: Dorian").
- **UX:** don't change the session mode until "Use this mode". Use a 7-step segmented row, not a free slider.

## Synthesis
- **"Mode morph" tab:** a 7-step brightness row with your current mode marked.
- **On tap:** your loop is re-realised step-by-step in that mode (same home note) and plays. The panel shows:
  - which note changed versus the previous step ("raise the 4th" / "flatten the 7th")
  - the mode's feel (`MODE_FEEL` from the coherence work)
  - the Style coherence note
- **Commit:** "Use this mode" sets the mode and maps the bars (undo-able).

## Post-build review (Playwright at 390px and 1280px; screenshots in /workspace/audit/wave-2/)
- **Checked:**
  - With TOOL selected, Lydian shows the existing coherence note ("TOOL rarely uses Lydian; closest fit: Dorian…").
  - Dorian → "Use this mode" set the mode and mapped the bars to Gm | Dm | E°.
- **Critique:** the ladder had no visual brighter/darker cue.
  - **Fixed:** added brighter/darker labels.
- **Critique:** step-mapping can produce a diminished chord (Dorian's vi).
  - **Kept:** that's honest. The chord names show it, and you can still edit.
