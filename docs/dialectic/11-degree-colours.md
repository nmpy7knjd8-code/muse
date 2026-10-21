# 11 · Scale-degree colours everywhere

## Thesis
A toggle colours every chord and note by its scale step, consistently across the app.

## Critique
- **UX and design:**
  - The app already uses colour for mood (chips) and tension (bars), and Garrett asked for no neutral-colour pass. A third full-chip colour system would fight both and change the look he likes.
  - Recolouring everything is invasive.
- **Educator:** Hooktheory's colour-per-function does help. The value is consistency (1 is always the same colour), and it applies to numerals, not letters.
- **Accessibility:** colour alone fails for colour-blind users. Keep the numeral text.

## Synthesis
- **Toggle:** "Colour by step", off by default, in Lessons (and remembered).
- **When on:** only the Roman numeral line under each bar and the Ear gym answer buttons get a step colour (1 = home violet … 5 = gold), with a matching small dot. Chip backgrounds, mood colours and the layout are untouched.
- **Colour logic:** colours come from the chord root's scale step in the current key and mode. Out-of-key roots get a neutral grey ring.

## Post-build review (Playwright at 390px and 1280px; screenshots in /workspace/audit/wave-2/)
- **Checked:** with the toggle on, the numerals under the bars are I (violet), V (gold), vi (orange), each with a dot. Chip backgrounds and mood colours are unchanged. Ear gym answer buttons use the same colours.
- **Critique:** a grey ring for out-of-key roots may be too subtle.
  - **Kept:** the numeral text still carries the meaning (♭VII etc.).
