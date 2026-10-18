// Drawer tools: metadata + lazy loaders (each tool is its own chunk; prefetched when idle for offline).
import { lazy, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react';
import type { ToolId, ToolProps } from './types';

export interface ToolDef {
  id: ToolId;
  title: string;
  sub: string;
  group: 'tools' | 'practice';
  icon: ReactNode;
  load: () => Promise<{ default: ComponentType<ToolProps> }>;
}

const ico = (d: ReactNode) => (
  <svg className="drawer-ico" viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);

export const TOOLS: ToolDef[] = [
  {
    id: 'arc', title: 'Tension arc', sub: 'Draw a curve, get chords', group: 'tools',
    icon: ico(<><path d="M3 18c3 0 4-10 8-10s5 7 10 4" /><path d="M3 21h18" /></>),
    load: () => import('./ArcTool'),
  },
  {
    id: 'ear', title: 'Mood ear trainer', sub: 'Which one sounds more…?', group: 'practice',
    icon: ico(<><path d="M7 15.5c0-6 2-10 6-10a5 5 0 0 1 5 5c0 3-3 3.5-3 6.5a3 3 0 0 1-6 0" /><path d="M11 11.5a2 2 0 0 1 4 0" /></>),
    load: () => import('./EarTool'),
  },
  {
    id: 'song', title: 'Song analysis', sub: 'Paste a chord sheet', group: 'tools',
    icon: ico(<><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5" /><path d="M9 13h7M9 17h4" /></>),
    load: () => import('./SongTool'),
  },
];

export const TOOL_BY_ID = Object.fromEntries(TOOLS.map((t) => [t.id, t])) as Record<ToolId, ToolDef>;
export const TOOL_COMPONENTS = Object.fromEntries(TOOLS.map((t) => [t.id, lazy(t.load)])) as Record<ToolId, LazyExoticComponent<ComponentType<ToolProps>>>;
export function prefetchTools(): void {
  for (const t of TOOLS) t.load().catch(() => { /* offline: loads on use */ });
}
