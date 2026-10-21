# 5 · Practise in groups first, then mixed

## Thesis
New learners drill one group of scale degrees at a time (1-3-5, then 2-7, then 4-6) before random mixes (Moloney 2004).

## Critique
- **Educator:**
  - Moloney found blocked practice better *during* training, and *equal* on random transfer. So blocked is a ramp, not the destination; the final stage must be mixed.
  - Interleaving research (Rohrer, Taylor) favours mixing once items are distinguishable.
  - Always include 1 in every group, so there's an anchor to compare against.
- **UX:**
  - Forced locking frustrates people who already have an ear. Let stages be picked freely, with a suggested next stage.
- **Mobile:** show stages as a compact segmented row, not a list.

## Synthesis
- **Stages:** "Start: 1·3·5" → "2·7" → "4·6" → "Mix all". Each stage's pool includes 1.
- **Suggestions:** reaching 8 of the last 10 right shows "Ready for the next group →". All stages stay tappable; the suggested one has a dot.
- **Shared engine:** Sing it (#6) uses the same stages.

## Post-build review (local + live Playwright, 390px and 1280px; screenshots in /workspace/audit/wave-1/)
- **Checked:**
  - The suggested stage starts at 1·3·5.
  - After 8 of the last 10 right (unit test), it suggests 2·7, shown with an underline and a "Ready for the next group → try it" link.
  - All stages stay tappable.
