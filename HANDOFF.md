# Muse handoff

Live: https://nmpy7knjd8-code.github.io/muse/ (GitHub Pages; every push to `main` runs tests, builds, and deploys via `.github/workflows/pages.yml`).

## What it is
Mobile-first PWA (Vite + React + TypeScript) that suggests the next chord or melody note and labels each option by mood. All music logic lives in `src/core/` (no DOM imports) so it can be ported to Swift later. Data files in `public/`: `theory_kb.json`, `mood_lexicon.json`, `lore.json`, `artists.json`, plus the tension model.

Run: `npm install && npm run dev`. Test: `npx vitest run`. Build: `npm run build`.

## Done on main
v1 suggestions + mood bar + safe/adventurous slider; piano/guitar/voice-leading/mood map/circle/Tonnetz visuals; mood journey; lore mode; Listen mode (mic note + chord recognition); sampled instruments + picker; clearer scale tint; Artist Lens tab; tension budget + curve view; chords + melody timeline (two lanes, note↔chord labels, N.C. harmonize, shared play/MIDI); NextPickBoard; CoF tap-to-add + direction labels; root ↑/↓; key persistence; bass + electric guitar; expanded Artist Lens (virtuosic + classic rock) + request box.

## Chord ↔ melody link (this branch)
- Hear a suggested chord under a pending N.C. melody plays chord + that bar’s notes together (`harmPreviewEvents`).
- Harmonize banner when a bar has melody waiting; NextPickBoard switches to clash→fit × calm→tense.
- Timeline ↻ clears a chord and re-opens chord suggestions for that melody (reharm).
- Tension curve: plain-language tips + melody-over-chord chips; suggestion cards ranked with piano/guitar/bass hand placements; 2–3 step paths with connecting melody; CoF tap-to-add on piano & guitar views (plays current instrument); Artist Lens request copy + optional song analysis; Polyphia/Collier removed (classic rock LZ/Beatles/Rush remain); melody Hear previews only the next note.
- Bass guitar: `fitMidiToInstrument` folds melody/CoF/timeline/path notes into the bass sample range; AudioEngine applies it on every `playNotes` so bass sounds on melody + circle, not only chords.
- CoF + paths for laypeople: feel-first move labels (right=brighter / left=opens), rim dots explained as next picks, ready-made progression/melody-run copy instead of CW/V jargon.

## Later
- Test on a real iPhone (audio on first tap, mic, home-screen install, offline).
- Tune mood and tension weights with real listening.
- Port `src/core` to Swift for a native iOS app.
