# Muse handoff

Live: https://nmpy7knjd8-code.github.io/muse/ (GitHub Pages; every push to `main` runs tests, builds, and deploys via `.github/workflows/pages.yml`).

## What it is
Mobile-first PWA (Vite + React + TypeScript) that suggests the next chord or melody note and labels each option by mood. All music logic lives in `src/core/` (no DOM imports) so it can be ported to Swift later. Data files in `public/`: `theory_kb.json`, `mood_lexicon.json`, `lore.json`, `artists.json` (tension model still used for ranking, not shown as a graph).

Run: `npm install && npm run dev`. Test: `npx vitest run`. Build: `npm run build`.

## Done on main
v1 suggestions + mood bar + safe/adventurous slider; piano/guitar/voice-leading/mood map/circle/Tonnetz visuals; mood journey; lore mode; Listen mode (mic note + chord recognition); sampled instruments + picker; clearer scale tint; Artist Lens tab; tension budget + curve view; chords + melody timeline (two lanes, note↔chord labels, N.C. harmonize, shared play/MIDI); NextPickBoard; CoF tap-to-add + direction labels; root ↑/↓; key persistence; bass + electric guitar; expanded Artist Lens (virtuosic + classic rock) + request box.

## Chord ↔ melody link (this branch)
- Hear a suggested chord under a pending N.C. melody plays chord + that bar’s notes together (`harmPreviewEvents`).
- Harmonize banner when a bar has melody waiting; NextPickBoard switches to clash→fit × calm→tense.
- Timeline ↻ clears a chord and re-opens chord suggestions for that melody (reharm).
- Suggestion cards ranked under the Circle of Fifths with an on-card piano graphic of the chord notes (no 1-2-3-4 finger numbers); ready-made 2–3 step paths at the bottom of Suggestions; CoF tap-to-add on piano & guitar views (plays current instrument); Artist Lens request copy + optional song analysis; Polyphia/Collier removed (classic rock LZ/Beatles/Rush remain); melody Hear previews only the next note.
- Tension curve restored with clearer hierarchy, REL_COLORS melody chips matching the timeline, and curve↔timeline selection sync.
- Bass guitar: `fitMidiToInstrument` folds melody/CoF/timeline/path notes into the bass sample range; AudioEngine applies it on every `playNotes` so bass sounds on melody + circle, not only chords.
- CoF + paths for laypeople: feel-first move labels (right=brighter / left=opens), rim dots explained as next picks, ready-made progression/melody-run copy instead of CW/V jargon.
- Novice-friendly copy: relation tags (in the chord / colour note), palette roles (home / pulls home), “no chord” + Find a chord, glossed terms on cards and visuals.
- Guide tab: how-to for each feature with “how to use” + “why it matters” musicality notes and jump buttons.
- Note suggestions ranked by harmonic/melodic fit first (mood is a light tint); rank strip bars follow score, not colourfulness.
- Metal guitar: electric instrument retuned (tighter release/ring/reverb) with a live amp path (HPF → WaveShaper drive → mid scoop → presence → air → LPF) on distortion samples and sawtooth fallback.
- MIDI keyboard input: Mic ↔ MIDI toggle beside Listen; Web MIDI note-on fills melody, held notes → `chromaFromMidis` + `matchChord` for chords (same templates as mic).
- Guide: “Which notes & chords will work” (relation tags + ranking) and Mic/MIDI section.
- In-context FitExplainer under Melody piano / Chords palettes (key tint + relation chips + ranking why).
- “Best fit first” suggestion cards sit directly under the Circle of Fifths (not below the next-pick board).
- Circle of fifths letter nodes brighten by next-pick rank (top suggestions most visible; unranked dim).

## Artist Lens band requests
- UI: Artist Lens → Request a band opens a prefilled GitHub issue (`Artist Lens request: …`, label `enhancement`). User must tap **Create** on GitHub. Also offers **Ask Cursor** (prompt deeplink) and **Copy muse.bandRequests JSON**.
- Agent watch: process open issues via `parseArtistLensIssue` / `scripts/list-artist-requests.sh`, or a localStorage dump via `parseBandRequestEntries` / `scripts/list-band-requests-json.sh`. Add to `public/artists.json` + update `tests/artists.test.ts`.
- Workflow `.github/workflows/artist-lens-request.yml` acknowledges new requests (suggests `@cursor` for a fast kick) and closes smoke-test placeholders.
- Device queue: `localStorage.muse.bandRequests` — copy JSON from the Request box (or Ask Cursor) so the agent can see it without a GitHub issue.
- Skip bands matching `isSmokeArtistRequest` (e.g. `PIPELINE-SMOKE-TEST`).

## Later
- Test on a real iPhone (audio on first tap, mic, home-screen install, offline).
- Tune mood and tension weights with real listening.
- Port `src/core` to Swift for a native iOS app.
