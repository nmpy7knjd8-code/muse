import { describe, expect, it } from 'vitest';
import {
  MODE_BY_ID, STYLES, STYLE_PROFILES, TUNING_BY_ID, chordMidis, coherence, guitarVoicings, INSTRUMENTS, key, parseChord, parseNote, pc,
  shapeMidi, styleCombo, styleFit, styleLens, styleProgressions, tuningById, tuningKeySuggestion, tuningTonics,
} from '../src/core';

describe('style profiles', () => {
  it('every style has a valid profile (modes, tonics, tunings, sources)', () => {
    for (const s of STYLES) {
      const p = STYLE_PROFILES[s.id];
      expect(p, s.id).toBeTruthy();
      expect(p!.modes.length).toBeGreaterThan(0);
      for (const m of p!.modes) expect(MODE_BY_ID[m], `${s.id} ${m}`).toBeTruthy();
      if (p!.tonics !== 'low') for (const t of p!.tonics) expect(parseNote(t), `${s.id} ${t}`).toBeTruthy();
      for (const t of p!.tunings) expect(TUNING_BY_ID[t], `${s.id} ${t}`).toBeTruthy();
      expect(p!.src.length).toBeGreaterThan(0);
    }
  });
  it('each style’s best combo is coherent with itself and has its own progressions', () => {
    for (const s of STYLES) {
      const c = styleCombo(s.id, tuningById('standard'))!;
      const t = tuningById(c.tuning);
      const k = key(c.tonic, c.mode);
      const coh = coherence(s.id, k, t)!;
      expect(coh.modeFit, s.id).toBe('typical');
      expect(coh.tonicFit, s.id).toBe('typical');
      expect(coh.note, s.id).toBeNull();
      expect(styleProgressions(s, k).some((p) => !p.borrowed), s.id).toBe(true);
    }
  });
  it('riff styles take the tonic from the tuning’s low string (research: TOOL D in drop D, Metallica E, Sabbath C♯)', () => {
    expect(styleCombo('tool', tuningById('standard'))!.label).toBe('TOOL: D minor/Phrygian in Drop D');
    expect(styleCombo('metallica', tuningById('standard'))).toMatchObject({ tonic: 'E', mode: 'minor', tuning: 'standard' });
    expect(styleCombo('black-sabbath', tuningById('standard'))).toMatchObject({ tonic: 'E', tuning: 'standard' }); // keeps a tuning it uses
    expect(styleCombo('black-sabbath', tuningById('dropD'))).toMatchObject({ tonic: 'C#', tuning: 'sabbathCs' });
    expect(styleCombo('tool', tuningById('dropB'))).toMatchObject({ tonic: 'B', tuning: 'dropB' });
    expect(styleCombo('flamenco', null)).toMatchObject({ tonic: 'A', mode: 'phrygianDominant' }); // por medio
    expect(styleCombo('led-zeppelin', null)).toMatchObject({ tonic: 'A', mode: 'mixolydian', tuning: 'standard' });
  });
});

describe('coherence notes', () => {
  it('flags unusual modes with the closest typical one, but never blocks', () => {
    const c = coherence('tool', key('D', 'lydian'), tuningById('toolDropD'))!;
    expect(c.modeFit).toBe('unusual');
    expect(c.note).toBe('TOOL rarely uses Lydian; closest fit: Dorian.');
    expect(styleProgressions({ ...STYLES.find((s) => s.id === 'tool')! }, key('D', 'lydian')).length).toBeGreaterThan(0);
  });
  it('flags a tonic away from the tuning’s open string for riff styles', () => {
    const c = coherence('tool', key('E', 'minor'), tuningById('dropD'))!;
    expect(c.tonicFit).toBe('unusual');
    expect(c.note).toMatch(/D in Drop D/);
  });
  it('text recomputes on every change of key, mode, style or tuning', () => {
    const base = coherence('tool', key('D', 'minor'), tuningById('dropD'))!;
    const variants = [
      coherence('tool', key('E', 'minor'), tuningById('dropD')),
      coherence('tool', key('D', 'phrygian'), tuningById('dropD')),
      coherence('metallica', key('D', 'minor'), tuningById('dropD')),
      coherence('tool', key('D', 'minor'), tuningById('standard')),
    ];
    for (const v of variants) expect(v!.why === base.why && v!.note === base.note).toBe(false);
    expect(base.why).toMatch(/open low D string/);
    expect(coherence(null, key('C'), tuningById('standard'))).toBeNull();
  });
});

describe('tuning ↔ key', () => {
  it('suggests tonics on the tuning’s open strings', () => {
    expect(tuningTonics(tuningById('dropD'))[0]).toBe(2);
    expect(tuningTonics(tuningById('openG'))[0]).toBe(7);
    expect(tuningTonics(tuningById('openD'))[0]).toBe(2);
    expect(tuningKeySuggestion(tuningById('dropD'), key('C'))).toMatchObject({ tonic: 'D' });
    expect(tuningKeySuggestion(tuningById('openG'), key('C'))!.label).toMatch(/ring a G chord/);
    expect(tuningKeySuggestion(tuningById('dropD'), key('D', 'minor'))).toBeNull();
    expect(tuningKeySuggestion(tuningById('standard'), key('C'))).toBeNull();
  });
  it('tuning-aware highlighting: chords on open low strings count as easy', () => {
    const lens = styleLens('pop', key('C'), tuningById('halfDown'));
    expect(styleFit(parseChord('Eb')!, lens)).toBe('tuning');
    expect(styleFit(parseChord('D')!, lens)).toBe('other');
  });
});

describe('guitar playback follows the tuning', () => {
  it('chordMidis uses the tuned voicing', () => {
    const c = parseChord('D5')!;
    const drop = tuningById('dropD').strings;
    const m = chordMidis(c, [], INSTRUMENTS.nylon, { tuning: drop });
    expect(m).toEqual(shapeMidi(guitarVoicings(c, 1, drop)[0]!, drop).sort((a, b) => a - b));
    expect(Math.min(...m)).toBe(38); // open low D
    expect(chordMidis(c, [], INSTRUMENTS.nylon)).not.toEqual(m);
    expect(pc(c.root)).toBe(2);
  });
});
