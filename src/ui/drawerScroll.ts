// Drawer menu scroll memory: survives the nav unmounting (module state, mirrored to sessionStorage).
const KEY = 'muse.drawerNav';
interface NavMem { top: number | null; entry: string }
function load(): NavMem {
  try { const o = JSON.parse(sessionStorage.getItem(KEY) ?? ''); if (o && typeof o.entry === 'string') return { top: typeof o.top === 'number' ? o.top : null, entry: o.entry }; } catch { /* */ }
  return { top: null, entry: 'writing' };
}
let mem: NavMem | null = null;
const get = () => (mem ??= load());
const persist = () => { try { sessionStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* */ } };
export const navEntry = () => get().entry;
export function setNavEntry(entry: string) { get().entry = entry; persist(); }
export function saveNavScroll(top: number) { get().top = top; persist(); }
export const savedNavScroll = () => get().top;
export function _resetNavMem() { mem = { top: null, entry: 'writing' }; }

/** Scroll position that keeps `saved` but minimally reveals the item; centres it when nothing was saved. */
export function revealScrollTop(saved: number | null, viewH: number, itemTop: number, itemH: number, maxTop: number, pad = 8): number {
  const clamp = (v: number) => Math.max(0, Math.min(maxTop, v));
  if (saved === null) return clamp(itemTop + itemH / 2 - viewH / 2);
  const s = clamp(saved);
  if (itemTop < s + pad) return clamp(itemTop - pad);
  if (itemTop + itemH > s + viewH - pad) return clamp(itemTop + itemH - viewH + pad);
  return s;
}

/** Restore + reveal on a freshly mounted nav (call in a layout effect, before paint, so nothing jumps). */
export function restoreNav(nav: HTMLElement) {
  const item = nav.querySelector<HTMLElement>(`[data-entry="${CSS.escape(navEntry())}"]`);
  const saved = savedNavScroll();
  if (!item) { if (saved !== null) nav.scrollTop = saved; return; }
  const nr = nav.getBoundingClientRect(); const ir = item.getBoundingClientRect();
  const itemTop = ir.top - nr.top + nav.scrollTop;
  nav.scrollTop = revealScrollTop(saved, nav.clientHeight, itemTop, ir.height, nav.scrollHeight - nav.clientHeight);
}
