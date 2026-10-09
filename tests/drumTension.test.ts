import { describe, expect, it } from 'vitest';
import {
  analyzeDrumBar, coachDrumBar, defaultPartMeters, drumPatternById,
  drumRelease, progressionDrumTension,
} from '../src/core';

const meter4 = defaultPartMeters().drums;

describe('drum tension build & release', () => {
  it('scores a backbeat pocket as home (lower departure level than a fill)', () => {
    const pocket = analyzeDrumBar(drumPatternById('backbeat-rock')!.hits, { ...meter4, subdiv: 2 });
    const fill = analyzeDrumBar(drumPatternById('build-fill')!.hits, meter4);
    expect(pocket.backbeatHome).toBeGreaterThan(0.5);
    expect(fill.fill).toBeGreaterThan(pocket.fill);
    expect(fill.level).toBeGreaterThan(pocket.level);
  });

  it('detects release when returning from a fill to crash-on-1 pocket', () => {
    const fill = analyzeDrumBar(drumPatternById('build-fill')!.hits, meter4);
    const landHits = drumPatternById('release-crash-one')!.hits;
    const land = analyzeDrumBar(landHits, { ...meter4, subdiv: 2 });
    const release = drumRelease(fill, land, landHits);
    expect(release).toBeGreaterThan(0.25);
    expect(land.backbeatHome).toBeGreaterThan(0.45);
  });

  it('stacks debt across a build then spends it on release', () => {
    const bars = [
      drumPatternById('backbeat-rock')!.hits,
      drumPatternById('build-fill')!.hits,
      drumPatternById('release-crash-one')!.hits,
    ];
    // Use 16th meter for fill; release pattern is 8ths but beats still map.
    const state = progressionDrumTension(bars, meter4);
    expect(state.points).toHaveLength(3);
    expect(state.points[1]!.level).toBeGreaterThan(state.points[0]!.level);
    expect(state.points[2]!.release).toBeGreaterThan(0.2);
    expect(state.points[2]!.debt).toBeLessThan(state.points[1]!.debt + 0.05);
    expect(state.homeIndex).toBeGreaterThanOrEqual(0);
  });

  it('coach exposes build/release levers and status labels', () => {
    const c = coachDrumBar(drumPatternById('backbeat-rock')!.hits, { ...meter4, subdiv: 2 });
    expect(c.levers.length).toBeGreaterThanOrEqual(4);
    expect(c.parts.backbeatHome).toBeGreaterThan(0.4);
    expect(c.message.length).toBeGreaterThan(10);
  });
});
