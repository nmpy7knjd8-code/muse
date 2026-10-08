# Muse handoff

Live: https://nmpy7knjd8-code.github.io/muse/ (GitHub Pages; every push to `main` runs tests, builds, and deploys via `.github/workflows/pages.yml`).

## What it is
Mobile-first PWA (Vite + React + TypeScript) that suggests the next chord or melody note and labels each option by mood. All music logic lives in `src/core/` (no DOM imports) so it can be ported to Swift later. Data files in `public/`: `theory_kb.json`, `mood_lexicon.json`, `lore.json`, `artists.json`, plus the tension model.

Run: `npm install && npm run dev`. Test: `npx vitest run`. Build: `npm run build`.

## Done on main
v1 suggestions + mood bar + safe/adventurous slider; piano/guitar/voice-leading/mood map/circle/Tonnetz visuals; mood journey; lore mode; Listen mode (mic note + chord recognition); sampled instruments + picker; clearer scale tint; Artist Lens tab; tension budget + curve view.

## Chords + melody timeline (this branch)
Combine chords with melody notes on one timeline:
- Unified timeline: each chord slot holds up to 4 melody notes at beat positions (`src/core/timeline.ts`).
- Label each melody note vs its chord: chord tone / tension / avoid / clash (`src/core/noteRelation.ts`).
- Next-note suggestions use the chord under the active slot + beat weight; next-chord suggestions can harmonize a pending N.C. melody (fit + mood).
- Melody-vs-chord dissonance folds into the tension curve per bar.
- UI: two lanes (melody above, chords below), color-coded relationships, play both together, Listen fills the melody lane, MIDI/text export via `toMidiTimeline` / `timelineText`.

## Later
- Test on a real iPhone (audio on first tap, mic, home-screen install, offline).
- Tune mood and tension weights with real listening.
- Port `src/core` to Swift for a native iOS app.
