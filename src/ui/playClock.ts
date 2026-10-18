// Playhead clock outside React state: the rAF loop updates it every frame, but only the
// components that draw a moving playhead subscribe — the rest of the app re-renders only
// when the *active* chord/note changes (audit #12: no full re-render at 60fps while playing).
import { useSyncExternalStore } from 'react';

export interface PlayClock {
  get: () => number;
  set: (sec: number) => void;
  subscribe: (fn: () => void) => () => void;
}

export function createPlayClock(): PlayClock {
  let sec = 0;
  const listeners = new Set<() => void>();
  return {
    get: () => sec,
    set: (v) => { if (v === sec) return; sec = v; listeners.forEach((l) => l()); },
    subscribe: (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
  };
}

export function usePlaySec(clock: PlayClock): number {
  return useSyncExternalStore(clock.subscribe, clock.get, clock.get);
}
