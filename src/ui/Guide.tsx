// How-to guide: each Muse feature with a plain “how to use it” and why it matters musically.
import type { ReactNode } from 'react';

export type GuideJump = 'chords' | 'melody' | 'bass' | 'artists' | 'moods';

interface Props {
  onJump: (tab: GuideJump) => void;
}

interface Section {
  id: string;
  title: string;
  /** Short label for the TOC (defaults to a trimmed title). */
  toc?: string;
  use: string;
  musicality: string;
  tip?: string;
  jump?: GuideJump;
  jumpLabel?: string;
}

interface TheoryGroup {
  id: string;
  title: string;
  intro: string;
  tips: Array<{ name: string; detail: string }>;
}

const SECTIONS: Section[] = [
  {
    id: 'overview',
    toc: 'Overview',
    title: 'What Muse is for',
    use: 'Build a short progression and/or melody one decision at a time. Hear each option before you add it. Muse ranks suggestions by fit to your key, what you already wrote, and the mood you asked for — not by random aesthetics alone.',
    musicality: 'Songwriting is often “what comes next?” Muse externalizes that choice so you can compare tension, colour, and familiarity with your ears, then lock what feels true.',
  },
  {
    id: 'key',
    toc: 'Key & meter',
    title: 'Key, Auto, and meter',
    use: 'Pick a tonic and mode at the top, or leave Auto on so Muse guesses major/minor from what you enter. Set the meter (time signature) so melody notes land on the right beat grid. BPM next to Play sets playback tempo.',
    musicality: 'Key is “home.” Notes and chords inside the key feel related; outside notes add colour or friction. Meter shapes where strong beats fall — chord tones on strong beats usually feel more settled.',
    tip: 'If Auto keeps flipping your key, turn it off and set the tonic yourself.',
  },
  {
    id: 'timeline',
    toc: 'Timeline',
    title: 'The timeline (three lanes)',
    use: 'Each bar can hold melody on top, a chord in the middle (piano keys by default, or staff — toggle Keys / Staff above the strip), and optional bass notes underneath. From the second bar on, previous-chord tones show in blue-grey next to this bar’s notes. Tap a chord or note label to hear it. Use the lock on a bar to keep it through Clear. Clear / Undo / Play / MIDI / Copy act on the whole timeline.',
    musicality: 'Harmony, melody, and bass are partners. A bar with “no chord” is melody waiting for harmony — a common sketching move before you decide what the chords are. Composed bass replaces the automatic root for that bar when you write one.',
    tip: 'Chord-only timelines hide empty melody/bass lanes so the strip stays clean.',
  },
  {
    id: 'play',
    toc: 'Play & Loop',
    title: 'Play, Loop, and play-from-selection',
    use: '▶ Play runs the timeline; ■ Stop ends early. Loop (on by default) repeats until you stop. Tap a chord card to select it — Play starts from that bar through the rest. A scrolling note ribbon lights each sounding chord/note under the strip.',
    musicality: 'Hearing the phrase from the middle is how arrangers check a landing: does the cadence still earn its home when you skip the setup? Looping a short cell trains your ear on the groove before you expand it.',
    tip: 'Turn Loop off when you want a single pass for export or a final listen.',
  },
  {
    id: 'chords',
    toc: 'Chords',
    title: 'Chords tab — palette & suggestions',
    use: 'Use In this key / 7ths / Open colour / Extra colour / Secondaries for quick adds, or type a symbol (F#m7, Bb/D…). Ranked “Best fit first” cards sit under the Circle of Fifths (each with a piano showing now→next). The next-pick board and ready-made progressions are further down. ▶ hears; ＋ adds.',
    musicality: 'Muse ranks next chords by key fit, voice leading, cadence grammar (V→I, deceptive vi), secondary setup/resolve, bass motion, common pop/jazz skeletons, mood, and tension style. In-key family first; 7ths and Open colour enrich home; Extra colour and Secondaries open the door when you ask for adventure.',
    jump: 'chords',
    jumpLabel: 'Open Chords',
  },
  {
    id: 'bestfit',
    toc: 'Best fit',
    title: 'Best fit first cards',
    use: 'Under the Circle of Fifths, ranked cards show symbol, Roman numeral, mood tags, a short why, and a mini piano of the suggestion. When you already have a chord, blue-grey keys are “now” and coloured keys are “next.” ▶ previews; ＋ adds.',
    musicality: 'Rank is Muse’s best guess at the strongest next step — not a rule. Use the why line and the now→next piano to see voice leading before you commit.',
  },
  {
    id: 'melody',
    toc: 'Melody',
    title: 'Melody tab — keyboard & Listen',
    use: 'Tap the piano strip, 👂 Listen (mic), or 🎹 MIDI to place notes on successive beats. Full bars spill into a new “no chord” bar. Colour tags tell you if a note sits in the chord, adds colour, rubs if held, or clashes.',
    musicality: 'Melody that hugs chord tones on strong beats feels singable; colour notes and mild rubs create interest; clashes want resolution. That push–pull is melodic storytelling.',
    jump: 'melody',
    jumpLabel: 'Open Melody',
    tip: 'Hear on a suggestion previews only the next note — not the whole line — so you judge the step itself.',
  },
  {
    id: 'bass',
    toc: 'Bass',
    title: 'Bass tab — low line under the chords',
    use: 'Switch to Bass next to Melody. Tap the low piano, Listen, or MIDI to place bass notes beat-by-beat under each bar (same packing as melody). The Bass instrument turns on when you add a note if it was Off. Empty bass bars still get an automatic root when Bass isn’t Off.',
    musicality: 'Bass is the floor: roots and fifths feel solid; walks and approaches glue chord changes. Writing a composed line is how you turn a sketch into an arrangement without leaving Muse.',
    jump: 'bass',
    jumpLabel: 'Open Bass',
    tip: '▶ Play prefers your composed bass notes for bars that have them, and keeps the auto root elsewhere.',
  },
  {
    id: 'fit',
    toc: 'What works',
    title: 'Which notes & chords will work — and why',
    use: 'Tags on melody notes and suggestion cards use the same four relations: in the chord, colour note, rubby if held, and clashes. When harmonizing a melody, Muse ranks chords by how many melody notes sit well over them. On the Chords tab, in-key family chords are safest; Open colour stays at home with texture; Extra colour, Secondaries, and Adventurous open the door to borrowed and aiming moves.',
    musicality: '“Works” means the ear can follow a path of tension and release. Chord tones on strong beats feel like home; colour notes create interest; rubs and clashes want to resolve. Muse scores that fit so the top of the list is usually the most singable or convincing next step — your ear still gets the final vote.',
    tip: 'Green “in the chord” + high rank ≈ safe. Orange/red tags are not forbidden — use them on purpose, then resolve.',
    jump: 'chords',
    jumpLabel: 'See chord suggestions',
  },
  {
    id: 'midi',
    toc: 'Mic & MIDI',
    title: 'Mic Listen & MIDI keyboard',
    use: 'Above the palettes, switch Mic ↔ MIDI, then start. Mic hears sung/played notes (YIN) or chords (chroma) — on Bass it favours lower frequencies. MIDI reads a USB/Bluetooth keyboard: press keys for melody or bass, hold a chord ~¼ s on the Chords tab to add it. Stop when you’re done typing.',
    musicality: 'Playing in from a real keyboard keeps your hands in musician space — Muse becomes a notepad that understands pitches and harmony, not just a click-to-add form.',
    tip: 'Web MIDI works best in Chrome/Edge (desktop) and newer Safari. Grant MIDI permission when asked.',
    jump: 'melody',
    jumpLabel: 'Try melody input',
  },
  {
    id: 'harmonize',
    toc: 'Harmonize',
    title: 'Find a chord (harmonize)',
    use: 'When a bar has melody but no chord, the banner offers Find a chord. On the Chords tab, Hear plays each candidate under that melody. ↻ on a filled bar clears the chord so you can reharmonize.',
    musicality: 'Reharmonization is a classic craft: same tune, new chords. Fitting melody “in the chord” stabilizes; deliberate colour or rub changes the emotional read without rewriting the melody.',
    jump: 'chords',
    jumpLabel: 'Go find a chord',
  },
  {
    id: 'nextpick',
    toc: 'Next-pick',
    title: 'Next-pick board',
    use: 'The scatter map places options by familiarity↔colour (or clash↔fit when harmonizing) and calm↔tense. Tap a dot to hear; use the rank strip for a top-to-bottom best-fit list.',
    musicality: 'You’re choosing a path through musical space: safer moves stay left/down; adventurous colours and tension climb up/right. Best fit is the rank order — use the map to understand *why*.',
  },
  {
    id: 'connections',
    toc: 'Connections',
    title: 'How notes connect (within & between)',
    use: 'Under the timeline, “How notes connect” shows two views. Between: each chord change as voice-leading lines (held / half-step / whole / leap), root motion, and any melody or bass bridge across the barline — ▶ Hear move plays the pair. Within: the ordered melody/bass sequence inside each bar with step sizes. Toggle Both / Between / Within.',
    musicality: 'Chords are pillars; notes are the paths between them. Smooth voice leading keeps shared tones and steps the rest; a melody that walks by step across a change feels joined instead of bolted on.',
    tip: 'Add 2+ chords (and optionally a short melody) — the panel appears once there is a sequence or a bridge to show.',
    jump: 'chords',
    jumpLabel: 'Build a short progression',
  },
  {
    id: 'paths',
    toc: 'Paths',
    title: 'Ready-made progressions & melody runs',
    use: 'At the bottom of Suggestions, Muse offers 2- or 3-step packages. For chords, blue passing notes sit between chords. ▶ hears the whole path; ＋ adds it in order.',
    musicality: 'Short paths teach voice-leading and phrase shape: not just “what chord,” but how to walk there so the ear follows. Passing notes are the glue between harmonic pillars.',
  },
  {
    id: 'mood',
    toc: 'Mood',
    title: 'Mood bar & Safe ↔ Adventurous',
    use: 'Type a mood or tap presets (mystical, bluesy, playful…). The slider favors common/safe moves vs rarer/colourful ones. Mood fit % on cards shows alignment with your request.',
    musicality: 'Mood language maps onto brightness, tension, stability, and surprise. Sliding toward Adventurous is how you leave the diatonic neighborhood without losing the thread of “what you’re going for.”',
  },
  {
    id: 'circle',
    toc: 'Circle',
    title: 'Circle of fifths',
    use: 'Big letters add a chord (or melody note on the Melody tab). Letter brightness follows next-pick ranking. Rim chips are Muse’s next picks — variants of the same root stack outward; each pill shows rank + a short quality. Tap a chip to hear. Same-root colour shows “same root” instead of a looping arrow. Ranked Best fit cards sit under the circle.',
    musicality: 'Neighbors on the circle are close harmonic relatives. Clockwise often brightens and aims home (V side); counter-clockwise opens the door (IV side). Opposite = farthest / unstable.',
    tip: 'Under the timeline, set Chords / Melody / Bass instruments separately — ▶ Play layers them.',
  },
  {
    id: 'tension',
    toc: 'Tension',
    title: 'Tension curve',
    use: 'Below the suggestion board, the Tension panel tracks how tense your progression feels for a style (pop/jazz/…). Tap a column to highlight that timeline bar; melody chips use the same colours as the timeline. Blue ring = melody rubs that chord.',
    musicality: 'Songs breathe between tension and release. Watching debt stack tells you when a cadence home will feel earned — and when a colour note is creating the rub you hear.',
  },
  {
    id: 'visuals',
    toc: 'Visuals',
    title: 'Visuals (Piano, Guitar, Moves, Mood, Map)',
    use: 'With a chord selected: Piano / Guitar show where to put your hands; Moves shows how each voice travels; Mood places candidates by dark↔bright and calm↔tense; Map (Tonnetz) shows nearby major/minor triads. Piano already paints now (blue-grey) vs next (suggestion colour).',
    musicality: 'Seeing shared notes and small motion trains smooth voice leading. The mood map is emotional geography; the Tonnetz is geometric neighborhood — both ways of choosing with intention instead of habit.',
  },
  {
    id: 'instruments',
    toc: 'Instruments',
    title: 'Instrument sounds',
    use: 'Assign instruments per part: Chords, Melody, and Bass (Off keeps auto-root-only bass silent). Piano, nylon/steel/metal guitar, Rhodes, pad, Electronic, or bass — metal is clean electric through a high-gain amp/cab.',
    musicality: 'Register and timbre change meaning: pad chords under a bright melody (or a separate bass line) already feels like an arrangement. Hear options in the texture you’ll actually write in.',
  },
  {
    id: 'moods-chords',
    toc: 'Moods list',
    title: 'Moods & chords',
    use: 'Open the menu (☰) → Moods & chords for every mood tag, the chord moves that carry it, and how chord qualities fall back when no theory move matches.',
    musicality: 'Mood is a colour label on a move — not the ranking. Knowing which moves feel tense vs warm helps you choose with intention instead of hoping a tag will sort the list.',
    jump: 'moods',
    jumpLabel: 'Open Moods & chords',
  },
  {
    id: 'artists',
    toc: 'Artists',
    title: 'Artist Lens',
    use: 'From the menu (☰), browse artists’ polarities and techniques, then Try it to load a short exercise into your timeline. Request a song or artist analysis when you want the catalog expanded.',
    musicality: 'Styles are patterns of tension, darkness, and surprise. Trying an exercise is apprenticing for a minute — then remixing it with Muse’s suggestions into your own voice.',
    jump: 'artists',
    jumpLabel: 'Open Artist Lens',
  },
  {
    id: 'lore-export',
    toc: 'Export',
    title: 'Lore mode & export',
    use: 'Lore mode shows folklore notes about keys/chords (not science). Copy / MIDI export your timeline for another DAW or shared lead sheet.',
    musicality: 'Lore is seasoning for imagination. Export is how sketches leave the sandbox and become rehearsal material.',
  },
];

const WORKFLOW: Array<{ step: string; detail: string }> = [
  { step: 'Set key & mood', detail: 'Pick home, tap a mood preset (or type one), leave Safe near the middle.' },
  { step: 'Lay a spine', detail: 'Add 2–4 in-key chords (or a ready-made progression). Hear each one.' },
  { step: 'Loop the cell', detail: 'Select the first bar if you want; ▶ Play with Loop on and live with the groove.' },
  { step: 'Sing a line', detail: 'Switch to Melody; place a short phrase. Watch in-the-chord vs colour tags.' },
  { step: 'Add bass', detail: 'Switch to Bass; plant roots (or a short walk) under a few bars.' },
  { step: 'Harmonize gaps', detail: 'On “no chord” bars, Find a chord and pick by melody fit.' },
  { step: 'Colour on purpose', detail: 'Nudge Adventurous, Open colour, Extra colour, or Secondaries when you want a lift — then resolve home.' },
  { step: 'Check the joins', detail: 'Open How notes connect — fix leaps that feel bolted on.' },
  { step: 'Export', detail: '■ Stop, turn Loop off for a final pass if you like, then MIDI or Copy.' },
];

const THEORY: TheoryGroup[] = [
  {
    id: 'home',
    title: 'Home, away, and coming back',
    intro: 'Most tonal music is a story about leaving home and returning. Muse’s key, Roman numerals, and tension curve are all ways of tracking that story.',
    tips: [
      { name: 'Tonic is rest', detail: 'I (or i in minor) is where phrases like to land. If everything feels unfinished, you may be avoiding tonic on purpose — or you may need a clearer cadence.' },
      { name: 'Dominant pulls home', detail: 'V (and V7) leans hard toward I. A strong chorus often aims at V before the big I. Muse boosts V→I / V→i grammar when ranking.' },
      { name: 'Subdominant opens the door', detail: 'IV (or iv / II in minor flavours) feels like stepping out without leaving the neighborhood. Great for verse lifts and pre-chorus breath.' },
      { name: 'Deceptive cadence', detail: 'V→vi (or V→bVI) is the classic “almost home.” Use it when you want emotion without full release — Muse recognizes the move.' },
      { name: 'Phrase length', detail: '2- and 4-bar cells are easy to loop and remember. Write a small loop first, then expand — that’s why Loop defaults on.' },
    ],
  },
  {
    id: 'voice',
    title: 'Voice leading & common tones',
    intro: 'Listeners track notes moving between chords more than chord labels. Small motion = smooth; leaps = drama.',
    tips: [
      { name: 'Keep what you can', detail: 'If two chords share a pitch, leave it in the same voice. The Piano “now / next” colours and How notes connect both show this.' },
      { name: 'Step the rest', detail: 'Move remaining voices by half or whole step when you can. A leap is fine for one voice — not usually all of them at once.' },
      { name: 'Contrary motion', detail: 'When the bass goes up, try a melody or top voice that falls (or vice versa). It thickens the sense of progress.' },
      { name: 'Guide tones', detail: 'In 7th chords, 3rd and 7th carry the quality. Moving those carefully (e.g. 7→3 into the next chord) is classic jazz glue.' },
      { name: 'Avoid parallel grinding', detail: 'Big parallel leaps in every voice can sound like a MIDI paste. Prefer mixed intervals of motion.' },
    ],
  },
  {
    id: 'melody',
    title: 'Melody that sings',
    intro: 'A melody is a path of tension over harmony. Muse’s four note tags are a practical ear-training language.',
    tips: [
      { name: 'Strong beats love chord tones', detail: 'Land 1–3–5 (or chord extensions you mean) on beats 1 and 3 in 4/4. Weak beats are safer for colour.' },
      { name: 'Colour on purpose', detail: '9ths, 11ths, 13ths, and suspensions create spice. If a tag says “colour,” it’s usually OK while moving — resolve if it starts to ache.' },
      { name: 'Rub vs clash', detail: 'A rub can be expressive if it resolves by step. A clash fights the chord’s third or quality — either change the note or the chord.' },
      { name: 'Stepwise stories', detail: 'Singable lines are mostly steps and small leaps, with one memorable leap as a hook.' },
      { name: 'Sequence', detail: 'Repeat a short shape starting on a new degree (up a step, down a third). Instant motif development.' },
      { name: 'Approach tones', detail: 'Slide into a chord tone from a half step below (or above). Leading tones and chromatic approaches feel intentional.' },
    ],
  },
  {
    id: 'bass',
    title: 'Bass that holds the room',
    intro: 'Bass tells the ear which chord is in charge and how you walk between pillars.',
    tips: [
      { name: 'Root on one', detail: 'Plant the root (or a clear slash bass) on beat 1 unless you’re writing a pedal or inversion on purpose.' },
      { name: 'Fifth for air', detail: 'Roots and fifths feel solid without crowding the midrange. Thirds in the bass change the inversion colour.' },
      { name: 'Walks & approaches', detail: 'Step into the next root from a scale tone or chromatic neighbor on the last beat of the bar.' },
      { name: 'Pedal point', detail: 'Hold one bass note under changing chords for tension (tonic pedal) or drama (dominant pedal).' },
      { name: 'Register', detail: 'Too high and bass fights the chords; too low and samples get muddy. Muse folds notes into each instrument’s range.' },
    ],
  },
  {
    id: 'harmony',
    title: 'Colour, borrowing, and aiming',
    intro: 'Once the spine works, colour is how you sound like *you*. Muse’s Open / Extra / Secondaries palettes map to these moves.',
    tips: [
      { name: '7ths enrich, don’t abandon', detail: 'Imaj7, ii7, V7 keep the same function with more colour. Start here before leaving the key.' },
      { name: 'Open colour', detail: 'sus2/sus4, add9, 6 chords keep home while changing texture — great when Adventurous is still low.' },
      { name: 'Modal borrow', detail: 'Borrow iv, bVII, bVI, etc. from the parallel minor/major for darkness or lift. Extra colour is this door.' },
      { name: 'Secondary dominants', detail: 'V/V, V/vi, etc. aim at a chord that isn’t tonic. Set up → resolve, or the “aim” feels unfinished.' },
      { name: 'ii–V into a target', detail: 'A mini ii–V before any chord (not only I) is the jazz handshake. Muse’s ranking respects setup/resolve pairs.' },
      { name: 'Slash chords', detail: 'Bass not on the root (C/E, Am/G) changes inversion and bass melody without changing the label’s family.' },
    ],
  },
  {
    id: 'rhythm',
    title: 'Meter, groove, and placement',
    intro: 'Harmony is only half the feel — when notes land matters as much as which notes.',
    tips: [
      { name: 'Honor the meter', detail: 'Set 3/4, 6/8, etc. so Muse’s beat grid matches your song. Melody packing follows beats-per-bar.' },
      { name: 'Pickup notes', detail: 'Start a phrase on the “and” of 4 or beat 4 — it leans into the downbeat and feels alive.' },
      { name: 'Don’t change everything at once', detail: 'If harmony leaps, keep rhythm simple. If rhythm is busy, keep chords closer.' },
      { name: 'Silence is a note', detail: 'A rest before a landing chord makes the arrival louder without raising velocity.' },
      { name: 'Loop to test groove', detail: 'If it doesn’t feel good looping for 30 seconds, the cell isn’t ready to expand.' },
    ],
  },
  {
    id: 'form',
    title: 'Building a longer idea',
    intro: 'Muse is a sketchpad for cells. Form is how cells become a song.',
    tips: [
      { name: 'A / A′ / B', detail: 'Repeat a progression, vary the melody (A′), then contrast with a new chord area (B) before returning home.' },
      { name: 'Tension budget', detail: 'Watch the tension curve: stack debt into the pre-chorus, spend it on the chorus I/V cadence.' },
      { name: 'One surprise per phrase', detail: 'A single borrowed chord or clash that resolves beats a bar full of accidents.' },
      { name: 'Register plan', detail: 'Verse lower/mid, chorus higher melody — or thicker chord instruments in the chorus only.' },
      { name: 'Export early', detail: 'MIDI/Copy a loop into your DAW while it’s hot; keep Muse for the next decision, not the final mix.' },
    ],
  },
  {
    id: 'ear',
    title: 'Ear tricks while you write',
    intro: 'Use Muse as a listening lab, not only a clicker.',
    tips: [
      { name: 'Blind A/B', detail: 'Hear two Best fit cards without looking at the rank. Keep the one your body prefers, then check why.' },
      { name: 'Play from the middle', detail: 'Select bar 3 and Play — if the ending still makes sense, your cadence is solid.' },
      { name: 'Mute the label', detail: 'Cover the chord symbol for a second and name the quality by ear (major / minor / dominant).' },
      { name: 'Sing before you tap', detail: 'Hum the next melody note, then find it on the Melody piano. Your voice is the best filter.' },
      { name: 'One lever at a time', detail: 'Change either harmony, melody, or bass — not all three — when something feels off. Easier debugging.' },
    ],
  },
];

function tocLabel(s: Section): string {
  return s.toc ?? s.title.replace(/ — .*| \(.*/, '');
}

function Block({ s, onJump }: { s: Section; onJump: (t: GuideJump) => void }) {
  return (
    <article className="guide-card" id={`guide-${s.id}`}>
      <h3>{s.title}</h3>
      <p className="guide-use"><span className="guide-kicker">How to use it</span>{s.use}</p>
      <p className="guide-mus"><span className="guide-kicker mus">Why it matters</span>{s.musicality}</p>
      {s.tip && <p className="small muted guide-tip">Tip: {s.tip}</p>}
      {s.jump && (
        <button type="button" className="pill" onClick={() => onJump(s.jump!)}>
          {s.jumpLabel ?? 'Try it'}
        </button>
      )}
    </article>
  );
}

export function Guide({ onJump }: Props): ReactNode {
  return (
    <div className="guide-page">
      <header className="guide-hero">
        <h2>How to use Muse</h2>
        <p className="muted">
          A field guide to each feature — what to tap, and how it connects to writing music that feels intentional.
        </p>
      </header>

      <nav className="guide-toc" aria-label="Guide sections">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#guide-${s.id}`}>{tocLabel(s)}</a>
        ))}
        <a href="#guide-theory">Theory tips</a>
      </nav>

      <section className="guide-workflow" aria-label="Suggested workflow">
        <h3>A simple writing loop</h3>
        <ol>
          {WORKFLOW.map((w) => (
            <li key={w.step}><b>{w.step}.</b> {w.detail}</li>
          ))}
        </ol>
      </section>

      {SECTIONS.map((s) => <Block key={s.id} s={s} onJump={onJump} />)}

      <section className="guide-theory" id="guide-theory" aria-label="Music theory tips and tricks">
        <header className="guide-theory-head">
          <h2>Music theory tips &amp; tricks</h2>
          <p className="muted">
            Practical moves you can try inside Muse — cadences, voice leading, melody colour, bass walks, and form.
            Use them as lenses, not laws; your ear still decides.
          </p>
        </header>
        <nav className="guide-theory-toc" aria-label="Theory topics">
          {THEORY.map((g) => (
            <a key={g.id} href={`#theory-${g.id}`}>{g.title}</a>
          ))}
        </nav>
        {THEORY.map((g) => (
          <article key={g.id} className="guide-theory-group" id={`theory-${g.id}`}>
            <h3>{g.title}</h3>
            <p className="guide-theory-intro">{g.intro}</p>
            <ul className="guide-theory-list">
              {g.tips.map((t) => (
                <li key={t.name}>
                  <b>{t.name}.</b> {t.detail}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <p className="small muted center guide-foot">
        Muse works offline on this device. Suggestions are helpers — your ear has the final vote.
      </p>
    </div>
  );
}
