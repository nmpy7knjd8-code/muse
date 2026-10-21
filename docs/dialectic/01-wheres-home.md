# 1 · Where's home? (scale-degree ear game)

## Thesis
- **What it does:** a new drawer tool. Muse plays a short "home" cadence in the current key and mode (I–IV–V–I, using the key's own diatonic chords), then one note. You tap which of seven buttons it was: 1–7, with plain names ("home", "strong", "leans home"…).
- **Scoring:** a streak counter.
- **Copy:** "Muse sets up home, then plays one note. Which step is it?"

## Critique
- **Educator:**
  - Showing 1–7 to a non-theory user is just numbers; the *feel* is what gets learned. Contextual ear-training research (JMTP, "Contextual Ear Training") ties degree identity to its tendency (2 wants down, 7 wants up). The labels must describe that.
  - In minor or Dorian, "3" is a different note than in major. Using major-relative numbers without saying so breaks the coherence model we just shipped. Label by the actual mode (♭3 in minor) and play the mode's own cadence.
  - Seven choices at once is too hard for a beginner. Moloney (Fordham 2004) found *blocked* groups (1-3-5, then 2-7, then 4-6) build the sense of key faster. That is #5; it should drive this game.
  - Play the answer *resolving* after you guess (e.g. 7→1). That's how the tendency gets learned, not just the correct/incorrect result.
- **UX:**
  - A separate drawer row per ear game would push the menu past one screen. Group them.
  - The game must re-read the key when the top bar changes. Stale questions are a coherence bug.
- **Mobile:**
  - Seven buttons at 390px need two rows of 44px or more.
  - Don't autoplay on open: iOS needs a gesture to unlock audio.

## Synthesis
- **Placement:** in "Ear gym" (one drawer row, Practice group), on the "Home notes" tab.
- **Cadence and key:** the cadence uses `diatonicChords(k)` degrees 1-4-5-1, so it is mode-aware. The question resets whenever key or mode changes.
- **Choices:**
  - Only the current stage's degrees, as large buttons labelled with a mode-aware symbol (♭3 etc.) and a feel word ("home", "colour", "lifted", "strong", "soft", "leans home" / "relaxed").
  - Stages (#5): 1·3·5 → 2·7 (with 1) → 4·6 (with 1) → all seven. A stage unlocks after 8 of your last 10 are right.
- **After answering:** Muse plays the note sliding to home (the nearest tonic, step by step), and explains the pull: "♭7 sits a step below home and relaxes into it."
- **Audio:** the first play is on tap, so it works on iOS.

## Post-build review (local + live Playwright, 390px and 1280px; screenshots in /workspace/audit/wave-1/)
- **Checked:**
  - Stages show mode-aware labels: A minor "Mix all" gives 1 2 ♭3 4 5 ♭6 ♭7.
  - Choices stay disabled until Play, which satisfies the iOS gesture rule.
  - After an answer, the result line names the step and its pull, and "Hear it go home" plays the resolution.
- **Critique:** the stage buttons are blocks of numbers, which could read as theory jargon.
  - **Kept:** under each choice the feel word does the teaching, and the stage row is short. No change.
- 0 sideways scroll, no console errors.
