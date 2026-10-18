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
  {
    id: 'hum', title: 'Hum to harmony', sub: 'Three moods for your tune', group: 'tools',
    icon: ico(<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>),
    load: () => import('./HumTool'),
  },
  {
    id: 'cadence', title: 'Cadence finder', sub: 'Pick where to land, work backwards', group: 'tools',
    icon: ico(<><path d="M4 12h12" /><path d="M12 7l5 5-5 5" /><path d="M20 5v14" /></>),
    load: () => import('./CadenceTool'),
  },
  {
    id: 'sections', title: 'Section builder', sub: 'Chorus, bridge… with a contrast meter', group: 'tools',
    icon: ico(<><rect x="3" y="5" width="7" height="14" rx="2" /><rect x="14" y="5" width="7" height="14" rx="2" /><path d="M10 12h4" /></>),
    load: () => import('./SectionsTool'),
  },
  {
    id: 'blend', title: 'Style blend', sub: 'Slide between two artists', group: 'tools',
    icon: ico(<><circle cx="9" cy="12" r="6" /><circle cx="15" cy="12" r="6" /></>),
    load: () => import('./BlendTool'),
  },
  {
    id: 'taste', title: 'Your taste', sub: 'What your thumbs taught Muse', group: 'tools',
    icon: ico(<><path d="M7 11v9H4v-9z" /><path d="M7 11l4-7a2 2 0 0 1 3 2l-1 4h5a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 16.8 20H7" /></>),
    load: () => import('./TasteTool'),
  },
  {
    id: 'practice', title: 'Play-along', sub: 'Count-in, loop, mic scoring', group: 'practice',
    icon: ico(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /><path d="M5 3 3 5M19 3l2 2" /></>),
    load: () => import('./PracticeTool'),
  },
  {
    id: 'release', title: 'Release finder', sub: 'Where should the tension let go?', group: 'tools',
    icon: ico(<><path d="M3 17c3-1 5-9 9-9 2.5 0 3 3 4 6" /><path d="M16 14l2 4 3-3" /><path d="M3 21h18" /></>),
    load: () => import('./ReleaseTool'),
  },
];

export const TOOL_BY_ID = Object.fromEntries(TOOLS.map((t) => [t.id, t])) as Record<ToolId, ToolDef>;
export const TOOL_COMPONENTS = Object.fromEntries(TOOLS.map((t) => [t.id, lazy(t.load)])) as Record<ToolId, LazyExoticComponent<ComponentType<ToolProps>>>;
export function prefetchTools(): void {
  for (const t of TOOLS) t.load().catch(() => { /* offline: loads on use */ });
}
