import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadKB } from './helpers';
import {
  SuggestionEngine, key, parseChord, chordSymbol, normalizeKB, MoodTextLexicon, describeProfile, matchProfile,
  profileFromMoods, applyFeatureMapping, DEFAULT_FEATURE_CONFIG, parseLlmProfile, buildMoodPrompt, LlmMoodInterpreter, LexiconInterpreter,
  MOOD_PROFILE_JSON_SCHEMA, toMidiFile, progressionText, parseExternalLexicon,
} from '../src/core';

const real = loadKB('theory_kb.json');
const seed = loadKB('theory_kb.seed.json');
const ch = (s: string) => parseChord(s)!;
const prog = (s: string) => s.split(' ').map(ch);

describe('knowledge base loading', () => {
  it('normalises the research KB', () => {
    expect(real.meta.isSeed).toBe(false);
    expect(real.chordMoves.length).toBeGreaterThan(80);
    expect(real.melodicMoves.length).toBeGreaterThan(40);
    expect(real.moodVocabulary.map((m) => m.id)).toContain('mystical');
    const vi = real.chordMoves.find((m) => m.id === 'maj_I_vi')!;
    expect(vi.from).toEqual({ roman: 'I', root: 0, quality: 'maj' });
    expect(vi.to.root).toBe(9);
    expect(vi.to.quality).toBe('min');
  });
  it('recognises the seed as seed data', () => {
    expect(seed.meta.isSeed).toBe(true);
    expect(seed.chordMoves.length).toBeGreaterThan(10);
  });
  it('tolerates malformed / flat-schema entries', () => {
    const kb = normalizeKB({
      chordMoves: [
        { id: 'flat', romanNumeral: 'I → bVI', moods: ['epic'], consensus: 0.9 },
        { id: 'broken', from: 5 },
        null,
      ],
      moodVocabulary: ['epic'],
    });
    expect(kb.chordMoves).toHaveLength(1);
    expect(kb.chordMoves[0].to.root).toBe(8);
    expect(kb.chordMoves[0].consensus).toBe('high');
  });
});

describe.each([['research KB', real], ['seed KB', seed]])('chord suggestions (%s)', (_n, kb) => {
  const eng = new SuggestionEngine(kb);
  it('after V suggests the tonic first in the safe setting', () => {
    const s = eng.suggestChords({ key: key('C'), progression: prog('C F G'), adventure: 0 });
    expect(s[0].id).toBe('C');
    expect(s[0].moods.map((m) => m.id)).toContain('resolved');
  });
  it('never suggests repeating the current chord', () => {
    const s = eng.suggestChords({ key: key('C'), progression: prog('C Am'), limit: 50 });
    expect(s.some((x) => x.id === 'Am')).toBe(false);
  });
  it('labels suggestions with roman numerals, moods, why and voice-leading', () => {
    const s = eng.suggestChords({ key: key('C'), progression: prog('C') });
    for (const x of s) {
      expect(x.roman.length).toBeGreaterThan(0);
      expect(x.moods.length).toBeGreaterThan(0);
      expect(x.why.length).toBeGreaterThan(5);
      expect(x.voicing.length).toBeGreaterThanOrEqual(3);
      expect(x.voiceLines.length).toBeGreaterThanOrEqual(3);
    }
    const am = s.find((x) => x.id === 'Am')!;
    expect(am.roman).toBe('vi');
    expect(am.commonTones).toBe(2);
    expect(am.nrt).toBe('R');
  });
  it('a mood target re-ranks toward that mood', () => {
    const base = eng.suggestChords({ key: key('C'), progression: prog('C'), limit: 40 });
    const myst = eng.suggestChords({ key: key('C'), progression: prog('C'), targetMoods: ['mystical'], limit: 40 });
    const hasMystical = (x: (typeof base)[number]) => x.moods.slice(0, 3).some((m) => ['mystical', 'dreamy', 'wonder', 'uncanny'].includes(m.id));
    const top = (list: typeof base) => list.slice(0, 5).filter(hasMystical).length;
    expect(top(myst)).toBeGreaterThan(top(base));
    expect(top(myst)).toBeGreaterThanOrEqual(2);
  });
  it('the adventure slider promotes unusual moves', () => {
    const safe = eng.suggestChords({ key: key('C'), progression: prog('C F'), adventure: 0 });
    const wild = eng.suggestChords({ key: key('C'), progression: prog('C F'), adventure: 1 });
    const avg = (l: typeof safe) => l.slice(0, 5).reduce((s, x) => s + x.commonness, 0) / 5;
    expect(avg(wild)).toBeLessThan(avg(safe));
    expect(safe.slice(0, 3).filter((x) => x.diatonic).length).toBeGreaterThanOrEqual(2);
  });
  it('works in minor keys and on an empty progression', () => {
    const s = eng.suggestChords({ key: key('A', 'minor'), progression: prog('Am Dm') });
    expect(s.slice(0, 8).some((x) => x.id === 'E' || x.id === 'E7')).toBe(true);
    const start = eng.suggestChords({ key: key('G'), progression: [] });
    expect(start[0].id).toBe('G');
  });
  it('includes richer sevenths, secondaries and borrowed colour in the pool', () => {
    const s = eng.suggestChords({ key: key('C'), progression: prog('C Am F'), adventure: 0.4, limit: 60 });
    const ids = new Set(s.map((x) => x.id));
    // diatonic / secondary / borrowed complexity beyond plain triads
    expect(['G7', 'Cmaj7', 'Dm7', 'Fmaj7', 'Bb', 'Ab', 'D7', 'E7'].filter((id) => ids.has(id)).length).toBeGreaterThanOrEqual(4);
    expect(s.some((x) => !['maj', 'min', 'dim'].includes(x.chord.quality))).toBe(true);
    const wild = eng.suggestChords({ key: key('C'), progression: prog('C Am F'), adventure: 0.85, limit: 60 });
    const wids = new Set(wild.map((x) => x.id));
    expect(['Db7', 'G7b9', 'G7#9', 'B7'].filter((id) => wids.has(id)).length).toBeGreaterThanOrEqual(2);
  });
  it('demotes a chord that just appeared so loops do not stay on top', () => {
    // C–Am–F–Am would otherwise love F again; variety should prefer a fresher move.
    const looped = eng.suggestChords({ key: key('C'), progression: prog('C Am F Am'), adventure: 0.2, limit: 12 });
    const fresh = eng.suggestChords({ key: key('C'), progression: prog('C Am'), adventure: 0.2, limit: 12 });
    expect(looped[0].id).not.toBe('F');
    expect(looped[0].id).not.toBe('Fmaj7');
    const fLooped = looped.findIndex((x) => x.id === 'F');
    const fFresh = fresh.findIndex((x) => x.id === 'F');
    // F is either lower than on the short path, or pushed off the shortlist entirely.
    if (fFresh >= 0 && fLooped >= 0) expect(fLooped).toBeGreaterThan(fFresh);
    else if (fFresh >= 0) expect(fLooped).toBe(-1);
  });
  it('after a secondary dominant, ranks the resolution target family highly', () => {
    const s = eng.suggestChords({ key: key('C'), progression: prog('C D7'), adventure: 0.3, limit: 12 });
    expect(s[0].id === 'G' || s[0].id === 'G7').toBe(true);
    // V7 on the target should sit near the top once resolution is rewarded
    const g7 = s.find((x) => x.id === 'G7');
    if (g7) expect(s.indexOf(g7)).toBeLessThan(6);
  });
});

describe('melody suggestions', () => {
  const eng = new SuggestionEngine(real);
  it('resolves the leading tone to the tonic', () => {
    const s = eng.suggestNotes({ key: key('C'), melody: [65, 71], chord: ch('G7') });
    const c5 = s.find((n) => n.midi === 72)!;
    expect(c5).toBeDefined();
    expect(c5.evidence.some((e) => e.category === 'resolution')).toBe(true);
    expect(s.slice(0, 4).map((n) => n.midi)).toContain(72);
  });
  it('labels degrees and chord tones', () => {
    const s = eng.suggestNotes({ key: key('C'), melody: [64], chord: ch('C'), limit: 30 });
    const g = s.find((n) => n.midi === 67)!;
    expect(g.degree).toBe('5');
    expect(g.isChordTone).toBe(true);
    expect(g.name).toBe('G4');
  });
  it('Lydian mode surfaces the #4 colour', () => {
    const s = eng.suggestNotes({ key: key('F', 'lydian'), melody: [65, 67], targetMoods: ['mystical'], limit: 6 });
    expect(s.some((n) => n.degree === '♯4')).toBe(true);
  });
  it('orders by chord/melodic fit even when a mood profile would favour clashy aesthetics', () => {
    // “tense” moods often tag chromatic colour; fit must still outrank that on a strong beat over C.
    const s = eng.suggestNotes({
      key: key('C'),
      melody: [60],
      chord: ch('C'),
      beat: 0,
      targetMoods: ['tense', 'dark'],
      limit: 12,
    });
    expect(s.length).toBeGreaterThan(4);
    // Scores are non-increasing (best fit first).
    for (let i = 1; i < s.length; i++) expect(s[i - 1].score).toBeGreaterThanOrEqual(s[i].score);
    const top = s.slice(0, 4);
    expect(top.every((n) => n.relation?.kind !== 'clash')).toBe(true);
    expect(top.some((n) => n.isChordTone)).toBe(true);
    const bestChord = s.find((n) => n.isChordTone)!;
    const clash = s.find((n) => n.relation?.kind === 'clash');
    if (clash) expect(bestChord.score).toBeGreaterThan(clash.score);
  });

  it('names the arrival chord of a 4-chord stretch in the why line', () => {
    const prog = [ch('C'), ch('Am'), ch('F'), ch('G')];
    const s = eng.suggestNotes({
      key: key('C'),
      melody: [60, 64],
      chord: ch('G'),
      progression: prog,
      beat: 0,
      limit: 12,
    });
    expect(s.length).toBeGreaterThan(3);
    // Chord tones of the arrival (G) should mention G and the stretch in why.
    const tone = s.find((n) => n.isChordTone && n.relation?.kind === 'chord');
    expect(tone).toBeDefined();
    expect(tone!.why).toMatch(/G/);
    expect(tone!.why).toMatch(/C–Am–F–G|end of/);
  });

  it('boosts arrival-chord tones over leftovers from the previous chord in a stretch', () => {
    // C–G: A is in C (vi-ish colour / 6th) but not a G triad tone; B is the 3rd of G (new arrival colour).
    const withStretch = eng.suggestNotes({
      key: key('C'),
      melody: [64],
      chord: ch('G'),
      progression: [ch('C'), ch('G')],
      beat: 0,
      limit: 20,
    });
    const alone = eng.suggestNotes({
      key: key('C'),
      melody: [64],
      chord: ch('G'),
      beat: 0,
      limit: 20,
    });
    const bStretch = withStretch.find((n) => n.midi % 12 === 11)!; // B
    const bAlone = alone.find((n) => n.midi % 12 === 11)!;
    expect(bStretch).toBeDefined();
    expect(bAlone).toBeDefined();
    // Relative: arrival 3rd should rank at least as well once stretch context is added.
    const rank = (list: typeof withStretch, pc: number) => list.findIndex((n) => n.midi % 12 === pc);
    expect(rank(withStretch, 11)).toBeLessThanOrEqual(rank(alone, 11) + 1);
    expect(withStretch.slice(0, 5).some((n) => n.isChordTone)).toBe(true);
  });
});

describe('free-text mood lexicon', () => {
  const lex = MoodTextLexicon.build(real);
  const eng = new SuggestionEngine(real);
  it('has a few hundred terms', () => {
    expect(lex.size).toBeGreaterThan(300);
  });
  it('maps single words and imagery', () => {
    const h = lex.interpret('haunting');
    expect(Object.keys(h.moods)).toEqual(expect.arrayContaining(['uncanny', 'mystical']));
    expect(h.dims.brightness!).toBeLessThan(0);
    const f = lex.interpret('like a foggy forest');
    expect(Object.keys(f.moods)).toEqual(expect.arrayContaining(['mystical', 'dreamy']));
    expect(f.unknown).toEqual([]);
  });
  it('blends with "but" and weights the contrasting clause', () => {
    const p = lex.interpret('victorious but bittersweet');
    expect(p.moods.triumphant).toBeGreaterThan(0.3);
    expect(p.moods.bittersweet).toBeGreaterThan(p.moods.triumphant);
    expect(describeProfile(p, eng.lexicon).join(' ')).toMatch(/bittersweet \d+% triumphant \d+%/);
  });
  it('handles intensifiers and negation', () => {
    const vh = lex.interpret('very dark and happy');
    expect(vh.moods.dark).toBeGreaterThan(vh.moods.bright);
    const nd = lex.interpret('not dark');
    expect(nd.moods.dark).toBeUndefined();
    expect(nd.dims.brightness!).toBeGreaterThan(0);
    const nt = lex.interpret('not tense');
    expect(nt.dims.tension!).toBeLessThan(0.3);
  });
  it('handles comparatives and stems, reports unknown words', () => {
    const d = lex.interpret('darker');
    expect(d.moods.dark).toBeGreaterThan(0.5);
    const p = lex.interpret('glorbish and sunny');
    expect(p.unknown).toEqual(['glorbish']);
    expect(p.moods.bright).toBeGreaterThan(0.5);
  });
  it('merges an external lexicon file (mood_lexicon.json-style)', () => {
    const ext = MoodTextLexicon.build(real, { entries: [{ term: 'petrichor', coreMoods: ['nostalgic', 'dreamy'], valence: 0.2, arousal: -0.4, synonyms: ['after the rain'] }] });
    const p = ext.interpret('petrichor');
    expect(Object.keys(p.moods)).toEqual(['nostalgic', 'dreamy']);
    expect(p.dims.energy!).toBeCloseTo(0.3, 5);
    expect(Object.keys(ext.interpret('after the rain').moods)).toContain('nostalgic');
  });
});

describe('real research mood_lexicon.json', () => {
  const raw = JSON.parse(readFileSync(resolve(process.cwd(), 'public/mood_lexicon.json'), 'utf8'));
  const lex = MoodTextLexicon.build(real, raw);
  it('imports every ranked descriptor (515) and their synonyms', () => {
    const known = new Set(real.moodVocabulary.map((m) => m.id));
    const entries = parseExternalLexicon(raw, known);
    expect(raw.entries.length).toBe(515);
    expect(new Set(entries.filter((e) => e.term).map((e) => e.term)).size).toBeGreaterThanOrEqual(515);
    expect(entries.every((e) => Object.keys(e.moods).every((m) => known.has(m)))).toBe(true);
  });
  it('the 4 new KB moods exist with their own colours and dims', () => {
    for (const id of ['peaceful', 'energetic', 'aggressive', 'solemn']) {
      const m = real.moodVocabulary.find((x) => x.id === id)!;
      expect(m.color).toMatch(/^#/);
      expect(m.brightness).toBeTypeOf('number');
      expect(m.tension).toBeTypeOf('number');
    }
  });
  it('interprets research descriptors', () => {
    expect(Object.keys(lex.interpret('sad').moods)[0]).toBe('melancholy');
    expect(lex.interpret('calm and serene').moods.peaceful).toBeGreaterThan(0.3);
    expect(lex.interpret('angry').moods.aggressive).toBeGreaterThan(0.3);
    // multi-word research phrases win over word-by-word blending
    expect(Object.keys(lex.interpret('sad but hopeful').moods)[0]).toBe('bittersweet');
    const blend = lex.interpret('very sad but triumphant');
    expect(blend.moods.melancholy).toBeGreaterThan(0);
    expect(blend.moods.triumphant).toBeGreaterThan(0);
  });
  it('"haunting, like a foggy forest" leads with a non-diatonic colour chord', () => {
    const eng = new SuggestionEngine(real);
    const top = eng.suggestChords({ key: key('C'), progression: prog('C Am F'), profile: lex.interpret('haunting, like a foggy forest'), limit: 3 });
    expect(top[0].diatonic).toBe(false);
    expect(top[0].features.brightness).toBeLessThan(0.2);
  });
  it('a mode preference rewards chords carrying the mode colour (C major + Dorian → E♭/B♭ chords)', () => {
    const eng = new SuggestionEngine(real);
    const p = { moods: {}, dims: {}, modes: ['dorian' as const], source: 'manual' as const };
    const top = eng.suggestChords({ key: key('C'), progression: prog('C Am F'), profile: p, limit: 4 });
    expect(top.slice(0, 3).some((s) => /^(B♭|Bb|E♭|Eb|Cm|Gm)/.test(s.symbol))).toBe(true);
  });
  it('ranking responds to new moods (peaceful vs aggressive)', () => {
    const eng = new SuggestionEngine(real);
    const run = (t: string) => eng.suggestChords({ key: key('C'), progression: prog('C Am F'), profile: lex.interpret(t), limit: 5 });
    const calm = run('peaceful'), angry = run('aggressive');
    expect(calm[0].features.tension).toBeLessThan(angry[0].features.tension);
  });
});

describe('blended profile ranking', () => {
  const eng = new SuggestionEngine(real);
  const lex = MoodTextLexicon.build(real);
  const run = (text: string, p = 'C Am F') => eng.suggestChords({ key: key('C'), progression: prog(p), profile: lex.interpret(text), limit: 10 });
  it('"haunting" favours chromatic, darker, tenser options', () => {
    const top = run('haunting').slice(0, 3);
    for (const s of top) {
      expect(s.features.chromaticism).toBeGreaterThan(0.35);
      expect(s.features.brightness).toBeLessThan(0.2);
    }
  });
  it('"triumphant" vs "melancholy" produce different leaders with matching brightness', () => {
    const tri = run('triumphant');
    const mel = run('melancholy');
    expect(tri[0].id).not.toBe(mel[0].id);
    expect(tri[0].features.brightness).toBeGreaterThan(mel[0].features.brightness);
  });
  it('a 50/50 blend ranks candidates that satisfy both above ones that satisfy one', () => {
    const p = lex.interpret('victorious but bittersweet');
    const s = eng.suggestChords({ key: key('C'), progression: prog('C Am F'), profile: p, limit: 30 });
    expect(s[0].match!.total).toBeGreaterThan(0.5);
    // match score is monotone in the final ordering's top half on average
    const topAvg = s.slice(0, 5).reduce((a, x) => a + x.match!.total, 0) / 5;
    const restAvg = s.slice(10).reduce((a, x) => a + x.match!.total, 0) / Math.max(1, s.slice(10).length);
    expect(topAvg).toBeGreaterThan(restAvg);
  });
  it('dimension-only profiles work (e.g. "not tense")', () => {
    const relaxed = eng.suggestChords({ key: key('C'), progression: prog('C F'), profile: { moods: {}, dims: { tension: 0.05 }, modes: [], source: 'manual' } });
    const tense = eng.suggestChords({ key: key('C'), progression: prog('C F'), profile: { moods: {}, dims: { tension: 0.95 }, modes: [], source: 'manual' } });
    expect(tense[0].features.tension).toBeGreaterThan(relaxed[0].features.tension);
  });
  it('a preferred mode favours chords from that mode', () => {
    const lyd = eng.suggestChords({ key: key('C'), progression: prog('C'), profile: { moods: {}, dims: {}, modes: ['lydian'], source: 'manual' }, limit: 5 });
    expect(lyd.map((s) => s.id)).toContain('D');
  });
  it('matchProfile gives exact mood hits full credit', () => {
    const m = matchProfile(profileFromMoods(['epic']), [{ id: 'epic', weight: 1 }], { brightness: 0, valence: 0, tension: 0.5, chromaticism: 0.5, stability: 0.5, energy: 0.8 }, eng.lexicon);
    expect(m.total).toBeGreaterThan(0.95);
  });
});

describe('feature mapping & LLM adapter', () => {
  it('applies feature→mood rules from a mapping file', () => {
    const { config, applied, ignored } = applyFeatureMapping({
      rules: [
        { feature: 'quality:dim7', dimension: 'tension', effect: 1, strength: 'strong' },
        { feature: 'degree:b6', dimension: 'darkness', effect: 0.9, strength: 'high' },
        { feature: 'nonsense', dimension: 'tension', effect: 1 },
      ],
    });
    expect(applied).toBe(2);
    expect(ignored).toBe(1);
    expect(config.qualityTension.dim7).toBe(1);
    expect(config.degreeBrightness[8]).toBeCloseTo(-0.9);
    expect(DEFAULT_FEATURE_CONFIG.qualityTension.dim7).toBe(0.9); // default untouched
  });
  it('validates LLM output against the vocabulary and ranges', () => {
    const vocab = real.moodVocabulary.map((m) => m.id);
    const p = parseLlmProfile('{"moods":[{"id":"mystical","weight":0.6},{"id":"spooky-ish","weight":0.4},{"id":"dark","weight":0.2}],"dims":{"brightness":-3,"tension":0.7},"modes":["dorian","klingon"]}', vocab);
    expect(Object.keys(p.moods)).toEqual(['mystical', 'dark']);
    expect(p.moods.mystical).toBeCloseTo(0.75);
    expect(p.dims.brightness).toBe(-1);
    expect(p.modes).toEqual(['dorian']);
    expect(buildMoodPrompt('foggy', vocab).system).toContain('mystical');
    expect(MOOD_PROFILE_JSON_SCHEMA.required).toContain('moods');
  });
  it('is disabled by default and falls back to the lexicon', async () => {
    const lex = new LexiconInterpreter(MoodTextLexicon.build(real));
    let called = false;
    const llm = new LlmMoodInterpreter({ enabled: false, fetchFn: (async () => { called = true; return new Response('{}'); }) as typeof fetch }, [], lex);
    expect(llm.available()).toBe(false);
    const p = await llm.interpret('haunting');
    expect(called).toBe(false);
    expect(p.source).toBe('lexicon');
  });
  it('uses the endpoint when enabled (mocked)', async () => {
    const lex = new LexiconInterpreter(MoodTextLexicon.build(real));
    const fetchFn = (async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"moods":[{"id":"epic","weight":1}],"dims":{},"modes":[]}' } }] }))) as typeof fetch;
    const llm = new LlmMoodInterpreter({ enabled: true, endpoint: 'https://example.invalid/v1/chat/completions', model: 'x', fetchFn }, ['epic'], lex);
    const p = await llm.interpret('huge');
    expect(p.source).toBe('llm');
    expect(p.moods).toEqual({ epic: 1 });
  });
});

describe('export', () => {
  it('writes a valid Standard MIDI File header and text summary', () => {
    const bytes = toMidiFile(prog('C Am F G'), [60, 62, 64]);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('MThd');
    expect(bytes[9]).toBe(1); // format 1
    expect(bytes[11]).toBe(2); // two tracks
    expect(progressionText(key('C'), prog('C Am F G'))).toContain('I | vi | IV | V');
  });
});

it('chord symbols round-trip through suggestions', () => {
  const eng = new SuggestionEngine(real);
  for (const s of eng.suggestChords({ key: key('Eb'), progression: prog('Eb Cm Ab'), limit: 30 })) {
    expect(chordSymbol(parseChord(s.id)!)).toBe(s.id);
  }
});
