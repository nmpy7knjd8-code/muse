import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  Chord, ChordSuggestion, MoodProfile, MoodLexicon, ModeId, MODES, MODE_BY_ID, MoodTextLexicon, NoteSuggestion, SuggestionEngine, LexiconInterpreter,
  analyzeRoman, chordSymbol, describeProfile, detectKeys, diatonicChords, guitarVoicings, isEmptyProfile, keyName,
  midiName, noteName, parseChord, parseNote, pc, pianoFingering, pianoVoicing, romanOf, scalePcs,
  spellInKey, tonicChoices, voiceProgression, type Key,
  chordFeatures, moodJourney, findLore, type JourneyStep,
  INSTRUMENTS, INSTRUMENT_IDS, bassLineMidi, chordMidis, fitMidiToInstrument, type InstrumentId, loadTryIt, progressionTension, moodTarget, type TensionStyleId, type ArtistTryIt, type Artist,
  TimelineSlot, activeBassSlotIndex, activeSlotIndex, bassOf, chordTargetIndex, chordsOf, clearSlotChord, insertBassNote, insertNote,
  insertRest, isSounding, labelBassSlot, labelSlot, melodyOf, nextBassBeat, nextNoteBeat, noteDurations, removeBassAt, removeNoteAt, removeSlot,
  setSlotChord, slotBass, timelineEvents, timelineText, toMidiTimeline,
  harmPreviewEvents, clampSlotsToPartMeters,
  REL_COLORS, REL_LABEL, type RelKind,
  colourPaletteChords, degreeRole, isDiatonicTriadClone, nrtPathLabel, nrtTag, openPaletteChords, rootMotion, secondaryPaletteChords,
  TimeSig, TIME_SIG_PRESETS, DEFAULT_TIME_SIG, BPM_PRESETS, DEFAULT_BPM, beatSecFromBpm, clampBpm,
  beatsPerBar, clampSlotsToMeter, parseMeter, defaultPartMeters, timeSigEqual,
  timeSigLabel, type PartMeter, type PartMeters, type PartId,
  suggestChordPaths, suggestNotePaths, formatChordPath, formatNotePath, type ChordPath, type NotePath,
  type ChordBridge, activeAt, type TimelineEvents,
} from '../core';
import { loadData, type LoadedData } from './data';
import { synth } from './audio';
import { CircleOfFifths, GuitarDiagram, MoodMap, PianoViz, ScaleLegend, StaffChordViz, TonnetzViz, VoiceLeadingViz, VoiceLegend, CURRENT_COLOR } from './visuals';
import { ArtistLens } from './ArtistLens';
import { Guide } from './Guide';
import { FitExplainer } from './FitExplainer';
import { NextPickBoard } from './NextPickBoard';
import { TensionCurve, type TensionMelNote } from './TensionCurve';
import { MoodChordRef } from './MoodChordRef';
import { ChordConnections } from './ChordConnections';
import { PlaybackRibbon, ribbonNotesFromEvents } from './PlaybackRibbon';
import { PartMeterPanel } from './PartMeterPanel';
import { listenErrorMessage, startListening, type ListenSession, type ListenStatus } from './listen';
import { midiErrorMessage, midiSupported, startMidiInput } from './midiInput';
import { BackIcon, BrandMark, CloseIcon, LockIcon, MenuIcon, ReharmIcon } from './icons';

type Tab = 'chords' | 'melody' | 'bass';
type InputPane = 'write' | 'meter';
/** Left drawer pages — Guide / Artist Lens / mood reference live off the main strip. */
type DrawerPage = 'menu' | 'moods' | 'guide' | 'artists';
type VisTab = 'piano' | 'guitar' | 'voices' | 'circle' | 'tonnetz' | 'map';
/** Timeline (and card) note graphic: piano keys (default) or staff. */
type NoteViz = 'piano' | 'staff';
type InputSource = 'mic' | 'midi';
interface Snapshot { slots: TimelineSlot[] }

const PRESET_MOODS = [
  'mystical', 'melancholy', 'triumphant', 'tense', 'dreamy', 'dark', 'bright', 'peaceful',
  'epic', 'bittersweet', 'yearning', 'solemn', 'hopeful', 'warm', 'romantic', 'nostalgic',
  'ominous', 'dramatic', 'uncanny', 'wonder', 'floating', 'surprising', 'bluesy', 'jazzy',
  'earthy', 'playful', 'resolved',
];
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
    setPartMeters((pm) => {
      const next = { ...pm };
      (['chords', 'melody', 'bass'] as PartId[]).forEach((id) => {
        if (timeSigEqual(pm[id].timeSig, timeSig)) next[id] = { ...pm[id], timeSig: { ...ts } };
      });
      setSlots((s) => clampSlotsToPartMeters(s, next));
      return next;
    });
  };
  const [bpm, setBpm] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem('muse.bpm'));
      return Number.isFinite(v) && v > 0 ? clampBpm(v) : DEFAULT_BPM;
    } catch { return DEFAULT_BPM; }
  });
  const chooseBpm = (n: number) => {
    const next = clampBpm(n);
    setBpm(next);
    try { localStorage.setItem('muse.bpm', String(next)); } catch { /* private mode */ }
  };
  const beatSec = beatSecFromBpm(bpm);
  const [meterNote, setMeterNote] = useState<string | null>(null);
  const [slots, setSlots] = useState<TimelineSlot[]>([]);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const beats = beatsPerBar(timeSig);
  const [tab, setTab] = useState<Tab>('chords');
  const [inputPane, setInputPane] = useState<InputPane>('write');
  const [partMeters, setPartMeters] = useState<PartMeters>(() => defaultPartMeters(timeSig));
  const choosePartMeter = (id: PartId, next: PartMeter) => {
    const merged = { ...partMeters, [id]: next };
    setPartMeters(merged);
    setSlots((s) => clampSlotsToPartMeters(s, merged));
  };
  const matchPartToSession = (id: PartId) => {
    choosePartMeter(id, { timeSig: { ...timeSig }, subdiv: 1 });
  };
  const melMeter = partMeters.melody;
  const bassMeter = partMeters.bass;
  const melBeats = beatsPerBar(melMeter.timeSig);
  const bassBeats = beatsPerBar(bassMeter.timeSig);
  const [drawer, setDrawer] = useState<DrawerPage | null>(null);
  /** ▶ Play transport: audio-clock origin + scheduled events for the scrolling playhead. */
  const [transport, setTransport] = useState<{ origin: number; events: TimelineEvents } | null>(null);
  const [playSec, setPlaySec] = useState(0);
  /** Loop ▶ Play when the timeline ends (default on). */
  const [loopPlay, setLoopPlay] = useState(() => {
    try {
      const v = localStorage.getItem('muse.loop');
      if (v === '0') return false;
      if (v === '1') return true;
    } catch { /* private mode */ }
    return true;
  });
  const chooseLoop = (on: boolean) => {
    setLoopPlay(on);
    try { localStorage.setItem('muse.loop', on ? '1' : '0'); } catch { /* private mode */ }
  };
  const loopPlayRef = useRef(loopPlay);
  loopPlayRef.current = loopPlay;
  const playAllRef = useRef<() => void>(() => {});
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const barRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  // Left-edge swipe opens the menu (mobile “top-left swipe” affordance).
  useEffect(() => {
    let x0 = 0, y0 = 0, tracking = false;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t || t.clientX > 28 || drawer) return;
      tracking = true; x0 = t.clientX; y0 = t.clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - x0, dy = t.clientY - y0;
      if (Math.abs(dy) > 40) { tracking = false; return; }
      if (dx > 56) { tracking = false; setDrawer('menu'); }
    };
    const onEnd = () => { tracking = false; };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [drawer]);
  useEffect(() => {
    if (!drawer) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [drawer]);
  const [visTab, setVisTab] = useState<VisTab>('piano');
  /** Timeline chord graphic: piano keys (default) or staff. */
  const [noteViz, setNoteViz] = useState<NoteViz>(() => {
    try {
      const v = localStorage.getItem('muse.noteViz') ?? localStorage.getItem('muse.cardNoteViz');
      if (v === 'staff' || v === 'piano') return v;
    } catch { /* private mode */ }
    return 'piano';
  });
  const chooseNoteViz = (v: NoteViz) => {
    setNoteViz(v);
    try { localStorage.setItem('muse.noteViz', v); } catch { /* private mode */ }
  };
  const [adventure, setAdventure] = useState(0.35);
  const [tStyle, setTStyle] = useState<TensionStyleId>(() => {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem('muse.tensionStyle') : null;
    return v === 'pop' || v === 'classical' || v === 'jazz' || v === 'film' ? v : 'pop';
  });
  const chooseTStyle = (s: TensionStyleId) => { setTStyle(s); try { localStorage.setItem('muse.tensionStyle', s); } catch { /* private mode */ } };
  /** Index among chorded timeline bars — shared by tension curve ↔ timeline highlight. */
  const [tensionPick, setTensionPick] = useState<number | null>(null);
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
  const [inputSource, setInputSource] = useState<InputSource>('mic');
  const [lastHeard, setLastHeard] = useState<string | null>(null);
  useEffect(() => () => listen?.stop(), [listen]);

  const chords = useMemo(() => chordsOf(slots), [slots]);
  const melody = useMemo(() => melodyOf(slots), [slots]);
  const bassLine = useMemo(() => bassOf(slots), [slots]);
  const chordTarget = chordTargetIndex(slots);
  const pendingHarm = !slots[chordTarget]?.chord && (slots[chordTarget]?.notes.length ?? 0) > 0 ? slots[chordTarget] : null;
  const noteSlot = slots[activeSlotIndex(slots, melBeats, melMeter.subdiv)] ?? null;
  const noteChord = noteSlot?.chord ?? slots.filter((s) => s.chord).at(-1)?.chord ?? null;
  const noteBeat = nextNoteBeat(slots, melBeats, melMeter.subdiv);
  const bassSlot = slots[activeBassSlotIndex(slots, bassBeats, bassMeter.subdiv)] ?? null;
  const bassChord = bassSlot?.chord ?? slots.filter((s) => s.chord).at(-1)?.chord ?? null;
  const bassBeat = nextBassBeat(slots, bassBeats, bassMeter.subdiv);
  const lineChord = tab === 'bass' ? bassChord : noteChord;
  const lineNotes = tab === 'bass' ? bassLine : melody;
  const picked: Key = { tonic: parseNote(tonic)!, mode };
  const detected = useMemo(() => (auto && (chords.length >= 2 || melody.length >= 4) ? detectKeys(chords, melody)[0] : null), [auto, slots]); // eslint-disable-line react-hooks/exhaustive-deps
  // auto-detect only chooses between major/minor keys; a modal pick (e.g. Dorian) is kept as-is
  const k: Key = auto && detected && (mode === 'major' || mode === 'minor') ? detected.key : picked;
  const scale = scalePcs(k);
  const cur = chords[chords.length - 1];
  const timelineVoicings = useMemo(() => voiceProgression(chords), [slots]); // eslint-disable-line react-hooks/exhaustive-deps
  const prevVoicing = timelineVoicings[timelineVoicings.length - 1];
  const spell = (m: number) => noteName(spellInKey(k, m), true);
  const spellMidi = (m: number) => midiName(m, spellInKey(k, m)).replace('#', '♯').replace(/b(?=\d)/, '♭');

  const chordSugs: ChordSuggestion[] = useMemo(() => {
    if (tab !== 'chords') return [];
    const progression = pendingHarm ? chordsOf(slots.slice(0, chordTarget)) : chords;
    const durs = pendingHarm ? noteDurations(pendingHarm.notes, melBeats) : [];
    const harmonize = pendingHarm
      ? pendingHarm.notes.flatMap((n, i) => (isSounding(n) ? [{ midi: n.midi, beat: n.beat, dur: durs[i] }] : []))
      : undefined;
    return engine.suggestChords({ key: k, progression, profile, adventure, limit: 28, tensionStyle: tStyle, harmonize });
  }, [engine, tab, k.tonic.letter, k.tonic.acc, k.mode, slots, profile, adventure, tStyle, beats]); // eslint-disable-line react-hooks/exhaustive-deps
  const chordedSlotIndices = useMemo(
    () => slots.map((s, i) => (s.chord ? i : -1)).filter((i) => i >= 0),
    [slots],
  );
  const tState = useMemo(() => {
    const steps = slots.filter((s) => s.chord).map((s) => ({
      chord: s.chord as Chord,
      melody: s.notes.filter(isSounding).map((n) => n.midi),
    }));
    return steps.length ? progressionTension(steps, k, { style: tStyle, adventure, target: moodTarget(profile) }) : null;
  }, [k.tonic.letter, k.tonic.acc, k.mode, slots, profile, adventure, tStyle]); // eslint-disable-line react-hooks/exhaustive-deps
  const tensionMelodyNotes: TensionMelNote[][] = useMemo(
    () => slots.filter((s) => s.chord).map((s) => {
      const out: TensionMelNote[] = [];
      for (const n of labelSlot(s, data.kb, melBeats)) {
        if (!isSounding(n)) continue;
        out.push({
          name: spellMidi(n.midi),
          label: n.relation?.label ?? '',
          kind: n.relation?.kind ?? null,
        });
      }
      return out;
    }),
    [slots, data.kb, melBeats, k.tonic.letter, k.tonic.acc, k.mode], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Keep tensionPick in range when bars are removed.
  useEffect(() => {
    if (tensionPick !== null && tensionPick >= chordedSlotIndices.length) setTensionPick(chordedSlotIndices.length ? chordedSlotIndices.length - 1 : null);
  }, [chordedSlotIndices.length, tensionPick]);
  const noteSugs: NoteSuggestion[] = useMemo(
    () => (tab === 'melody' || tab === 'bass'
      ? engine.suggestNotes({
        key: k,
        melody: tab === 'bass' ? bassLine : melody,
        chord: tab === 'bass' ? bassChord : noteChord,
        // Last few chords so ranking / why text respect the arrival of the sequence.
        progression: chords.slice(-4),
        profile,
        adventure,
        limit: 12,
        beat: tab === 'bass' ? bassBeat : noteBeat,
        timeSig,
      })
      : []),
    [engine, tab, k.tonic.letter, k.tonic.acc, k.mode, slots, profile, adventure, timeSig.num, timeSig.den], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [pathLen, setPathLen] = useState<2 | 3>(2);
  const chordPaths: ChordPath[] = useMemo(() => {
    if (tab !== 'chords') return [];
    const progression = pendingHarm ? chordsOf(slots.slice(0, chordTarget)) : chords;
    return suggestChordPaths(engine, {
      key: k, progression, profile, adventure, tensionStyle: tStyle, melody, steps: pathLen, limit: 4,
    });
  }, [engine, tab, pendingHarm, chordTarget, k.tonic.letter, k.tonic.acc, k.mode, slots, profile, adventure, tStyle, pathLen]); // eslint-disable-line react-hooks/exhaustive-deps
  const notePaths: NotePath[] = useMemo(() => {
    if (tab !== 'melody' && tab !== 'bass') return [];
    return suggestNotePaths(engine, {
      key: k,
      melody: tab === 'bass' ? bassLine : melody,
      chord: tab === 'bass' ? bassChord : noteChord,
      progression: chords.slice(-4),
      profile,
      adventure,
      steps: pathLen,
      limit: 4,
      beat: tab === 'bass' ? bassBeat : noteBeat,
    });
  }, [engine, tab, k.tonic.letter, k.tonic.acc, k.mode, slots, profile, adventure, pathLen]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // Per-part instruments: chords / melody / optional bass line (persisted separately).
  const readInst = (key: string, fallback: InstrumentId): InstrumentId => {
    try {
      const v = localStorage.getItem(key) as InstrumentId | null;
      if (v && v in INSTRUMENTS) return v;
      const legacy = localStorage.getItem('muse.instrument') as InstrumentId | null;
      if (legacy && legacy in INSTRUMENTS) return legacy;
    } catch { /* private mode */ }
    return fallback;
  };
  const [chordInst, setChordInst] = useState<InstrumentId>(() => readInst('muse.chordInst', 'piano'));
  const [melodyInst, setMelodyInst] = useState<InstrumentId>(() => readInst('muse.melodyInst', 'piano'));
  const [bassInst, setBassInst] = useState<InstrumentId | 'off'>(() => {
    try {
      const v = localStorage.getItem('muse.bassInst');
      if (v === 'off') return 'off';
      if (v && v in INSTRUMENTS) return v as InstrumentId;
    } catch { /* private mode */ }
    return 'off';
  });
  const activeParts = useMemo(() => {
    const ids: InstrumentId[] = [chordInst, melodyInst];
    if (bassInst !== 'off') ids.push(bassInst);
    return [...new Set(ids)];
  }, [chordInst, melodyInst, bassInst]);
  // Sample-load progress for every active part (external store → re-render on progress)
  const loadKey = useSyncExternalStore(
    (f) => synth.subscribe(f),
    () => activeParts.map((id) => `${id}:${synth.loadState(id).state}:${Math.round(synth.loadState(id).progress * 10)}`).join('|'),
  );
  void loadKey; // subscribe only — parts state drives the UI
  const partsLoading = activeParts.some((id) => synth.loadState(id).state === 'loading');
  const partsReady = activeParts.every((id) => synth.loadState(id).state === 'ready');
  const partsError = activeParts.some((id) => synth.loadState(id).state === 'error');
  const loadProgress = activeParts.length
    ? activeParts.reduce((s, id) => s + synth.loadState(id).progress, 0) / activeParts.length
    : 0;
  const instrChip = (id: InstrumentId) => INSTRUMENTS[id].label.replace(' guitar', '').replace('Nylon', 'Guitar').replace('Soft pad', 'Pad');
  const persistPart = (key: string, id: InstrumentId | 'off') => {
    try { localStorage.setItem(key, id); } catch { /* private mode */ }
  };
  const previewPart = (id: InstrumentId, part: 'chords' | 'melody' | 'bass') => {
    synth.unlock();
    synth.setInstrument(id); // reverb send follows last previewed part
    void synth.ensureLoaded(id);
    const demo = cur ?? diatonicChords(k)[0];
    if (part === 'melody') {
      const m = fitMidiToInstrument(60, INSTRUMENTS[id]);
      void synth.ensureLoaded(id).then(() => { synth.stopAll(); synth.playNotes([m], { dur: 0.7, instrument: id }); });
      return;
    }
    if (part === 'bass') {
      void synth.ensureLoaded(id).then(() => {
        synth.stopAll();
        synth.playNotes([bassLineMidi(demo, INSTRUMENTS[id])], { dur: 1.0, instrument: id });
      });
      return;
    }
    const def = INSTRUMENTS[id];
    if (def.voicing === 'guitar') setVisTab('guitar');
    else if (def.voicing === 'bass') setVisTab('circle');
    else setVisTab('piano');
    void synth.ensureLoaded(id).then(() => {
      synth.stopAll();
      synth.playNotes(chordMidis(demo, pianoVoicing(demo), def, { omitBass: bassInst !== 'off' }), { dur: 1.2, instrument: id });
    });
  };
  const chooseChordInst = (id: InstrumentId) => { setChordInst(id); persistPart('muse.chordInst', id); persistPart('muse.instrument', id); previewPart(id, 'chords'); };
  const chooseMelodyInst = (id: InstrumentId) => { setMelodyInst(id); persistPart('muse.melodyInst', id); previewPart(id, 'melody'); };
  const chooseBassInst = (id: InstrumentId | 'off') => {
    setBassInst(id);
    persistPart('muse.bassInst', id);
    if (id !== 'off') previewPart(id, 'bass');
  };
  const omitBass = bassInst !== 'off';
  /** Chord tones on the chord instrument (no low bass when a bass part is active). */
  const chordTones = (c: Chord, v: number[]) => chordMidis(c, v, INSTRUMENTS[chordInst], { omitBass });
  const playChordParts = (c: Chord, v: number[], opts: { at?: number; dur?: number; vel?: number; autoBass?: boolean } = {}) => {
    const { autoBass = true, ...playOpts } = opts;
    synth.playNotes(chordTones(c, v), { ...playOpts, instrument: chordInst });
    // Auto root only when no composed bass lane is driving Play (previews still get a root).
    if (autoBass && bassInst !== 'off') {
      synth.playNotes([bassLineMidi(c, INSTRUMENTS[bassInst])], {
        at: playOpts.at, dur: playOpts.dur ?? 1.1, vel: (playOpts.vel ?? 0.75) * 0.92, instrument: bassInst,
      });
    }
  };
  /** Keep a MIDI inside an instrument's sample range (melody or bass part). */
  const fitMidi = (m: number, id: InstrumentId = melodyInst) => fitMidiToInstrument(m, INSTRUMENTS[id]);
  const ensureBassOn = () => {
    if (bassInst === 'off') chooseBassInst('bass');
  };
  // Warm the active parts once audio unlocks / parts change.
  useEffect(() => {
    if (!synth.unlocked && !synth.ctx) return;
    for (const id of activeParts) void synth.ensureLoaded(id);
  }, [activeParts, loadKey]);
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
  // Hear policy (going forward): preview ONLY the candidate next chord/note — never previous → next.
  const playChord = (c: Chord, prev?: number[]) => {
    synth.unlock();
    synth.stopAll();
    playChordParts(c, pianoVoicing(c, prev));
  };
  const playMove = (s: ChordSuggestion) => {
    // Exception: when harmonizing a pending N.C. bar, overlay that bar's melody under the candidate chord.
    synth.unlock();
    synth.stopAll();
    if (pendingHarm?.notes.length) {
      const prev = harmPreviewEvents(pendingHarm.notes, { timeSig, beatSec });
      playChordParts(s.chord, s.voicing, { dur: prev.chordDur, vel: 0.62 });
      prev.notes.forEach((n) => synth.playNotes([fitMidi(n.midi)], {
        at: n.at, dur: n.dur, vel: n.beat === 0 ? 0.95 : 0.85, instrument: melodyInst,
      }));
    } else {
      playChordParts(s.chord, s.voicing);
    }
  };
  const startHarmonize = () => {
    setTab('chords');
    setSelectedId(null);
    flash(`Pick a chord for bar ${chordTarget + 1} melody`);
  };
  const reharmBar = (i: number) => {
    if (!slots[i]?.chord || slots[i].locked || !slots[i].notes.length) return;
    snapshot();
    setSlots((s) => clearSlotChord(s, i));
    setTab('chords');
    setSelectedId(null);
    flash(`Find a better chord for bar ${i + 1} — Hear plays chord + melody`);
  };
  const playNoteMove = (n: NoteSuggestion) => {
    synth.unlock();
    synth.stopAll();
    if (tab === 'bass') {
      const id = bassInst === 'off' ? 'bass' : bassInst;
      synth.playNotes([fitMidi(n.midi, id)], { dur: 0.7, vel: 0.92, instrument: id });
      return;
    }
    synth.playNotes([fitMidi(n.midi)], { dur: 0.65, vel: 0.92, instrument: melodyInst });
  };
  const playBridge = (b: ChordBridge) => {
    synth.unlock();
    synth.stopAll();
    void synth.ensureLoaded(chordInst);
    const from = slots[b.fromIndex]?.chord;
    const to = slots[b.toIndex]?.chord;
    if (!from || !to) return;
    const va = b.voiceLines.map((l) => l.from);
    const vb = b.voiceLines.map((l) => l.to);
    // Prefer unique pitches (voiceLeading may repeat on split/merge).
    const uniq = (ms: number[]) => [...new Set(ms)].sort((a, c) => a - c);
    playChordParts(from, uniq(va).length ? uniq(va) : pianoVoicing(from), { dur: 0.85, vel: 0.72 });
    playChordParts(to, uniq(vb).length ? uniq(vb) : pianoVoicing(to), { at: 0.95, dur: 1.0, vel: 0.78 });
    if (b.melodyBridge) {
      synth.playNotes([fitMidi(b.melodyBridge.from)], { at: 0.35, dur: 0.4, vel: 0.88, instrument: melodyInst });
      synth.playNotes([fitMidi(b.melodyBridge.to)], { at: 1.15, dur: 0.45, vel: 0.9, instrument: melodyInst });
    } else if (b.linkHintMidi !== null) {
      synth.playNotes([fitMidi(b.linkHintMidi)], { at: 0.55, dur: 0.35, vel: 0.7, instrument: melodyInst });
    }
    flash(`${b.fromSymbol} → ${b.toSymbol} · ${b.commonToneCount} held · ${b.totalMotion} st`);
  };
  const stopPlayback = () => {
    synth.stopAll();
    setTransport(null);
    setPlaySec(0);
  };
  const playAll = (opts: { soft?: boolean } = {}) => {
    synth.unlock();
    // Soft restart (loop): previous pass already finished — skip stopAll to avoid a click.
    if (!opts.soft) synth.stopAll();
    for (const id of activeParts) void synth.ensureLoaded(id);
    // ▶ Play from the selected bar (if any); otherwise from the start.
    const startIndex = tensionPick !== null ? (chordedSlotIndices[tensionPick] ?? 0) : 0;
    const ev = timelineEvents(slots, { timeSig, beatSec, startIndex, partMeters });
    const origin = synth.scheduleOrigin();
    setTransport({ origin, events: ev });
    setPlaySec(0);
    // Full progression for voice-leading; only schedule events from startIndex onward.
    const withC = slots.map((s, i) => ({ s, i })).filter((x) => x.s.chord);
    const voicings = voiceProgression(withC.map((x) => x.s.chord as Chord));
    const vBy = new Map(withC.map((x, j) => [x.i, voicings[j]]));
    const bassInstId = bassInst === 'off' ? null : bassInst;
    const composedBassBars = new Set(ev.bass.map((b) => b.index));
    // playNotes({ at }) is relative to scheduleOrigin(); playhead = audioTime − origin.
    ev.chords.forEach((c) => playChordParts(c.chord, vBy.get(c.index) ?? pianoVoicing(c.chord), {
      at: c.at, dur: c.dur, vel: 0.7,
      // Prefer composed bass notes for that bar; otherwise keep auto root when Bass is on.
      autoBass: !composedBassBars.has(c.index),
    }));
    ev.notes.forEach((n) => synth.playNotes([fitMidi(n.midi)], {
      at: n.at, dur: n.dur, vel: n.beat === 0 ? 0.95 : 0.85, instrument: melodyInst,
    }));
    if (bassInstId) {
      ev.bass.forEach((n) => synth.playNotes([fitMidi(n.midi, bassInstId)], {
        at: n.at, dur: n.dur, vel: n.beat === 0 ? 0.95 : 0.88, instrument: bassInstId,
      }));
    }
  };
  playAllRef.current = () => playAll({ soft: true });
  const togglePlay = () => {
    if (transport) stopPlayback();
    else playAll();
  };

  // Drive playhead from the audio clock; scroll the timeline to the sounding bar.
  useEffect(() => {
    if (!transport) return;
    let raf = 0;
    let restarted = false;
    const tick = () => {
      const now = synth.audioTime();
      if (now === null) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const t = now - transport.origin;
      if (t >= transport.events.total) {
        if (loopPlayRef.current) {
          if (!restarted) {
            restarted = true;
            playAllRef.current();
          }
          return;
        }
        setTransport(null);
        setPlaySec(0);
        return;
      }
      setPlaySec(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [transport]);

  const playActive = transport ? activeAt(transport.events, playSec) : null;
  useEffect(() => {
    if (!playActive || playActive.chordIndex === null) return;
    const el = barRefs.current.get(playActive.chordIndex);
    const scroller = timelineRef.current;
    if (!el || !scroller) return;
    const left = el.offsetLeft - (scroller.clientWidth - el.clientWidth) / 2;
    scroller.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [playActive?.chordIndex]);

  const ribbonBits = useMemo(() => {
    if (!transport) return null;
    return ribbonNotesFromEvents(
      transport.events,
      spellMidi,
      (i) => (slots[i]?.chord ? chordSymbol(slots[i]!.chord!, true) : ''),
    );
  }, [transport, slots, k.tonic.letter, k.tonic.acc, k.mode]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const dropNote = (si: number, ni: number) => { snapshot(); setSlots((s) => removeNoteAt(s, si, ni)); };
  const dropBass = (si: number, ni: number) => { snapshot(); setSlots((s) => removeBassAt(s, si, ni)); };
  const toggleLock = (i: number) => setSlots((s) => s.map((x, j) => (j === i ? { ...x, locked: !x.locked } : x)));
  const clearAll = () => { stopPlayback(); synth.unlock(); snapshot(); setSlots((s) => s.filter((x) => x.locked)); setMeterNote(null); setSelectedId(null); };
  const addNote = (m: number) => {
    synth.unlock();
    synth.playNotes([fitMidi(m)], { dur: 0.6, instrument: melodyInst });
    snapshot();
    setSlots((s) => insertNote(s, m, undefined, melBeats, melMeter.subdiv).slots);
    setSelectedId(null);
  };
  const addBass = (m: number) => {
    synth.unlock();
    ensureBassOn();
    const id = bassInst === 'off' ? 'bass' : bassInst;
    const fitted = fitMidi(m, id);
    synth.playNotes([fitted], { dur: 0.65, instrument: id });
    snapshot();
    setSlots((s) => insertBassNote(s, fitted, undefined, bassBeats, bassMeter.subdiv).slots);
    setSelectedId(null);
  };
  const addRest = () => {
    if (tab === 'chords') return;
    snapshot();
    if (tab === 'bass') {
      setSlots((s) => insertRest(s, 'bass', undefined, bassBeats, bassMeter.subdiv).slots);
    } else {
      setSlots((s) => insertRest(s, 'notes', undefined, melBeats, melMeter.subdiv).slots);
    }
    flash('Rest');
  };
  const playChordSequence = (cs: Chord[], step = 0.8, dur = 0.75) => {
    synth.stopAll();
    const voiced = voiceProgression(cs);
    cs.forEach((c, i) => playChordParts(c, voiced[i], {
      at: i * step, dur, vel: i === cs.length - 1 ? 0.78 : 0.7,
    }));
  };
  const playChordPath = (p: ChordPath) => {
    synth.unlock();
    synth.stopAll();
    const voiced = voiceProgression([...chords, ...p.chords]);
    const base = chords.length;
    const step = beatSec * 2.14;
    p.chords.forEach((c, i) => {
      const at = i * step;
      playChordParts(c, voiced[base + i] ?? pianoVoicing(c), { at, dur: step * 0.94, vel: 0.68 });
      if (p.links[i] !== undefined) {
        synth.playNotes([fitMidi(p.links[i])], {
          at: at + step * 0.2, dur: step * 0.55, vel: 0.92, instrument: melodyInst,
        });
      }
    });
  };
  const addChordPath = (p: ChordPath) => {
    snapshot();
    playChordPath(p);
    setSlots((prev) => {
      let s = prev;
      for (let i = 0; i < p.chords.length; i++) {
        const target = chordTargetIndex(s);
        s = setSlotChord(s, target, p.chords[i]);
        if (p.links[i] !== undefined) s = insertNote(s, p.links[i], target, melBeats, melMeter.subdiv).slots;
      }
      return s;
    });
    setSelectedId(null);
  };
  const playNotePath = (p: NotePath) => {
    synth.unlock();
    synth.stopAll();
    const noteStep = Math.max(0.22, beatSec * 1.05);
    const under = tab === 'bass' ? bassChord : noteChord;
    if (under) {
      const v = under === cur && prevVoicing ? prevVoicing : pianoVoicing(under);
      playChordParts(under, v, { dur: 0.4 + p.midis.length * noteStep, vel: 0.35 });
    }
    if (tab === 'bass') {
      const id = bassInst === 'off' ? 'bass' : bassInst;
      p.midis.forEach((m, i) => synth.playNotes([fitMidi(m, id)], {
        at: 0.05 + i * noteStep, dur: noteStep * 0.9, vel: 0.92, instrument: id,
      }));
      return;
    }
    p.midis.forEach((m, i) => synth.playNotes([fitMidi(m)], {
      at: 0.05 + i * noteStep, dur: noteStep * 0.9, vel: 0.92, instrument: melodyInst,
    }));
  };
  const addNotePath = (p: NotePath) => {
    snapshot();
    playNotePath(p);
    if (tab === 'bass') {
      ensureBassOn();
      const id = bassInst === 'off' ? 'bass' : bassInst;
      setSlots((prev) => {
        let s = prev;
        for (const m of p.midis) s = insertBassNote(s, fitMidi(m, id), undefined, bassBeats, bassMeter.subdiv).slots;
        return s;
      });
    } else {
      setSlots((prev) => {
        let s = prev;
        for (const m of p.midis) s = insertNote(s, m, undefined, melBeats, melMeter.subdiv).slots;
        return s;
      });
    }
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
    const bytes = toMidiTimeline(slots, bpm, timeSig, partMeters);
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
    const step = beatSec * 1.9;
    playChordSequence(j.map((x) => x.chord), step, step * 0.94);
  };
  const playJourney = () => {
    if (!journey) return;
    synth.unlock();
    const step = beatSec * 1.9;
    playChordSequence(journey.map((x) => x.chord), step, step * 0.94);
  };
  const useJourney = () => {
    if (!journey) return;
    snapshot();
    setSlots(journey.map((x) => ({ chord: x.chord, notes: [], bass: [], locked: false })));
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
    const nextSlots = l.chords.map((chord) => ({ chord, notes: [] as TimelineSlot['notes'], bass: [] as TimelineSlot['notes'], locked: false }));
    if (l.timeSig) {
      setTimeSig(l.timeSig);
      try { localStorage.setItem('muse.timeSig', timeSigLabel(l.timeSig)); } catch { /* private mode */ }
      setPartMeters(defaultPartMeters(l.timeSig));
      setSlots(clampSlotsToMeter(nextSlots, beatsPerBar(l.timeSig)));
    } else setSlots(nextSlots);
    setMeterNote(l.meterNote ?? null);
    setTab('chords');
    setSelectedId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    synth.unlock();
    playChordSequence(l.chords);
    const meterBit = l.timeSig ? ` · ${timeSigLabel(l.timeSig)}` : l.meterNote ? ` · ${l.meterNote}` : '';
    flash(`Loaded "${t.label}" (${artist.name} style)${meterBit} — undo to go back`);
  };
  const previewTryIt = (t: ArtistTryIt) => {
    const l = loadTryIt(t);
    if (!l) return;
    synth.unlock();
    playChordSequence(l.chords);
  };

  // ---- Listen (mic YIN/chroma) or MIDI keyboard (Web MIDI → same note/chord callbacks) ----
  // callbacks run outside React's render cycle, so they read the latest state through refs
  const live = useRef({ tab, k, slots, timeSig, bassInst, partMeters });
  live.current = { tab, k, slots, timeSig, bassInst, partMeters };
  const snapshotLive = () => setHistory((h) => [...h.slice(-49), { slots: live.current.slots }]);
  const heardChord = (root: number, quality: string): Chord => ({ root: spellInKey(live.current.k, root), quality: quality as Chord['quality'] });
  const stopInput = () => { listen?.stop(); setListen(null); setListenStatus(null); };
  const chooseInputSource = (src: InputSource) => {
    if (src === inputSource) return;
    stopInput();
    setInputSource(src);
  };
  const toggleListen = async () => {
    synth.unlock();
    if (listen) { stopInput(); return; }
    const onNote = (m: number) => {
      snapshotLive();
      const pm = live.current.partMeters;
      if (live.current.tab === 'bass') {
        ensureBassOn();
        const part = live.current.bassInst === 'off' ? 'bass' : live.current.bassInst;
        setSlots((x) => insertBassNote(x, fitMidi(m, part), undefined, beatsPerBar(pm.bass.timeSig), pm.bass.subdiv).slots);
      } else {
        setSlots((x) => insertNote(x, m, undefined, beatsPerBar(pm.melody.timeSig), pm.melody.subdiv).slots);
      }
      setSelectedId(null);
      setLastHeard(midiName(m, spellInKey(live.current.k, m)));
    };
    const onChord = (cm: { root: number; quality: string }) => {
      const c = heardChord(cm.root, cm.quality);
      snapshotLive();
      setSlots((x) => setSlotChord(x, chordTargetIndex(x), c));
      setSelectedId(null);
      setLastHeard(chordSymbol(c, true));
    };
    const shared = {
      target: () => (live.current.tab === 'melody' || live.current.tab === 'bass'
        ? live.current.tab
        : 'chords' as const),
      onNote,
      onChord,
      onStatus: setListenStatus,
      noteName: (m: number) => midiName(m, spellInKey(live.current.k, m)),
      chordName: (cm: { root: number; quality: string }) => chordSymbol(heardChord(cm.root, cm.quality), true),
    };
    try {
      const session = inputSource === 'midi'
        ? await startMidiInput(shared)
        : await startListening({ ...shared, isPaused: () => synth.isPlaying() });
      setListen(session);
      setLastHeard(null);
      if (inputSource === 'midi') {
        flash(tab === 'chords'
          ? 'MIDI — hold a chord ~¼ s to add'
          : tab === 'bass'
            ? 'MIDI — press keys to fill the bass lane'
            : 'MIDI — press keys to fill the melody lane');
      } else {
        flash(tab === 'chords'
          ? 'Listening for chords — hold each one ~½ s'
          : tab === 'bass'
            ? 'Listening for low notes — fills the bass lane'
            : 'Listening for notes — fills the melody lane');
      }
    } catch (e) {
      flash(inputSource === 'midi' ? midiErrorMessage(e) : listenErrorMessage(e));
    }
  };

  // Ranked suggestions: engine order is score-desc — show that flat list (mood stays as tags).
  const ranked = useMemo(
    () => (tab === 'chords' ? chordSugs : noteSugs),
    [tab, chordSugs, noteSugs],
  );

  const selColor = lex.color(tab === 'chords' ? selChord?.primaryMood ?? 'floating' : selNote?.primaryMood ?? 'floating');
  const shapes = useMemo(() => (selChord ? guitarVoicings(selChord.chord) : []), [selChord]);
  const shape = shapes[Math.min(shapeIdx, shapes.length - 1)];
  const chips = profile ? describeProfile(profile, lex) : [];
  const kbBadge = data.kb.meta.isSeed ? 'seed' : '';

  /** Ranked suggestion cards — shown just under the Circle of Fifths. */
  const bestFitBlock = () => (
    <div className="group best-fit-under-cof">
      <div className="ghead">Best fit first</div>
      {ranked.map((s, i) => {
        const isChord = 'chord' in s;
        const selected = (isChord ? selChord?.id : selNote?.id) === s.id;
        const color = lex.color(s.primaryMood);
        const rar = RARITY_MARK[s.rarity];
        const cs = isChord ? s as ChordSuggestion : null;
        const ns = !isChord ? s as NoteSuggestion : null;
        const root = cs && cur ? rootMotion(cur, cs.chord) : null;
        const midis = cs ? cs.voicing : ns ? [ns.midi] : [];
        // Previous chord tones (voice-led) — same “now” colour as the Piano tab.
        const prior = cs && cur && prevVoicing?.length ? prevVoicing : [];
        return (
          <div key={s.id} className={'card' + (selected ? ' sel' : '')} style={{ borderLeftColor: color }}
            onClick={() => { setSelectedId(s.id); if (isChord) playMove(s as ChordSuggestion); else playNoteMove(s as NoteSuggestion); }}>
            <div className="card-main">
              <div className="card-top">
                <span className="card-rank" title="Best-fit rank (1 = strongest suggestion)">#{i + 1}</span>
                {root && <span className={'root-arrow ' + (root.dir === '↑' ? 'root-up' : root.dir === '↓' ? 'root-down' : 'root-same')} aria-label={root.label} title={root.label}>{root.dir}</span>}
                <span className="sym">{isChord ? (s as ChordSuggestion).symbol : (s as NoteSuggestion).name.replace('#', '♯')}</span>
                <span className="rn" title={isChord ? 'Roman numeral in this key' : 'Scale degree from home'}>{isChord ? (s as ChordSuggestion).roman : `deg ${(s as NoteSuggestion).degree}`}</span>
                {root && <span className={'root-badge ' + (root.dir === '↑' ? 'root-up' : root.dir === '↓' ? 'root-down' : 'root-same')} title="Bass/root vs the chord you’re on">{root.label}</span>}
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
              {midis.length > 0 && (
                <div className="card-piano" aria-label={cs ? `Piano notes for ${cs.symbol}` : `Piano note ${(ns as NoteSuggestion).name}`}>
                  <PianoViz
                    variant="card"
                    current={prior}
                    suggested={midis}
                    fingers={[]}
                    color={color}
                    spell={spell}
                    height={44}
                    label={cs ? cs.symbol : (ns as NoteSuggestion).name}
                  />
                </div>
              )}
            </div>
            <div className="card-actions">
              <button aria-label="Play" onClick={(e) => { e.stopPropagation(); setSelectedId(s.id); if (isChord) playMove(s as ChordSuggestion); else playNoteMove(s as NoteSuggestion); }}>▶</button>
              <button aria-label="Add" className="add" onClick={(e) => { e.stopPropagation(); if (isChord) addChord((s as ChordSuggestion).chord); else if (tab === 'bass') addBass((s as NoteSuggestion).midi); else addNote((s as NoteSuggestion).midi); }}>＋</button>
            </div>
          </div>
        );
      })}
    </div>
  );

  const visuals = (all: boolean) => {
    if (tab === 'melody' || tab === 'bass') {
      const underChord = tab === 'bass' ? bassChord : noteChord;
      const line = tab === 'bass' ? bassLine : melody;
      const partId = tab === 'bass' ? (bassInst === 'off' ? 'bass' : bassInst) : melodyInst;
      const underV = underChord === cur ? prevVoicing : underChord ? pianoVoicing(underChord) : [];
      const addLinePc = (p: number) => {
        // Pick the octave nearest the last line note, then fold into the instrument range
        // so bass (and other narrow instruments) get a real sample instead of extreme pitch-shift.
        const fallback = tab === 'bass' ? 40 : 60;
        const anchor = fitMidi(line.length ? line[line.length - 1]! : fallback, partId);
        let best = fitMidi(p + (tab === 'bass' ? 36 : 60), partId);
        for (let oct = 1; oct <= 6; oct++) {
          const m = fitMidi(p + 12 * (oct + 1), partId);
          if (Math.abs(m - anchor) < Math.abs(best - anchor)) best = m;
        }
        if (tab === 'bass') {
          addBass(best);
          flash(`Added bass ${spellMidi(best)} · ${INSTRUMENTS[partId].label}`);
        } else {
          addNote(best);
          flash(`Added ${spellMidi(best)} · ${INSTRUMENTS[melodyInst].label}`);
        }
      };
      return (
        <div className="vis-body">
          <PianoViz
            scalePcs={scale}
            tonicPc={pc(k.tonic)}
            current={underChord ? underV : []}
            suggested={selNote ? [fitMidi(selNote.midi, partId)] : []}
            fingers={[]}
            melody={line.slice(-8)}
            color={selColor}
            spell={spell}
            minLow={tab === 'bass' ? 28 : 55}
            minHigh={tab === 'bass' ? 55 : 84}
            label={`${tab === 'bass' ? 'Bass' : 'Melody'} · plays on ${INSTRUMENTS[partId].label}`}
            labelKeys="all"
          />
          <div className="legend">
            {underChord && <span><i style={{ background: CURRENT_COLOR }} />under: {chordSymbol(underChord, true)}</span>}
            {selNote && <span><i style={{ background: selColor }} />next: {spellMidi(fitMidi(selNote.midi, partId))}</span>}
            {selNote?.relation && <span><i style={{ background: REL_COLORS[selNote.relation.kind] }} />{selNote.relation.label} · {REL_LABEL[selNote.relation.kind]}</span>}
            <ScaleLegend keyLabel={keyName(k)} tonic={noteName(k.tonic, true)} />
          </div>
          <Contour melody={line.slice(-10)} next={selNote ? fitMidi(selNote.midi, partId) : undefined} color={selColor} spell={spellMidi} />
          <CircleOfFifths
            tonicPc={pc(k.tonic)} scalePcs={scale}
            currentPc={line.length ? line[line.length - 1]! % 12 : undefined}
            others={noteSugs.map((s) => ({ pc: s.midi % 12, color: lex.color(s.primaryMood), id: s.id, label: s.name.replace('#', '♯') }))}
            selected={selNote ? { pc: selNote.midi % 12, color: selColor, label: selNote.name.replace('#', '♯') } : undefined}
            spellPc={spell}
            onPick={(id) => { const s = noteSugs.find((x) => x.id === id); if (s) { setSelectedId(id); playNoteMove(s); } }}
            onAddPc={addLinePc}
          />
          <p className="small muted center">
            Big letters = notes you can add (brighter = stronger next pick) · rim chips = next-note picks (stack outward by root — rank + quality on each pill; brighter / lower number = better; tap to hear) ·
            +1/−1 = steps from where you are (right = brighter, left = opens) · plays on <b>{INSTRUMENTS[partId].label}</b>
          </p>
          <div className="cof-instr row gap" role="group" aria-label={`${tab === 'bass' ? 'Bass' : 'Melody'} instrument for circle taps`}>
            {tab === 'bass' ? (
              <>
                <button type="button" className={'pill' + (bassInst === 'off' ? ' on' : '')} onClick={() => chooseBassInst('off')}>Off</button>
                {INSTRUMENT_IDS.map((id) => (
                  <button key={id} type="button" className={'pill' + (bassInst === id ? ' on' : '')} onClick={() => chooseBassInst(id)}>
                    {instrChip(id)}
                  </button>
                ))}
              </>
            ) : INSTRUMENT_IDS.map((id) => (
              <button key={id} type="button" className={'pill' + (melodyInst === id ? ' on' : '')} onClick={() => chooseMelodyInst(id)}>
                {instrChip(id)}
              </button>
            ))}
          </div>
          {bestFitBlock()}
        </div>
      );
    }
    const addCircleChord = (p: number) => {
      const dia = diatonicChords(k).find((c) => pc(c.root) === p);
      const built = dia ?? parseChord(noteName(spellInKey(k, p)));
      if (built) { addChord(built); flash(`Added ${chordSymbol(built, true)} · ${INSTRUMENTS[chordInst].label}`); }
    };
    const cofBlock = (opts?: { title?: boolean }) => (
      <div className="cof-block">
        {opts?.title && <h4>Circle of fifths</h4>}
        <CircleOfFifths
          tonicPc={pc(k.tonic)} scalePcs={scale} currentPc={cur ? pc(cur.root) : undefined}
          others={chordSugs.map((s) => ({ pc: pc(s.chord.root), color: lex.color(s.primaryMood), id: s.id, label: s.symbol }))}
          selected={selChord ? { pc: pc(selChord.chord.root), color: selColor, label: selChord.symbol } : undefined}
          spellPc={spell}
          onPick={(id) => { const s = chordSugs.find((x) => x.id === id); if (s) { setSelectedId(id); playMove(s); } }}
          onAddPc={addCircleChord}
        />
        <p className="small muted center">
          Big letters = chords you can add (brighter = stronger next pick) · rim chips = next-chord picks (variants of the same root stack outward — rank + quality on each pill; brighter / lower number = better; tap to hear) ·
          +1/−1 = one step around the circle (right = brighter / pulls home, left = opens / relaxes) ·
          plays on <b>{INSTRUMENTS[chordInst].label}</b>
          {bassInst !== 'off' ? <> + bass <b>{INSTRUMENTS[bassInst].label}</b></> : null}
        </p>
        <div className="cof-instr row gap" role="group" aria-label="Chord instrument for circle taps">
          {INSTRUMENT_IDS.map((id) => (
            <button key={id} type="button" className={'pill' + (chordInst === id ? ' on' : '')} onClick={() => chooseChordInst(id)}>
              {instrChip(id)}
            </button>
          ))}
        </div>
        {bestFitBlock()}
      </div>
    );
    if (!selChord) {
      return (
        <div className="vis-body">
          <p className="muted">Pick a suggestion below, or tap a letter on the circle to add that chord. Colored dots on the rim are Muse’s recommended next moves.</p>
          {cofBlock()}
        </div>
      );
    }
    const fingers = pianoFingering(selChord.voicing, 'R');
    const piano = (
      <div className="vis-section" key="piano">
        {all && <h4>Piano · right hand</h4>}
        <PianoViz scalePcs={scale} tonicPc={pc(k.tonic)} current={cur ? prevVoicing : []} suggested={selChord.voicing} fingers={fingers} melody={melody.slice(-6)} color={selColor} spell={spell} minLow={53} minHigh={79} label={`Piano: ${selChord.symbol}`} />
        <div className="legend">
          {cur && <span><i style={{ background: CURRENT_COLOR }} />now: {chordSymbol(cur, true)}</span>}
          <span><i style={{ background: selColor }} />next: {selChord.symbol}</span>
          <span><i className="ring" />shared note</span>
          <ScaleLegend keyLabel={keyName(k)} tonic={noteName(k.tonic, true)} />
        </div>
        {!all && cofBlock()}
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
            <div className="mono small" title="Frets low→high string (× = mute, 0 = open)">{shape?.frets.map((f) => (f === null ? '×' : f)).join(' ')}</div>
            {shape && <div className="small muted">frets · × mute · 0 open</div>}
            {shapes.length > 1 && (
              <div className="row gap">
                <button className="ghost" onClick={() => setShapeIdx((i) => (i - 1 + shapes.length) % shapes.length)}>‹</button>
                <span className="small">{shapeIdx + 1}/{shapes.length}</span>
                <button className="ghost" onClick={() => setShapeIdx((i) => (i + 1) % shapes.length)}>›</button>
              </div>
            )}
          </div>
        </div>
        {!all && cofBlock()}
      </div>
    );
    const voices = (
      <div className="vis-section" key="voices">
        {all && <h4>How notes move</h4>}
        <VoiceLeadingViz lines={selChord.voiceLines} fromLabel={cur ? chordSymbol(cur, true) : ''} toLabel={selChord.symbol} spell={spellMidi} color={selColor} />
        {selChord.voiceLines.length > 0 && <VoiceLegend />}
        {cur && <p className="small muted">{selChord.commonTones} shared note{selChord.commonTones === 1 ? '' : 's'} · fingers move {selChord.voiceLines.reduce((a, l) => a + Math.abs(l.delta), 0)} half-step{selChord.voiceLines.reduce((a, l) => a + Math.abs(l.delta), 0) === 1 ? '' : 's'} total</p>}
        {!all && cofBlock({ title: true })}
      </div>
    );
    const circle = (
      <div className="vis-section" key="circle">
        {all && <h4>Circle of fifths</h4>}
        {cofBlock()}
      </div>
    );
    const tonnetz = (
      <div className="vis-section" key="tonnetz">
        {all && <h4>Chord neighborhood map</h4>}
        <TonnetzViz tonicPc={pc(k.tonic)} current={cur} suggested={selChord.chord} color={selColor} nrt={selChord.nrt} spellPc={spell} />
        <p className="small muted">Across = fifths (circle neighbors). Diagonal = thirds. P = flip major↔minor; L/R = slide one note by a half/whole step.</p>
        {!all && cofBlock({ title: true })}
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
        {!all && cofBlock({ title: true })}
      </div>
    );
    const map = { piano, guitar, voices, circle, tonnetz, map: moodmap };
    return all ? <div className="vis-body">{Object.values(map)}</div> : <div className="vis-body">{map[visTab]}</div>;
  };

  return (
    <div className="app" onPointerDown={() => synth.unlock()}>
      <header className="top">
        <div className="top-left">
          <button
            type="button"
            className="menu-btn"
            aria-label="Open menu"
            aria-expanded={drawer != null}
            onClick={() => setDrawer((d) => (d ? null : 'menu'))}
          >
            <MenuIcon />
          </button>
          <div className="brand" aria-label="Muse">
            <BrandMark />
            <span className="brand-name">Muse</span>
            {kbBadge && <small>{kbBadge}</small>}
          </div>
        </div>
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
        <span className="muted"> · </span>
        <label className="meter-pick">
          <span className="muted">BPM</span>
          <select
            aria-label="Tempo"
            value={bpm}
            onChange={(e) => chooseBpm(Number(e.target.value))}
          >
            {!(BPM_PRESETS as readonly number[]).includes(bpm) && (
              <option value={bpm}>{bpm}</option>
            )}
            {BPM_PRESETS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </label>
        {detected && auto && <span className="muted"> · detected ({Math.round(detected.confidence * 100)}%)</span>}
        {data.kb.meta.isSeed && <span className="warn"> · using seed theory data</span>}
      </div>
      {meterNote && meterNote !== timeSigLabel(timeSig) && (
        <p className="meter-note small muted" title="From Artist Lens try-it">Meter note: {meterNote}</p>
      )}

      {/* Unified timeline: melody lane above, chords below (hidden on Guide) */}
      <section className="strip" aria-label="Timeline">
        {slots.length === 0 ? (
          <p className="muted small">Tap chords below to start, or switch to Melody / Bass — all share this timeline. New here? Open the <button type="button" className="linkish" onClick={() => setDrawer('guide')}>Guide</button>.</p>
        ) : (
          <>
          <div className="strip-tools">
            <div className="card-viz-toggle" role="group" aria-label="Timeline chord display">
              <button
                type="button"
                className={'pill' + (noteViz === 'piano' ? ' on' : '')}
                aria-pressed={noteViz === 'piano'}
                title="Show piano keys on timeline chords"
                onClick={() => chooseNoteViz('piano')}
              >
                Keys
              </button>
              <button
                type="button"
                className={'pill' + (noteViz === 'staff' ? ' on' : '')}
                aria-pressed={noteViz === 'staff'}
                title="Show staff notation on timeline chords"
                onClick={() => chooseNoteViz('staff')}
              >
                Staff
              </button>
            </div>
            {chords.length > 1 && (
              <div className="card-note-legend small muted" aria-hidden="true">
                <span><i style={{ background: CURRENT_COLOR }} />prev</span>
                <span><i style={{ background: '#c4b0ff' }} />this bar</span>
                <span><i className="ring" />shared</span>
              </div>
            )}
          </div>
          <div
            className={'timeline' + (slots.some((s) => s.notes.length || slotBass(s).length) ? '' : ' chords-only')}
            role="list"
            ref={timelineRef}
          >
            {slots.map((s, i) => {
              const labeled = labelSlot(s, data.kb, melBeats);
              const bassLabeled = labelBassSlot(s, data.kb, bassBeats);
              const chordedIdx = s.chord ? chordedSlotIndices.indexOf(i) : -1;
              // Only an explicit pick shows selection chrome (no default-to-last outline).
              const tensionOn = chordedIdx >= 0 && tensionPick === chordedIdx;
              const playOn = playActive?.chordIndex === i;
              const bassPlayId = bassInst === 'off' ? 'bass' : bassInst;
              const showLanes = labeled.length > 0 || bassLabeled.length > 0
                || slots.some((x) => x.notes.length || slotBass(x).length);
              const barMidis = s.chord
                ? (chordedIdx >= 0 ? (timelineVoicings[chordedIdx] ?? pianoVoicing(s.chord)) : pianoVoicing(s.chord))
                : [];
              const priorMidis = chordedIdx > 0 ? (timelineVoicings[chordedIdx - 1] ?? []) : [];
              const barColor = s.locked ? '#ffd54f' : '#c4b0ff';
              return (
                <div
                  key={i}
                  ref={(el) => { if (el) barRefs.current.set(i, el); else barRefs.current.delete(i); }}
                  className={'tbar' + (s.locked ? ' locked' : '') + (!s.chord ? ' nc' : '') + (tensionOn || playOn ? ' on' : '') + (playOn ? ' playing' : '')}
                  role="listitem"
                >
                  {showLanes && (
                  <div className="tmel" aria-label={`Bar ${i + 1} melody`}>
                    {labeled.length === 0 && <span className="muted small">·</span>}
                    {labeled.map((n, j) => {
                      if (!isSounding(n)) {
                        return (
                          <div key={j} className="tnote rest" title={`Rest @ beat ${n.beat + 1}`}>
                            <span className="tnote-rest">rest</span>
                            <button type="button" className="tx" aria-label="Remove rest" onClick={() => dropNote(i, j)}><CloseIcon /></button>
                          </div>
                        );
                      }
                      const kind = n.relation?.kind;
                      const tip = n.relation ? `${REL_LABEL[n.relation.kind]} · ${n.relation.label} — ${n.relation.why}` : 'no chord yet';
                      const noteOn = !!playActive?.melodies.some((a) => a.index === i && a.beat === n.beat && a.midi === n.midi);
                      return (
                        <div
                          key={j}
                          className={'tnote' + (kind ? ` ${kind}` : '') + (noteOn ? ' playing' : '')}
                          style={kind ? { borderColor: REL_COLORS[kind], color: REL_COLORS[kind] } : undefined}
                          title={tip}
                        >
                          <button type="button" className="tnote-play" onClick={() => { synth.unlock(); synth.playNotes([fitMidi(n.midi)], { dur: 0.45, instrument: melodyInst }); }}>
                            <span>{spellMidi(n.midi)}</span>
                            {n.relation && <small>{n.relation.label}</small>}
                          </button>
                          <button type="button" className="tx" aria-label="Remove note" onClick={() => dropNote(i, j)}><CloseIcon /></button>
                        </div>
                      );
                    })}
                  </div>
                  )}
                  <div
                    className={'tchord' + (s.locked ? ' locked' : '') + (tensionOn ? ' sel' : '')}
                    onClick={() => {
                      if (s.chord) {
                        playChord(s.chord);
                        if (chordedIdx >= 0) setTensionPick(chordedIdx);
                      }
                    }}
                  >
                    {s.chord && noteViz === 'piano' && (
                      <div className="tchord-piano" aria-label={`Piano for ${chordSymbol(s.chord, true)}`}>
                        <PianoViz
                          variant="card"
                          current={priorMidis}
                          suggested={barMidis}
                          fingers={[]}
                          color={barColor}
                          spell={spell}
                          height={40}
                          label={chordSymbol(s.chord, true)}
                        />
                      </div>
                    )}
                    {s.chord && noteViz === 'staff' && (
                      <div className="tchord-staff" aria-hidden={false} aria-label={`Staff for ${chordSymbol(s.chord, true)}`}>
                        <StaffChordViz
                          midis={barMidis}
                          priorMidis={priorMidis}
                          color={barColor}
                          spell={spell}
                          scalePcs={scale}
                          tonicPc={pc(k.tonic)}
                          label={chordSymbol(s.chord, true)}
                        />
                      </div>
                    )}
                    <div className="tchord-body">
                      <div className="sym" title={s.chord ? undefined : 'No chord yet — melody only'}>{s.chord ? chordSymbol(s.chord, true) : 'no chord'}</div>
                      <div className="rn">{s.chord ? romanOf(s.chord, k) : 'melody only'}</div>
                    </div>
                    <div className="chip-actions" role="group" aria-label="Bar actions">
                      {s.chord && (
                        <button
                          type="button"
                          className={'ticon' + (s.locked ? ' on lock' : ' lock')}
                          aria-label={s.locked ? 'Unlock chord' : 'Lock chord'}
                          aria-pressed={s.locked ? 'true' : 'false'}
                          title={s.locked ? 'Unlock — Clear can remove this bar' : 'Lock — keep this bar when you Clear'}
                          onClick={(e) => { e.stopPropagation(); toggleLock(i); }}
                        >
                          <LockIcon locked={!!s.locked} />
                        </button>
                      )}
                      {s.chord && s.notes.length > 0 && !s.locked && (
                        <button
                          type="button"
                          className="ticon"
                          aria-label="Reharmonize bar"
                          title="Clear chord and find a better fit for this melody"
                          onClick={(e) => { e.stopPropagation(); reharmBar(i); }}
                        >
                          <ReharmIcon />
                        </button>
                      )}
                      <button
                        type="button"
                        className="ticon danger"
                        aria-label="Remove bar"
                        title={s.locked ? 'Unlock before removing' : 'Remove bar'}
                        onClick={(e) => { e.stopPropagation(); removeAt(i); }}
                      >
                        <CloseIcon />
                      </button>
                    </div>
                  </div>
                  {showLanes && (
                  <div className="tbass" aria-label={`Bar ${i + 1} bass`}>
                    {bassLabeled.length === 0 && <span className="muted small">·</span>}
                    {bassLabeled.map((n, j) => {
                      if (!isSounding(n)) {
                        return (
                          <div key={j} className="tnote bass rest" title={`Bass rest @ beat ${n.beat + 1}`}>
                            <span className="tnote-rest">rest</span>
                            <button type="button" className="tx" aria-label="Remove rest" onClick={() => dropBass(i, j)}><CloseIcon /></button>
                          </div>
                        );
                      }
                      const kind = n.relation?.kind;
                      const tip = n.relation ? `Bass · ${REL_LABEL[n.relation.kind]} · ${n.relation.label}` : 'bass note';
                      const noteOn = !!playActive?.basses.some((a) => a.index === i && a.beat === n.beat && a.midi === n.midi);
                      return (
                        <div
                          key={j}
                          className={'tnote bass' + (kind ? ` ${kind}` : '') + (noteOn ? ' playing' : '')}
                          style={kind ? { borderColor: REL_COLORS[kind], color: REL_COLORS[kind] } : undefined}
                          title={tip}
                        >
                          <button
                            type="button"
                            className="tnote-play"
                            onClick={() => {
                              synth.unlock();
                              synth.playNotes([fitMidi(n.midi, bassPlayId)], { dur: 0.5, instrument: bassPlayId });
                            }}
                          >
                            <span>{spellMidi(n.midi)}</span>
                            {n.relation && <small>{n.relation.label}</small>}
                          </button>
                          <button type="button" className="tx" aria-label="Remove bass note" onClick={() => dropBass(i, j)}><CloseIcon /></button>
                        </div>
                      );
                    })}
                  </div>
                  )}
                </div>
              );
            })}
          </div>
          </>
        )}
        <div className="rel-legend small muted" aria-hidden={!slots.some((s) => (s.notes.length || slotBass(s).length) && s.chord)}>
          {(['chord', 'tension', 'avoid', 'clash'] as RelKind[]).map((r) => (
            <span key={r}><i style={{ background: REL_COLORS[r] }} />{REL_LABEL[r]}</span>
          ))}
        </div>
        {transport && ribbonBits && (
          <PlaybackRibbon
            events={transport.events}
            playSec={playSec}
            notes={ribbonBits.notes}
            chords={ribbonBits.chords}
          />
        )}
        {pendingHarm && (
          <div className="harm-banner" role="status">
            <div className="harm-banner-text">
              <b>Bar {chordTarget + 1}</b> has melody waiting for a chord
              <span className="muted"> · {pendingHarm.notes.map((n) => (isSounding(n) ? spellMidi(n.midi) : 'rest')).join(' ')}</span>
            </div>
            {tab === 'chords' ? (
              <span className="small muted">Hear plays chord + melody together</span>
            ) : (
              <button type="button" className="add" onClick={startHarmonize}>Find a chord →</button>
            )}
          </div>
        )}
        <ChordConnections
          slots={slots}
          keyInfo={k}
          kb={data.kb}
          beats={beats}
          spell={spellMidi}
          focusIndex={tensionPick !== null ? (chordedSlotIndices[tensionPick] ?? null) : null}
          onFocusBar={(si) => {
            const ci = chordedSlotIndices.indexOf(si);
            if (ci >= 0) setTensionPick(ci);
          }}
          onHearBridge={playBridge}
        />
        <div className="row gap play-row">
          <button onClick={togglePlay} disabled={!slots.length} aria-pressed={!!transport}>
            {transport ? '■ Stop' : '▶ Play'}
          </button>
          <button
            type="button"
            className={'pill' + (loopPlay ? ' on' : '')}
            aria-pressed={loopPlay}
            title={loopPlay ? 'Loop on — Play repeats until you stop' : 'Loop off — Play stops at the end'}
            onClick={() => chooseLoop(!loopPlay)}
          >
            Loop
          </button>
          <label className="meter-pick bpm-inline">
            <span className="muted">BPM</span>
            <select
              aria-label="Playback tempo"
              value={bpm}
              onChange={(e) => chooseBpm(Number(e.target.value))}
            >
              {!(BPM_PRESETS as readonly number[]).includes(bpm) && (
                <option value={bpm}>{bpm}</option>
              )}
              {BPM_PRESETS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </label>
          <button onClick={undo} disabled={!history.length}>↶ Undo</button>
          <button onClick={clearAll} disabled={!slots.length}>Clear</button>
          <button onClick={copyText} disabled={!slots.length}>Copy</button>
          <button onClick={downloadMidi} disabled={!slots.length}>MIDI</button>
        </div>
        <div className="instr-parts" aria-label="Instruments by part">
          <div className="instr-part">
            <span className="instr-part-label">Chords</span>
            <div className="instr" role="radiogroup" aria-label="Chord instrument">
              {INSTRUMENT_IDS.map((id) => (
                <button key={id} role="radio" aria-checked={chordInst === id} className={'pill' + (chordInst === id ? ' on' : '')} onClick={() => chooseChordInst(id)}>
                  {instrChip(id)}
                </button>
              ))}
            </div>
          </div>
          <div className="instr-part">
            <span className="instr-part-label">Melody</span>
            <div className="instr" role="radiogroup" aria-label="Melody instrument">
              {INSTRUMENT_IDS.map((id) => (
                <button key={id} role="radio" aria-checked={melodyInst === id} className={'pill' + (melodyInst === id ? ' on' : '')} onClick={() => chooseMelodyInst(id)}>
                  {instrChip(id)}
                </button>
              ))}
            </div>
          </div>
          <div className="instr-part">
            <span className="instr-part-label">Bass</span>
            <div className="instr" role="radiogroup" aria-label="Bass instrument">
              <button role="radio" aria-checked={bassInst === 'off'} className={'pill' + (bassInst === 'off' ? ' on' : '')} onClick={() => chooseBassInst('off')}>
                Off
              </button>
              {INSTRUMENT_IDS.map((id) => (
                <button key={id} role="radio" aria-checked={bassInst === id} className={'pill' + (bassInst === id ? ' on' : '')} onClick={() => chooseBassInst(id)}>
                  {instrChip(id)}
                </button>
              ))}
            </div>
          </div>
        </div>
        {/* Reserve height only while loading / error / first unlock — selected pills already show the mix */}
        {(partsLoading || partsError || !partsReady) && (
          <div className="instr-status small" aria-live="polite">
            {partsLoading ? <span className="loading">⏳ loading parts {Math.round(loadProgress * 100)}% · synth meanwhile</span>
              : partsError ? <span className="warn">some samples unavailable — using synth</span>
              : <span className="muted">Tap anything to start sound</span>}
          </div>
        )}
      </section>

      {/* Input */}
      <section className="input">
        <div className="input-head">
          <div className="seg part-tabs" role="tablist" aria-label="Part">
            <button type="button" role="tab" aria-selected={tab === 'chords'} className={tab === 'chords' ? 'on' : ''} onClick={() => { setTab('chords'); setSelectedId(null); setInputPane('write'); }}>Chords</button>
            <button type="button" role="tab" aria-selected={tab === 'melody'} className={tab === 'melody' ? 'on' : ''} onClick={() => { setTab('melody'); setSelectedId(null); setInputPane('write'); }}>Melody</button>
            <button type="button" role="tab" aria-selected={tab === 'bass'} className={tab === 'bass' ? 'on' : ''} onClick={() => { setTab('bass'); setSelectedId(null); setInputPane('write'); if (bassInst === 'off') chooseBassInst('bass'); }}>Bass</button>
          </div>
          <div className="seg input-pane" role="group" aria-label={`${tab} pane`}>
            <button type="button" className={inputPane === 'write' ? 'on' : ''} aria-pressed={inputPane === 'write'} onClick={() => setInputPane('write')}>Write</button>
            <button type="button" className={inputPane === 'meter' ? 'on' : ''} aria-pressed={inputPane === 'meter'} onClick={() => setInputPane('meter')}>Meter</button>
          </div>
        </div>
        {inputPane === 'meter' ? (
          <PartMeterPanel
            part={tab}
            meter={partMeters[tab]}
            master={timeSig}
            laneNotes={tab === 'melody'
              ? (slots[activeSlotIndex(slots, melBeats, melMeter.subdiv)]?.notes ?? [])
              : tab === 'bass'
                ? slotBass(slots[activeBassSlotIndex(slots, bassBeats, bassMeter.subdiv)] ?? { chord: null, notes: [], bass: [] })
                : []}
            onChange={(next) => choosePartMeter(tab, next)}
            onAddRest={tab === 'chords' ? undefined : addRest}
            onMatchSession={() => matchPartToSession(tab)}
          />
        ) : (
        <>
        <div className={'listen' + (listen ? ' on' : '')}>
          <div className="seg listen-src" role="group" aria-label="Input source">
            <button type="button" className={inputSource === 'mic' ? 'on' : ''} onClick={() => chooseInputSource('mic')} aria-pressed={inputSource === 'mic'}>Mic</button>
            <button type="button" className={inputSource === 'midi' ? 'on' : ''} onClick={() => chooseInputSource('midi')} aria-pressed={inputSource === 'midi'} title={midiSupported() ? 'USB or Bluetooth MIDI keyboard' : 'Web MIDI not supported in this browser'}>MIDI</button>
          </div>
          <button className={listen ? 'rec' : ''} onClick={() => void toggleListen()} aria-pressed={!!listen}>
            {listen ? '■ Stop' : (inputSource === 'midi' ? '🎹 MIDI' : '👂 Listen')}
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
                <span className="muted">
                  {inputSource === 'midi'
                    ? (tab === 'chords' ? 'hold a chord on your keyboard…' : 'press a key…')
                    : (tab === 'chords' ? 'play a chord…' : tab === 'bass' ? 'play a low note…' : 'sing or play a note…')}
                </span>
              )}
              <span className="level"><i style={{ width: `${Math.min(100, Math.round((listenStatus?.level ?? 0) * (inputSource === 'midi' ? 100 : 600)))}%` }} /></span>
              {lastHeard && <span className="added">added {lastHeard}</span>}
            </div>
          ) : (
            <span className="small muted">
              {inputSource === 'midi'
                ? (tab === 'chords' ? 'add chords from a MIDI keyboard' : tab === 'bass' ? 'add bass notes from a MIDI keyboard' : 'add melody notes from a MIDI keyboard')
                : (tab === 'chords' ? 'hear chords from your instrument' : tab === 'bass' ? 'hear low notes you play' : 'hear notes you sing or play')}
            </span>
          )}
        </div>
        {tab === 'chords' ? (
          <>
            {(() => {
              const dia = diatonicChords(k, false);
              const sev = diatonicChords(k, true);
              const taken = (c: Chord) => isDiatonicTriadClone(c, dia) || isDiatonicTriadClone(c, sev);
              const prevMoods = cur ? engine.chordMoods(cur, k, chords[chords.length - 2]) : [];
              const row = (label: string, chords: Chord[]) => (
                <PaletteRow
                  key={label}
                  label={label}
                  chords={chords}
                  k={k}
                  prev={cur ?? null}
                  prevMoods={prevMoods}
                  lex={lex}
                  engine={engine}
                  onAdd={addChord}
                />
              );
              return (
                <>
                  {row('In this key', dia)}
                  {row('7ths (richer)', sev)}
                  {row('Open colour', openPaletteChords(k).filter((c) => !taken(c)))}
                  {row('Extra colour', colourPaletteChords(k).filter((c) => !taken(c)))}
                  {row('Secondaries', secondaryPaletteChords(k).filter((c) => !taken(c)))}
                </>
              );
            })()}
            <form className="typed" onSubmit={(e) => { e.preventDefault(); submitTyped(); }}>
              <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type a chord: F#m7, Bb/D…" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
              <button type="submit">Add</button>
            </form>
            <FitExplainer mode="chords" keyInfo={k} />
          </>
        ) : tab === 'melody' ? (
          <div className="melody-input">
            <PianoViz scalePcs={scale} tonicPc={pc(k.tonic)} melody={melody.slice(-1)} spell={spell} onKey={addNote} minLow={60} minHigh={83} height={130} label="Tap to add melody notes" labelKeys="all" />
            <div className="write-tools">
              <div className="legend"><ScaleLegend keyLabel={keyName(k)} tonic={noteName(k.tonic, true)} /><span><i className="dot" />your notes</span></div>
              <button type="button" className="pill rest-btn" onClick={addRest} title="Insert a rest on the next pulse">Rest</button>
            </div>
            <FitExplainer mode="melody" keyInfo={k} underChord={noteChord} />
          </div>
        ) : (
          <div className="melody-input bass-input">
            <PianoViz
              scalePcs={scale}
              tonicPc={pc(k.tonic)}
              melody={bassLine.slice(-1)}
              spell={spell}
              onKey={addBass}
              minLow={28}
              minHigh={55}
              height={130}
              label={`Tap to add bass · ${INSTRUMENTS[bassInst === 'off' ? 'bass' : bassInst].label}`}
              labelKeys="all"
            />
            <div className="write-tools">
              <div className="legend">
                <ScaleLegend keyLabel={keyName(k)} tonic={noteName(k.tonic, true)} />
                <span><i className="dot bass" />bass notes</span>
              </div>
              <button type="button" className="pill rest-btn" onClick={addRest} title="Insert a rest on the next pulse">Rest</button>
            </div>
            <FitExplainer mode="bass" keyInfo={k} underChord={bassChord} />
          </div>
        )}
        </>
        )}
      </section>

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
            <div className="vis-title"><b style={{ color: selColor }}>{selNote.name.replace('#', '♯')}</b> <span className="muted" title="Scale degree — steps up from the home note">degree {selNote.degree} from home</span></div>
          ) : <div className="vis-title muted">Visuals</div>}
        </div>
        {tab === 'chords' && (
          <div className="seg small-seg">
            {(['piano', 'guitar', 'voices', 'map', 'circle', 'tonnetz'] as VisTab[]).map((v) => (
              <button
                key={v}
                className={visTab === v ? 'on' : ''}
                onClick={() => setVisTab(v)}
                title={v === 'voices' ? 'How each note moves to the next chord' : v === 'tonnetz' ? 'Map of nearby major/minor chords' : v === 'circle' ? 'Circle of fifths' : v === 'map' ? 'Mood map' : undefined}
              >
                {v === 'voices' ? 'Moves' : v === 'map' ? 'Mood' : v === 'tonnetz' ? 'Map' : v === 'circle' ? 'Circle' : v[0].toUpperCase() + v.slice(1)}
              </button>
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

      {/* Suggestions — ranked cards live under CoF; next-pick board then ready-made paths at the bottom */}
      <section className="suggestions" aria-label="Suggestions">
        <h3>
          {tab === 'chords'
            ? (pendingHarm
              ? `Chord for bar ${chordTarget + 1} melody`
              : cur ? `Next chord after ${chordSymbol(cur, true)}` : 'Start with…')
            : lineNotes.length
              ? `Next ${tab === 'bass' ? 'bass ' : ''}note after ${spellMidi(lineNotes[lineNotes.length - 1])}${lineChord ? ` over ${chordSymbol(lineChord, true)}` : ''}`
              : (tab === 'bass' ? 'First bass note' : 'First melody note')}
        </h3>
        <NextPickBoard
          mode={tab === 'chords' ? 'chords' : 'melody'}
          items={tab === 'chords' ? chordSugs : noteSugs}
          selectedId={tab === 'chords' ? (selChord?.id ?? null) : (selNote?.id ?? null)}
          colorOf={(id) => lex.color(id)}
          labelOf={(id) => lex.label(id)}
          harmonizing={tab === 'chords' && !!pendingHarm}
          fromChord={tab === 'chords' ? cur : undefined}
          fromLabel={tab === 'chords'
            ? (pendingHarm
              ? `bar ${chordTarget + 1} melody`
              : (cur ? chordSymbol(cur, true) : undefined))
            : (lineNotes.length ? spellMidi(lineNotes[lineNotes.length - 1]) : undefined)}
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
              if (!s) return;
              if (tab === 'bass') addBass(s.midi);
              else addNote(s.midi);
            }
          }}
        />
        {((tab === 'chords' && chordPaths.length > 0) || ((tab === 'melody' || tab === 'bass') && notePaths.length > 0)) && (
          <div className="path-block path-block-bottom">
            <div className="row gap" style={{ alignItems: 'center', marginBottom: 4 }}>
              <h4 style={{ margin: 0, flex: 1 }}>
                {tab === 'chords' ? 'Ready-made progressions' : tab === 'bass' ? 'Ready-made bass runs' : 'Ready-made melody runs'}
              </h4>
              <span className="small muted">length</span>
              <button type="button" className={'pill' + (pathLen === 2 ? ' on' : '')} onClick={() => setPathLen(2)} aria-label="2 steps">2</button>
              <button type="button" className={'pill' + (pathLen === 3 ? ' on' : '')} onClick={() => setPathLen(3)} aria-label="3 steps">3</button>
            </div>
            <p className="small muted" style={{ margin: '0 0 6px' }}>
              {tab === 'chords'
                ? 'A short sequence Muse thinks works next. Blue passing notes sit between the chords so the jump feels smooth — ▶ hears the whole thing before you add it.'
                : tab === 'bass'
                  ? 'A short bass figure Muse ranks next. ▶ hears it under the current chord; ＋ adds every note on the bass lane.'
                  : 'A short run of notes Muse ranks as a good next phrase. ▶ hears it over the current chord; ＋ adds every note in order.'}
            </p>
            <div className="path-row">
              {tab === 'chords' ? chordPaths.map((p) => (
                <div key={p.id} className="path-chip">
                  <div>
                    <div className="path-syms">{formatChordPath(p)}</div>
                    <div className="path-mel">{p.linkNames.length ? `passing notes between chords: ${p.linkNames.join(' · ')}` : ''}</div>
                    {p.why && <div className="path-why">{p.why}</div>}
                  </div>
                  <div className="path-actions">
                    <button type="button" aria-label="Hear this progression" onClick={() => playChordPath(p)}>▶</button>
                    <button type="button" className="add" aria-label="Add this progression" onClick={() => addChordPath(p)}>＋</button>
                  </div>
                </div>
              )) : notePaths.map((p) => (
                <div key={p.id} className="path-chip">
                  <div>
                    <div className="path-syms">{formatNotePath(p)}</div>
                    {p.why && <div className="path-why">{p.why}</div>}
                  </div>
                  <div className="path-actions">
                    <button type="button" aria-label={tab === 'bass' ? 'Hear this bass run' : 'Hear this melody run'} onClick={() => playNotePath(p)}>▶</button>
                    <button type="button" className="add" aria-label={tab === 'bass' ? 'Add this bass run' : 'Add this melody run'} onClick={() => addNotePath(p)}>＋</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Tension sits below timeline + best-next suggestions so picks come first */}
      {tState && (
        <TensionCurve
          state={tState}
          labels={chords.map((c) => chordSymbol(c, true))}
          melodyNotes={tensionMelodyNotes}
          style={tStyle}
          onStyle={chooseTStyle}
          selectedIndex={tensionPick}
          onSelect={setTensionPick}
          ghost={tab === 'chords' && selChord?.tension ? { level: selChord.tension.level, debtAfter: selChord.tension.debtAfter, label: selChord.symbol, color: lex.color(selChord.primaryMood) } : null}
        />
      )}

      <div className="center" style={{ marginTop: 14 }}>
        <button className={'pill' + (loreOn ? ' on' : '')} onClick={() => setLoreOn((x) => !x)}>Lore mode {loreOn ? 'on' : 'off'}</button>
      </div>

      <details className="about">
        <summary>About &amp; credits</summary>
        <p>Muse suggests next chords and melody notes labelled by mood. It works offline; nothing leaves your device.
          {' '}<button type="button" className="linkish" onClick={() => setDrawer('guide')}>Open the Guide</button> for how each feature connects to musicality.
          {' '}<button type="button" className="linkish" onClick={() => setDrawer('moods')}>Moods &amp; chords</button> lists every mood tag and the moves that carry it.</p>
        <p><b>Sounds.</b> Piano: <a href="https://github.com/Tonejs/audio/tree/master/salamander" target="_blank" rel="noreferrer">Salamander Grand Piano</a> by Alexander Holm (<a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">CC BY 3.0</a>), via the <a href="https://github.com/Tonejs/audio" target="_blank" rel="noreferrer">Tone.js audio</a> repository.
          Nylon &amp; steel guitar, bass, Rhodes, pad, and Electronic (saw lead): FluidR3_GM (Frank Wen). Metal guitar: MusyngKite clean electric samples through a live amp/cab. MP3 renders from <a href="https://github.com/gleitz/midi-js-soundfonts" target="_blank" rel="noreferrer">gleitz/midi-js-soundfonts</a> (<a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">CC BY 3.0</a>).
          Samples were trimmed, faded and re-encoded (MP3) for size; notes between samples are pitch-shifted.</p>
        <p><b>No sound on iPhone?</b> Flip off Silent mode (the switch on the side), turn the volume up, and tap again — Safari only starts audio after a tap.</p>
        <p><b>Theory &amp; moods.</b> Mood labels come from the bundled research knowledge base and mood lexicon (sources listed inside the data files). Lore mode notes are folklore, not science.</p>
      </details>
      <footer className="foot small muted">
        Works offline · no account · theory: {data.kbFile} v{data.kb.meta.version}{data.featureMapping ? ` · feature map (${data.featureMapping.applied} rules)` : ''} · lexicon {textLex.size} terms{data.moodLexicon ? ' (+ research lexicon)' : ''}
      </footer>

      {drawer && (
        <div
          className="drawer-root"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          onClick={(e) => { if (e.target === e.currentTarget) setDrawer(null); }}
        >
          <aside className={'drawer' + (drawer === 'menu' ? ' menu-only' : '')} onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              {drawer !== 'menu' ? (
                <button type="button" className="ticon" aria-label="Back to menu" onClick={() => setDrawer('menu')}><BackIcon /></button>
              ) : (
                <span className="drawer-title">Menu</span>
              )}
              <button type="button" className="ticon danger" aria-label="Close menu" onClick={() => setDrawer(null)}><CloseIcon /></button>
            </div>
            {drawer === 'menu' && (
              <nav className="drawer-nav" aria-label="More">
                <button type="button" className="drawer-link" onClick={() => setDrawer('moods')}>
                  <b>Moods &amp; chords</b>
                  <span className="muted">Every mood tag and the chord moves that carry it</span>
                </button>
                <button type="button" className="drawer-link" onClick={() => setDrawer('guide')}>
                  <b>Guide</b>
                  <span className="muted">How to use Muse — what to tap and why</span>
                </button>
                {data.artists && (
                  <button type="button" className="drawer-link" onClick={() => setDrawer('artists')}>
                    <b>Artist Lens</b>
                    <span className="muted">Styles, techniques, and Try-it exercises</span>
                  </button>
                )}
                <button
                  type="button"
                  className="drawer-link"
                  onClick={() => { setDrawer(null); setTab('chords'); setSelectedId(null); }}
                >
                  <b>Back to writing</b>
                  <span className="muted">Chords &amp; melody</span>
                </button>
              </nav>
            )}
            {drawer === 'moods' && (
              <div className="drawer-body">
                <MoodChordRef kb={data.kb} lex={lex} />
              </div>
            )}
            {drawer === 'guide' && (
              <div className="drawer-body">
                <Guide onJump={(t) => {
                  if (t === 'artists') { setDrawer('artists'); return; }
                  if (t === 'moods') { setDrawer('moods'); return; }
                  setDrawer(null);
                  setTab(t);
                  if (t === 'bass' && bassInst === 'off') chooseBassInst('bass');
                  setSelectedId(null);
                  window.scrollTo({ top: 0 });
                }} />
              </div>
            )}
            {drawer === 'artists' && data.artists && (
              <div className="drawer-body">
                <ArtistLens
                  key={focusArtist ?? 'all'}
                  initial={focusArtist}
                  data={data.artists}
                  lex={lex}
                  kbIndex={data.kbIndex}
                  onTryIt={(t, a) => { tryIt(t, a); setDrawer(null); }}
                  onPreview={previewTryIt}
                />
              </div>
            )}
          </aside>
        </div>
      )}

      {detail && selChord && tab === 'chords' && (
        <div className="sheet" role="dialog" aria-label="Suggestion details">
          <div className="sheet-inner">
            <div className="sheet-head">
              <div>
                <div className="big" style={{ color: selColor }}>{cur ? `${chordSymbol(cur, true)} → ` : ''}{selChord.symbol}</div>
                <div className="muted">
                  {selChord.roman} in {keyName(k)}
                  {cur ? (() => { const r = rootMotion(cur, selChord.chord); return <>{' · '}<span className={'root-move ' + (r.dir === '↑' ? 'root-up' : r.dir === '↓' ? 'root-down' : 'root-same')}>{r.label}</span></>; })() : null}
                  {' · '}{RARITY_MARK[selChord.rarity].label}{selChord.nrt ? ` · ${nrtPathLabel(selChord.nrt)}` : ''}
                </div>
              </div>
              <button className="ghost" onClick={() => setDetail(false)}>Close</button>
            </div>
            <div className="tags">
              {selChord.moods.slice(0, 5).map((m) => <span key={m.id} className="tag" style={{ background: lex.color(m.id) }}>{lex.label(m.id).toLowerCase()}</span>)}
              {selChord.moodShift && <span className="shift">{selChord.moodShift.arrow} {selChord.moodShift.text}</span>}
            </div>
            <div className="row gap">
              <button onClick={() => playMove(selChord)}>{pendingHarm ? '▶ Hear with melody' : '▶ Hear'}</button>
              <button className="add" onClick={() => { addChord(selChord.chord); setDetail(false); }}>＋ Add</button>
            </div>
            <Dims s={selChord} />
            {visuals(true)}
            <h4>Why Muse suggests this</h4>
            <ul className="evidence">
              {selChord.evidence.map((e) => (
                <li key={e.id}><b>{e.name}</b> <span className={'cons ' + e.consensus}>{e.consensus}</span><br /><span className="small">{e.description}</span></li>
              ))}
              {!selChord.evidence.length && <li className="muted">No theory note yet; mood guessed from the chord type.</li>}
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
                        <button className="linkish" onClick={() => { setDetail(false); setFocusArtist(u.artistId); setDrawer('artists'); }}>{name(u.artistId)}</button> — {u.name}
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
            nrt ? nrtPathLabel(nrt) : null,
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
    ['dark ↔ bright', f.brightness, -1, 1], ['calm ↔ tense', f.tension, 0, 1], ['unusual', f.chromaticism, 0, 1], ['settled', f.stability, 0, 1], ['energy', f.energy, 0, 1],
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

