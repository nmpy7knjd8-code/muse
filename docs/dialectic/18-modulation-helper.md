# 18 · Modulation helper

## Thesis
Pick a target key for the last chorus; Muse offers 2–3 pivot routes there.

## Critique
- **Educator:**
  - Name the three classic routes plainly:
    - **Shared chord (pivot):** smoothest.
    - **Its own 5 chord (dominant):** clear.
    - **Just jump (truck-driver):** blunt; the pop "lift" up a half or whole step.
  - The common pop lift is +1 or +2 semitones. Suggest those first, plus the relative and the 4th or 5th.
- **Coherence:**
  - The target key keeps your mode.
  - The guitar tuning's friendly keys get a dot (Drop D → D).
  - Changing key must update the top bar after you commit, otherwise every other tool stays stale.
- **UX:** "Add to end" appends the route and the new home. "Use" should also set the key, or highlighting breaks. Make that one action.

## Synthesis
- **Key change tab:** target chips are +1, +2, a 4th, a 5th and the relative key, each tagged with a plain phrase ("classic last-chorus lift"). Tuning-friendly keys get a dot.
- **Routes:** up to 3 from `modulationRoutes()`: pivot (when a shared chord exists), dominant, and truck-driver.
- **Actions:** each route has Hear (your last bar → route → new home) and "Add to end & switch key". That appends the chords and sets the key, with undo.

## Post-build review (Playwright at 390px and 1280px; screenshots in /workspace/audit/wave-3/)
- **Checked:**
  - From C: targets D♭ / D / F / G / A. D is dotted when the tuning is Drop D (unit test).
  - C → D♭ has no shared chord, so only the dominant (A♭7 → D♭) and jump routes are shown. No fake pivot is offered.
  - "Add to end & switch key" appended A♭7 D♭ and set the top-bar key to D♭ in one action, with undo.
