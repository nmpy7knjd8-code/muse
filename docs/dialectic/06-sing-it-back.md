# 6 · Sing it back

## Thesis
Muse plays the home cadence and a note; you sing it; the mic checks the pitch.

## Critique
- **Educator:**
  - Singing is what makes degrees stick (Dalcroze, Kodály). But octave errors are not ear errors: compare pitch class, not exact MIDI.
  - A strict ±25-cent check fails untrained voices. Within half a semitone is enough to show the right degree.
  - Guiding with the feel words helps.
- **UX:**
  - The mic may be blocked, missing (desktop), or the user may be in public. A silent fallback is needed: "I sang it → reveal", self-graded.
  - Echo cancellation can't remove our own playback on a speaker. Don't listen while Muse is playing.
- **Mobile:**
  - Mic permission prompts on iOS need a user gesture, and the session must be stopped when leaving the tab or drawer, or the mic indicator stays on.

## Synthesis
- **Flow:** "Sing it" tab → tap Play (cadence + note) → tap "Listen" → sing for up to 4 s → judged by `judgeSung()`. Needs ≥0.35 s held within ±0.5 semitone of the target's pitch class (octave-free).
- **Live meter:** a number-free "low ← on → high" bar is shown while singing.
- **Without a mic:** "No mic? Sing, then tap Reveal" self-grades into the same spaced schedule.
- **Mic lifecycle:** the mic stops on result, on tab change, and on unmount. Frames are ignored while playback sounds.

## Post-build review (local + live Playwright, 390px and 1280px; screenshots in /workspace/audit/wave-1/)
- **Checked:**
  - On headless desktop and mobile, 'No mic' self-grading records into the same schedule.
  - The live mic path is unit-tested (`judgeSung`: octave-free, ±0.5 semitone, held 0.35 s or more). The mic stops on result or unmount, and frames are ignored while Muse is playing.
- **Not verifiable in CI:** real singing. A fake-mic run was not attempted for this wave.
