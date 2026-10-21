# 3 · Name the chords (on your own songs)

## Thesis
Hide all chord names in a saved progression or an Artist Lens song. Muse plays it; you fill in each bar from the palette.

## Critique
- **Educator:**
  - Filling *every* bar from a 20-chord palette is dictation, and beginners fail and quit. Hooktheory's "Level Up" scaffolds by giving most chords and asking for one, from a small set.
  - Use real-song context (Artist Lens Try-its, your own loop): research on transfer says practice on the music you care about.
- **UX:**
  - This overlaps with #2. Make the difference explicit: #2 is *where did it change*, #3 is *what is this chord*.
  - Artist Lens data is loaded lazily and may be offline. Your own bars and the Style progressions are always available, so they must be the default.
- **Mobile:** the full palette would overflow. Use 4 choices max.

## Synthesis
- **Tab "Name it":** the source is a toggle between "My bars" and "My style". The first bar is always shown as home.
- **Each round:** one hidden bar (shown as "?"), with 4 numeral choices, each with a play button. The hidden bar is chosen by the adaptive engine (#4), favouring numerals you miss.
- **After revealing:** "Hear in place" replays the loop with that bar highlighted.
- **Fallback:** if your bars are out of key or have fewer than 3 chords, it falls back to your Style's progression with a note saying so.

## Post-build review (local + live Playwright, 390px and 1280px; screenshots in /workspace/audit/wave-1/)
- **Checked:** A minor with TOOL-style fallback gives bars `i ? ♭III ♭VII`. The reveal names the numeral, the chord and the bar. Each option plays its chord.
- **Critique:** without the reveal the numerals alone are abstract.
  - **Kept:** after the reveal the chord letters appear under each numeral, and "Hear in place" replays the loop.
- **Shared fixes:** the source-toggle fix from #2 applies here too.
