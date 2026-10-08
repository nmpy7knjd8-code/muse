import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  Chord, ChordSuggestion, MoodProfile, MoodLexicon, ModeId, MODES, MODE_BY_ID, MoodTextLexicon, NoteSuggestion, SuggestionEngine, LexiconInterpreter,
  analyzeRoman, chordSymbol, describeProfile, detectKeys, diatonicChords, guitarVoicings, isEmptyProfile, keyName,
  midiName, noteName, parseChord, parseNote, pc, pianoFingering, pianoVoicing, romanOf, scalePcs,
  spellInKey, tonicChoices, voiceProgression, type Key,
  chordFeatures, moodJourney, findLore, type JourneyStep,
  INSTRUMENTS, INSTRUMENT_IDS, chordMidis, type InstrumentId, loadTryIt, progressionTension, moodTarget, type TensionStyleId, type ArtistTryIt, type Artist,
  TimelineSlot, activeSlotIndex, chordTargetIndex, chordsOf, clearSlotChord, insertNote, labelSlot, melodyOf,
  nextNoteBeat, noteDurations, removeNoteAt, removeSlot, setSlotChord, timelineEvents, timelineText, toMidiTimeline,
  REL_COLORS, REL_LABEL, type RelKind,
  colourPaletteChords, degreeRole, isDiatonicTriadClone, nrtTag, rootMotion,
  TimeSig, TIME_SIG_PRESETS, DEFAULT_TIME_SIG, beatsPerBar, clampSlotsToMeter, parseMeter,
  timeSigLabel,
} from '../core';
import { loadData, type LoadedData } from './data';
import { synth } from './audio';
import { CircleOfFifths, GuitarDiagram, MoodMap, PianoViz, ScaleLegend, TonnetzViz, VoiceLeadingViz, VoiceLegend, CURRENT_COLOR } from './visuals';
import { ArtistLens } from './ArtistLens';
import { TensionCurve } from './TensionCurve';
import { NextPickBoard } from './NextPickBoard';
import { listenErrorMessage, startListening, type ListenSession, type ListenStatus } from './listen';

type Tab = 'chords' | 'melody' | 'artists';
type VisTab = 'piano' | 'guitar' | 'voices' | 'circle' | 'tonnetz' | 'map';
interface Snapshot { slots: TimelineSlot[] }

const PRESET_MOODS = ['mystical', 'melancholy', 'triumphant', 'tense', 'dreamy', 'dark', 'bright', 'peaceful', 'epic', 'bittersweet', 'yearning', 'solemn'];
const RARITY_MARK: Record<string, { sym: string; label: string }> = {
  common: { sym: '●', label: 'common' },
  colorful: { sym: '◆', label: 'colorful' },
  adventurous: { sym: '★', label: 'unusual' },
};

export default function App() {
  const [data, setData] = useState<LoadedData | null>(null);
  useEffect(() => { void loadData().then(setData); }, []);
  if (!data) return <div className="loading">Loading Muse…</div>;
  return <Composer data={data} />;
}

function Composer({ data }: { data: LoadedData }) {
  const engine = useMemo(() => new SuggestionEngine(data.kb), [data]);
  const textLex = useMemo(() => MoodTextLexicon.build(data.kb, data.moodLexicon), [data]);
  const interpreter = useMemo(() => new LexiconInterpreter(textLex), [textLex]);
  const lex = engine.lexicon;

  const [tonic, setTonic] = useState(() => {
    try {
      const t = localStorage.getItem('muse.tonic');
      return t && parseNote(t) ? t : 'C';
    } catch { return 'C'; }
  });
  const [mode, setMode] = useState<ModeId>(() => {
    try {
      const v = localStorage.getItem('muse.mode');
      return v && v in MODE_BY_ID ? (v as ModeId) : 'major';
    } catch { return 'major'; }
  });
  const [auto, setAuto] = useState(() => {
    try {
      const a = localStorage.getItem('muse.auto');
      if (a === '0') return false;
      if (a === '1') return true;
      // Saved key/mode from a prior visit → keep that pick, don't reopen on Auto/C major
      if (localStorage.getItem('muse.tonic') || localStorage.getItem('muse.mode')) return false;
      return true;
    } catch { return true; }
  });
  const chooseTonic = (t: string) => {
    setTonic(t); setAuto(false);
    try {
      localStorage.setItem('muse.tonic', t);
      localStorage.setItem('muse.mode', mode);
      localStorage.setItem('muse.auto', '0');
    } catch { /* private mode */ }
  };
  const chooseMode = (m: ModeId) => {
    setMode(m); setAuto(false);
    // Keep tonic spelling valid for the new mode family (e.g. Db major → C# minor)
    const choices = tonicChoices(m);
    let nextTonic = tonic;
    if (!choices.includes(tonic)) {
      const n = parseNote(tonic);
      nextTonic = n ? choices[pc(n)] ?? choices[0]! : choices[0]!;
      setTonic(nextTonic);
    }
    try {
      localStorage.setItem('muse.mode', m);
      localStorage.setItem('muse.tonic', nextTonic);
      localStorage.setItem('muse.auto', '0');
    } catch { /* private mode */ }
  };
  const chooseAuto = (on: boolean) => {
    setAuto(on);
    try {
      localStorage.setItem('muse.auto', on ? '1' : '0');
      if (!on) {
        localStorage.setItem('muse.tonic', tonic);
        localStorage.setItem('muse.mode', mode);
      }
    } catch { /* private mode */ }
  };
  const [timeSig, setTimeSig] = useState<TimeSig>(() => {
    try {
      const v = localStorage.getItem('muse.timeSig');
      const p = v ? parseMeter(v) : null;
      return p ?? DEFAULT_TIME_SIG;
    } catch { return DEFAULT_TIME_SIG; }
  });
  const chooseTimeSig = (ts: TimeSig) => {
    setTimeSig(ts);
    try { localStorage.setItem('muse.timeSig', timeSigLabel(ts)); } catch { /* private mode */ }
    setSlots((s) => clampSlotsToMeter(s, beatsPerBar(ts)));
  };
  const [meterNote, setMeterNote] = useState<string | null>(null);
  const [slots, setSlots] = useState<TimelineSlot[]>([]);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const beats = beatsPerBar(timeSig);
  const [tab, setTab] = useState<Tab>('chords');
  const [visTab, setVisTab] = useState<VisTab>('piano');
  const [adventure, setAdventure] = useState(0.35);
  const [tStyle, setTStyle] = useState<TensionStyleId>(() => {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem('muse.tensionStyle') : null;
    return v === 'pop' || v === 'classical' || v === 'jazz' || v === 'film' ? v : 'pop';
  });
  const chooseTStyle = (s: TensionStyleId) => { setTStyle(s); try { localStorage.setItem('muse.tensionStyle', s); } catch { /* private mode */ } };
  const [moodText, setMoodText] = useState('');
  const [profile, setProfile] = useState<MoodProfile | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState(false);
  const [typed, setTyped] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [shapeIdx, setShapeIdx] = useState(0);
  const toastTimer = useRef<number | undefined>(undefined);
  const [jFrom, setJFrom] = useState('melancholy');
  const [jTo, setJTo] = useState('triumphant');
  const [jLen, setJLen] = useState(6);
  const [journey, setJourney] = useState<JourneyStep[] | null>(null);
  const [loreOn, setLoreOn] = useState(false);
  const [listen, setListen] = useState<ListenSession | null>(null);
  const [listenStatus, setListenStatus] = useState<ListenStatus | null>(null);
  const [lastHeard, setLastHeard] = useState<string | null>(null);
  useEffect(() => () => listen?.stop(), [listen]);

  const chords = useMemo(() => chordsOf(slots), [slots]);
  const melody = useMemo(() => melodyOf(slots), [slots]);
  const chordTarget = chordTargetIndex(slots);
  const pendingHarm = !slots[chordTarget]?.chord && (slots[chordTarget]?.notes.length ?? 0) > 0 ? slots[chordTarget] : null;
  const noteSlot = slots[activeSlotIndex(slots)] ?? null;
  const noteChord = noteSlot?.chord ?? slots.filter((s) => s.chord).at(-1)?.chord ?? null;
  const noteBeat = nextNoteBeat(slots, beats);
  const picked: Key = { tonic: parseNote(tonic)!, mode };
  const detected = useMemo(() => (auto && (chords.length >= 2 || melody.length >= 4) ? detectKeys(chords, melody)[0] : null), [auto, slots]); // eslint-disable-line react-hooks/exhaustive-deps
  // auto-detect only chooses between major/minor keys; a modal pick (e.g. Dorian) is kept as-is
  const k: Key = auto && detected && (mode === 'major' || mode === 'minor') ? detected.key : picked;
  const scale = scalePcs(k);
  const cur = chords[chords.length - 1];
  const prevVoicing = useMemo(() => { const v = voiceProgression(chords); return v[v.length - 1]; }, [slots]); // eslint-disable-line react-hooks/exhaustive-deps
  const spell = (m: number) => noteName(spellInKey(k, m), true);
  const spellMidi = (m: number) => midiName(m, spellInKey(k, m)).replace('#', '♯').replace(/b(?=\d)/, '♭');

  const chordSugs: ChordSuggestion[] = useMemo(() => {
    if (tab !== 'chords') return [];
    const progression = pendingHarm ? chordsOf(slots.slice(0, chordTarget)) : chords;
    const durs = pendingHarm ? noteDurations(pendingHarm.notes) : [];
    const harmonize = pendingHarm
      ? pendingHarm.notes.map((n, i) => ({ midi: n.midi, beat: n.beat, dur: durs[i] }))
      : undefined;
    return engine.suggestChords({ key: k, progression, profile, adventure, limit: 28, tensionStyle: tStyle, harmonize });
  }, [engine, tab, k.tonic.letter, k.tonic.acc, k.mode, slots, profile, adventure, tStyle]); // eslint-disable-line react-hooks/exhaustive-deps
  const tState = useMemo(() => {
    const steps = slots.filter((s) => s.chord).map((s) => ({ chord: s.chord as Chord, melody: s.notes.map((n) => n.midi) }));
    return steps.length ? progressionTension(steps, k, { style: tStyle, adventure, target: moodTarget(profile) }) : null;
  }, [k.tonic.letter, k.tonic.acc, k.mode, slots, profile, adventure, tStyle]); // eslint-disable-line react-hooks/exhaustive-deps
  const noteSugs: NoteSuggestion[] = useMemo(
    () => (tab === 'melody' ? engine.suggestNotes({ key: k, melody, chord: noteChord, profile, adventure, limit: 12, beat: noteBeat, timeSig }) : []),
    [engine, tab, k.tonic.letter, k.tonic.acc, k.mode, slots, profile, adventure, timeSig.num, timeSig.den], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const selChord = chordSugs.find((s) => s.id === selectedId) ?? chordSugs[0];
  const selNote = noteSugs.find((s) => s.id === selectedId) ?? noteSugs[0];
  useEffect(() => setShapeIdx(0), [selChord?.id]);

  const flash = (msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1800);
  };
  const snapshot = () => setHistory((h) => [...h.slice(-49), { slots }]);
  const undo = () => {
    synth.unlock();
    const last = history[history.length - 1];
    if (!last) return;
    setSlots(last.slots);
    setHistory((h) => h.slice(0, -1));
  };
  // instrument + sample loading state (external store → re-render on progress)
  const audioKey = useSyncExternalStore((f) => synth.subscribe(f), () => `${synth.instrument}|${synth.loadState().state}|${Math.round(synth.loadState().progress * 10)}`);
  const instrument = audioKey.split('|')[0] as InstrumentId;
  const loadState = synth.loadState(instrument);
  const chooseInstrument = (id: InstrumentId) => {
    synth.unlock();
    synth.setInstrument(id);
    const demo = cur ?? diatonicChords(k)[0];
    void synth.ensureLoaded(id).then(() => { synth.stopAll(); synth.playNotes(chordMidis(demo, pianoVoicing(demo), INSTRUMENTS[id]), { dur: 1.2 }); });
  };
  // chords are voiced per instrument: voice-led keyboard voicing with a warm bass, or a real guitar shape
  const withBass = (c: Chord, v: number[]) => chordMidis(c, v, INSTRUMENTS[instrument]);
  // iOS: the ring/silent switch can mute Web Audio — hint once, and whenever audio is not running after a tap
  useEffect(() => {
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const onUp = () => {
      window.setTimeout(() => {
        if (!synth.unlocked) return;
        if (!synth.isRunning()) flash('No sound? Check the silent switch and volume, then tap again.');
        else if (ios && !localStorage.getItem('muse.soundTip')) {
          localStorage.setItem('muse.soundTip', '1');
          flash('Tip: if you hear nothing, flip off Silent mode (side switch) and turn the volume up.');
        }
      }, 900);
    };
    window.addEventListener('pointerup', onUp, { once: true });
    return () => window.removeEventListener('pointerup', onUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- audio actions (all called from tap handlers) ----
  const playChord = (c: Chord, prev?: number[]) => { synth.unlock(); synth.stopAll(); const v = pianoVoicing(c, prev); synth.playNotes(withBass(c, v)); };
  const playMove = (s: ChordSuggestion) => {
    // Hear previews only the potential next chord (not previous → next).
    synth.unlock();
    synth.stopAll();
    synth.playNotes(withBass(s.chord, s.voicing));
  };
  const playNoteMove = (n: NoteSuggestion) => {
    synth.unlock();
    const last = melody[melody.length - 1];
    const groups = last !== undefined ? [[last], [n.midi]] : [[n.midi]];
    const under = noteChord;
    if (under) {
      const v = under === cur && prevVoicing ? prevVoicing : pianoVoicing(under);
      synth.playNotes(withBass(under, v), { dur: 1.6, vel: 0.35 });
    }
    groups.forEach((g, i) => synth.playNotes(g, { at: i * 0.5, dur: 0.5, vel: 0.9 }));
  };
  const playAll = () => {
    synth.unlock();
    synth.stopAll();
    const ev = timelineEvents(slots, { timeSig });
    const withC = slots.map((s, i) => ({ s, i })).filter((x) => x.s.chord);
    const voicings = voiceProgression(withC.map((x) => x.s.chord as Chord));
    const vBy = new Map(withC.map((x, j) => [x.i, voicings[j]]));
    ev.chords.forEach((c) => synth.playNotes(withBass(c.chord, vBy.get(c.index) ?? pianoVoicing(c.chord)), { at: c.at, dur: c.dur, vel: 0.7 }));
    ev.notes.forEach((n) => synth.playNotes([n.midi], { at: n.at, dur: n.dur, vel: n.beat === 0 ? 0.95 : 0.85 }));
  };

  // ---- editing ----
  const addChord = (c: Chord) => {
    snapshot();
    const target = chordTargetIndex(slots);
    const prev = target > 0 ? voiceProgression(chordsOf(slots.slice(0, target))).at(-1) : undefined;
    playChord(c, prev);
    setSlots((s) => setSlotChord(s, chordTargetIndex(s), c));
    setSelectedId(null);
  };
  const removeAt = (i: number) => { if (slots[i]?.locked) return flash('Unlock the chord first'); snapshot(); setSlots((s) => removeSlot(s, i)); };
  const dropChord = (i: number) => { if (slots[i]?.locked) return flash('Unlock the chord first'); snapshot(); setSlots((s) => clearSlotChord(s, i)); };
  const dropNote = (si: number, ni: number) => { snapshot(); setSlots((s) => removeNoteAt(s, si, ni)); };
  const toggleLock = (i: number) => setSlots((s) => s.map((x, j) => (j === i ? { ...x, locked: !x.locked } : x)));
  const clearAll = () => { synth.unlock(); snapshot(); setSlots((s) => s.filter((x) => x.locked)); setMeterNote(null); setSelectedId(null); };
  const addNote = (m: number) => {
    synth.unlock();
    synth.playNotes([m], { dur: 0.6 });
    snapshot();
    setSlots((s) => insertNote(s, m, undefined, beats).slots);
    setSelectedId(null);
  };
  const submitTyped = () => {
    const c = parseChord(typed.trim());
    if (!c) return flash(`Couldn't read "${typed}" — try C, F#m7, Bbmaj7, G7/B`);
    addChord(c);
    setTyped('');
  };

  // ---- mood ----
  const interpret = async (text: string) => {
    setMoodText(text);
    if (!text.trim()) return setProfile(null);
    setProfile(await interpreter.interpret(text));
  };
  const togglePreset = (id: string) => {
    synth.unlock();
    const moods = { ...(profile?.moods ?? {}) };
    if (moods[id]) delete moods[id];
    else moods[id] = Object.keys(moods).length ? 1 / (Object.keys(moods).length + 1) : 1;
    const total = Object.values(moods).reduce((a, b) => a + b, 0);
    const norm = Object.fromEntries(Object.entries(moods).map(([k2, v]) => [k2, v / (total || 1)]));
    const next: MoodProfile = { ...(profile ?? { dims: {}, modes: [], source: 'manual' as const }), moods: norm, source: profile?.source ?? 'manual' };
    setProfile(isEmptyProfile(next) ? null : next);
  };
  const bumpMood = (id: string, delta: number) => {
    if (!profile) return;
    const moods = { ...profile.moods, [id]: Math.max(0, (profile.moods[id] ?? 0) + delta) };
    if (moods[id] <= 0.001) delete moods[id];
    const total = Object.values(moods).reduce((a, b) => a + b, 0);
    const next = { ...profile, moods: Object.fromEntries(Object.entries(moods).map(([k2, v]) => [k2, v / (total || 1)])) };
    setProfile(isEmptyProfile(next) ? null : next);
  };
  const dropDim = (d: string) => {
    if (!profile) return;
    const dims = { ...profile.dims } as Record<string, number>;
    delete dims[d];
    const next = { ...profile, dims };
    setProfile(isEmptyProfile(next) ? null : next);
  };
  const dropMode = (m: ModeId) => profile && setProfile({ ...profile, modes: profile.modes.filter((x) => x !== m) });

  // ---- export ----
  const copyText = async () => {
    const txt = timelineText(k, slots, timeSig) + (meterNote ? `\nMeter note: ${meterNote}` : '');
    try { await navigator.clipboard.writeText(txt); flash('Copied timeline'); } catch { flash(txt); }
  };
  const downloadMidi = () => {
    const bytes = toMidiTimeline(slots, 90, timeSig);
    const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'audio/midi' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'muse-progression.mid';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  // ---- mood journey ----
  const makeJourney = () => {
    synth.unlock();
    const j = moodJourney(engine, k, jFrom, jTo, { length: jLen, adventure });
    setJourney(j);
    const v = voiceProgression(j.map((x) => x.chord));
    synth.playSequence(j.map((x, i) => withBass(x.chord, v[i])), 0.8, 0.75);
  };
  const playJourney = () => {
    if (!journey) return;
    synth.unlock();
    const v = voiceProgression(journey.map((x) => x.chord));
    synth.playSequence(journey.map((x, i) => withBass(x.chord, v[i])), 0.8, 0.75);
  };
  const useJourney = () => {
    if (!journey) return;
    snapshot();
    setSlots(journey.map((x) => ({ chord: x.chord, notes: [], locked: false })));
    setMeterNote(null);
    setTab('chords');
    setSelectedId(null);
    flash('Journey loaded — undo to go back');
  };

  const [focusArtist, setFocusArtist] = useState<string | null>(null);
  // ---- Artist Lens "Try it": load an exercise like a journey (key + chords, pedal bass applied) ----
  const tryIt = (t: ArtistTryIt, artist: Artist) => {
    const l = loadTryIt(t);
    if (!l) return flash('Could not read that exercise');
    snapshot();
    chooseTonic(l.tonic); chooseMode(l.mode);
    const nextSlots = l.chords.map((chord) => ({ chord, notes: [] as TimelineSlot['notes'], locked: false }));
    if (l.timeSig) {
      setTimeSig(l.timeSig);
      try { localStorage.setItem('muse.timeSig', timeSigLabel(l.timeSig)); } catch { /* private mode */ }
      setSlots(clampSlotsToMeter(nextSlots, beatsPerBar(l.timeSig)));
    } else setSlots(nextSlots);
    setMeterNote(l.meterNote ?? null);
    setTab('chords');
    setSelectedId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    synth.unlock();
    const v = voiceProgression(l.chords);
    synth.playSequence(l.chords.map((c, i) => withBass(c, v[i])), 0.8, 0.75);
    const meterBit = l.timeSig ? ` · ${timeSigLabel(l.timeSig)}` : l.meterNote ? ` · ${l.meterNote}` : '';
    flash(`Loaded "${t.label}" (${artist.name} style)${meterBit} — undo to go back`);
  };
  const previewTryIt = (t: ArtistTryIt) => {
    const l = loadTryIt(t);
    if (!l) return;
    synth.unlock();
    const v = voiceProgression(l.chords);
    synth.playSequence(l.chords.map((c, i) => withBass(c, v[i])), 0.8, 0.75);
  };

  // ---- Listen (live mic: melody notes via YIN, chords via chroma templates) ----
  // callbacks run outside React's render cycle, so they read the latest state through refs
  const live = useRef({ tab, k, slots, timeSig });
  live.current = { tab, k, slots, timeSig };
  const snapshotLive = () => setHistory((h) => [...h.slice(-49), { slots: live.current.slots }]);
  const heardChord = (root: number, quality: string): Chord => ({ root: spellInKey(live.current.k, root), quality: quality as Chord['quality'] });
  const toggleListen = async () => {
    // Unlock first (gesture), then startListening switches AudioSession to play-and-record for the mic.
    synth.unlock();
    if (listen) { listen.stop(); setListen(null); setListenStatus(null); return; }
    try {
      const session = await startListening({
        target: () => (live.current.tab === 'melody' ? 'melody' : 'chords'),
        isPaused: () => synth.isPlaying(),
        onNote: (m) => {
          snapshotLive();
          setSlots((x) => insertNote(x, m, undefined, beatsPerBar(live.current.timeSig)).slots);
          setSelectedId(null);
          setLastHeard(midiName(m, spellInKey(live.current.k, m)));
        },
        onChord: (cm) => {
          const c = heardChord(cm.root, cm.quality);
          snapshotLive();
          setSlots((x) => setSlotChord(x, chordTargetIndex(x), c));
          setSelectedId(null);
          setLastHeard(chordSymbol(c, true));
        },
        onStatus: setListenStatus,
        noteName: (m) => midiName(m, spellInKey(live.current.k, m)),
        chordName: (cm) => chordSymbol(heardChord(cm.root, cm.quality), true),
      });
      setListen(session);
      setLastHeard(null);
      flash(tab === 'chords' ? 'Listening for chords — hold each one ~½ s' : 'Listening for notes — fills the melody lane');
    } catch (e) {
      flash(listenErrorMessage(e));
    }
  };

  // ---- grouped suggestions ----
  const groups = useMemo(() => {
    const items = tab === 'chords' ? chordSugs : noteSugs;
    const map = new Map<string, Array<ChordSuggestion | NoteSuggestion>>();
    for (const s of items) {
      const g = map.get(s.primaryMood) ?? [];
      g.push(s);
      map.set(s.primaryMood, g);
    }
    return [...map.entries()];
  }, [tab, chordSugs, noteSugs]);

  const selColor = lex.color(tab === 'chords' ? selChord?.primaryMood ?? 'floating' : selNote?.primaryMood ?? 'floating');
  const shapes = useMemo(() => (selChord ? guitarVoicings(selChord.chord) : []), [selChord]);
  const shape = shapes[Math.min(shapeIdx, shapes.length - 1)];
  const chips = profile ? describeProfile(profile, lex) : [];
  const kbBadge = data.kb.meta.isSeed ? 'seed' : '';

  const visuals = (all: boolean) => {
    if (tab === 'melody') {
      const underV = noteChord === cur ? prevVoicing : noteChord ? pianoVoicing(noteChord) : [];
      const addMelodyPc = (p: number) => {
        const anchor = melody.length ? melody[melody.length - 1]! : 60;
        let best = p + 60;
        for (let oct = 3; oct <= 6; oct++) {
          const m = p + 12 * (oct + 1);
          if (Math.abs(m - anchor) < Math.abs(best - anchor)) best = m;
        }
        addNote(best);
      };
      return (
        <div className="vis-body">
          <PianoViz scalePcs={scale} tonicPc={pc(k.tonic)} current={noteChord ? underV : []} suggested={selNote ? [selNote.midi] : []} fingers={[]} melody={melody.slice(-8)} color={selColor} spell={spell} minLow={55} minHigh={84} label="Melody on piano" labelKeys="all" />
          <div className="legend">
            {noteChord && <span><i style={{ background: CURRENT_COLOR }} />under: {chordSymbol(noteChord, true)}</span>}
            {selNote && <span><i style={{ background: selColor }} />next: {spellMidi(selNote.midi)}</span>}
            {selNote?.relation && <span><i style={{ background: REL_COLORS[selNote.relation.kind] }} />{selNote.relation.label} · {REL_LABEL[selNote.relation.kind]}</span>}
            <ScaleLegend keyLabel={keyName(k)} tonic={noteName(k.tonic, true)} />
          </div>
          <Contour melody={melody.slice(-10)} next={selNote?.midi} color={selColor} spell={spellMidi} />
          <CircleOfFifths
            tonicPc={pc(k.tonic)} scalePcs={scale}
            currentPc={melody.length ? melody[melody.length - 1]! % 12 : undefined}
            others={noteSugs.map((s) => ({ pc: s.midi % 12, color: lex.color(s.primaryMood), id: s.id }))}
            selected={selNote ? { pc: selNote.midi % 12, color: selColor, label: selNote.name.replace('#', '♯') } : undefined}
            spellPc={spell}
            onPick={(id) => { const s = noteSugs.find((x) => x.id === id); if (s) { setSelectedId(id); playNoteMove(s); } }}
            onAddPc={addMelodyPc}
          />
          <p className="small muted center">Tap a note to add it to the melody · outer dots preview suggestions</p>
        </div>
      );
    }
    if (!selChord) return <p className="muted">Suggestions appear here.</p>;
    const fingers = pianoFingering(selChord.voicing, 'R');
    const piano = (
      <div className="vis-section" key="piano">
        {all && <h4>Piano · right hand</h4>}
        <PianoViz scalePcs={scale} tonicPc={pc(k.tonic)} current={cur ? prevVoicing : []} suggested={selChord.voicing} fingers={fingers} melody={melody.slice(-6)} color={selColor} spell={spell} minLow={53} minHigh={79} label={`Piano: ${selChord.symbol}`} />
        <div className="legend">
          {cur && <span><i style={{ background: CURRENT_COLOR }} />now: {chordSymbol(cur, true)}</span>}
          <span><i style={{ background: selColor }} />next: {selChord.symbol}</span>
          <span><i className="ring" />common tone</span>
          <ScaleLegend keyLabel={keyName(k)} tonic={noteName(k.tonic, true)} />
        </div>
      </div>
    );
    const guitar = (
      <div className="vis-section" key="guitar">
        {all && <h4>Guitar</h4>}
        <div className="guitar-row">
          {shape ? <GuitarDiagram shape={shape} color={selColor} title={`${selChord.symbol} guitar`} /> : <p className="muted">No playable shape found.</p>}
          <div className="guitar-meta">
            <div className="big">{selChord.symbol}</div>
            <div className="muted small">{shape?.label}{shape?.partial ? ' (simplified)' : ''}</div>
            <div className="mono small">{shape?.frets.map((f) => (f === null ? 'x' : f)).join(' ')}</div>
            {shapes.length > 1 && (
              <div className="row gap">
                <button className="ghost" onClick={() => setShapeIdx((i) => (i - 1 + shapes.length) % shapes.length)}>‹</button>
                <span className="small">{shapeIdx + 1}/{shapes.length}</span>
                <button className="ghost" onClick={() => setShapeIdx((i) => (i + 1) % shapes.length)}>›</button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
    const voices = (
      <div className="vis-section" key="voices">
        {all && <h4>Voice leading</h4>}
        <VoiceLeadingViz lines={selChord.voiceLines} fromLabel={cur ? chordSymbol(cur, true) : ''} toLabel={selChord.symbol} spell={spellMidi} color={selColor} />
        {selChord.voiceLines.length > 0 && <VoiceLegend />}
        {cur && <p className="small muted">{selChord.commonTones} common tone{selChord.commonTones === 1 ? '' : 's'} · total motion {selChord.voiceLines.reduce((a, l) => a + Math.abs(l.delta), 0)} semitones</p>}
      </div>
    );
    const circle = (
      <div className="vis-section" key="circle">
        {all && <h4>Circle of fifths</h4>}
        <CircleOfFifths
          tonicPc={pc(k.tonic)} scalePcs={scale} currentPc={cur ? pc(cur.root) : undefined}
          others={chordSugs.map((s) => ({ pc: pc(s.chord.root), color: lex.color(s.primaryMood), id: s.id }))}
          selected={{ pc: pc(selChord.chord.root), color: selColor, label: selChord.symbol }}
          spellPc={spell}
          onPick={(id) => { const s = chordSugs.find((x) => x.id === id); if (s) { setSelectedId(id); playMove(s); } }}
          onAddPc={(p) => {
            const dia = diatonicChords(k).find((c) => pc(c.root) === p);
            const built = dia ?? parseChord(noteName(spellInKey(k, p)));
            if (built) addChord(built);
          }}
        />
        <p className="small muted center">+N = clockwise (dominant / sharp) · −N = counter-clockwise (subdominant / flat) · tap a note to add · outer dots preview</p>
      </div>
    );
    const tonnetz = (
      <div className="vis-section" key="tonnetz">
        {all && <h4>Tonnetz (neo-Riemannian)</h4>}
        <TonnetzViz tonicPc={pc(k.tonic)} current={cur} suggested={selChord.chord} color={selColor} nrt={selChord.nrt} spellPc={spell} />
        <p className="small muted">Horizontal = fifths, diagonal = thirds. P flips major/minor, L and R move one note by a half / whole step.</p>
      </div>
    );
    const curF = cur ? chordFeatures(cur, k, engine.chordMoods(cur, k, chords[chords.length - 2]), 0.7, analyzeRoman(cur, k).diatonic, lex) : null;
    const moodmap = (
      <div className="vis-section" key="map">
        {all && <h4>Mood map</h4>}
        <MoodMap
          points={chordSugs.map((s) => ({ id: s.id, label: s.symbol, x: s.features.brightness, y: s.features.tension, color: lex.color(s.primaryMood) }))}
          selectedId={selChord.id}
          current={cur && curF ? { x: curF.brightness, y: curF.tension, label: chordSymbol(cur, true) } : undefined}
          target={profile ? { x: profile.dims.brightness ?? profile.dims.valence, y: profile.dims.tension } : undefined}
          onPick={(id) => { const s = chordSugs.find((x) => x.id === id); if (s) { setSelectedId(id); playMove(s); } }}
        />
        <p className="small muted center">Every candidate next chord placed by how dark/bright and calm/tense it feels. Tap a dot to hear it.{profile && (profile.dims.brightness !== undefined || profile.dims.tension !== undefined) ? ' Dashed lines = your mood target.' : ''}</p>
      </div>
    );
    const map = { piano, guitar, voices, circle, tonnetz, map: moodmap };
    return all ? <div className="vis-body">{Object.values(map)}</div> : <div className="vis-body">{map[visTab]}</div>;
  };

  return (
    <div className="app" onPointerDown={() => synth.unlock()}>
      <header className="top">
        <div className="brand">Muse{kbBadge && <small> {kbBadge}</small>}</div>
        <div className="keypick">
          <select aria-label="Tonic" value={tonicChoices(mode).includes(tonic) ? tonic : tonicChoices(mode)[pc(parseNote(tonic)!)]} onChange={(e) => chooseTonic(e.target.value)}>
            {tonicChoices(mode).map((t) => <option key={t} value={t}>{t.replace('#', '♯').replace('b', '♭')}</option>)}
          </select>
          <select aria-label="Mode" value={mode} onChange={(e) => chooseMode(e.target.value as ModeId)}>
            {MODES.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <button className={'pill' + (auto ? ' on' : '')} onClick={() => chooseAuto(!auto)} title="Detect key from what you enter">Auto</button>
        </div>
      </header>
      <div className="keyline small">
        Key: <b>{keyName(k)}</b>
        <span className="muted"> · </span>
        <label className="meter-pick">
          <span className="muted">Meter</span>
          <select
            aria-label="Time signature"
            value={timeSigLabel(timeSig)}
            onChange={(e) => {
              const p = TIME_SIG_PRESETS.find((x) => timeSigLabel(x) === e.target.value);
              if (p) chooseTimeSig(p);
            }}
          >
            {TIME_SIG_PRESETS.map((p) => (
              <option key={p.label} value={p.label}>{p.label}{p.hint ? ` (${p.hint})` : ''}</option>
            ))}
          </select>
        </label>
        {detected && auto && <span className="muted"> · detected ({Math.round(detected.confidence * 100)}%)</span>}
        {data.kb.meta.isSeed && <span className="warn"> · using seed theory data</span>}
      </div>
      {meterNote && meterNote !== timeSigLabel(timeSig) && (
        <p className="meter-note small muted" title="From Artist Lens try-it">Meter note: {meterNote}</p>
      )}

      {/* Unified timeline: melody lane above, chords below */}
      <section className="strip" aria-label="Timeline">
        {slots.length === 0 ? (
          <p className="muted small">Tap chords below to start, or switch to Melody — both share this timeline.</p>
        ) : (
          <div className="timeline" role="list">
            {slots.map((s, i) => {
              const labeled = labelSlot(s, data.kb, beats);
              return (
                <div key={i} className={'tbar' + (s.locked ? ' locked' : '') + (!s.chord ? ' nc' : '')} role="listitem">
                  <div className="tmel" aria-label={`Bar ${i + 1} melody`}>
                    {labeled.length === 0 && <span className="muted small">·</span>}
                    {labeled.map((n, j) => {
                      const kind = n.relation?.kind;
                      const tip = n.relation ? `${REL_LABEL[n.relation.kind]} · ${n.relation.label} — ${n.relation.why}` : 'no chord yet';
                      return (
                        <div
                          key={j}
                          className={'tnote' + (kind ? ` ${kind}` : '')}
                          style={kind ? { borderColor: REL_COLORS[kind], color: REL_COLORS[kind] } : undefined}
                          title={tip}
                        >
                          <button type="button" className="tnote-play" onClick={() => { synth.unlock(); synth.playNotes([n.midi], { dur: 0.45 }); }}>
                            <span>{spellMidi(n.midi)}</span>
                            {n.relation && <small>{n.relation.label}</small>}
                          </button>
                          <button type="button" className="tx" aria-label="Remove note" onClick={() => dropNote(i, j)}>×</button>
                        </div>
                      );
                    })}
                  </div>
                  <div
                    className={'tchord' + (s.locked ? ' locked' : '')}
                    onClick={() => { if (s.chord) playChord(s.chord); }}
                  >
                    <div className="sym">{s.chord ? chordSymbol(s.chord, true) : 'N.C.'}</div>
                    <div className="rn">{s.chord ? romanOf(s.chord, k) : 'melody'}</div>
                    <div className="chip-actions">
                      {s.chord && <button aria-label="Lock chord" onClick={(e) => { e.stopPropagation(); toggleLock(i); }}>{s.locked ? '🔒' : '🔓'}</button>}
                      {s.chord && s.notes.length > 0 && !s.locked && (
                        <button aria-label="Clear chord, keep melody" title="Clear chord, keep melody" onClick={(e) => { e.stopPropagation(); dropChord(i); }}>⌀</button>
                      )}
                      <button aria-label="Remove bar" onClick={(e) => { e.stopPropagation(); removeAt(i); }}>×</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="rel-legend small muted" aria-hidden={!slots.some((s) => s.notes.length && s.chord)}>
          {(['chord', 'tension', 'avoid', 'clash'] as RelKind[]).map((r) => (
            <span key={r}><i style={{ background: REL_COLORS[r] }} />{REL_LABEL[r]}</span>
          ))}
        </div>
        <div className="row gap">
          <button onClick={playAll} disabled={!slots.length}>▶ Play</button>
          <button onClick={undo} disabled={!history.length}>↶ Undo</button>
          <button onClick={clearAll} disabled={!slots.length}>Clear</button>
          <button onClick={copyText} disabled={!slots.length}>Copy</button>
          <button onClick={downloadMidi} disabled={!slots.length}>MIDI</button>
        </div>
        <div className="instr" role="radiogroup" aria-label="Instrument">
          {INSTRUMENT_IDS.map((id) => (
            <button key={id} role="radio" aria-checked={instrument === id} className={'pill' + (instrument === id ? ' on' : '')} onClick={() => chooseInstrument(id)}>
              {INSTRUMENTS[id].label.replace(' guitar', '').replace('Nylon', 'Guitar').replace('Soft pad', 'Pad')}
            </button>
          ))}
        </div>
        {/* status line always reserves its height, so loading never shifts the layout under a finger */}
        <div className="instr-status small" aria-live="polite">
          {loadState.state === 'loading' ? <span className="loading">⏳ loading {INSTRUMENTS[instrument].label.toLowerCase()} {Math.round(loadState.progress * 100)}% · synth meanwhile</span>
            : loadState.state === 'error' ? <span className="warn">samples unavailable — using synth</span>
            : loadState.state === 'ready' ? <span className="muted">♪ {INSTRUMENTS[instrument].label} ready</span>
            : <span className="muted">Tap anything to start sound</span>}
        </div>
      </section>

      {tab !== 'artists' && tState && (
        <TensionCurve state={tState} labels={chords.map((c) => chordSymbol(c, true))} style={tStyle} onStyle={chooseTStyle}
          ghost={tab === 'chords' && selChord?.tension ? { level: selChord.tension.level, debtAfter: selChord.tension.debtAfter, label: selChord.symbol, color: lex.color(selChord.primaryMood) } : null} />
      )}

      {/* Input */}
      <section className="input">
        <div className="seg">
          <button className={tab === 'chords' ? 'on' : ''} onClick={() => { setTab('chords'); setSelectedId(null); }}>Chords</button>
          <button className={tab === 'melody' ? 'on' : ''} onClick={() => { setTab('melody'); setSelectedId(null); }}>Melody</button>
          {data.artists && <button className={tab === 'artists' ? 'on' : ''} onClick={() => { setTab('artists'); setSelectedId(null); }}>Artist Lens</button>}
        </div>
        {tab === 'artists' && data.artists ? (
          <ArtistLens key={focusArtist ?? 'all'} initial={focusArtist} data={data.artists} lex={lex} kbIndex={data.kbIndex} onTryIt={tryIt} onPreview={previewTryIt} />
        ) : (<>
        <div className={'listen' + (listen ? ' on' : '')}>
          <button className={listen ? 'rec' : ''} onClick={() => void toggleListen()} aria-pressed={!!listen}>
            {listen ? '■ Stop listening' : '👂 Listen'}
          </button>
          {listen ? (
            <div className="live" aria-live="polite">
              {listenStatus?.state === 'paused' ? (
                <span className="muted">paused while Muse plays…</span>
              ) : listenStatus?.label ? (
                <>
                  <b>{listenStatus.label}</b>
                  <span className="conf">{Math.round(listenStatus.confidence * 100)}%</span>
                  <span className="holdbar"><i style={{ width: `${Math.round(listenStatus.hold * 100)}%` }} /></span>
                </>
              ) : (
                <span className="muted">{tab === 'chords' ? 'play a chord…' : 'sing or play a note…'}</span>
              )}
              <span className="level"><i style={{ width: `${Math.min(100, Math.round((listenStatus?.level ?? 0) * 600))}%` }} /></span>
              {lastHeard && <span className="added">added {lastHeard}</span>}
            </div>
          ) : (
            <span className="small muted">{tab === 'chords' ? 'hear chords from your instrument' : 'hear notes you sing or play'}</span>
          )}
        </div>
        {tab === 'chords' ? (
          <>
            <PaletteRow
              label="Diatonic"
              chords={diatonicChords(k, false)}
              k={k}
              prev={cur ?? null}
              prevMoods={cur ? engine.chordMoods(cur, k, chords[chords.length - 2]) : []}
              lex={lex}
              engine={engine}
              onAdd={addChord}
            />
            <PaletteRow
              label="7ths"
              chords={diatonicChords(k, true)}
              k={k}
              prev={cur ?? null}
              prevMoods={cur ? engine.chordMoods(cur, k, chords[chords.length - 2]) : []}
              lex={lex}
              engine={engine}
              onAdd={addChord}
            />
            <PaletteRow
              label="Colour"
              chords={colourPaletteChords(k).filter((c) => !isDiatonicTriadClone(c, diatonicChords(k, false)) && !isDiatonicTriadClone(c, diatonicChords(k, true)))}
              k={k}
              prev={cur ?? null}
              prevMoods={cur ? engine.chordMoods(cur, k, chords[chords.length - 2]) : []}
              lex={lex}
              engine={engine}
              onAdd={addChord}
            />
            <form className="typed" onSubmit={(e) => { e.preventDefault(); submitTyped(); }}>
              <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type a chord: F#m7, Bb/D…" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
              <button type="submit">Add</button>
            </form>
          </>
        ) : (
          <div className="melody-input">
            <PianoViz scalePcs={scale} tonicPc={pc(k.tonic)} melody={melody.slice(-1)} spell={spell} onKey={addNote} minLow={60} minHigh={83} height={130} label="Tap to add melody notes" labelKeys="all" />
            <div className="legend"><ScaleLegend keyLabel={keyName(k)} tonic={noteName(k.tonic, true)} /><span><i className="dot" />your notes</span></div>
            <p className="small muted">Tap keys (or 👂 Listen) to fill the melody lane above each chord. Notes land on successive beats; a full bar spills into the next (N.C. until you add a chord).</p>
          </div>
        )}
        </>)}
      </section>

      {tab !== 'artists' && (<>

      {/* Mood */}
      <section className="mood">
        <form onSubmit={(e) => { e.preventDefault(); void interpret(moodText); }} className="moodbar">
          <input value={moodText} onChange={(e) => setMoodText(e.target.value)} onBlur={() => void interpret(moodText)} placeholder="Describe a mood: haunting, victorious but bittersweet…" enterKeyHint="go" />
          {moodText && <button type="button" className="ghost" onClick={() => { setMoodText(''); setProfile(null); }}>✕</button>}
        </form>
        {profile && (
          <div className="interp">
            <span className="small muted">Make it more:</span>
            {Object.entries(profile.moods).sort((a, b) => b[1] - a[1]).map(([id, w]) => (
              <span key={id} className="mchip" style={{ borderColor: lex.color(id), color: lex.color(id) }}>
                <button onClick={() => bumpMood(id, -0.15)} aria-label={`less ${id}`}>−</button>
                {lex.label(id).toLowerCase()} {Math.round(w * 100)}%
                <button onClick={() => bumpMood(id, 0.15)} aria-label={`more ${id}`}>+</button>
              </span>
            ))}
            {chips.slice(Object.keys(profile.moods).length).map((c, i) => {
              const dimKeys = Object.keys(profile.dims);
              const isMode = i >= dimKeys.length;
              return (
                <button key={c} className="dchip" onClick={() => (isMode ? dropMode(profile.modes[i - dimKeys.length]) : dropDim(dimKeys[i]))}>{c} ✕</button>
              );
            })}
            {profile.unknown && profile.unknown.length > 0 && <span className="small muted">(didn't know: {profile.unknown.join(', ')})</span>}
          </div>
        )}
        <div className="presets">
          {PRESET_MOODS.filter((m) => lex.get(m) || true).map((m) => {
            const on = !!profile?.moods[m];
            return (
              <button key={m} className={'preset' + (on ? ' on' : '')} style={{ borderColor: lex.color(m), background: on ? lex.color(m) : undefined, color: on ? '#111' : lex.color(m) }} onClick={() => togglePreset(m)}>
                {lex.label(m).toLowerCase()}
              </button>
            );
          })}
        </div>
        <label className="slider">
          <span>Safe</span>
          <input type="range" min={0} max={1} step={0.05} value={adventure} onChange={(e) => setAdventure(Number(e.target.value))} aria-label="Safe to adventurous" />
          <span>Adventurous</span>
        </label>
      </section>

      {/* Visuals */}
      <section className="visuals" style={{ borderColor: selColor }}>
        <div className="vis-head">
          {tab === 'chords' && selChord ? (
            <>
              <div className="vis-title">
                {cur ? (() => {
                  const r = rootMotion(cur, selChord.chord);
                  return <span className={'root-arrow ' + (r.dir === '↑' ? 'root-up' : r.dir === '↓' ? 'root-down' : 'root-same')} aria-label={r.label} title={r.label}>{r.dir}</span>;
                })() : null}
                <b style={{ color: selColor }}>{cur ? `${chordSymbol(cur, true)} → ` : ''}{selChord.symbol}</b>
                <span className="muted">{selChord.roman}</span>
                {cur ? (() => {
                  const r = rootMotion(cur, selChord.chord);
                  return <span className={'root-badge ' + (r.dir === '↑' ? 'root-up' : r.dir === '↓' ? 'root-down' : 'root-same')} title="Root vs current chord">{r.label}</span>;
                })() : null}
              </div>
              <button className="ghost" onClick={() => setDetail(true)}>Details</button>
            </>
          ) : tab === 'melody' && selNote ? (
            <div className="vis-title"><b style={{ color: selColor }}>{selNote.name.replace('#', '♯')}</b> <span className="muted">degree {selNote.degree}</span></div>
          ) : <div className="vis-title muted">Visuals</div>}
        </div>
        {tab === 'chords' && (
          <div className="seg small-seg">
            {(['piano', 'guitar', 'voices', 'map', 'circle', 'tonnetz'] as VisTab[]).map((v) => (
              <button key={v} className={visTab === v ? 'on' : ''} onClick={() => setVisTab(v)}>{v === 'voices' ? 'Voices' : v === 'map' ? 'Map' : v[0].toUpperCase() + v.slice(1)}</button>
            ))}
          </div>
        )}
        {visuals(false)}
      </section>

      {loreOn && (
        <section className="lore">
          <div className="row gap"><span className="lorebadge">LORE, NOT SCIENCE</span><span className="small muted">{data.lore?.disclaimer}</span></div>
          {(data.lore ? findLore(data.lore, k, tab === 'chords' ? selChord?.chord : undefined) : []).map((e) => (
            <div key={e.id} className="lorecard">
              <b>{e.title}</b>
              <div className="small">{e.text}</div>
              <div className="small muted">{e.source}{e.caution ? ` — ${e.caution}` : ''}</div>
            </div>
          ))}
          {data.lore && !findLore(data.lore, k, selChord?.chord).length && <p className="small muted">No lore for {keyName(k)}{selChord ? ` / ${selChord.symbol}` : ''}.</p>}
        </section>
      )}

      <details className="journey">
        <summary>Mood journey — generate a progression</summary>
        <div className="row gap">
          <select aria-label="Start mood" value={jFrom} onChange={(e) => setJFrom(e.target.value)}>
            {lex.ids().map((m) => <option key={m} value={m}>{lex.label(m)}</option>)}
          </select>
          <span>→</span>
          <select aria-label="End mood" value={jTo} onChange={(e) => setJTo(e.target.value)}>
            {lex.ids().map((m) => <option key={m} value={m}>{lex.label(m)}</option>)}
          </select>
        </div>
        <label className="slider"><span>{jLen} chords</span><input type="range" min={4} max={8} step={1} value={jLen} onChange={(e) => setJLen(Number(e.target.value))} aria-label="Journey length" /></label>
        <div className="row gap">
          <button className="add" onClick={makeJourney}>Generate</button>
          <button onClick={playJourney} disabled={!journey}>▶ Play</button>
          <button onClick={useJourney} disabled={!journey}>Use as progression</button>
        </div>
        {journey && (
          <div className="jchips">
            {journey.map((s, i) => (
              <div key={i} className="jchip" style={{ background: lex.color(s.moods[0]?.id ?? 'floating') }} onClick={() => playChord(s.chord)}>
                {s.symbol}<small>{s.roman} · {lex.label(s.moods[0]?.id ?? '').toLowerCase()}</small>
              </div>
            ))}
          </div>
        )}
      </details>

      {/* Suggestions */}
      <section className="suggestions" aria-label="Suggestions">
        <h3>
          {tab === 'chords'
            ? (pendingHarm
              ? `Chord for bar ${chordTarget + 1} melody`
              : cur ? `Next chord after ${chordSymbol(cur, true)}` : 'Start with…')
            : melody.length
              ? `Next note after ${spellMidi(melody[melody.length - 1])}${noteChord ? ` over ${chordSymbol(noteChord, true)}` : ''}`
              : 'First melody note'}
        </h3>
        <NextPickBoard
          mode={tab === 'melody' ? 'melody' : 'chords'}
          items={tab === 'chords' ? chordSugs : noteSugs}
          selectedId={tab === 'chords' ? (selChord?.id ?? null) : (selNote?.id ?? null)}
          colorOf={(id) => lex.color(id)}
          labelOf={(id) => lex.label(id)}
          fromChord={tab === 'chords' ? cur : undefined}
          fromLabel={tab === 'chords'
            ? (cur ? chordSymbol(cur, true) : undefined)
            : (melody.length ? spellMidi(melody[melody.length - 1]) : undefined)}
          onSelect={(id) => {
            setSelectedId(id);
            if (tab === 'chords') {
              const s = chordSugs.find((x) => x.id === id);
              if (s) playMove(s);
            } else {
              const s = noteSugs.find((x) => x.id === id);
              if (s) playNoteMove(s);
            }
          }}
          onAdd={(id) => {
            if (tab === 'chords') {
              const s = chordSugs.find((x) => x.id === id);
              if (s) addChord(s.chord);
            } else {
              const s = noteSugs.find((x) => x.id === id);
              if (s) addNote(s.midi);
            }
          }}
        />
        {groups.map(([mood, items]) => (
          <div key={mood} className="group">
            <div className="ghead"><i style={{ background: lex.color(mood) }} />{lex.label(mood)}</div>
            {items.map((s) => {
              const isChord = 'chord' in s;
              const selected = (isChord ? selChord?.id : selNote?.id) === s.id;
              const color = lex.color(s.primaryMood);
              const rar = RARITY_MARK[s.rarity];
              const cs = isChord ? s as ChordSuggestion : null;
              const ns = !isChord ? s as NoteSuggestion : null;
              const root = cs && cur ? rootMotion(cur, cs.chord) : null;
              return (
                <div key={s.id} className={'card' + (selected ? ' sel' : '')} style={{ borderLeftColor: color }}
                  onClick={() => { setSelectedId(s.id); if (isChord) playMove(s as ChordSuggestion); else playNoteMove(s as NoteSuggestion); }}>
                  <div className="card-main">
                    <div className="card-top">
                      {root && <span className={'root-arrow ' + (root.dir === '↑' ? 'root-up' : root.dir === '↓' ? 'root-down' : 'root-same')} aria-label={root.label} title={root.label}>{root.dir}</span>}
                      <span className="sym">{isChord ? (s as ChordSuggestion).symbol : (s as NoteSuggestion).name.replace('#', '♯')}</span>
                      <span className="rn">{isChord ? (s as ChordSuggestion).roman : (s as NoteSuggestion).degree}</span>
                      {root && <span className={'root-badge ' + (root.dir === '↑' ? 'root-up' : root.dir === '↓' ? 'root-down' : 'root-same')} title="Root vs current chord">{root.label}</span>}
                      <span className={'rar ' + s.rarity} title={rar.label}>{rar.sym} {rar.label}</span>
                    </div>
                    <div className="tags">
                      {s.moods.slice(0, 3).map((m) => <span key={m.id} className="tag" style={{ background: lex.color(m.id) }}>{lex.label(m.id).toLowerCase()}</span>)}
                      {cs?.moodShift && <span className="shift">{cs.moodShift.arrow} {cs.moodShift.text}</span>}
                      {profile && <span className="fit" title="fit to your mood">{Math.round((s.match?.total ?? 0) * 100)}% fit</span>}
                      {cs?.harmony && <span className="fit" title="melody fit">{Math.round(((cs.harmony.fit + 1) / 2) * 100)}% melody</span>}
                      {ns?.relation && (
                        <span className="reltag" style={{ borderColor: REL_COLORS[ns.relation.kind], color: REL_COLORS[ns.relation.kind] }}>
                          {ns.relation.label} · {REL_LABEL[ns.relation.kind]}
                        </span>
                      )}
                      {cs?.tension?.reasons.slice(0, 1).map((r) => <span key={r} className={'treason' + (r.startsWith('pushes') ? ' warn' : '')}>{r}</span>)}
                    </div>
                    <div className="why">{s.why}</div>
                  </div>
                  <div className="card-actions">
                    <button aria-label="Play" onClick={(e) => { e.stopPropagation(); setSelectedId(s.id); if (isChord) playMove(s as ChordSuggestion); else playNoteMove(s as NoteSuggestion); }}>▶</button>
                    <button aria-label="Add" className="add" onClick={(e) => { e.stopPropagation(); if (isChord) addChord((s as ChordSuggestion).chord); else addNote((s as NoteSuggestion).midi); }}>＋</button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </section>

      <div className="center" style={{ marginTop: 14 }}>
        <button className={'pill' + (loreOn ? ' on' : '')} onClick={() => setLoreOn((x) => !x)}>Lore mode {loreOn ? 'on' : 'off'}</button>
      </div>
      </>)}

      <details className="about">
        <summary>About &amp; credits</summary>
        <p>Muse suggests next chords and melody notes labelled by mood. It works offline; nothing leaves your device.</p>
        <p><b>Sounds.</b> Piano: <a href="https://github.com/Tonejs/audio/tree/master/salamander" target="_blank" rel="noreferrer">Salamander Grand Piano</a> by Alexander Holm (<a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">CC BY 3.0</a>), via the <a href="https://github.com/Tonejs/audio" target="_blank" rel="noreferrer">Tone.js audio</a> repository.
          Nylon, steel &amp; distorted electric guitar, bass guitar, Rhodes and pad: FluidR3_GM soundfont by Frank Wen, MP3 renders from <a href="https://github.com/gleitz/midi-js-soundfonts" target="_blank" rel="noreferrer">gleitz/midi-js-soundfonts</a> (<a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">CC BY 3.0</a>).
          Samples were trimmed, faded and re-encoded (MP3) for size; notes between samples are pitch-shifted.</p>
        <p><b>No sound on iPhone?</b> Flip off Silent mode (the switch on the side), turn the volume up, and tap again — Safari only starts audio after a tap.</p>
        <p><b>Theory &amp; moods.</b> Mood labels come from the bundled research knowledge base and mood lexicon (sources listed inside the data files). Lore mode notes are folklore, not science.</p>
      </details>
      <footer className="foot small muted">
        Works offline · no account · theory: {data.kbFile} v{data.kb.meta.version}{data.featureMapping ? ` · feature map (${data.featureMapping.applied} rules)` : ''} · lexicon {textLex.size} terms{data.moodLexicon ? ' (+ research lexicon)' : ''}
      </footer>

      {detail && selChord && tab === 'chords' && (
        <div className="sheet" role="dialog" aria-label="Suggestion details">
          <div className="sheet-inner">
            <div className="sheet-head">
              <div>
                <div className="big" style={{ color: selColor }}>{cur ? `${chordSymbol(cur, true)} → ` : ''}{selChord.symbol}</div>
                <div className="muted">
                  {selChord.roman} in {keyName(k)}
                  {cur ? (() => { const r = rootMotion(cur, selChord.chord); return <>{' · '}<span className={'root-move ' + (r.dir === '↑' ? 'root-up' : r.dir === '↓' ? 'root-down' : 'root-same')}>{r.label}</span></>; })() : null}
                  {' · '}{RARITY_MARK[selChord.rarity].label}{selChord.nrt ? ` · ${selChord.nrt.split('').join('→')}` : ''}
                </div>
              </div>
              <button className="ghost" onClick={() => setDetail(false)}>Close</button>
            </div>
            <div className="tags">
              {selChord.moods.slice(0, 5).map((m) => <span key={m.id} className="tag" style={{ background: lex.color(m.id) }}>{lex.label(m.id).toLowerCase()}</span>)}
              {selChord.moodShift && <span className="shift">{selChord.moodShift.arrow} {selChord.moodShift.text}</span>}
            </div>
            <div className="row gap">
              <button onClick={() => playMove(selChord)}>▶ Hear</button>
              <button className="add" onClick={() => { addChord(selChord.chord); setDetail(false); }}>＋ Add</button>
            </div>
            <Dims s={selChord} />
            {visuals(true)}
            <h4>Why (theory knowledge base)</h4>
            <ul className="evidence">
              {selChord.evidence.map((e) => (
                <li key={e.id}><b>{e.name}</b> <span className={'cons ' + e.consensus}>{e.consensus}</span><br /><span className="small">{e.description}</span></li>
              ))}
              {!selChord.evidence.length && <li className="muted">No KB entry; mood inferred from chord quality.</li>}
            </ul>
            {(() => {
              const used = data.artists ? selChord.evidence.flatMap((e) => data.artists!.techniqueChipIndex[`chordMove:${e.id}`] ?? []) : [];
              const uniq = [...new Map(used.map((u) => [u.artistId + u.techniqueId, u])).values()].slice(0, 6);
              if (!uniq.length || !data.artists) return null;
              const name = (id: string) => data.artists!.artists.find((a) => a.id === id)?.name ?? id;
              return (
                <>
                  <h4>Used by (Artist Lens)</h4>
                  <ul className="evidence">
                    {uniq.map((u) => (
                      <li key={u.artistId + u.techniqueId}>
                        <button className="linkish" onClick={() => { setDetail(false); setFocusArtist(u.artistId); setTab('artists'); window.scrollTo({ top: 0 }); }}>{name(u.artistId)}</button> — {u.name}
                      </li>
                    ))}
                  </ul>
                </>
              );
            })()}
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/** One palette row: chord symbol, roman, and (vs previous) root ↑/↓ + mood shift. */
function PaletteRow({
  label, chords, k, prev, prevMoods, lex, engine, onAdd,
}: {
  label: string;
  chords: Chord[];
  k: Key;
  prev: Chord | null;
  prevMoods: Array<{ id: string; weight: number }>;
  lex: MoodLexicon;
  engine: SuggestionEngine;
  onAdd: (c: Chord) => void;
}) {
  if (!chords.length) return null;
  return (
    <div className="pal-block">
      <div className="pal-label small muted">{label}{prev ? ' · vs last chord' : ''}</div>
      <div className="palette">
        {chords.map((c) => {
          const rn = analyzeRoman(c, k);
          const roman = rn.secondary ?? rn.text;
          const motion = prev ? rootMotion(prev, c) : null;
          const nrt = prev ? nrtTag(prev, c) : null;
          const moods = engine.chordMoods(c, k, prev ?? undefined);
          const shift = prev && prevMoods.length ? lex.shift(prevMoods, moods) : null;
          const moodId = moods[0]?.id;
          const color = moodId ? lex.color(moodId) : undefined;
          const role = !prev ? degreeRole(rn.degree) : null;
          const rel = prev
            ? [nrt || motion?.label, shift ? `${shift.arrow} ${shift.text}` : null].filter(Boolean).join(' · ')
            : role;
          const tip = [
            `${chordSymbol(c, true)} (${roman})`,
            motion ? `root ${motion.label} vs ${chordSymbol(prev!, true)}` : null,
            nrt ? `neo-Riemannian ${nrt}` : null,
            shift ? `${shift.arrow} ${shift.text}` : moodId ? lex.label(moodId) : null,
            role,
          ].filter(Boolean).join(' — ');
          return (
            <button
              key={`${label}:${chordSymbol(c)}`}
              type="button"
              className={'pal' + (motion ? ` root-${motion.dir === '↑' ? 'up' : motion.dir === '↓' ? 'down' : 'same'}` : '')}
              style={color ? { borderColor: color } : undefined}
              title={tip}
              onClick={() => onAdd(c)}
            >
              <b>{chordSymbol(c, true)}</b>
              <small className="pal-rn">{roman}</small>
              {rel && <small className="pal-rel">{prev ? (nrt || motion?.label) : role}{shift ? ` ${shift.arrow}` : ''}</small>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Dims({ s }: { s: ChordSuggestion }) {
  const f = s.features;
  const rows: Array<[string, number, number, number]> = [
    ['dark ↔ bright', f.brightness, -1, 1], ['tension', f.tension, 0, 1], ['unusual', f.chromaticism, 0, 1], ['resolved', f.stability, 0, 1], ['energy', f.energy, 0, 1],
  ];
  return (
    <div className="dims">
      {rows.map(([label, v, lo, hi]) => (
        <div key={label} className="dim"><span>{label}</span><div className="bar"><i style={{ width: `${((v - lo) / (hi - lo)) * 100}%` }} /></div></div>
      ))}
    </div>
  );
}

function Contour({ melody, next, color, spell }: { melody: number[]; next?: number; color: string; spell: (m: number) => string }) {
  const notes = next !== undefined ? [...melody, next] : melody;
  if (!notes.length) return <p className="small muted">Tap the keyboard to start a melody.</p>;
  const lo = Math.min(...notes) - 2, hi = Math.max(...notes) + 2;
  const W = 320, H = 120, step = W / Math.max(notes.length, 4);
  const y = (m: number) => 10 + ((hi - m) / (hi - lo || 1)) * (H - 20);
  return (
    <svg className="contour" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Melodic contour">
      <polyline points={melody.map((m, i) => `${i * step + step / 2},${y(m)}`).join(' ')} fill="none" stroke="#bbb" strokeWidth={2} />
      {next !== undefined && melody.length > 0 && <line x1={(melody.length - 1) * step + step / 2} y1={y(melody[melody.length - 1])} x2={melody.length * step + step / 2} y2={y(next)} stroke={color} strokeWidth={3} strokeDasharray="5 3" />}
      {notes.map((m, i) => (
        <g key={i}>
          <circle cx={i * step + step / 2} cy={y(m)} r={6} fill={i === notes.length - 1 && next !== undefined ? color : '#ddd'} />
          <text x={i * step + step / 2} y={y(m) - 9} className="cnote">{spell(m)}</text>
        </g>
      ))}
    </svg>
  );
}

