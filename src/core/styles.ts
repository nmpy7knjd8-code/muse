// Style lens: chord progressions characteristic of genres and artists, written as roman numerals
// (accidentals are absolute vs. the tonic's major scale, like parseRoman: minor keys spell bIII, bVI, bVII).
// Realised in whatever key/mode the user is in. Plain data + pure helpers — no DOM.
// Artist entries reuse the Artist Lens research (public/artists.json "Try it" progressions) where available;
// the others cite well-known songs. Tunings are only *suggested* (see tunings.ts).
import { Chord, QUALITY_BY_ID, QualityId, chordSymbol, triadClass } from './chords';
import { pc } from './notes';
import { parseRoman } from './roman';
import { Key, MODE_BY_ID, ModeId, scalePcs } from './scales';
import { Tuning, tuningFriendlyRoots } from './tunings';

export interface StyleProgression {
  roman: string[];
  name: string;
  why: string;
  /** Only offered in these modes (otherwise offered in the matching major/minor family). */
  modes?: ModeId[];
}
export interface MusicStyle {
  id: string;
  name: string;
  group: 'Genres' | 'Artist styles';
  /** one line: what makes it sound like this */
  blurb: string;
  major: StyleProgression[];
  minor: StyleProgression[];
  /** extra tagged progressions for specific modes (Dorian, Phrygian…) */
  modal?: StyleProgression[];
  /** Only 7th-or-richer chords count as typical (jazz-type harmony). */
  richer?: boolean;
  /** Suggested tuning id (offered, never forced). */
  tuning?: string;
}

const P = (roman: string, name: string, why: string, modes?: ModeId[]): StyleProgression => ({ roman: roman.split(/\s+/), name, why, ...(modes ? { modes } : {}) });

/** "Any style": the general tips shown by default. */
export const GENERAL_STYLE: MusicStyle = {
  id: 'any', name: 'Any style', group: 'Genres',
  blurb: 'Progressions that work in almost any genre — the backbone of most songs.',
  major: [
    P('I V vi IV', 'The “four chords”', 'Home → lift → sad turn → hopeful: every chord shares notes with the next, and IV sets up the return to I.'),
    P('I vi IV V', '50s / doo-wop', 'Falls to the relative minor and climbs back; V at the end pulls hard to repeat.'),
    P('ii V I', 'ii–V–I', 'Roots fall in fifths — the strongest pull in tonal music. The jazz and pop cadence.'),
    P('I IV V I', 'Three-chord', 'Home, away, tension, home. Blues, folk, rock and country all start here.'),
    P('vi IV I V', 'Minor-first loop', 'Same chords as the four-chord loop, starting on vi so it feels wistful.'),
    P('I iii IV iv', 'Minor iv sigh', 'Borrowing iv from the minor key gives a bittersweet drop before home.'),
  ],
  minor: [
    P('i bVI bIII bVII', 'Epic minor loop', 'All diatonic, roots step by thirds and fourths — dark but driving.'),
    P('i iv v i', 'Minor three-chord', 'The natural-minor answer to I–IV–V: softer, no leading tone.'),
    P('i bVII bVI V', 'Andalusian cadence', 'Stepwise descent to a major V (borrowed raised 7th) — flamenco, rock ballads.'),
    P('i iv V i', 'Harmonic-minor cadence', 'Major V brings the leading tone back: a firm, classical resolve.'),
    P('iiø7 V7 i', 'Minor ii–V–i', 'Half-diminished ii and dominant V: the jazz minor cadence.'),
    P('i bIII bVII iv', 'Rock minor loop', 'Bright ♭III and ♭VII lift a minor key without leaving it.'),
  ],
  modal: [
    P('i IV i', 'Dorian vamp', 'The major IV holds the raised 6th — the Dorian colour (“Oye Como Va”).', ['dorian']),
    P('I bVII IV I', 'Mixolydian rock', '♭VII→IV→I: the double-plagal swagger of classic rock.', ['mixolydian']),
    P('I II I', 'Lydian lift', 'Major II carries the ♯4 — floating, film-score wonder.', ['lydian', 'lydianDominant']),
    P('i bII i', 'Phrygian half-step', '♭II leans down a semitone into home — dark, Spanish, metal.', ['phrygian']),
    P('I bII I', 'Phrygian-dominant', 'Major tonic with ♭II above it: flamenco and Middle-Eastern heat.', ['phrygianDominant']),
    P('iv bIII bII I', 'Andalusian landing', 'Descends by step and lands on the major tonic — flamenco cadence.', ['phrygianDominant']),
  ],
};

export const STYLES: MusicStyle[] = [
  // ---------------- Genres ----------------
  { id: 'pop', name: 'Pop', group: 'Genres', blurb: 'Diatonic loops, strong hooks, few surprises.',
    major: [P('I V vi IV', 'Axis loop', '“Let It Be”, “Someone Like You” — maximally familiar.'), P('vi IV I V', 'Sensitive loop', 'Starts on the minor for emotional pop choruses.'), P('I vi IV V', '50s loop', 'Doo-wop turned pop (“Stand by Me”).'), P('IV I V vi', 'Lift-off', 'Starting on IV keeps the chorus feeling airborne.')],
    minor: [P('i bVI bIII bVII', 'Minor pop loop', 'The same four-chord engine in minor (“Zombie”).'), P('i bVII bVI bVII', 'Rocking minor', 'Two-chord rock back and forth under a hook.'), P('bVI bVII i', 'Rise to home', '♭VI–♭VII–i climbs by step into the tonic.')] },
  { id: 'rock', name: 'Rock', group: 'Genres', blurb: 'I–IV–V power, borrowed ♭VII and ♭VI, loud major chords in minor keys.',
    major: [P('I bVII IV I', 'Double plagal', '♭VII→IV→I (“Sweet Child O’ Mine” chorus, “Hey Jude” coda).'), P('I IV V IV', 'Garage rock', '“Louie Louie”, “Wild Thing” — three chords, rocking.'), P('I bIII IV I', 'Blues-rock riff', '♭III borrowed from blues — muscle and grit.'), P('I bVI bVII I', 'Aeolian cadence', '♭VI–♭VII–I: the stadium-rock finish.')],
    minor: [P('i bVII bVI bVII', 'Minor rock', '“All Along the Watchtower”.'), P('i bIII bVII IV', 'Dorian rock', 'Major IV in minor adds lift.'), P('i iv bVII i', 'Minor riff', 'iv and ♭VII circle the tonic.')] },
  { id: 'blues', name: 'Blues', group: 'Genres', blurb: 'Dominant 7ths on I, IV and V; 12-bar form.',
    major: [P('I7 IV7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7', '12-bar blues', 'Every chord is a dominant 7 — the ♭7 blue note is part of the harmony.'), P('I7 IV7 I7 V7', 'Quick 4', 'Condensed 12-bar: tonic, quick change to IV, turnaround on V.'), P('I7 VI7 ii7 V7', 'Blues turnaround', 'Secondary dominants walk back to the top.')],
    minor: [P('i7 iv7 i7 bVI7 V7 i7', 'Minor blues', '♭VI7 to V7 is the minor-blues sting (“The Thrill Is Gone”).'), P('i7 iv7 i7 i7', 'Minor vamp', 'Slow-burn minor blues.')] },
  { id: 'jazz', name: 'Jazz', group: 'Genres', richer: true, blurb: '7th chords everywhere, ii–V motion, tritone subs.',
    major: [P('ii7 V7 Imaj7', 'ii–V–I', 'The core jazz cadence — roots fall in fifths, guide tones move by step.'), P('Imaj7 vi7 ii7 V7', 'Rhythm turnaround', '“I Got Rhythm” changes.'), P('iii7 VI7 ii7 V7', 'Circle turnaround', 'A chain of fifths back to I.'), P('ii7 bII7 Imaj7', 'Tritone sub', '♭II7 replaces V7 — chromatic bass slide into I.')],
    minor: [P('iiø7 V7b9 i7', 'Minor ii–V–i', 'Half-diminished ii and altered V7.'), P('i7 iv7 bVII7 bIIImaj7', 'Minor circle', 'Fifths from the minor tonic to its relative major (“Autumn Leaves”).'), P('i6 iiø7 V7 i6', 'Minor-6 cadence', 'm6 tonic for a Gypsy-jazz colour.')] },
  { id: 'rnb', name: 'R&B / Soul', group: 'Genres', richer: true, blurb: 'Lush 7ths and 9ths, descending diatonic chains, borrowed iv.',
    major: [P('IVmaj7 iii7 ii7 Imaj7', 'Neo-soul descent', 'Stepwise falling 7th chords (D’Angelo, Erykah Badu).'), P('Imaj7 vi9 ii9 V7sus4', 'Smooth loop', 'Suspended V avoids a hard cadence — it floats.'), P('I I7 IV iv', 'Gospel-soul iv', 'Minor iv (Motown, “Ain’t No Sunshine” feel).')],
    minor: [P('i9 iv9', 'Two-chord vamp', 'Minor 9 chords for a slinky groove.'), P('i7 bVImaj7 v7', 'Late-night', 'maj7 on ♭VI softens the minor.'), P('iv7 bVII7 bIIImaj7 bVImaj7', 'Soul circle', 'Fifths through the relative major.')] },
  { id: 'funk', name: 'Funk', group: 'Genres', blurb: 'One-chord dominant vamps, 9ths, Dorian minor.',
    major: [P('I9 IV9', 'Two-chord vamp', 'James Brown: rhythm over harmony; 9ths stay bright.'), P('I7 bVII IV', 'Funk-rock', '♭VII and IV under a dominant tonic.'), P('I7 I7 IV7 I7', 'Static I7', 'One chord, all groove — change only for the bridge.')],
    minor: [P('i7 IV7', 'Dorian funk', 'Minor 7 tonic + dominant IV: the classic funk minor.'), P('i7 iv7', 'Minor vamp', 'Darker two-chord groove.')] },
  { id: 'folk', name: 'Folk / Country', group: 'Genres', blurb: 'Open-position triads, I–IV–V, country’s II7.',
    major: [P('I IV I V', 'Folk cycle', 'Simple and singable — campfire harmony.'), P('I IV V I', 'Country three-chord', 'Hank Williams to Johnny Cash.'), P('I II7 V7 I', 'Country II7', 'Secondary dominant II7 — the “country” chord.'), P('I vi ii V', 'Waltz turnaround', 'Old-time country cycle.')],
    minor: [P('i bVII i', 'Modal folk', 'Celtic/Appalachian minor drone.'), P('i bIII bVII i', 'Ballad minor', 'Murder-ballad colour.'), P('i iv i bVII', 'Folk minor', 'Plain minor triads with a modal ♭VII.')] },
  { id: 'metal', name: 'Metal', group: 'Genres', tuning: 'dropD', blurb: 'Power chords, Phrygian ♭II, tritones, Aeolian ♭VI–♭VII.',
    major: [P('I5 bVII5 bVI5 bVII5', 'Aeolian power', 'Metal rarely sits in major — borrowed ♭VI/♭VII darken it.'), P('I5 bII5 I5', 'Phrygian stab', 'Half-step above home — instant menace.')],
    minor: [P('i5 bVI5 bVII5 i5', 'Epic metal', 'Aeolian climb (Iron Maiden, Metallica).'), P('i5 bII5 i5 bV5', 'Phrygian + tritone', '♭II and the ♭5 “devil’s interval” (thrash/death).'), P('i5 bIII5 iv5 bVI5', 'Sabbath walk', 'Doom-style minor-pentatonic roots.')],
    modal: [P('I5 bII5 I5 bVI5', 'Phrygian-dominant riff', 'Major-3rd tonic with ♭II/♭VI (Middle-Eastern metal).', ['phrygianDominant'])] },
  { id: 'prog', name: 'Prog', group: 'Genres', blurb: 'Modal colour, non-functional moves, odd meters (try the Meter tab).',
    major: [P('I II IV I', 'Lydian prog', 'Major II (♯4) gives that Yes/Genesis brightness.'), P('I bVII IV bIII', 'Descending majors', 'A chain of major chords down in fourths.'), P('Imaj7 iii IV bVII', 'Art-rock drift', 'Diatonic, then a borrowed ♭VII.')],
    minor: [P('i bII bVII i', 'Phrygian prog', 'Dark half-step colour.'), P('i bVI bIII bVII', 'Prog-metal loop', 'Dream Theater / Porcupine Tree minor loop.'), P('i iv II V', 'Dorian twist', 'Major II surprises inside minor (Dream Theater).')] },
  { id: 'punk', name: 'Punk', group: 'Genres', blurb: 'Fast barre power chords, three or four chords.',
    major: [P('I5 IV5 V5 I5', 'Three-chord punk', 'Ramones — barre power chords, all downstrokes.'), P('I5 V5 vi5 IV5', 'Pop-punk', 'The four-chord loop in power chords (Green Day, Blink-182).'), P('I5 bVII5 IV5', 'Snotty rock', 'Borrowed ♭VII.')],
    minor: [P('i5 bVI5 bVII5', 'Minor punk', 'Dark and fast.'), P('i5 iv5 bVII5', 'Hardcore', 'Minor fourths and ♭VII.')] },
  { id: 'indie', name: 'Indie', group: 'Genres', blurb: 'add9 shimmer, borrowed iv, chromatic mediants.',
    major: [P('I III IV iv', 'Creep move', 'Major III and minor iv (“Creep”) — dreamy then crushed.'), P('Iadd9 IVmaj7', 'Shimmer vamp', 'Open add9/maj7 colours for jangly guitars.'), P('vi IV I V', 'Anthemic', 'Minor-first loop.'), P('I IV I iv', 'Bittersweet', 'Major IV then minor iv.')],
    minor: [P('i bVI bIII bVII', 'Indie minor', 'Wide, plaintive loop.'), P('iadd9 bVImaj7 bIIIadd9 bVII', 'Dreamy minor', 'Added 9ths and maj7 blur the edges (Deftones-ish).')] },
  { id: 'gospel', name: 'Gospel', group: 'Genres', richer: true, blurb: 'Passing chords, secondary dominants, minor iv, rich voicings.',
    major: [P('I VI7 ii7 V7', 'Gospel turnaround', 'VI7 (V7/ii) pushes into ii.'), P('IVmaj7 iv7 Imaj7', 'Plagal minor iv', 'Amen cadence with a borrowed minor iv.'), P('Imaj7 III7 vi7 IV', 'Church lift', 'III7 (V/vi) raises the stakes.')],
    minor: [P('i7 iv7 bVII7 bIIImaj7', 'Minor circle', 'Fifths through to the relative major.'), P('iiø7 V7 i7', 'Minor cadence', 'Half-diminished approach.')] },
  { id: 'lofi', name: 'Lo-fi / Hip-hop', group: 'Genres', richer: true, blurb: 'Looped jazzy 7ths and 9ths, two-to-four chords.',
    major: [P('ii7 V7 Imaj7 vi7', 'Jazzy loop', 'Turnaround that never quite lands.'), P('IVmaj7 iii7 vi7', 'Chill descent', 'Soft falling 7ths.'), P('Imaj7 iv7', 'Mellow minor iv', 'Major 7 to borrowed minor iv.')],
    minor: [P('i9 iv9', 'Boom-bap vamp', 'Minor 9s loop under a beat.'), P('i7 bVImaj7 bIIImaj7 bVII7', 'Night drive', 'Floating maj7s over a minor home.'), P('iv7 v7 i7', 'Soft minor', 'No leading tone — stays smoky.')] },
  { id: 'edm', name: 'EDM', group: 'Genres', blurb: 'Big minor loops, triads for drops, build on ♭VI–♭VII.',
    major: [P('vi IV I V', 'Festival loop', 'Avicii/Calvin Harris anthem loop.'), P('I V vi IV', 'Drop loop', 'Maximally singable for drops.')],
    minor: [P('i bVI bIII bVII', 'Trance loop', 'Euphoric minor loop.'), P('i bVII bVI bVII', 'Big-room', 'Two-step minor rocking.'), P('bVI bVII i i', 'Build to drop', '♭VI–♭VII rise into the drop.')] },
  { id: 'cinematic', name: 'Cinematic', group: 'Genres', blurb: 'Chromatic mediants, epic Aeolian, minor iv.',
    major: [P('I bVI I', 'Chromatic mediant', 'Two major chords a third apart share one note — wonder and scale.'), P('I III IV iv', 'Heroic → tender', 'Major III then minor iv (“hero theme” sigh).'), P('I bIII IV I', 'Epic lift', 'Borrowed ♭III opens up the sky.')],
    minor: [P('i bVI bIII bVII', 'Epic minor', 'Trailer music staple.'), P('i bVI iv V', 'Dark drama', 'Harmonic-minor V for tension.'), P('i III iv i', 'Chromatic minor', 'Major III (not ♭III) — the “villain” mediant.')] },
  { id: 'latin', name: 'Latin / Bossa', group: 'Genres', richer: true, blurb: 'Bossa 7ths, II7 lifts, minor ii–V, syncopation.',
    major: [P('Imaj7 II7 ii7 V7', 'Bossa lift', '“Girl from Ipanema” — II7 (♯4) brightens before the ii–V.'), P('ii7 V7 Imaj7 VI7', 'Bossa cycle', 'Turnaround into the next phrase.')],
    minor: [P('i7 iv7 iiø7 V7', 'Minor bossa', 'Saudade-heavy minor cycle.'), P('i6 iiø7 V7 i6', 'Tango/bolero cadence', 'm6 tonic and half-diminished ii.')],
    modal: [P('i7 IV7', 'Latin Dorian vamp', '“Oye Como Va” — Santana’s Dorian groove.', ['dorian'])] },
  { id: 'reggae', name: 'Reggae', group: 'Genres', blurb: 'Off-beat skank on simple triads; two-chord loops.',
    major: [P('I IV', 'One-drop vamp', 'Bob Marley: two chords, all feel.'), P('I V vi IV', 'Roots loop', 'Pop progression with a skank.')],
    minor: [P('i iv', 'Dub minor', 'Minor two-chord dub loop.'), P('i bVII', 'Rockers', 'i–♭VII rock steady.')] },
  { id: 'flamenco', name: 'Flamenco', group: 'Genres', blurb: 'Andalusian cadence, Phrygian ♭II, major tonic landing.',
    major: [P('iv bIII bII I', 'Por medio cadence', 'Andalusian descent landing on a major tonic.'), P('I bII I', 'Phrygian turn', '♭II to I — the flamenco half-step.')],
    minor: [P('i bVII bVI V', 'Andalusian cadence', 'Descends by step to a major V.'), P('bVI V', 'Falseta landing', '♭VI–V: the Phrygian close on the dominant.')],
    modal: [P('I bII bIII bII', 'Phrygian-dominant', 'Climbing ♭II–♭III and back (“soleá” feel).', ['phrygianDominant', 'phrygian'])] },
  // ---------------- Artist styles ----------------
  { id: 'tool', name: 'TOOL', group: 'Artist styles', tuning: 'toolDropD', blurb: 'Drop-D power chords, Phrygian ♭II, ♭VI, odd meters.',
    major: [P('I5 bII5 I5 bVII5', 'Borrowed ♭II', 'TOOL rarely sits in major — the ♭II/♭VII colours do the work.')],
    minor: [P('i5 bVI i5 bII5 i5', 'Phrygian pivot', 'Artist Lens “Try it”: tonic pedal broken by ♭VI and the half-step ♭II.'), P('i5 bVII5 bVI5 bII5', 'Descending shift', 'Walks down then lands a half-step above home (Artist Lens).')],
    modal: [P('I5 bII5 I5 bVI5', 'Phrygian-dominant', 'Artist Lens: major tonic power chord against ♭II and ♭VI in 7/8.', ['phrygianDominant'])] },
  { id: 'radiohead', name: 'Radiohead', group: 'Artist styles', blurb: 'Chromatic mediants, major III and minor iv, unresolved loops.',
    major: [P('I III IV iv', '“Creep”', 'G–B–C–Cm: major III, then the minor iv sinks.'), P('I iii III IV iv I', 'Mediant flip', 'Artist Lens: iii turns major, then IV turns minor.')],
    minor: [P('bVI bIII bVII iv', 'Floating minor', 'Artist Lens: never touches i until it has to.'), P('i bVI bIII', 'Nude-ish drift', 'Wide minor loop that avoids V.')] },
  { id: 'steely-dan', name: 'Steely Dan', group: 'Artist styles', richer: true, blurb: '“Mu” add9 chords, borrowed iv7, ♭VII9, chromatic ii–V detours.',
    major: [P('Iadd9 IVmaj7 iv7 bVII9 Iadd9', 'Backdoor return', 'Artist Lens: iv7–♭VII9 is the backdoor ii–V home.'), P('ii7 V7sus4 Imaj7', 'Sus cadence', 'Suspended V for a polished, unresolved shine.')],
    modal: [P('I bVII IV I', '“Reelin’ in the Years”', 'A Mixolydian rock-jazz swagger (Hooktheory).', ['mixolydian'])],
    minor: [P('i7 IV9', 'Dorian vamp', '“Do It Again” feel — minor 7 to dominant IV9.'), P('i9 bVImaj7 bVII9', 'Smoky minor', 'Rich extensions over a minor tonic.')] },
  { id: 'the-beatles', name: 'The Beatles', group: 'Artist styles', blurb: 'Borrowed ♭VII, II7, minor iv — classic songcraft.',
    major: [P('I vi IV V', 'Doo-wop roots', 'Artist Lens: early Beatles loop.'), P('I II7 IV I', '“Eight Days a Week”', 'II7 lifts before IV.'), P('I bVII IV I', '“Hey Jude” coda', 'Double plagal.'), P('I iv I', 'Minor iv', '“In My Life” sigh.')],
    minor: [P('i bVI i', '“Eleanor Rigby”', 'Em–C: minor and its ♭VI.'), P('i bVII bVI V', 'Descending bass', 'Andalusian-type walk.')] },
  { id: 'pink-floyd', name: 'Pink Floyd', group: 'Artist styles', blurb: 'Slow Dorian vamps, Mixolydian ♭VII, spacious triads.',
    major: [P('IV V ii I', '“Wish You Were Here”', 'C–D–Am–G in G.'), P('I bVII I IV I', 'Mixolydian sway', 'Artist Lens: “Try it”.')],
    modal: [P('i IV i', '“Another Brick in the Wall”', 'D Dorian — the major IV over a minor home (Hooktheory).', ['dorian'])],
    minor: [P('i7 IV', '“Breathe”', 'Em7–A: Dorian vamp.'), P('i bVII bIII', 'Floating minor', 'Spacious minor triads.')] },
  { id: 'led-zeppelin', name: 'Led Zeppelin', group: 'Artist styles', blurb: 'Mixolydian riffs, blues ♭III, descending minor bass.',
    major: [P('I bVII I IV I', 'Mixolydian riff', 'Artist Lens “Try it”.'), P('I bIII IV I', 'Blues-rock', 'Borrowed ♭III riff.')],
    minor: [P('i bVII bVI V', '“Babe I’m Gonna Leave You”', 'Descending bass to major V.'), P('i bVII bVI bVII', 'Stair-step minor', 'Aeolian descent and back.')] },
  { id: 'nirvana', name: 'Nirvana', group: 'Artist styles', tuning: 'nirvanaEb', blurb: 'Four power chords in minor-pentatonic roots, quiet/loud.',
    major: [P('I5 bIII5 IV5 bVI5', 'Grunge major', 'Pentatonic roots in power chords.')],
    modal: [P('I bVII IV I', 'Mixolydian grunge', 'Major with a ♭VII — “On a Plain”, “Stay Away” sit in Mixolydian (Hooktheory).', ['mixolydian'])],
    minor: [P('i5 iv5 bIII5 bVI5', '“Teen Spirit”', 'F5–B♭5–A♭5–D♭5: minor-pentatonic roots, all power chords.'), P('i5 bIII5 bVII5 iv5', 'Grunge loop', 'Loud minor loop.')] },
  { id: 'metallica', name: 'Metallica', group: 'Artist styles', blurb: 'Palm-muted E power chords, ♭II and ♭V, Aeolian ♭VI–♭VII.',
    major: [P('I5 bVII5 bVI5 bVII5', 'Borrowed power', 'Aeolian chords even in major.')],
    minor: [P('i5 bVII5 bVI5 bVII5', 'Aeolian gallop', 'Riff-driven minor.'), P('i5 bII5 i5 bV5', 'Thrash chromatics', '♭II and the tritone ♭V.')] },
  { id: 'black-sabbath', name: 'Black Sabbath', group: 'Artist styles', tuning: 'sabbathCs', blurb: 'Down-tuned doom riffs, tritone, minor-pentatonic roots.',
    major: [P('I5 bIII5 IV5 bVI5', 'Doom in major', 'Pentatonic roots borrowed from minor.')],
    minor: [P('i5 bIII5 iv5 bVI5 V5', '“Iron Man”', 'B–D–E–G–F♯: minor-pentatonic roots with a major V.'), P('i5 bV5 i5', 'Tritone', '“Black Sabbath” — the ♭5 devil’s interval.')] },
  { id: 'rolling-stones', name: 'Rolling Stones', group: 'Artist styles', tuning: 'stonesOpenG', blurb: 'Open-G I↔IV riffs, ♭VII, blues swagger.',
    major: [P('I IV I bVII', 'Open-G riff', 'One-finger I↔IV moves in open G.'), P('I bVII IV I', 'Rock swagger', '♭VII–IV–I.')],
    minor: [P('i bVII bVI bVII', '“Paint It Black”-ish', 'Minor with ♭VII and ♭VI.')] },
  { id: 'joni-mitchell', name: 'Joni Mitchell', group: 'Artist styles', tuning: 'joniOpenD', blurb: 'Open tunings, sus2/add9 shimmer, unresolved colours.',
    major: [P('Iadd9 IVmaj7 Isus4 I', 'Open-tuning shimmer', 'Ringing open strings blur major/sus colours.'), P('I iii IV I', 'Folk lift', 'Gentle diatonic motion.')],
    minor: [P('iadd9 bVImaj7 bVII', 'Open minor', 'Drone strings over a minor tonic.')] },
  { id: 'sonic-youth', name: 'Sonic Youth', group: 'Artist styles', tuning: 'sonicGGDDGG', blurb: 'Drone open tunings, one-finger shapes, noise.',
    major: [P('I5 bVII5 I5 IV5', 'Drone riff', 'Open-string drones under moving fifths.'), P('I IV I', 'Teen Age Riot', 'G-based drone with IV.')],
    minor: [P('i5 bVII5 bVI5', 'Noise minor', 'Fifths sliding over drones.')] },
  { id: 'deftones', name: 'Deftones', group: 'Artist styles', tuning: 'dropD', blurb: 'add9/maj7 dream colours over heavy drop tuning.',
    major: [P('Iadd9 IVmaj7 vi', 'Dream major', 'Blurred add9 colours.')],
    minor: [P('iadd9 bVImaj7 bIIIadd9 bVII', 'Dream minor', 'Artist Lens “Try it”.')] },
  { id: 'opeth', name: 'Opeth', group: 'Artist styles', blurb: 'Dorian 9ths in acoustic sections, Phrygian heavy sections.',
    major: [], minor: [P('i9 IV i9 bVIImaj7', 'Dorian acoustic', 'Artist Lens: soft Dorian 9ths.'), P('i5 bII5 i5 bVI5', 'Phrygian heavy', 'Artist Lens: the death-metal side.')] },
  { id: 'king-crimson', name: 'King Crimson', group: 'Artist styles', blurb: 'Augmented chords, ♭II, whole-tone and octatonic colour.',
    major: [P('I #IV I', 'Tritone shift', 'Roots a tritone apart.')],
    minor: [P('i5 I+ bII5 V+ i5', 'Augmented chromatics', 'Artist Lens “Try it”.')] },
  { id: 'meshuggah', name: 'Meshuggah', group: 'Artist styles', tuning: 'dropB', blurb: 'Low Phrygian riffs with a tritone; polymeter.',
    major: [], minor: [P('i5 bII5 i5 #IV5', 'Phrygian + tritone', 'Artist Lens (8-string originals, approximated here).')] },
  { id: 'animals-as-leaders', name: 'Animals as Leaders', group: 'Artist styles', blurb: 'Phrygian djent cells, extended chords.',
    major: [], minor: [P('i5 bII5 i5 bVII5', 'Phrygian cell', 'Artist Lens “Try it”.')] },
  { id: 'dream-theater', name: 'Dream Theater', group: 'Artist styles', blurb: 'Prog-metal minor with a Dorian major II.',
    major: [P('I bVII IV bIII', 'Prog majors', 'Descending major chords.')], minor: [P('i iv II V i', 'Dorian twist', 'Artist Lens “Try it”.')] },
  { id: 'rush', name: 'Rush', group: 'Artist styles', blurb: 'Mixolydian riffs in odd meters.',
    major: [P('I bVII IV I', 'Mixolydian 7/8', 'Artist Lens “Try it”.')], minor: [P('i bVII bVI bVII', 'Minor prog', 'Aeolian riffing.')] },
  { id: 'queen', name: 'Queen', group: 'Artist styles', blurb: 'Mixolydian rock with theatrical II–V turns.',
    major: [P('I bVII IV I II V I', 'Theatrical turn', 'Artist Lens “Try it”.')], minor: [P('i bVI bVII i', 'Operatic minor', 'Big Aeolian cadence.')] },
  { id: 'bjork', name: 'Björk', group: 'Artist styles', blurb: 'Lydian II, add9 tonics, strings and beats.',
    major: [P('Iadd9 II vi', 'Lydian verse', 'Artist Lens “Try it”.'), P('Iadd9 II IV V', 'Lydian chorus', 'Artist Lens “Try it”.')], minor: [P('i bVI II', 'Dorian-ish colour', 'Major II in minor.')] },
  { id: 'sigur-ros', name: 'Sigur Rós', group: 'Artist styles', blurb: 'Slow sus2/add9 swells, plagal motion.',
    major: [P('Isus2 IVadd9 vi IVadd9 I', 'Swell', 'Artist Lens “Try it”.')], minor: [P('i bVI bIII bVII', 'Post-rock minor', 'Slow build loop.')] },
  { id: 'portishead', name: 'Portishead', group: 'Artist styles', blurb: 'Line-cliché minor (i–i(maj7)–i7–i6), spy-film V7♭9.',
    major: [], minor: [P('i i(maj7) i7 i6 bVI7 V7b9', 'Line cliché', 'Artist Lens: chromatic descending inner voice.')] },
  { id: 'nine-inch-nails', name: 'Nine Inch Nails', group: 'Artist styles', blurb: 'Lydian II in industrial power chords; bleak Dorian.',
    major: [P('I5 II I5 vii', 'Lydian industrial', 'Artist Lens “Try it”.')], minor: [P('i bIII IV i', '“Hurt”-like', 'Dorian IV lifts the despair.')] },
  { id: 'coltrane', name: 'John Coltrane', group: 'Artist styles', richer: true, blurb: 'Giant Steps major-third cycles; modal Dorian vamps.',
    major: [P('ii7 bIII7 bVImaj7 VII7 IIImaj7 V7 Imaj7', 'Coltrane changes', 'Artist Lens: keys a major third apart.')], minor: [P('i7 IV7 i7 IV7', 'Modal vamp', 'Artist Lens: “Impressions”-style Dorian.')] },
  { id: 'snarky-puppy', name: 'Snarky Puppy', group: 'Artist styles', blurb: 'Dorian fusion grooves.',
    major: [P('Imaj7 II7 IVmaj7 I', 'Fusion lift', 'Bright II7 colour.')], minor: [P('i IV i II V i', 'Dorian groove', 'Artist Lens “Try it”.')] },
  { id: 'debussy', name: 'Debussy', group: 'Artist styles', blurb: 'Parallel chords, whole-tone augmented, pentatonic fifths.',
    major: [P('I5 II5 III5 V5 VI5 V5 I5', 'Parallel fifths', 'Artist Lens: pentatonic planing.'), P('I+ II+ III+', 'Whole-tone', 'Artist Lens: augmented planing.')], minor: [P('i bVII bVI bVII', 'Modal planing', 'Parallel triads.')] },
  { id: 'messiaen', name: 'Messiaen', group: 'Artist styles', blurb: 'Octatonic 7♭9 chords a minor third apart.',
    major: [P('I7b9 bIII7b9 #IV7b9 VI7b9 I7b9', 'Octatonic cycle', 'Artist Lens “Try it”.')], minor: [] },
  { id: 'herrmann', name: 'Bernard Herrmann', group: 'Artist styles', blurb: 'Minor-major 7th suspense, ♭VI, V7♭9.',
    major: [], minor: [P('i(maj7) bVI i(maj7) V7b9', 'Hitchcock chord', 'Artist Lens “Try it”.')] },
  { id: 'bach-chorale', name: 'Bach chorale', group: 'Artist styles', blurb: 'Functional four-part harmony: pre-dominant → dominant → tonic, secondary dominants.',
    major: [P('I IV V I', 'Authentic cadence', 'Tonic–subdominant–dominant–tonic.'), P('vi ii V7 I', 'Circle cadence', 'Roots fall in fifths.'), P('I V/V V I', 'Secondary dominant', 'V of V intensifies the cadence.')],
    minor: [P('i iv V i', 'Minor cadence', 'Raised leading tone in V.'), P('i iiø7 V7 i', 'Half-diminished approach', 'Classical minor pre-dominant.'), P('i bVI iv V', 'Deceptive colour', '♭VI and iv before the half cadence.')] },
];

export const STYLE_BY_ID: Record<string, MusicStyle> = Object.fromEntries(STYLES.map((s) => [s.id, s]));
export const isStyleId = (id: unknown): id is string => typeof id === 'string' && id in STYLE_BY_ID;

export interface RealisedProgression extends StyleProgression { chords: Chord[]; symbols: string[]; borrowed?: boolean }

/** Progressions for this style realised in the user's key/mode (mode-tagged ones first). */
export function styleProgressions(style: MusicStyle | null | undefined, k: Key): RealisedProgression[] {
  const s = style ?? GENERAL_STYLE;
  const fam = MODE_BY_ID[k.mode].family;
  const tagged = (s.modal ?? []).filter((p) => p.modes?.includes(k.mode));
  let list: Array<StyleProgression & { borrowed?: boolean }> = [...tagged, ...(fam === 'major' ? s.major : s.minor)];
  if (!list.length) list = (fam === 'major' ? s.minor : s.major).map((p) => ({ ...p, borrowed: true }));
  const out: RealisedProgression[] = [];
  for (const p of list) {
    const chords = p.roman.map((r) => parseRoman(r, k));
    if (chords.some((c) => !c)) continue;
    out.push({ ...p, chords: chords as Chord[], symbols: (chords as Chord[]).map((c) => chordSymbol(c, true)) });
  }
  return out;
}

type Fam = 'maj' | 'dom' | 'min' | 'dim' | 'aug' | 'sus' | 'power';
function family(q: QualityId): Fam {
  const t = triadClass(q);
  if (t === 'power') return 'power';
  if (t === 'min') return 'min';
  if (t === 'dim') return 'dim';
  if (t === 'aug') return 'aug';
  if (t === 'sus') return 'sus';
  const tones = QUALITY_BY_ID[q].tones.map(([, s]) => s % 12);
  return tones.includes(10) ? 'dom' : 'maj';
}
const BRIGHT: Fam[] = ['maj', 'dom'];
function compatible(a: Fam, b: Fam): boolean {
  if (a === b) return true;
  if (a === 'power' || b === 'power') return a === 'sus' || b === 'sus';
  return BRIGHT.includes(a) && BRIGHT.includes(b);
}
const richEnough = (q: QualityId) => QUALITY_BY_ID[q].tones.length >= 4;

export interface StyleLens {
  style: MusicStyle;
  /** chord vocabulary in this key */
  vocab: Chord[];
  /** root pc → chord families that count as typical there */
  fams: Map<number, Set<Fam>>;
  /** roots the tuning makes easy (nudges), as pitch classes */
  tuningRoots: number[];
}

/** Build the per-key lens for a style; null for “Any style” (nothing dims, nothing moves). */
export function styleLens(styleId: string | null | undefined, k: Key, tuning?: Tuning | null): StyleLens | null {
  const style = styleId ? STYLE_BY_ID[styleId] : undefined;
  if (!style) return null;
  const vocab: Chord[] = [];
  const fams = new Map<number, Set<Fam>>();
  const scale = scalePcs(k);
  const addFam = (r: number, f: Fam) => { if (!fams.has(r)) fams.set(r, new Set()); fams.get(r)!.add(f); };
  for (const p of styleProgressions(style, k)) for (const c of p.chords) {
    if (!vocab.some((v) => pc(v.root) === pc(c.root) && v.quality === c.quality)) vocab.push(c);
    const r = pc(c.root);
    const f = family(c.quality);
    addFam(r, f);
    // A power chord stands for the triad the key implies on that root (C5 in C minor ≈ Cm).
    if (f === 'power') {
      if (scale.includes((r + 3) % 12) && !scale.includes((r + 4) % 12)) addFam(r, 'min');
      else if (scale.includes((r + 4) % 12) && !scale.includes((r + 3) % 12)) addFam(r, 'maj');
    }
  }
  return { style, vocab, fams, tuningRoots: tuning ? tuningFriendlyRoots(tuning) : [] };
}

export type StyleFit = 'typical' | 'tuning' | 'other';
/** How a chord sits in the style: typical (in its vocabulary), tuning (easy in the chosen tuning), or other. */
export function styleFit(chord: Chord, lens: StyleLens | null): StyleFit | null {
  if (!lens) return null;
  const root = pc(chord.root);
  const f = family(chord.quality);
  const hit = [...(lens.fams.get(root) ?? [])].some((v) => compatible(v, f));
  if (hit && (!lens.style.richer || richEnough(chord.quality) || chord.quality === '5')) return 'typical';
  if (lens.tuningRoots.includes(root) && f !== 'dim' && f !== 'aug') return 'tuning';
  return 'other';
}

/** Stable re-rank: style-typical suggestions move up a few places; order is untouched without a lens. */
export function styleRerank<T>(items: T[], chordOf: (t: T) => Chord | null, lens: StyleLens | null, boost = 4): T[] {
  if (!lens) return items;
  return items
    .map((t, i) => {
      const c = chordOf(t);
      const fit = c ? styleFit(c, lens) : null;
      return { t, i, s: i - (fit === 'typical' ? boost : fit === 'tuning' ? boost / 2 : 0) };
    })
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map((x) => x.t);
}
