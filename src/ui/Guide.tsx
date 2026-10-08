// How-to guide: each Muse feature with a plain “how to use it” and why it matters musically.
import type { ReactNode } from 'react';

export type GuideJump = 'chords' | 'melody' | 'bass' | 'artists' | 'moods';

interface Props {
  onJump: (tab: GuideJump) => void;
}

interface Section {
  id: string;
  title: string;
  use: string;
  musicality: string;
  tip?: string;
  jump?: GuideJump;
  jumpLabel?: string;
}

const SECTIONS: Section[] = [
  {
    id: 'overview',
    title: 'What Muse is for',
    use: 'Build a short progression and/or melody one decision at a time. Hear each option before you add it. Muse ranks suggestions by fit to your key, what you already wrote, and the mood you asked for — not by random aesthetics alone.',
    musicality: 'Songwriting is often “what comes next?” Muse externalizes that choice so you can compare tension, colour, and familiarity with your ears, then lock what feels true.',
  },
  {
    id: 'key',
    title: 'Key, Auto, and meter',
    use: 'Pick a tonic and mode at the top, or leave Auto on so Muse guesses major/minor from what you enter. Set the meter (time signature) so melody notes land on the right beat grid.',
    musicality: 'Key is “home.” Notes and chords inside the key feel related; outside notes add colour or friction. Meter shapes where strong beats fall — chord tones on strong beats usually feel more settled.',
    tip: 'If Auto keeps flipping your key, turn it off and set the tonic yourself.',
  },
  {
    id: 'timeline',
    title: 'The timeline (three lanes)',
    use: 'Each bar can hold melody on top, a chord in the middle (staff of its notes above the name), and optional bass notes underneath. Tap a chord or note label to hear it. Use the lock on a bar to keep it through Clear. Clear / Undo / Play / MIDI / Copy act on the whole timeline.',
    musicality: 'Harmony, melody, and bass are partners. A bar with “no chord” is melody waiting for harmony — a common sketching move before you decide what the chords are. Composed bass replaces the automatic root for that bar when you write one.',
    tip: 'Tap a chord card to select it — ▶ Play starts from that bar and continues through the rest. Loop (on by default) repeats until you ■ Stop. Chord-only timelines skip the empty melody/bass lanes. Use BPM next to Play to change tempo.',
  },
  {
    id: 'chords',
    title: 'Chords tab — palette & suggestions',
    use: 'Use In this key / 7ths / Open colour / Extra colour / Secondaries for quick adds, or type a symbol (F#m7, Bb/D…). Ranked “Best fit first” cards sit under the Circle of Fifths (each with a piano of the chord notes); timeline bars show the chord on a staff above the name. The next-pick board and ready-made progressions are further down. ▶ hears; ＋ adds.',
    musicality: 'Muse ranks next chords by key fit, voice leading, cadence grammar (V→I, deceptive vi), secondary setup/resolve, bass motion, common pop/jazz skeletons, mood, and tension style. In-key family first; 7ths and Open colour enrich home; Extra colour and Secondaries open the door when you ask for adventure.',
    jump: 'chords',
    jumpLabel: 'Open Chords',
  },
  {
    id: 'melody',
    title: 'Melody tab — keyboard & Listen',
    use: 'Tap the piano strip, 👂 Listen (mic), or 🎹 MIDI to place notes on successive beats. Full bars spill into a new “no chord” bar. Colour tags tell you if a note sits in the chord, adds colour, rubs if held, or clashes.',
    musicality: 'Melody that hugs chord tones on strong beats feels singable; colour notes and mild rubs create interest; clashes want resolution. That push–pull is melodic storytelling.',
    jump: 'melody',
    jumpLabel: 'Open Melody',
    tip: 'Hear on a suggestion previews only the next note — not the whole line — so you judge the step itself.',
  },
  {
    id: 'bass',
    title: 'Bass tab — low line under the chords',
    use: 'Switch to Bass next to Melody. Tap the low piano, Listen, or MIDI to place bass notes beat-by-beat under each bar (same packing as melody). The Bass instrument turns on when you add a note if it was Off. Empty bass bars still get an automatic root when Bass isn’t Off.',
    musicality: 'Bass is the floor: roots and fifths feel solid; walks and approaches glue chord changes. Writing a composed line is how you turn a sketch into an arrangement without leaving Muse.',
    jump: 'bass',
    jumpLabel: 'Open Bass',
    tip: '▶ Play prefers your composed bass notes for bars that have them, and keeps the auto root elsewhere.',
  },
  {
    id: 'fit',
    title: 'Which notes & chords will work — and why',
    use: 'Tags on melody notes and suggestion cards use the same four relations: in the chord (sits on a chord tone), colour note (adds spice that usually still fits), rubby if held (fine while moving, harsh if sustained), and clashes (fights the chord’s quality). When harmonizing a melody, Muse ranks chords by how many melody notes sit well over them. On the Chords tab, in-key family chords are safest; Open colour stays at home with texture; Extra colour, Secondaries, and Adventurous open the door to borrowed and aiming moves.',
    musicality: '“Works” means the ear can follow a path of tension and release. Chord tones on strong beats feel like home; colour notes create interest; rubs and clashes want to resolve. Muse scores that fit so the top of the list is usually the most singable or convincing next step — your ear still gets the final vote.',
    tip: 'Green “in the chord” + high rank ≈ safe. Orange/red tags are not forbidden — use them on purpose, then resolve.',
    jump: 'chords',
    jumpLabel: 'See chord suggestions',
  },
  {
    id: 'midi',
    title: 'Mic Listen & MIDI keyboard',
    use: 'Above the palettes, switch Mic ↔ MIDI, then start. Mic hears sung/played notes (YIN) or chords (chroma) — on Bass it favours lower frequencies. MIDI reads a USB/Bluetooth keyboard: press keys for melody or bass, hold a chord ~¼ s on the Chords tab to add it. Stop when you’re done typing.',
    musicality: 'Playing in from a real keyboard keeps your hands in musician space — Muse becomes a notepad that understands pitches and harmony, not just a click-to-add form.',
    tip: 'Web MIDI works best in Chrome/Edge (desktop) and newer Safari. Grant MIDI permission when asked.',
    jump: 'melody',
    jumpLabel: 'Try melody input',
  },
  {
    id: 'harmonize',
    title: 'Find a chord (harmonize)',
    use: 'When a bar has melody but no chord, the banner offers Find a chord. On the Chords tab, Hear plays each candidate under that melody. ↻ on a filled bar clears the chord so you can reharmonize.',
    musicality: 'Reharmonization is a classic craft: same tune, new chords. Fitting melody “in the chord” stabilizes; deliberate colour or rub changes the emotional read without rewriting the melody.',
    jump: 'chords',
    jumpLabel: 'Go find a chord',
  },
  {
    id: 'nextpick',
    title: 'Next-pick board',
    use: 'The scatter map places options by familiarity↔colour (or clash↔fit when harmonizing) and calm↔tense. Tap a dot to hear; use the rank strip for a top-to-bottom best-fit list.',
    musicality: 'You’re choosing a path through musical space: safer moves stay left/down; adventurous colours and tension climb up/right. Best fit is the rank order — use the map to understand *why*.',
  },
  {
    id: 'connections',
    title: 'How notes connect (within & between)',
    use: 'Under the timeline, “How notes connect” shows two views. Between: each chord change as voice-leading lines (held / half-step / whole / leap), root motion, and any melody or bass bridge across the barline — ▶ Hear move plays the pair. Within: the ordered melody/bass sequence inside each bar with step sizes. Toggle Both / Between / Within.',
    musicality: 'Chords are pillars; notes are the paths between them. Smooth voice leading keeps shared tones and steps the rest; a melody that walks by step across a change feels joined instead of bolted on. Watching the sequence trains your ear to hear connection, not just labels.',
    tip: 'Add 2+ chords (and optionally a short melody) — the panel appears once there is a sequence or a bridge to show.',
    jump: 'chords',
    jumpLabel: 'Build a short progression',
  },
  {
    id: 'paths',
    title: 'Ready-made progressions & melody runs',
    use: 'At the bottom of Suggestions, Muse offers 2- or 3-step packages. For chords, blue passing notes sit between chords. ▶ hears the whole path; ＋ adds it in order.',
    musicality: 'Short paths teach voice-leading and phrase shape: not just “what chord,” but how to walk there so the ear follows. Passing notes are the glue between harmonic pillars.',
  },
  {
    id: 'mood',
    title: 'Mood bar & Safe ↔ Adventurous',
    use: 'Type a mood (haunting, victorious but bittersweet…) or tap presets. The slider favors common/safe moves vs rarer/colourful ones. Mood fit % on cards shows alignment with your request.',
    musicality: 'Mood language maps onto brightness, tension, stability, and surprise. Sliding toward Adventurous is how you leave the diatonic neighborhood without losing the thread of “what you’re going for.”',
  },
  {
    id: 'circle',
    title: 'Circle of fifths',
    use: 'Big letters add a chord (or melody note on the Melody tab). Letter brightness follows next-pick ranking (strongest suggestions glow most). Rim chips are Muse’s next picks — variants of the same root stack outward on that spoke so nothing overlaps; each pill shows rank + a short quality (Δ7, m, 7…); brighter / lower number = better. Tap a chip to hear. Same-root colour (e.g. C→Cmaj7) shows “same root” instead of a looping arrow. +1/−1 under letters = steps from where you are. Ranked “Best fit first” cards sit directly under the circle.',
    musicality: 'Neighbors on the circle are close harmonic relatives. Clockwise often brightens and aims home (V side); counter-clockwise opens the door (IV side). Opposite = farthest / unstable.',
    tip: 'Under the timeline, set Chords / Melody / Bass instruments separately — ▶ Play layers them.',
  },
  {
    id: 'tension',
    title: 'Tension curve',
    use: 'Below the suggestion board, the Tension panel tracks how tense your progression feels for a style (pop/jazz/…). Tap a column to highlight that timeline bar; melody chips use the same colours as the timeline (in the chord / colour / rub / clash). Blue ring = melody rubs that chord.',
    musicality: 'Songs breathe between tension and release. Watching debt stack tells you when a cadence home will feel earned — and when a colour note is creating the rub you hear.',
  },
  {
    id: 'visuals',
    title: 'Visuals (Piano, Guitar, Moves, Mood, Map)',
    use: 'With a chord selected: Piano / Guitar show where to put your hands; Moves shows how each voice travels; Mood places candidates by dark↔bright and calm↔tense; Map (Tonnetz) shows nearby major/minor triads.',
    musicality: 'Seeing shared notes and small motion trains smooth voice leading. The mood map is emotional geography; the Tonnetz is geometric neighborhood — both ways of choosing with intention instead of habit.',
  },
  {
    id: 'instruments',
    title: 'Instrument sounds',
    use: 'Assign instruments per part: Chords, Melody, and Bass (Off keeps auto-root-only bass silent as its own part). Piano, nylon/steel/metal guitar, Rhodes, pad, Electronic (saw lead), or bass — metal is clean electric guitar through a high-gain amp/cab. When Bass is on, chords stay upper voices; use the Bass tab to write a composed line instead of only the automatic root.',
    musicality: 'Register and timbre change meaning: pad chords under a bright melody (or a separate bass line) already feels like an arrangement. Hear options in the texture you’ll actually write in.',
  },
  {
    id: 'moods-chords',
    title: 'Moods & chords',
    use: 'Open the menu (☰) → Moods & chords for every mood tag, the chord moves that carry it, and how chord qualities fall back when no theory move matches.',
    musicality: 'Mood is a colour label on a move — not the ranking. Knowing which moves feel tense vs warm helps you choose with intention instead of hoping a tag will sort the list.',
    jump: 'moods',
    jumpLabel: 'Open Moods & chords',
  },
  {
    id: 'artists',
    title: 'Artist Lens',
    use: 'From the menu (☰), browse artists’ polarities and techniques, then Try it to load a short exercise into your timeline. Request a song or artist analysis when you want the catalog expanded.',
    musicality: 'Styles are patterns of tension, darkness, and surprise. Trying an exercise is apprenticing for a minute — then remixing it with Muse’s suggestions into your own voice.',
    jump: 'artists',
    jumpLabel: 'Open Artist Lens',
  },
  {
    id: 'lore-export',
    title: 'Lore mode & export',
    use: 'Lore mode shows folklore notes about keys/chords (not science). Copy / MIDI export your timeline for another DAW or shared lead sheet.',
    musicality: 'Lore is seasoning for imagination. Export is how sketches leave the sandbox and become rehearsal material.',
  },
];

const WORKFLOW: Array<{ step: string; detail: string }> = [
  { step: 'Set key & mood', detail: 'Pick home, type a mood, leave Safe near the middle.' },
  { step: 'Lay a spine', detail: 'Add 2–4 in-key chords (or a ready-made progression). Hear each one.' },
  { step: 'Sing a line', detail: 'Switch to Melody; place a short phrase. Watch in-the-chord vs colour tags.' },
  { step: 'Add bass', detail: 'Switch to Bass; plant roots (or a short walk) under a few bars.' },
  { step: 'Harmonize gaps', detail: 'On “no chord” bars, Find a chord and pick by melody fit.' },
  { step: 'Colour on purpose', detail: 'Nudge Adventurous, Open colour, Extra colour, or Secondaries when you want a lift — then resolve home.' },
  { step: 'Export', detail: '▶ Play the whole thing, then MIDI or Copy into your other tools.' },
];

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
          <a key={s.id} href={`#guide-${s.id}`}>{s.title.replace(/ — .*| \(.*/, '')}</a>
        ))}
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

      <p className="small muted center guide-foot">
        Muse works offline on this device. Suggestions are helpers — your ear has the final vote.
      </p>
    </div>
  );
}
