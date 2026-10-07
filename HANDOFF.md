# Muse handoff

Live: https://nmpy7knjd8-code.github.io/muse/ (GitHub Pages; every push to `main` runs tests, builds, and deploys via `.github/workflows/pages.yml`).

## What it is
Mobile-first PWA (Vite + React + TypeScript) that suggests the next chord or melody note and labels each option by mood. All music logic lives in `src/core/` (no DOM imports) so it can be ported to Swift later. Data files in `public/`: `theory_kb.json`, `mood_lexicon.json`, `lore.json`, `artists.json`, plus the tension model.

Run: `npm install && npm run dev`. Test: `npx vitest run`. Build: `npm run build`.

## Done on main
v1 suggestions + mood bar + safe/adventurous slider; piano/guitar/voice-leading/mood map/circle/Tonnetz visuals; mood journey; lore mode; Listen mode (mic note + chord recognition); sampled instruments + picker; clearer scale tint; Artist Lens tab; tension budget + curve view.

## Unfinished (this branch: `wip-melody-timeline`, uncommitted work-in-progress, may not pass tests)
Combine chords with melody notes:
- Unified timeline: each chord slot holds one or more melody notes (beat positions).
- Label each melody note vs its chord: chord tone / tension (9, 11, #11, 13) / clash.
- Next-note suggestions conditioned on current chord AND previous notes; next-chord suggestions that harmonize entered melody (ranked by fit + mood).
- Include melody-vs-chord dissonance in the tension score.
- UI: two lanes (melody above, chords below), color-coded relationships, play both together, Listen mode fills the melody lane, both in MIDI export.
Started files: `src/core/timeline.ts`, `src/core/noteRelation.ts`, edits to `suggest.ts`, `export.ts`, `index.ts`.

## Later
- Test on a real iPhone (audio on first tap, mic, home-screen install, offline).
- Tune mood and tension weights with real listening.
- Port `src/core` to Swift for a native iOS app.
