# 22 · Built-in tuner (aware of alternate tunings)

## Thesis
A mic tuner that targets the strings of the selected tuning (Drop D, Open G…).

## Critique
- **Educator:** beginners can't tell which string they're on. Auto-detect the nearest string of *the selected tuning*, and say "low D (6th string)", not just "D".
- **Design:**
  - Garrett wants number-free bars, but a tuner needs direction and closeness. A needle with "flat ← in tune → sharp" and a green state at ±5 cents meets both; show no cents number.
  - Drop D's low string at about 73 Hz needs a lower detection floor than the voice tools use (minFreq ~60 Hz). Check `detectPitch` accepts `minFreq`.
- **UX:**
  - The mic must stop when you leave the tool.
  - Echo cancellation can dull low strings. The existing `startMicPitch` disables noise suppression; acceptable.
  - Manual string lock for noisy rooms.
- **Mobile:** six big string buttons and a needle fit in the drawer.

## Synthesis
- **Tuner tool** (Practice group): six string buttons from `tuningById(current).strings`, labelled "6 · D low"…, with an "Auto" mode.
- **Reading:** `tunerReading()` gives the nearest string and a cents offset. The needle is number-free, and the arrows read "tune up" / "tune down" / "in tune ✓". It holds green for ~0.5 s of stability.
- **Detection:** `minFreq` 60 Hz.
- **Tuning switch:** a link: "Switch tuning in the Style row on Write".

## Post-build review (Playwright at 390px and 1280px; screenshots in /workspace/audit/wave-4/)
- **Checked with a fake mic** (Chromium fake device playing a 73.42 Hz D2 with harmonics) in Drop D: Auto found "6 · D (low) — in tune ✓", the needle centred, and the gauge got a green ring after holding steady.
- **String labels** follow the tuning (6 · D (low) … 1 · E (high)).
- **Detection:** the floor is lowered to 50 Hz, so Drop B and C# standard low strings are detectable.
- The mic stops on Stop and on unmount.
