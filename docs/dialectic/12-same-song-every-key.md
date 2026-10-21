# 12 · Same song, every key

## Thesis
Slide the key; hear that your song keeps its feel. Numerals are shown next to letters.

## Critique
- **Educator:**
  - This is the core of relative pitch: keys change the letters, not the relationships. But pitch height *does* change the feel slightly (lower = darker). Be honest about it.
  - Guitar reality: some keys are much easier in a given tuning. Tie the slide to the tuning's friendly keys (coherence model).
- **UX:**
  - Sliding must not change the real song until you ask. Preview first, then "Move my song here" (with undo).
  - The top-bar key must update when you commit.
- **Mobile:** use a 12-button key ring rather than a fiddly slider.

## Synthesis
- **"Key slide" tab:** shows your bars (or the style loop) as letters with the numerals underneath.
- **Choosing a key:** tap one of 12 keys to transpose the preview and hear it. Letters change; numerals stay the same.
- **Tuning tags:** keys that suit your tuning (`tuningTonics`) get an "easy on guitar" dot. The current key is marked.
- **Commit:** "Move my song to G" transposes the bars and sets the key (undo-able).
- **Copy:** "The letters change, the relationships don't — that's why it still sounds like your song (just higher or lower)."

## Post-build review (Playwright at 390px and 1280px; screenshots in /workspace/audit/wave-2/)
- **Checked:**
  - Tapping G plays and shows G D Em over I V vi; the numerals are unchanged.
  - "Move my song to G" transposed the real bars (G | D | Em) and set the key to G, with undo.
  - Keys that suit the tuning get an amber dot, with a legend.
- **Critique:** the move button only appears for your own bars. A style fallback loop has nothing to move.
  - **Intended**, and the note explains the source.
