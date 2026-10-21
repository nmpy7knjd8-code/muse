# 2 · Spot the swap

## Thesis
Muse plays your loop, then plays it again with one chord changed. You tap the bar that changed, then pick its replacement from four chords.

## Critique
- **Educator:**
  - Two tasks at once (where, then what) is good scaffolding. But "what" from four chord *names* tests reading, not hearing. Answers should be heard: each option gets a play button.
  - Hooktheory's Chord Crush works because options are relative (functions), not absolute letters.
  - Difficulty should come from how close the swap is. Major↔minor on the same root, or far root motion, is easy. Relatives (vi↔I share two notes) are hard. That's a known confusion pair in harmony-hearing studies.
- **UX:**
  - If the user has 0–1 bars there's nothing to swap. Fall back to a style-coherent progression (the current style's progressions in the current key), not a random one.
  - Locked bars and the user's bars must never be mutated. The game only reads them.
- **Mobile:**
  - Bar buttons for up to 8 bars must wrap; cap the loop at 8 bars.
  - Two full plays is a lot of listening on a phone. Offer "Replay changed" separately.

## Synthesis
- **Source loop:** your first ≤8 bars if there are ≥3; otherwise the top progression for your Style in your key; otherwise I–V–vi–IV.
- **Phase 1:** tap the changed bar. Bars are shown as numbered blocks with Roman numerals (no letters until reveal).
- **Phase 2:** pick the replacement from 3 options, each with its own play button, labelled by numeral.
- **Difficulty:** an adaptive level (#4) picks easy swaps (different chord family or far root) or close swaps (relatives / shared notes).
- **Read-only:** your timeline is never changed. A "Use this version" button appears after the reveal, with undo.

## Post-build review (local + live Playwright, 390px and 1280px; screenshots in /workspace/audit/wave-1/)
- **Found:**
  - The 'My bars' toggle stayed highlighted when the game had fallen back to the style loop, so the toggle misreported the source.
  - The fallback note said "your style" even with Style = Any.
  - A correct chord with the wrong bar was just marked red, with no credit.
- **Fixed:**
  - The toggle now reflects the actual source, and reads 'Common loop' when there is no style.
  - The note names the progression source ("a TOOL progression in your key" / "a common progression").
  - The partial-credit line "(you heard the new chord though!)" was added.
  - The heading now says "Bar 1 stays home" and "Here's what changed" after the reveal.
- **Test added:** the note names the style.
