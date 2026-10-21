# 7 · Bass-line detective

## Thesis
Muse plays a progression; you pick each bar's bass note as a scale step.

## Critique
- **Educator:**
  - Beginners hear the top voice, not the bass. The bass must be *exposed*: play the bass note alone first, then the chord ("bass, then full").
  - Restrict choices to the steps that occur in the progression plus one distractor.
  - Tie it to tuning: in Drop D, or with a style whose tonic is the low string (TOOL), the bass on the open low string *is* home. Say so.
- **UX:**
  - Asking every bar in sequence is long. Ask 2 bars per round (the adaptive engine picks them).
- **Mobile:** fine if the choices are a single row of 4.

## Synthesis
- **Tab "Bass":** uses your bars or your Style progression, like "Name it". Playback is bass alone then full, low register, using the current guitar tuning's lowest string as the floor.
- **Questions:** 2 bars per round; choices are the progression's bass steps plus one distractor, with feel words.
- **Tuning note:** when the bass is on the tuning's open low string, the reveal says "That's your open low D string — home in Drop D."

## Post-build review (local + live Playwright, 390px and 1280px; screenshots in /workspace/audit/wave-1/)
- **Checked with TOOL → Apply (D minor, Drop D):**
  - Two bars are asked, and the choices carry feel words.
  - The reveal adds "That bass is your open low string in TOOL — Drop D — home, so it can just ring."
  - The bass register uses the tuning's low string (`bassMidiFor`: Dm → MIDI 38 in Drop D).
- **Critique:** the result lines are a bit dense on mobile.
  - **Accepted:** they are short, and each bar gets its own line.
