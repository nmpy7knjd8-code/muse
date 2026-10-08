import { describe, expect, it } from 'vitest';
import { chromaFromMidis, matchChord } from '../src/core';
import { midiErrorMessage, midiSupported } from '../src/ui/midiInput';

const PC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const label = (m: ReturnType<typeof matchChord>) => (m ? `${PC[m.root]}${m.quality}` : 'none');

describe('chromaFromMidis + matchChord', () => {
  it('recognises held MIDI triads and sevenths', () => {
    expect(label(matchChord(chromaFromMidis([60, 64, 67])))).toBe('Cmaj');
    expect(label(matchChord(chromaFromMidis([57, 60, 64])))).toBe('Amin');
    expect(label(matchChord(chromaFromMidis([55, 59, 62, 65])))).toBe('G7');
    expect(label(matchChord(chromaFromMidis([48, 52, 55, 59])))).toBe('Cmaj7');
  });
  it('uses the lowest note as bass for slash-like voicings', () => {
    // E in the bass under C major → still Cmaj (bass bonus on E wouldn't invent Em)
    const m = matchChord(chromaFromMidis([40, 60, 64, 67]));
    expect(label(m)).toBe('Cmaj');
    expect(m!.confidence).toBeGreaterThan(0.5);
  });
  it('empty input yields null match', () => {
    expect(matchChord(chromaFromMidis([]))).toBeNull();
  });
  it('a single MIDI note is reported as a note', () => {
    const m = matchChord(chromaFromMidis([69]));
    expect(m!.kind).toBe('note');
    expect(PC[m!.root]).toBe('A');
  });
});

describe('midiErrorMessage', () => {
  it('rewrites missing Web MIDI support', () => {
    const msg = midiErrorMessage(new Error('requestMIDIAccess is not defined'));
    expect(msg.toLowerCase()).toContain('midi');
    expect(msg.toLowerCase()).toContain('browser');
  });
  it('rewrites permission denials', () => {
    expect(midiErrorMessage(new Error('NotAllowedError: Permission denied')).toLowerCase()).toContain('permission');
  });
  it('midiSupported reflects navigator capability', () => {
    expect(typeof midiSupported()).toBe('boolean');
  });
});
