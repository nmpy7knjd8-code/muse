# Muse — next-chord / next-note suggestions by mood (web v1)

A mobile-first PWA for composing. Pick a key, enter the chords or melody notes you have so far, and Muse
suggests what could come next. Each option is labelled with the mood it pushes toward (mystical,
melancholy, triumphant, tense, dreamy…) and a one-line reason. Tap an option to hear the previous chord
followed by the suggestion. It runs fully offline, with no account.

## Run
```
npm install
npm run dev            # http://localhost:5173
npm test               # vitest (core logic)
npm run build          # tsc -b && vite build -> dist/
npm run preview        # serves dist/ at http://0.0.0.0:4173/muse/
```
To use it on an iPhone, open the preview URL in Safari and choose Share → Add to Home Screen.
Two features need **HTTPS** on a real device (localhost doesn't count): the service worker (offline use)
and the microphone ("Hum it in"). Serve it through any static host or an HTTPS tunnel.

## Live
https://nmpy7knjd8-code.github.io/muse/ — deployed by `.github/workflows/pages.yml` on every push to `main`
(tests → build with `BASE_PATH=/<repo>/` → GitHub Pages). Production builds default to the `/muse/` base
(see `vite.config.ts`; override with `BASE_PATH=/`). All runtime paths (data fetches, manifest, service
worker) are relative to that base. Local `npm run preview` serves at http://localhost:4173/muse/.

## Features
- Key/mode picker with auto key detection (from both chords and melody).
- Progression strip: lock, remove, undo, clear, play, copy text, MIDI export.
- Chord palette, typed chords (`F#m7`, `Bb/D`, …), and a tap piano for melody.
- Suggestions grouped and coloured by mood. Each card shows the roman numeral, 1–3 mood tags, a
  mood-shift arrow, a "why" line from the theory KB, and a common/colourful/unusual marker.
- Free-text mood bar ("haunting, like a foggy forest", "victorious but bittersweet"). It is interpreted
  offline into editable chips (mood weights + darker/brighter/tense/unusual/mode chips).
  Includes a Safe ↔ Adventurous slider.
- Visuals (all SVG):
  - piano (current vs next chord, RH fingering, voice-led voicing, scale)
  - guitar diagrams (curated open/E/A shapes plus a generator that never returns an unplayable shape)
  - voice-leading lines
  - mood map (dark↔bright × calm↔tense)
  - circle of fifths with a mood-coloured arrow
  - Tonnetz with the P/L/R path
- Mood journey: pick a start and end mood and get a generated 4–8 chord progression.
- Lore mode, clearly labelled "LORE, NOT SCIENCE": Schubart key characters, the Scriabin mystic chord, etc.
- Hum it in: microphone pitch detection (YIN) to enter melody notes.

## Data (loaded at runtime from `public/`; drop in new versions, no code change)
| file | purpose |
|---|---|
| `theory_kb.json` | research theory KB (moods + colours, chord moves, melodic moves, modes, progressions) |
| `theory_kb.seed.json` | hand-written fallback seed (marked `meta.seed`), used only if the KB file is missing |
| `mood_lexicon.json` | research mood vocabulary (515 ranked descriptors), merged into the built-in lexicon |
| `feature_mood_mapping.json` | tuning for scoring dimensions (`{config:{…}}` or a rules list); ships as an empty placeholder |
| `lore.json` | lore-mode entries (each has source + caution) |

## Architecture (designed for a later Swift port)
`src/core/` is framework-free TypeScript with no DOM or React. All music logic and all visualisation
data live here:
- notes, chords, scales, roman, keyDetect: theory primitives
- kb, moods, profile, lexicon, llm: KB loading, MoodProfile (mood weights plus brightness, valence,
  tension, chromaticism, stability, energy, and modes), text interpretation, and the pluggable
  `MoodInterpreter`
- suggest, journey: ranking and the mood-journey beam search
- voicing, guitar, relations, mapLayout: piano voicing/fingering, voice leading, guitar shapes,
  fifths/Tonnetz/P-L-R, mood-map layout
- export, lore, pitch: MIDI/text export, lore lookup, YIN pitch tracker

`src/ui/` is the React UI, the Web Audio synth, and the mic. Tests live in `tests/`.

### LLM interpreter (off)
`src/core/llm.ts` holds a JSON schema, a prompt, a validator, and an OpenAI-compatible adapter.
It is **disabled by default and ships no keys**. Enable it only by constructing `LlmMoodInterpreter`
with your own endpoint/model/key. If it fails, it falls back to the offline lexicon.

## Known limitations
- Not yet tested on a real iPhone. Audio unlock, PWA install, and mic were only checked in desktop
  Chrome at iPhone viewport size.
- Mood labels come from cited consensus where the KB has it. Otherwise they are heuristics, and the
  lore notes are not science.
- Melody suggestions use single notes only (no rhythm). The synth is simple.
