# Style ↔ Tuning ↔ Key coherence

Code: `src/core/styleProfiles.ts` (profiles + logic), `src/core/styles.ts` (progressions), `src/core/tunings.ts`.

## Model
- **Profile per style:** modes ranked, typical tonics (or `low` = the tuning's lowest open string), usual tunings.
- **Style picked:** offer one combo (tuning → tonic → mode), e.g. `TOOL: D minor/Phrygian in Drop D · Apply`. The current tuning is kept if the style uses it.
- **Tuning picked:** offer the tonic on its open strings. Drop D → D, open G → G (its open strings ring the chord), C♯ standard → C♯.
- **Key/mode changed:** nothing resets. An unusual mode gets a note naming the closest typical mode (by notes in common). An off-tonic key for a riff style gets a note about the open-string drone.
- **"Why this fits":** one plain sentence combining the mode feel, how typical it is for the style, and the tuning's open strings. It shows under the selectors and inside Chord tips.
- **Highlighting** (`styles.ts`) recomputes from key + style + tuning. Chords on a non-standard tuning's open low strings count as "easy in this tuning".

## Sources and what they changed
| Source | Finding | Effect |
|---|---|---|
| Hooktheory TOOL table; MusicScene "Schism"; MusicRadar Adam Jones lesson | D minor most common (Schism, Lateralus, Right in Two), D/A Phrygian, Schism verse D Dorian; drop D essential, drop B occasionally | TOOL: tonic = low string, modes minor > Phrygian > Dorian > Phrygian-dominant (last from Artist Lens); tunings drop D, drop B. Confirmed the original guess and added Dorian. |
| 12notez + metallicaR key counts; Baylor thesis on Metallica riffs | E minor dominant; ♭II/♭V Phrygian colours | Metallica: tonic = low string (E standard), minor > Phrygian. Confirmed. |
| TuneLit Black Sabbath; Hooktheory Sabbath | C♯ standard from Master of Reality; E/B/D minor, plus Dorian, Locrian and Mixolydian songs | Sabbath: low-string tonic, minor > Dorian > Phrygian > Locrian. Added Dorian and Locrian. |
| Hooktheory Nirvana | Many Mixolydian and Dorian songs; Teen Spirit is F Phrygian; keys reflect E♭ tuning | Nirvana: added a Mixolydian progression and Mixolydian/Dorian modes. Changed: was minor-only. |
| Hooktheory Led Zeppelin | A Mixolydian dominates (Good Times Bad Times, Rock and Roll, The Ocean…), standard tuning | Changed: suggested tuning is now standard (DADGAD kept as an alternative); tonic A, Mixolydian first. |
| Hooktheory Pink Floyd | E minor most common; D Dorian (Another Brick), little Mixolydian | Changed: minor > Dorian > major; added the Dorian vamp; Mixolydian moved down. |
| Hooktheory Steely Dan; Guitar World "Mu chord"; sdarchive | Major and Mixolydian frequent (Aja, Reelin' in the Years), minor (Do It Again G minor); add9 "mu" chords | Added Mixolydian progression; modes major > Mixolydian > minor. |
| Hooktheory Radiohead | Wide spread: major, minor, Dorian, Mixolydian, harmonic minor, Phrygian | Radiohead: broad mode list; tonics A/D/E. |
| Hooktheory Deftones | C♯/C minor, D♭ major, Lydian appearances | Deftones: minor > major > Lydian; drop D low-string tonic. |
| music.stackexchange "best key for guitar"; Classical Guitar Corner | E, A, G and Em use the most open strings | Rock, blues, punk and funk default to E/A; standard tuning counts E and A as "open-string" tonics. |
| jazzguitar.be Real Book stats | F, E♭, C, B♭ cover most standards | Jazz tonics F, E♭, C, B♭. |
| J. Moore "The Flamenco Key" (UCSD); flamencoexplained.com | A Phrygian (por medio) more common than E (por arriba); tonic chord is major | Flamenco: A then E; Phrygian dominant first. |
| jonimitchell.com transcriptions; sonicyouth.com tunings | Joni: open D/open G; Lee Ranaldo GGDDGG | Joni: D in open D; Sonic Youth: G in GGDDGG. |
| Muse Artist Lens (`public/artists.json`) | "Try it" keys and modes | Remaining artist profiles (Opeth, Meshuggah, Björk, Coltrane…). |

Genres without artist-specific research (pop, R&B, gospel, lo-fi, EDM, cinematic, Latin, reggae, Bach chorale) use common-practice conventions (marked `conv`).
