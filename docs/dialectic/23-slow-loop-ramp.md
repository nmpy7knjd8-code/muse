# 23 · Slow-down and loop practice (auto tempo ramp)

## Thesis
Loop chosen bars at a lower tempo, with speed rising automatically as you score well.

## Critique
- **Existing app:** Play-along already has Slow/Steady/Full speeds and repeats. A new tool would duplicate it. **Extend Play-along instead.**
- **Educator:**
  - "Slow practice + gradual tempo increase" is standard (deliberate practice; metronome laddering).
  - The ramp should respond to accuracy: up when ≥80% chord tones, down when <50%. Without the mic, step up after each clean run, self-reported.
  - Small steps (~5%) beat jumps (0.5 → 0.75).
- **UX:**
  - Changing tempo *within* a run is disorienting and complicates the schedule. Ramp *between* runs, with "Again at 70%".
  - Picking a bar range (loop the hard bit) is essential, as Chordify Premium does.
- **Mobile:** use a range of chips (tap start, tap end), not two selects.

## Synthesis
- **In Play-along:**
  - "Loop bars" range: tap a chip to start the range, tap another to end it.
  - Continuous speed with Slow/Steady/Full presets and a "–5% / +5%" nudge; the speed is shown as a percentage, which is a tempo, not a score.
  - "Speed up as I nail it" toggle: after each run, `nextTempo()` adjusts by ±5% using the score (or +5% if the mic is off), then shows "Again at N%".

## Post-build review (Playwright at 390px and 1280px; screenshots in /workspace/audit/wave-4/)
- **Checked:**
  - Tapping chip 2 then chip 3 gives "Looping bars 2–3 · Loop all".
  - −5%/+5% nudges work (80% → 90%). With ramp on and the mic off, one run ends with "Nice — next run at 95%", and the tempo moves to 95%.
- **Found:** out-of-range chips were dimmed, but the chosen range wasn't highlighted.
  - **Fixed:** in-range chips get the accent outline until a scored run recolours them.
