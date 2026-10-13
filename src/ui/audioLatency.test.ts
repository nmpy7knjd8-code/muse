import { describe, it, expect } from 'vitest';
import { AudioEngine } from './audio';

describe('chord tap latency', () => {
  it('one-shot notes start at the current audio clock, not a lookahead', () => {
    const eng = new AudioEngine();
    (eng as unknown as { ctx: { currentTime: number } }).ctx = { currentTime: 5 };
    expect(eng.immediate()).toBeGreaterThanOrEqual(5);
    expect(eng.immediate() - 5).toBeLessThan(0.01);
    expect(eng.scheduleOrigin() - 5).toBeGreaterThan(eng.immediate() - 5);
  });
});
