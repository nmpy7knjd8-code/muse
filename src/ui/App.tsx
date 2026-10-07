import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Chord, ChordSuggestion, MoodProfile, ModeId, MODES, MoodTextLexicon, NoteSuggestion, SuggestionEngine, LexiconInterpreter,
  analyzeRoman, bassNote, chordSymbol, describeProfile, detectKeys, diatonicChords, guitarVoicings, isEmptyProfile, keyName,
  midiName, noteName, parseChord, parseNote, pc, pianoFingering, pianoVoicing, progressionText, romanOf, scalePcs,
  spellInKey, toMidiFile, tonicChoices, voiceProgression, type Key,
  chordFeatures, moodJourney, findLore, type JourneyStep,
} from '../core';
import { loadData, type LoadedData } from './data';
import { synth } from './audio';
import { CircleOfFifths, GuitarDiagram, MoodMap, PianoViz, TonnetzViz, VoiceLeadingViz, VoiceLegend, CURRENT_COLOR } from './visuals';
import { startHumming, type MicSession } from './mic';

type Tab = 'chords' | 'melody';
type VisTab = 'piano' | 'guitar' | 'voices' | 'circle' | 'tonnetz' | 'map';
interface Slot { chord: Chord; locked: boolean }
interface Snapshot { slots: Slot[]; melody: number[] }

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

  const [tonic, setTonic] = useState('C');
  const [mode, setMode] = useState<ModeId>('major');
  const [auto, setAuto] = useState(true);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [melody, setMelody] = useState<number[]>([]);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [tab, setTab] = useState<Tab>('chords');
  const [visTab, setVisTab] = useState<VisTab>('piano');
  const [sevenths, setSevenths] = useState(false);
  const [adventure, setAdventure] = useState(0.35);
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
  const [mic, setMic] = useState<MicSession | null>(null);
  const [livePitch, setLivePitch] = useState<number | null>(null);
  useEffect(() => () => mic?.stop(), [mic]);

  const chords = slots.map((s) => s.chord);
  const picked: Key = { tonic: parseNote(tonic)!, mode };
  const detected = useMemo(() => (auto && (chords.length >= 2 || melody.length >= 4) ? detectKeys(chords, melody)[0] : null), [auto, slots, melody]); // eslint-disable-line react-hooks/exhaustive-deps
  // auto-detect only chooses between major/minor keys; a modal pick (e.g. Dorian) is kept as-is
  const k: Key = auto && detected && (mode === 'major' || mode === 'minor') ? detected.key : picked;
  const scale = scalePcs(k);
  const cur = chords[chords.length - 1];
  const prevVoicing = useMemo(() => { const v = voiceProgression(chords); return v[v.length - 1]; }, [slots]); // eslint-disable-line react-hooks/exhaustive-deps
  const spell = (m: number) => noteName(spellInKey(k, m), true);
  const spellMidi = (m: number) => midiName(m, spellInKey(k, m)).replace('#', '♯').replace(/b(?=\d)/, '♭');

  const chordSugs: ChordSuggestion[] = useMemo(
    () => (tab === 'chords' ? engine.suggestChords({ key: k, progression: chords, profile, adventure, limit: 18 }) : []),
    [engine, tab, k.tonic.letter, k.tonic.acc, k.mode, slots, profile, adventure], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const noteSugs: NoteSuggestion[] = useMemo(
    () => (tab === 'melody' ? engine.suggestNotes({ key: k, melody, chord: cur ?? null, profile, adventure, limit: 12 }) : []),
    [engine, tab, k.tonic.letter, k.tonic.acc, k.mode, melody, slots, profile, adventure], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const selChord = chordSugs.find((s) => s.id === selectedId) ?? chordSugs[0];
  const selNote = noteSugs.find((s) => s.id === selectedId) ?? noteSugs[0];
  useEffect(() => setShapeIdx(0), [selChord?.id]);

  const flash = (msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1800);
  };
  const snapshot = () => setHistory((h) => [...h.slice(-49), { slots, melody }]);
  const undo = () => {
    synth.unlock();
    const last = history[history.length - 1];
    if (!last) return;
    setSlots(last.slots);
    setMelody(last.melody);
    setHistory((h) => h.slice(0, -1));
  };
  const withBass = (c: Chord, v: number[]) => [bassNote(c), ...v];

  // ---- audio actions (all called from tap handlers) ----
  const playChord = (c: Chord, prev?: number[]) => { synth.unlock(); synth.stopAll(); const v = pianoVoicing(c, prev); synth.playNotes(withBass(c, v)); };
  const playMove = (s: ChordSuggestion) => {
    synth.unlock();
    if (cur && prevVoicing) synth.playSequence([withBass(cur, prevVoicing), withBass(s.chord, s.voicing)], 0.85, 0.8);
    else { synth.stopAll(); synth.playNotes(withBass(s.chord, s.voicing)); }
  };
  const playNoteMove = (n: NoteSuggestion) => {
    synth.unlock();
    const last = melody[melody.length - 1];
    const groups = last !== undefined ? [[last], [n.midi]] : [[n.midi]];
    if (cur) synth.playNotes(withBass(cur, prevVoicing ?? pianoVoicing(cur)), { dur: 1.6, vel: 0.35 });
    groups.forEach((g, i) => synth.playNotes(g, { at: i * 0.5, dur: 0.5, vel: 0.9 }));
  };
  const playAll = () => {
    synth.unlock();
    const v = voiceProgression(chords);
    if (chords.length) synth.playSequence(chords.map((c, i) => withBass(c, v[i])), 0.9, 0.85);
    melody.forEach((m, i) => synth.playNotes([m], { at: i * 0.45, dur: 0.42, vel: 0.9 }));
  };

  // ---- editing ----
  const addChord = (c: Chord) => {
    snapshot();
    playChord(c, prevVoicing);
    setSlots((s) => [...s, { chord: c, locked: false }]);
    setSelectedId(null);
  };
  const removeAt = (i: number) => { if (slots[i].locked) return flash('Unlock the chord first'); snapshot(); setSlots((s) => s.filter((_, j) => j !== i)); };
  const toggleLock = (i: number) => setSlots((s) => s.map((x, j) => (j === i ? { ...x, locked: !x.locked } : x)));
  const clearAll = () => { synth.unlock(); snapshot(); setSlots((s) => s.filter((x) => x.locked)); setMelody([]); setSelectedId(null); };
  const addNote = (m: number) => {
    synth.unlock();
    synth.playNotes([m], { dur: 0.6 });
    snapshot();
    setMelody((x) => [...x, m]);
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
    const txt = progressionText(k, chords, melody);
    try { await navigator.clipboard.writeText(txt); flash('Copied progression'); } catch { flash(txt); }
  };
  const downloadMidi = () => {
    const bytes = toMidiFile(chords, melody);
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
    setSlots(journey.map((x) => ({ chord: x.chord, locked: false })));
    setTab('chords');
    setSelectedId(null);
    flash('Journey loaded — undo to go back');
  };

  // ---- hum it in ----
  const toggleMic = async () => {
    synth.unlock();
    if (mic) { mic.stop(); setMic(null); setLivePitch(null); return; }
    try {
      const session = await startHumming((m) => { setMelody((x) => [...x, m]); setSelectedId(null); }, setLivePitch);
      snapshot();
      setMic(session);
    } catch (e) {
      flash((e as Error).message || 'Microphone unavailable');
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
      return (
        <div className="vis-body">
          <PianoViz scalePcs={scale} current={cur ? prevVoicing : []} suggested={selNote ? [selNote.midi] : []} fingers={[]} melody={melody.slice(-8)} color={selColor} spell={spell} minLow={55} minHigh={84} label="Melody on piano" />
          <Contour melody={melody.slice(-10)} next={selNote?.midi} color={selColor} spell={spellMidi} />
        </div>
      );
    }
    if (!selChord) return <p className="muted">Suggestions appear here.</p>;
    const fingers = pianoFingering(selChord.voicing, 'R');
    const piano = (
      <div className="vis-section" key="piano">
        {all && <h4>Piano · right hand</h4>}
        <PianoViz scalePcs={scale} current={cur ? prevVoicing : []} suggested={selChord.voicing} fingers={fingers} melody={melody.slice(-6)} color={selColor} spell={spell} minLow={53} minHigh={79} label={`Piano: ${selChord.symbol}`} />
        <div className="legend">
          {cur && <span><i style={{ background: CURRENT_COLOR }} />now: {chordSymbol(cur, true)}</span>}
          <span><i style={{ background: selColor }} />next: {selChord.symbol}</span>
          <span><i className="ring" />common tone</span>
          <span><i style={{ background: '#ECE8F7' }} />{keyName(k)} scale</span>
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
        />
        <p className="small muted center">Ring = key of {keyName(k)} (outlined) · dots = every suggestion, coloured by mood · arrow = selected move</p>
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
          <select aria-label="Tonic" value={tonicChoices(mode).includes(tonic) ? tonic : tonicChoices(mode)[pc(parseNote(tonic)!)]} onChange={(e) => { setTonic(e.target.value); setAuto(false); }}>
            {tonicChoices(mode).map((t) => <option key={t} value={t}>{t.replace('#', '♯').replace('b', '♭')}</option>)}
          </select>
          <select aria-label="Mode" value={mode} onChange={(e) => { setMode(e.target.value as ModeId); setAuto(false); }}>
            {MODES.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <button className={'pill' + (auto ? ' on' : '')} onClick={() => setAuto((a) => !a)} title="Detect key from what you enter">Auto</button>
        </div>
      </header>
      <div className="keyline small">
        Key: <b>{keyName(k)}</b>
        {detected && auto && <span className="muted"> · detected ({Math.round(detected.confidence * 100)}%)</span>}
        {data.kb.meta.isSeed && <span className="warn"> · using seed theory data</span>}
      </div>

      {/* Progression strip */}
      <section className="strip" aria-label="Progression">
        <div className="chips">
          {slots.length === 0 && melody.length === 0 && <span className="muted small">Tap chords below to start, or switch to Melody.</span>}
          {slots.map((s, i) => (
            <div key={i} className={'chip' + (s.locked ? ' locked' : '')} onClick={() => playChord(s.chord)}>
              <div className="sym">{chordSymbol(s.chord, true)}</div>
              <div className="rn">{romanOf(s.chord, k)}</div>
              <div className="chip-actions">
                <button aria-label="Lock chord" onClick={(e) => { e.stopPropagation(); toggleLock(i); }}>{s.locked ? '🔒' : '🔓'}</button>
                <button aria-label="Remove chord" onClick={(e) => { e.stopPropagation(); removeAt(i); }}>×</button>
              </div>
            </div>
          ))}
          {melody.length > 0 && <div className="melchips">♪ {melody.slice(-12).map((m) => spellMidi(m)).join(' ')}</div>}
        </div>
        <div className="row gap">
          <button onClick={playAll} disabled={!chords.length && !melody.length}>▶ Play</button>
          <button onClick={undo} disabled={!history.length}>↶ Undo</button>
          <button onClick={clearAll} disabled={!slots.length && !melody.length}>Clear</button>
          <button onClick={copyText} disabled={!chords.length && !melody.length}>Copy</button>
          <button onClick={downloadMidi} disabled={!chords.length && !melody.length}>MIDI</button>
        </div>
      </section>

      {/* Input */}
      <section className="input">
        <div className="seg">
          <button className={tab === 'chords' ? 'on' : ''} onClick={() => { setTab('chords'); setSelectedId(null); }}>Chords</button>
          <button className={tab === 'melody' ? 'on' : ''} onClick={() => { setTab('melody'); setSelectedId(null); }}>Melody</button>
        </div>
        {tab === 'chords' ? (
          <>
            <div className="palette">
              {diatonicChords(k, sevenths).map((c) => (
                <button key={chordSymbol(c)} className="pal" onClick={() => addChord(c)}>
                  <b>{chordSymbol(c, true)}</b>
                  <small>{analyzeRoman(c, k).text}</small>
                </button>
              ))}
            </div>
            <div className="row gap">
              <label className="small toggle"><input type="checkbox" checked={sevenths} onChange={(e) => setSevenths(e.target.checked)} /> 7ths</label>
              <form className="typed" onSubmit={(e) => { e.preventDefault(); submitTyped(); }}>
                <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type a chord: F#m7, Bb/D…" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
                <button type="submit">Add</button>
              </form>
            </div>
          </>
        ) : (
          <div className="melody-input">
            <PianoViz scalePcs={scale} melody={melody.slice(-1)} spell={spell} onKey={addNote} minLow={60} minHigh={83} height={130} label="Tap to add melody notes" />
            <div className="hum">
              <button className={mic ? 'rec' : ''} onClick={() => void toggleMic()}>{mic ? '■ Stop' : '🎤 Hum it in'}</button>
              {mic && <span className="live">{livePitch !== null ? `hearing ${spellMidi(livePitch)}` : 'listening…'}</span>}
            </div>
            <p className="small muted">Tap keys (or hum) to add melody notes; the {keyName(k)} scale is tinted. With Auto on, the key is detected from your notes too.</p>
          </div>
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
              <div className="vis-title"><b style={{ color: selColor }}>{cur ? `${chordSymbol(cur, true)} → ` : ''}{selChord.symbol}</b> <span className="muted">{selChord.roman}</span></div>
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
        <h3>{tab === 'chords' ? (cur ? `Next chord after ${chordSymbol(cur, true)}` : 'Start with…') : melody.length ? `Next note after ${spellMidi(melody[melody.length - 1])}` : 'First melody note'}</h3>
        {groups.map(([mood, items]) => (
          <div key={mood} className="group">
            <div className="ghead"><i style={{ background: lex.color(mood) }} />{lex.label(mood)}</div>
            {items.map((s) => {
              const isChord = 'chord' in s;
              const selected = (isChord ? selChord?.id : selNote?.id) === s.id;
              const color = lex.color(s.primaryMood);
              const rar = RARITY_MARK[s.rarity];
              return (
                <div key={s.id} className={'card' + (selected ? ' sel' : '')} style={{ borderLeftColor: color }}
                  onClick={() => { setSelectedId(s.id); if (isChord) playMove(s as ChordSuggestion); else playNoteMove(s as NoteSuggestion); }}>
                  <div className="card-main">
                    <div className="card-top">
                      <span className="sym">{isChord ? (s as ChordSuggestion).symbol : (s as NoteSuggestion).name.replace('#', '♯')}</span>
                      <span className="rn">{isChord ? (s as ChordSuggestion).roman : (s as NoteSuggestion).degree}</span>
                      <span className={'rar ' + s.rarity} title={rar.label}>{rar.sym} {rar.label}</span>
                    </div>
                    <div className="tags">
                      {s.moods.slice(0, 3).map((m) => <span key={m.id} className="tag" style={{ background: lex.color(m.id) }}>{lex.label(m.id).toLowerCase()}</span>)}
                      {isChord && (s as ChordSuggestion).moodShift && <span className="shift">{(s as ChordSuggestion).moodShift!.arrow} {(s as ChordSuggestion).moodShift!.text}</span>}
                      {profile && <span className="fit" title="fit to your mood">{Math.round((s.match?.total ?? 0) * 100)}% fit</span>}
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
      <footer className="foot small muted">
        Works offline · no account · theory: {data.kbFile} v{data.kb.meta.version}{data.featureMapping ? ` · feature map (${data.featureMapping.applied} rules)` : ''} · lexicon {textLex.size} terms{data.moodLexicon ? ' (+ research lexicon)' : ''}
      </footer>

      {detail && selChord && tab === 'chords' && (
        <div className="sheet" role="dialog" aria-label="Suggestion details">
          <div className="sheet-inner">
            <div className="sheet-head">
              <div>
                <div className="big" style={{ color: selColor }}>{cur ? `${chordSymbol(cur, true)} → ` : ''}{selChord.symbol}</div>
                <div className="muted">{selChord.roman} in {keyName(k)} · {RARITY_MARK[selChord.rarity].label}{selChord.nrt ? ` · ${selChord.nrt.split('').join('→')}` : ''}</div>
              </div>
              <button className="ghost" onClick={() => setDetail(false)}>Close</button>
            </div>
            <div className="tags">
              {selChord.moods.slice(0, 5).map((m) => <span key={m.id} className="tag" style={{ background: lex.color(m.id) }}>{lex.label(m.id).toLowerCase()}</span>)}
              {selChord.moodShift && <span className="shift">{selChord.moodShift.arrow} {selChord.moodShift.text}</span>}
            </div>
            <div className="row gap">
              <button onClick={() => playMove(selChord)}>▶ Play move</button>
              <button onClick={() => { playChord(selChord.chord, prevVoicing); }}>Chord only</button>
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
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
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

