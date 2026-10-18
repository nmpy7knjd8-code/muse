// Shared modal focus handling (drawer + tutorial): move focus in, keep Tab/Shift+Tab inside, Escape closes,
// and optionally hand focus back to whatever had it before the dialog opened.
import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = 'button, [href], input, select, textarea, video[controls], [tabindex]:not([tabindex="-1"])';

export function focusablesIn(el: HTMLElement | null): HTMLElement[] {
  return Array.from(el?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((n) => !n.hasAttribute('disabled') && n.getAttribute('aria-hidden') !== 'true');
}

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean, o: { onEscape?: () => void; returnFocus?: boolean; fallback?: () => HTMLElement | null | undefined } = {}) {
  // Options live in a ref so inline callbacks don't re-run the effect (which would bounce focus).
  const opts = useRef(o);
  opts.current = o;
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    const prev = document.activeElement as HTMLElement | null;
    if (el && !el.contains(document.activeElement)) (focusablesIn(el)[0] ?? el).focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && opts.current.onEscape) { e.preventDefault(); opts.current.onEscape(); return; }
      if (e.key !== 'Tab') return;
      const f = focusablesIn(el); if (!f.length) { e.preventDefault(); return; }
      const first = f[0]!, last = f[f.length - 1]!;
      if (!el?.contains(document.activeElement)) { e.preventDefault(); first.focus(); return; }
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (!opts.current.returnFocus) return;
      const target = prev && prev !== document.body && prev.isConnected && prev.getClientRects().length ? prev : opts.current.fallback?.();
      // after unmount so the dialog's own nodes are gone
      window.setTimeout(() => target?.focus(), 0);
    };
  }, [active, ref]);
}
