// Interactive theory guide: 14 chapters, beginner → advanced. Every fact is drawn from repo data/docs:
// scales.ts (MODES, intervals), earGym.ts (degree feels), lessons.ts (CONCEPTS, BRIGHTNESS), styleProfiles.ts
// (MODE_FEEL, profile sources), songwriting.ts (strums, prosody), tunings.ts, research/tension/tension_report.md,
// docs/style-coherence.md, docs/dialectic/*. Chapter structure mirrors /workspace/muse-guide (PDF guide) —
// keep in sync when its HTML source lands. Examples are realised in the user's CURRENT key.
import { Chord, chordSymbol } from './chords';
import { mod } from './notes';
import { Key, MODE_BY_ID, diatonicChords, key as mkKey, tonicPc } from './scales';
import { parseRoman } from './roman';
import { modeDegrees, degreeMidi, homeCadence } from './earGym';
import { BRIGHTNESS } from './lessons';

export type GuideVisual = 'keyboard' | 'fretboard' | 'ladder' | 'modes' | 'tension' | 'functions' | 'strum' | 'lyric';
export interface GuideSound { label: string; chords?: Chord[]; notes?: number[]; step?: number }
export interface GuideQuiz { q: string; options: string[]; answer: number; why: string; sound?: GuideSound }
export interface GuideTry { label: string; tool: string; tab?: string; mode?: Key['mode'] }
export interface GuideChapter {
  id: string; n: number; title: string; level: 'Start here' | 'Core' | 'Going further';
  idea: string; revisit?: string; body: string[]; visual?: GuideVisual;
  sounds: GuideSound[]; tries: GuideTry[]; quiz: GuideQuiz[]; sources: string[];
}
export const GUIDE_PEDAGOGY: Array<{ name: string; how: string; src: string }> = [
  { name: 'Sound before symbol', how: 'Every idea starts with something to hear or play; the name comes after.', src: 'Kodály & Dalcroze practice; Gordon’s audiation (Music Learning Theory); JMTP “Contextual Ear Training”' },
  { name: 'Hear notes as steps of home', how: 'Notes are taught as scale steps with feelings (home, strong, leans home), not letter names.', src: 'Functional / contextual ear training (JMTP); Hooktheory relative notation' },
  { name: 'Spiral', how: 'Each chapter revisits an earlier idea at a deeper level (look for “Revisit”).', src: 'Bruner’s spiral curriculum' },
  { name: 'Worked examples', how: 'Each chapter has examples in your key you can hear before trying it yourself.', src: 'Sweller — worked-example effect (cognitive load theory)' },
  { name: 'Retrieval practice', how: 'Short quizzes with instant feedback; missed ideas come back in the Ear gym later.', src: 'Roediger & Karpicke 2006; Hua 2015 (spaced interval practice)' },
  { name: 'Dual coding', how: 'Words + pictures + sound: keyboards, fretboards, the coloured step ladder, curves.', src: 'Paivio — dual coding; Mayer — multimedia learning' },
  { name: 'Real songs & making things', how: 'Ideas link to famous songs and to Muse tools where you build your own.', src: 'Hooktheory TheoryTab practice; Muse docs/dialectic' },
];

const R = (k: Key, rs: string) => rs.split(' ').map((r) => parseRoman(r, k)).filter(Boolean) as Chord[];
const minorOf = (k: Key) => mkKey(['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][tonicPc(k)]!, 'minor');
const majorOf = (k: Key) => ({ ...k, mode: 'major' as const });
const scaleRun = (k: Key) => { const d = modeDegrees(k); return [...d.map((x) => degreeMidi(k, x, 60)), degreeMidi(k, d[0]!, 60) + 12]; };

/** Chapters with sounds realised in key `k0` (major/minor variants derived from its tonic). */
export function guideChapters(k0: Key): GuideChapter[] {
  const M = majorOf(k0); const m = minorOf(k0); const d = diatonicChords(M);
  const T = chordSymbol(d[0]!, true);
  return [
    { id: 'sound', n: 1, title: 'Sound & notes', level: 'Start here', visual: 'keyboard',
      idea: 'Music uses 12 notes that repeat higher and lower. A half step is the next key or fret; a whole step skips one.',
      body: ['There are 7 letter names (A–G) and 5 in-between notes (sharps/flats) — 12 in all, then they repeat an octave higher.', 'Half step = next piano key = one guitar fret. Whole step = two.', 'Pitch is how high or low; the same note an octave apart sounds “the same, but higher”.'],
      sounds: [{ label: 'Half step, then whole step', notes: [60, 61, 60, 62], step: 0.45 }, { label: 'Same note, an octave apart', notes: [60, 72, 60, 72], step: 0.5 }],
      tries: [{ label: 'Tune your guitar', tool: 'tuner' }],
      quiz: [{ q: 'How many different notes are there before they repeat?', options: ['7', '8', '12'], answer: 2, why: '7 letters + 5 sharps/flats = 12, then the octave repeats.' },
        { q: 'Which is a half step?', options: ['Next fret on the same string', 'Two frets up', 'The next string'], answer: 0, why: 'One fret = one half step (one semitone).', sound: { label: 'Hear a half step', notes: [64, 65], step: 0.5 } }],
      sources: ['src/core/notes.ts', 'muse-guide keyboard / fret diagrams'] },
    { id: 'scales', n: 2, title: 'Scales, keys & scale steps', level: 'Start here', visual: 'ladder', revisit: 'Half & whole steps (ch. 1) make the scale’s pattern.',
      idea: 'A key picks 7 of the 12 notes and one of them is home. Each note’s step number tells you how it feels against home.',
      body: ['Major scale pattern: whole-whole-half-whole-whole-whole-half (scales.ts intervals 0 2 4 5 7 9 11).', 'Steps have feelings: 1 home · 3 colour · 5 strong · 7 leans home · 4 lifted · 6 soft · 2 passing (earGym.ts).', 'Learning steps (not letters) means your ear works in every key.'],
      sounds: [{ label: `Set up home, then the scale (${MODE_BY_ID.major.name})`, notes: scaleRun(M), step: 0.32 }, { label: 'Home cadence', chords: homeCadence(M) }],
      tries: [{ label: 'Ear gym · Home notes', tool: 'gym', tab: 'degree' }],
      quiz: [{ q: 'In a major key, which step “leans home” hardest?', options: ['5', '7', '4'], answer: 1, why: '7 sits a half step under home and pulls up into it.', sound: { label: 'Hear 7 → 1', notes: [degreeMidi(M, modeDegrees(M)[6]!), degreeMidi(M, modeDegrees(M)[6]!) + 1] } },
        { q: 'Which step is home?', options: ['1', '5', '8'], answer: 0, why: 'Step 1 is home (8 is just 1 again, an octave up).' }],
      sources: ['src/core/scales.ts', 'src/core/earGym.ts (FEEL)', 'JMTP Contextual Ear Training'] },
    { id: 'chords', n: 3, title: 'Chords', level: 'Start here', visual: 'keyboard', revisit: 'Chords are stacked scale steps (ch. 2): 1-3-5.',
      idea: 'A chord is notes played together — usually every other note of the scale: a root, a 3rd and a 5th.',
      body: ['Major chord = bright; minor chord = sad: the only difference is the 3rd (one half step).', 'Power chords (root + 5th) have no 3rd, so they are neither happy nor sad — heavy and neutral.', 'Sus chords swap the 3rd for a neighbour — open, wanting to settle. 7th chords add one more note on top.'],
      sounds: [{ label: `${T} major vs minor`, chords: [d[0]!, { ...d[0]!, quality: 'min' }] }, { label: 'Power chord, sus4 → settle, 7th', chords: [{ ...d[0]!, quality: '5' }, { ...d[0]!, quality: 'sus4' }, d[0]!, { ...d[0]!, quality: 'maj7' }] }],
      tries: [{ label: 'Lessons · Your theory', tool: 'lessons', tab: 'theory' }],
      quiz: [{ q: 'What makes a chord major or minor?', options: ['The root', 'The 3rd', 'The 5th'], answer: 1, why: 'Lowering the 3rd by a half step turns major into minor.', sound: { label: 'Major then minor', chords: [d[0]!, { ...d[0]!, quality: 'min' }] } },
        { q: 'Which chord is neither happy nor sad?', options: ['Power chord', 'Minor', 'Major 7th'], answer: 0, why: 'It has no 3rd (lessons.ts “Power chord”).' }],
      sources: ['src/core/chords.ts', 'src/core/lessons.ts (CONCEPTS)'] },
    { id: 'roman', n: 4, title: 'Roman numerals & function', level: 'Core', visual: 'functions', revisit: 'Chords built on each scale step (ch. 2–3).',
      idea: 'Name chords by the scale step they start on (I, ii, V…) and you can talk about songs in any key. Chords have jobs: home, away, and pulling back.',
      body: ['Capital = major (I, IV, V), lower case = minor (ii, iii, vi), ° = diminished.', 'Home (tonic): I, vi, iii. Away (pre-dominant): IV, ii. Pull-home (dominant): V, vii°.', 'V → I is the strongest pull in tonal music.'],
      sounds: [{ label: 'The 7 chords of the key', chords: d, step: 0.55 }, { label: 'Home → away → pull → home', chords: R(M, 'I IV V I') }],
      tries: [{ label: 'Ear gym · Name it', tool: 'gym', tab: 'name' }],
      quiz: [{ q: 'Which chord has the “pull-home” job?', options: ['IV', 'V', 'vi'], answer: 1, why: 'V (dominant) leads strongly to I.', sound: { label: 'V → I', chords: R(M, 'V I') } },
        { q: 'In a major key, vi is…', options: ['major', 'minor', 'diminished'], answer: 1, why: 'Lower-case numerals are minor chords.' }],
      sources: ['src/core/roman.ts', 'src/core/scales.ts diatonicChords'] },
    { id: 'progressions', n: 5, title: 'Progressions & cadences', level: 'Core', visual: 'functions', revisit: 'Chord jobs (ch. 4) in order make a progression.',
      idea: 'A progression is a chord path; a cadence is how a phrase ends — finished, a question, or a fake-out.',
      body: ['Strong landing (authentic): V → I. Amen (plagal): IV → I. Question mark (half): ends on V. Fake-out (deceptive): V → vi (lessons.ts).', 'I–V–vi–IV powers dozens of hits (see Songs like yours).'],
      sounds: [{ label: 'Strong landing V → I', chords: R(M, 'I IV V I') }, { label: 'Fake-out V → vi', chords: R(M, 'I IV V vi') }, { label: 'Question mark', chords: R(M, 'I IV I V') }],
      tries: [{ label: 'Lessons · Fix it', tool: 'lessons', tab: 'fix' }, { label: 'Songs like yours', tool: 'songs' }],
      quiz: [{ q: 'Listen: how does this phrase end?', options: ['Finished', 'Question mark', 'Fake-out'], answer: 2, why: 'V sets up home, then lands on vi instead.', sound: { label: 'Play the phrase', chords: R(M, 'I IV V vi') } },
        { q: 'Which ending feels most final?', options: ['V → I', 'I → V', 'IV → V'], answer: 0, why: 'The authentic cadence V → I.' }],
      sources: ['src/core/lessons.ts (CONCEPTS, detectConcepts)', 'src/core/songCatalog.ts'] },
    { id: 'tension', n: 6, title: 'Tension, release & dissonance', level: 'Core', visual: 'tension', revisit: 'Cadences (ch. 5) are where tension releases.',
      idea: 'Music feels like it leans away from home and comes back. A little dissonance is good; the sweet spot is in the middle.',
      body: ['How tense a chord sounds tracks its dissonance closely, and this holds across listeners (Lahdelma & Eerola 2016, 2020).', '7ths and 9ths are mild colours people like; clusters and ♭9 stacks are the “expensive” chords.', 'Liking follows an inverted U: moderate surprise in a predictable setting is best (Cheung et al. 2019).', 'Tension is felt relative to home, not just chord to chord.'],
      sounds: [{ label: 'Rise and release', chords: R(M, 'I IV ii V7 I'), step: 0.9 }],
      tries: [{ label: 'Tension arc', tool: 'arc' }, { label: 'Release finder', tool: 'release' }],
      quiz: [{ q: 'Which amount of surprise do listeners tend to like most?', options: ['None', 'A moderate amount', 'As much as possible'], answer: 1, why: 'The inverted-U (Wundt/Berlyne) — confirmed for chords by Cheung et al. 2019.' }],
      sources: ['research/tension/tension_report.md', 'src/core/harmonyTension.ts'] },
    { id: 'modes', n: 7, title: 'Modes, bright → dark', level: 'Going further', visual: 'modes', revisit: 'Same home note (ch. 2), one scale step changed.',
      idea: 'Keep the same home note and change one scale step at a time: Lydian is brightest, Locrian darkest.',
      body: [`Ladder: ${BRIGHTNESS.map((x) => MODE_BY_ID[x].name.replace(/ \(.*\)/, '')).join(' → ')}.`, 'Each neighbour differs by exactly one note (lessons.ts modeStepNote).', 'Rock loves Mixolydian (♭7); Dorian is “hopeful minor”; Phrygian (♭2) sounds menacing (TOOL, metal).'],
      sounds: BRIGHTNESS.slice(0, 7).filter((_, i) => i % 2 === 0).map((mm) => ({ label: MODE_BY_ID[mm].name, notes: scaleRun({ ...M, mode: mm }), step: 0.26 })),
      tries: [{ label: 'Lessons · Mode morph', tool: 'lessons', tab: 'modes' }],
      quiz: [{ q: 'Which mode is brightest?', options: ['Dorian', 'Lydian', 'Phrygian'], answer: 1, why: 'Lydian’s raised 4th makes it the top of the ladder.' },
        { q: 'Going from major to Mixolydian you…', options: ['lower the 7th', 'raise the 4th', 'lower the 3rd'], answer: 0, why: 'Mixolydian = major with ♭7.' }],
      sources: ['src/core/scales.ts MODES', 'src/core/lessons.ts BRIGHTNESS', 'src/core/styleProfiles.ts MODE_FEEL'] },
    { id: 'borrowed', n: 8, title: 'Borrowed & secondary chords, key changes', level: 'Going further', visual: 'functions', revisit: 'Chord jobs (ch. 4) can point at chords other than home.',
      idea: 'Borrow a chord from the opposite mood for bittersweet colour; use a secondary dominant to point at a non-home chord; change key for a lift.',
      body: ['Borrowed: iv or ♭VI in a major key (from the parallel minor).', 'Secondary dominant: e.g. V/V (II7) points at V.', 'Key changes: shared chord (smooth), the new key’s V (clear), or just jump up a half/whole step (bold).'],
      sounds: [{ label: 'Borrowed iv', chords: R(M, 'I IV iv I') }, { label: 'Secondary V/V', chords: R(M, 'I V/V V I') }],
      tries: [{ label: 'Song helpers · Key change', tool: 'helpers', tab: 'mod' }, { label: 'Missions', tool: 'lessons', tab: 'missions' }],
      quiz: [{ q: 'Which sounds “bittersweet” in a major key?', options: ['iv (minor four)', 'V', 'I'], answer: 0, why: 'iv is borrowed from the parallel minor.', sound: { label: 'Hear it', chords: R(M, 'I IV iv I') } }],
      sources: ['src/core/lessons.ts', 'src/core/songwriting.ts modulationRoutes', 'src/core/roman.ts (secondary)'] },
    { id: 'melody', n: 9, title: 'Melody vs chords, hooks & lyric stress', level: 'Going further', visual: 'lyric', revisit: 'Chord notes (ch. 3) are where melodies land.',
      idea: 'Melodies mostly step, leap occasionally (then step back), repeat an idea, and land on chord notes; stressed syllables go on strong beats.',
      body: ['Coach traits: smooth steps, about an octave of range, a repeated idea, landing on chord tones, ending home (songwriting.ts melodyCoach).', 'Hooks = repetition with variation: repeat, answer a step higher, turn upside down.', 'Prosody: stressed syllables on strong beats (Pattison).'],
      sounds: [{ label: 'Steps, then a leap that steps back', notes: [64, 62, 60, 62, 64, 72, 71, 69], step: 0.3 }],
      tries: [{ label: 'Melody coach', tool: 'helpers', tab: 'coach' }, { label: 'Lyric stress', tool: 'helpers', tab: 'lyrics' }],
      quiz: [{ q: 'After a big leap up, a melody usually…', options: ['leaps again', 'steps back down', 'stops'], answer: 1, why: 'Leap then step back makes the jump feel intentional (melody coach).' }],
      sources: ['src/core/songwriting.ts', 'docs/dialectic/14, 16, 17'] },
    { id: 'rhythm', n: 10, title: 'Rhythm & strumming', level: 'Core', visual: 'strum', revisit: 'Same chords (ch. 5), different feel.',
      idea: 'The same chords become a different genre when the rhythm changes. Keep your strumming hand moving down-up.',
      body: ['Downs on the beat, ups in between; “miss” the strings for rests.', 'Reggae strums only the off-beats; punk is all downstrokes; folk skips a down: D-DU-UDU (songwriting.ts STRUMS).'],
      sounds: [{ label: 'Chords on every beat', chords: R(M, 'I I I I'), step: 0.4 }],
      tries: [{ label: 'Song helpers · Strum', tool: 'helpers', tab: 'strum' }, { label: 'Play-along', tool: 'practice' }],
      quiz: [{ q: 'A reggae skank strums on…', options: ['every beat', 'the off-beats', 'beat 1 only'], answer: 1, why: 'The “and”s — short choppy off-beat strums.' }],
      sources: ['src/core/songwriting.ts STRUMS'] },
    { id: 'tunings', n: 11, title: 'Guitar tunings & how tuning, key and mode fit', level: 'Going further', visual: 'fretboard', revisit: 'Home note (ch. 2) on an open string.',
      idea: 'Retuning moves which notes ring open. Pick a key whose home is an open low string and riffs can pound it without fretting.',
      body: ['Drop D lowers the low E to D → D is the natural home (TOOL, Drop D, D minor/Phrygian).', 'Open G: strumming open strings plays a G chord.', 'Muse suggests a key for your tuning and notes when a style/mode is unusual (docs/style-coherence.md).'],
      sounds: [{ label: 'Low open D drone + D minor', chords: R(mkKey('D', 'minor'), 'i bVI i bII') }],
      tries: [{ label: 'Tuner', tool: 'tuner' }, { label: 'Ear gym · Bass', tool: 'gym', tab: 'bass' }],
      quiz: [{ q: 'In Drop D, which home note is easiest for heavy riffs?', options: ['E', 'D', 'G'], answer: 1, why: 'The open low string is D.' }],
      sources: ['src/core/tunings.ts', 'src/core/styleProfiles.ts', 'docs/style-coherence.md'] },
    { id: 'styles', n: 12, title: 'Styles & artists', level: 'Going further', revisit: 'Modes (ch. 7) + tunings (ch. 11) + progressions (ch. 5).',
      idea: 'A style is a habit: typical modes, home notes, tunings, progressions and rhythms. Learn the habit, then bend it.',
      body: ['TOOL: D minor/Phrygian in Drop D. Led Zeppelin: A Mixolydian in standard. Flamenco: A Phrygian dominant (style profiles, sourced).', 'Muse’s Style picker offers the combo and explains “why this fits”.'],
      sounds: [{ label: 'Mixolydian rock (I ♭VII IV I)', chords: R(M, 'I bVII IV I') }, { label: 'Phrygian menace (i ♭II)', chords: R(m, 'i bII i bII') }],
      tries: [{ label: 'Songs like yours', tool: 'songs' }, { label: 'Style blend', tool: 'blend' }],
      quiz: [{ q: 'Rock’s “I ♭VII IV” comes from which mode?', options: ['Mixolydian', 'Lydian', 'Locrian'], answer: 0, why: '♭VII is Mixolydian’s signature chord.' }],
      sources: ['src/core/styleProfiles.ts (sources header)', 'docs/style-coherence.md'] },
    { id: 'ear', n: 13, title: 'Training your ear', level: 'Core', revisit: 'Everything above — by ear.',
      idea: 'Set up home, then hear each note or chord as a step of home. Practise in small groups, then mix; come back to misses later.',
      body: ['Start with 1·3·5, then 2·7, then 4·6, then mix (Moloney 2004: blocked first, mixed later).', 'Spaced review beats cramming (Hua 2015). Singing makes it stick (Kodály, Dalcroze).'],
      sounds: [{ label: 'Home cadence, then step 5', chords: homeCadence(M) }],
      tries: [{ label: 'Ear gym', tool: 'gym', tab: 'degree' }, { label: 'Sing it', tool: 'gym', tab: 'sing' }],
      quiz: [{ q: 'Which order works best for beginners?', options: ['Everything mixed from day one', 'Small groups, then mixed', 'Only intervals'], answer: 1, why: 'Blocked then mixed (Moloney 2004).' }],
      sources: ['src/core/earGym.ts', 'docs/dialectic/01–07'] },
    { id: 'glossary', n: 14, title: 'Glossary', level: 'Core',
      idea: 'Quick definitions — each links back to its chapter.',
      body: [], sounds: [], tries: [{ label: 'Your progress', tool: 'progress' }], quiz: [], sources: ['all chapters'] },
  ];
}
export const GLOSSARY: Array<{ term: string; def: string; ch: string }> = [
  { term: 'Half step / whole step', def: 'Next key or fret / two frets.', ch: 'sound' },
  { term: 'Octave', def: 'Same note 12 half steps higher.', ch: 'sound' },
  { term: 'Key', def: '7 notes with one as home.', ch: 'scales' },
  { term: 'Scale step (degree)', def: 'A note’s number counting from home (1–7).', ch: 'scales' },
  { term: 'Triad', def: 'Root + 3rd + 5th.', ch: 'chords' },
  { term: 'Power chord', def: 'Root + 5th, no 3rd.', ch: 'chords' },
  { term: 'Sus chord', def: '3rd swapped for the 2nd or 4th.', ch: 'chords' },
  { term: 'Roman numeral', def: 'Chord named by its scale step: I, ii, V…', ch: 'roman' },
  { term: 'Tonic / dominant', def: 'Home chord / the V chord that pulls home.', ch: 'roman' },
  { term: 'Cadence', def: 'How a phrase ends (authentic, plagal, half, deceptive).', ch: 'progressions' },
  { term: 'Dissonance', def: 'Notes that rub; heard as tension.', ch: 'tension' },
  { term: 'Mode', def: 'Same home, different step pattern (Lydian…Locrian).', ch: 'modes' },
  { term: 'Borrowed chord', def: 'From the opposite-mood key with the same home.', ch: 'borrowed' },
  { term: 'Secondary dominant', def: 'A V chord aimed at a chord other than home.', ch: 'borrowed' },
  { term: 'Modulation', def: 'Moving to a new home key.', ch: 'borrowed' },
  { term: 'Hook', def: 'A short, repeated, memorable idea.', ch: 'melody' },
  { term: 'Prosody', def: 'Stressed syllables on strong beats.', ch: 'melody' },
  { term: 'Drop D', def: 'Low E string tuned down to D.', ch: 'tunings' },
  { term: 'Audiation', def: 'Hearing music in your head with understanding (Gordon).', ch: 'ear' },
];
export interface GuideProgress { read: string[]; quiz: Record<string, number> }
export function parseGuideProgress(raw: string | null): GuideProgress {
  try { const o = JSON.parse(raw ?? ''); return { read: Array.isArray(o?.read) ? o.read.filter((x: unknown) => typeof x === 'string') : [], quiz: o?.quiz && typeof o.quiz === 'object' ? o.quiz : {} }; } catch { return { read: [], quiz: {} }; }
}
/** Chapter is complete when read and every quiz question answered right at least once. */
export function chapterDone(p: GuideProgress, ch: GuideChapter): boolean {
  return p.read.includes(ch.id) && ch.quiz.every((_, i) => ((p.quiz[ch.id] ?? 0) >> i) & 1);
}
export const pcOfMidi = (m: number) => mod(m, 12);
