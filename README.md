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
- Unified timeline: melody lane above, chords below, optional bass and drums. Melody notes are
  labelled chord tone / tension / avoid / clash. Play, copy, and MIDI export lanes together
  (drums render as ASCII tab in Copy). Pending N.C. melody can be harmonized by the next-chord suggestions.
- **Drums tab:** kit×subdivision percussion grid (simultaneous columns + Loop) with several hats,
  kicks, toms, crash/splash, ride/bell, and rim. Pitched voices lock to the session key/mode
  (kick=1, mid tom=3, high tom/ride bell=5, etc.) with FluidR3 steel-drum / taiko sample colour.
  Rhythm tension strip teaches build & release. Guide + Artist Lens (TOOL) go deep on how to play.
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
- 👂 Listen (live mic): the mic stays open while it's on.
  - Melody mode: a stable sung or played note (held ≥250 ms, passes an RMS gate) is added and the
    suggestions refresh. Pitch detection is monophonic YIN.
  - Chords mode: polyphonic recognition (FFT → peak-picked chroma → harmonic-aware template match over
    maj/min/7/maj7/m7/sus2/sus4/dim/aug, using a confidence threshold and a bass-root tiebreak).
    Each chord must be held ≥350 ms. A lone single note is reported as a note, not added as a chord.
  - A sustained note or chord is added only once. Repeating it needs a short silence.
  - Listening pauses while Muse itself is playing, so its own audio can't feed back.
  - A live indicator shows what it hears, the confidence, a hold-progress bar and the input level.

## Tension budget
- `src/core/tension.ts` is a verbatim copy of `research/tension/tension.ts`; the tests in
  `tests/tension.test.ts` come with it.
- What the model measures, with sources in `research/tension/tension_report.md`:
  - roughness, harmonicity and familiarity (Hutchinson & Knopoff; Parncutt; Harrison & Pearce)
  - distance from home, surface tension and attraction (Lerdahl's Tonal Pitch Space)
  - voice-leading motion
- `src/core/harmonyTension.ts` connects the model to Muse:
  - style presets, calibrated on three corpora: Pop/rock = RS200, Classical = Beethoven quartets,
    Jazz = iRb. Film is heuristic.
  - the Safe↔Adventurous slider and the mood target scale the sweet-spot band and the "unresolved
    tension" budget
  - an idiom discount for modal and blues colours (♭VII, I7, chords native to the mode), because
    Lerdahl's model over-rates their tension
  - melody-vs-chord dissonance folded into each chord's tension
- **Effect on suggestions:** each one gets a ranking adjustment (`TENSION_GAIN × adjust`) and reason
  chips such as "resolves built-up tension" or "adds colour after a settled stretch". The model's level
  also refines the mood-map tension axis.
- **UI:** a tension curve under the progression shows:
  - status, coloured too-static / sweet / building / resolve-soon / over-budget
  - the green sweet-spot band and the orange unresolved-tension area
  - a dashed budget line and ↓ release marks
  - a ghost segment for the selected suggestion
  - a per-chord breakdown (tap a chord)
  - a style picker, saved in localStorage
- The weights are heuristics (evidence D) and should be tuned with listeners.

## Artist Lens
A third tab covering 15 artists, TOOL first. It is built from `public/artists.json`, which comes from
the research worker; `research/artists/` has the build and validation.
- **Cards:** the hook, mood chips (opacity = weight) and polarity bars (bar length = how many of the
  artist's techniques work that polarity).
- **Artist detail:**
  - the aesthetic summary
  - "Try it" exercises, labelled as original exercises in the artist's style. They load like the mood
    journey (key + chords, undo-able); the pedal / held-bass degree becomes the bass of the listed
    chords. ▶ previews an exercise without loading it.
  - technique cards grouped by category, with evidence badges and citations
  - technique chips that open the matching item from Muse's theory KB
  - works, a listening guide, and the sources
- The Chords detail sheet shows "Used by (Artist Lens)" reverse links for the KB moves behind a
  suggestion.

## Sound
- Sampled instruments, self-hosted in `public/samples/<instrument>/<midi>.mp3`. They are about 4.1 MB of
  MP3 (iOS Safari decodes these), lazy-loaded the first time you need them, and cached by the service
  worker for offline use. A synth plays until they load: FM e-piano/pluck, or detuned saws through a
  filter envelope for the pad.
- Mixing (`src/ui/audio.ts`, planning in `src/core/playback.ts`):
  - click-free attack and exponential release
  - velocity-dependent brightness and slight humanization
  - guitar strums at about 20–24 ms per string
  - voice-led keyboard voicings with a warm bass (D2–C♯3) and low-interval limits so chords don't get
    muddy; guitar instruments play real guitar shapes; metal guitar uses clean electric samples plus a live amp/cab stack; bass plays a single low root
  - a generated convolution reverb and a compressor followed by a limiter
- The instrument picker (Piano / Nylon / Steel / Metal / Rhodes / Pad / Electronic / Bass) is remembered in `localStorage`.
  Key and mode picks are remembered too.
- Live input: **Mic** (YIN notes / chroma chords) or **MIDI** keyboard (Web MIDI). Same hold-to-add behaviour; MIDI does not touch the mic AudioSession.
- iPhone: audio starts on the first tap, and the AudioSession is set to `playback`. If you hear nothing,
  check the ring/silent switch and the volume. The app shows this tip.
- `scripts/fetch-samples.sh` reproduces the sample set.
- `audio-previews/` has rendered previews of C–Am–F–G for each instrument. They are made with the same
  engine in an `OfflineAudioContext` (`?render-preview` hook, `src/ui/renderPreview.ts`).

## Credits
- **Piano:** Salamander Grand Piano (V2/V3) by Alexander Holm, CC BY 3.0
  (https://creativecommons.org/licenses/by/3.0/), via https://github.com/Tonejs/audio (salamander/).
- **Nylon & steel acoustic guitar, acoustic bass, Rhodes (Electric Piano 1), Warm Pad, Electronic (lead_2_sawtooth), steel drums, taiko:** FluidR3_GM
  soundfont by Frank Wen. MP3 renders come from https://github.com/gleitz/midi-js-soundfonts (CC BY 3.0).
  Steel drums + taiko colour the key-tuned drum voices (toms / ride bell / kick body).
- **Metal guitar:** MusyngKite `electric_guitar_clean` samples (same midi-js-soundfonts pack, CC BY 3.0)
  through a live high-gain amp + speaker-cab path in `src/ui/audio.ts` — clean electric guitar into an
  amp, not FluidR3’s synth-like `distortion_guitar`.
- For both, the samples were trimmed, faded and re-encoded (mono/stereo MP3, 72–96 kbps), and notes
  between samples are pitch-shifted.

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
- export, lore, pitch, chroma: MIDI/text export, lore lookup, YIN pitch tracker, FFT/chroma chord matcher + HoldTracker debounce

`src/ui/` is the React UI, the Web Audio synth, and `listen.ts` (the live mic loop). Tests live in `tests/`.

### LLM interpreter (off)
`src/core/llm.ts` holds a JSON schema, a prompt, a validator, and an OpenAI-compatible adapter.
It is **disabled by default and ships no keys**. Enable it only by constructing `LlmMoodInterpreter`
with your own endpoint/model/key. If it fails, it falls back to the offline lexicon.

## Known limitations
- Not yet tested on a real iPhone. Audio unlock, PWA install, and mic were only checked in desktop
  Chrome at iPhone viewport size. Listen switches the iOS AudioSession to `play-and-record` (and
  back to `playback` when you stop) so the mic is not blocked after the first chord tap.
- Mood labels come from cited consensus where the KB has it. Otherwise they are heuristics, and the
  lore notes are not science.
- Melody suggestions use single notes only (no rhythm). The synth is simple.
