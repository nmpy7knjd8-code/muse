# 10 · Theory unlocked as you use it

## Thesis
The first time you use a concept, a card says "You just used X", with an explanation and a sound example.

## Critique
- **Educator:**
  - This is "experience first, name later" (Dalcroze; Orff "sound before symbol"), the right order. But detection must be accurate. Calling a diatonic vi "borrowed" would teach wrong theory. Use `analyzeRoman` (diatonic flag, secondary label).
  - Examples should be in *your* key and point at *your* bar.
- **UX:**
  - A modal interrupting writing is hostile. Use the existing small flash toast, once per concept, ever.
  - Keep a browsable list for later.
- **Mobile:** the flash already exists and doesn't cover the input. No new chrome on Write.

## Synthesis
- **Detection:** `detectConcepts(chords, key)` finds:
  - authentic cadence, plagal cadence, deceptive move, half cadence
  - borrowed chord, secondary dominant
  - sus chord, 7th chord, power chord
  - mode colour (♭VII in major, IV major in minor = Dorian)
- **Toast:** when an edit introduces a new concept, Write flashes "New idea: Deceptive move — Lessons › Your theory". Seen concepts are stored in `muse.concepts`.
- **"Your theory" tab:** each card shows a plain explanation, where it happens in your bars, and Hear (your bars), plus locked cards for ideas you haven't tried yet.

## Post-build review (Playwright at 390px and 1280px; screenshots in /workspace/audit/wave-2/)
- **Checked:**
  - Typing Am after C G flashed "New idea: Fake-out (deceptive move) — see Lessons › Your theory" once. It waits 1.9 s so it doesn't overwrite the edit's own toast, then shows for 3.6 s.
  - The card lights up and points to "bar 3 (Am)".
- **Critique:** the list of 10 fully-open cards is long at 390px, and the lit cards were buried.
  - **Fixed:** cards you've used now sort first, then ones seen before, then locked ones.
- **Tests:** detection accuracy (diatonic vi isn't called borrowed; V in minor isn't borrowed) and that every concept's example demonstrates itself in 3 keys.
