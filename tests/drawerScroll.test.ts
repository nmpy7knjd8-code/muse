import { describe, expect, it } from 'vitest';
import { revealScrollTop, saveNavScroll, savedNavScroll, setNavEntry, navEntry, _resetNavMem } from '../src/ui/drawerScroll';

describe('drawer scroll memory', () => {
  it('keeps saved position when the selected entry is visible', () => { expect(revealScrollTop(200, 400, 300, 50, 1000)).toBe(200); });
  it('scrolls minimally to reveal an entry below / above', () => {
    expect(revealScrollTop(0, 400, 600, 50, 1000)).toBe(258);
    expect(revealScrollTop(500, 400, 100, 50, 1000)).toBe(92);
  });
  it('centres the entry when nothing was saved, clamped', () => {
    expect(revealScrollTop(null, 400, 600, 50, 1000)).toBe(425);
    expect(revealScrollTop(null, 400, 10, 50, 1000)).toBe(0);
  });
  it('remembers across resets of the nav (module state)', () => {
    _resetNavMem(); saveNavScroll(321); setNavEntry('tool:song');
    expect(savedNavScroll()).toBe(321); expect(navEntry()).toBe('tool:song');
  });
});
