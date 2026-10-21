// Progress map (idea 24): aggregate local learning stores into a plain-language theory tree with
// done / next / later states and prerequisites. Pure; see docs/dialectic/24.
import { gymMastery, type GymStats } from './earGym';
import { CONCEPT_BY_ID, type ConceptId } from './lessons';
import type { ModeId } from './scales';

export interface ProgressStores { concepts: string[]; missions: string[]; gym: GymStats; earRounds: number; modesUsed: string[]; guide?: string[] }
export type NodeState = 'done' | 'next' | 'later';
export interface ProgressNode { id: string; name: string; theory?: string; state: NodeState; how: string; tool: string; tab?: string; needs: string[] }
export interface ProgressBranch { id: string; name: string; nodes: ProgressNode[]; share: number }

interface Def { id: string; name: string; theory?: string; how: string; tool: string; tab?: string; needs: string[]; done: (s: ProgressStores) => boolean }
const gymSolid = (s: ProgressStores, prefix: string, min = 3) => {
  const ids = Object.keys(s.gym.items).filter((i) => i.startsWith(prefix));
  return ids.length >= min && gymMastery(s.gym, ids) >= 0.3;
};
const th = (id: ConceptId) => { const n = CONCEPT_BY_ID[id].name; const m = /\(([^)]+)\)/.exec(n); return (m ? m[1]! : n).toLowerCase(); };
const C = (id: ConceptId) => (s: ProgressStores) => s.concepts.includes(id);
const M = (id: string) => (s: ProgressStores) => s.missions.includes(id);
const modeUsed = (m: ModeId) => (s: ProgressStores) => s.modesUsed.includes(m);

const G = (...ids: string[]) => (s: ProgressStores) => ids.every((i) => (s.guide ?? []).includes(i));

const TREE: Array<{ id: string; name: string; defs: Def[] }> = [
  { id: 'hearing', name: 'Hearing', defs: [
    { id: 'h-home', name: 'Hear home notes', theory: 'scale degrees 1·3·5', how: 'Ear gym › Home notes (1·3·5)', tool: 'gym', tab: 'degree', needs: [], done: (s) => gymSolid(s, 'degree:', 3) },
    { id: 'h-mood', name: 'Hear moods in chords', how: 'Mood ear trainer — a few rounds', tool: 'ear', needs: [], done: (s) => s.earRounds >= 10 },
    { id: 'h-swap', name: 'Spot a changed chord', how: 'Ear gym › Swap', tool: 'gym', tab: 'swap', needs: ['h-home'], done: (s) => gymSolid(s, 'swap:', 3) },
    { id: 'h-name', name: 'Name a hidden chord', theory: 'Roman numerals by ear', how: 'Ear gym › Name it', tool: 'gym', tab: 'name', needs: ['h-swap'], done: (s) => gymSolid(s, 'name:', 3) },
    { id: 'h-bass', name: 'Follow the bass', how: 'Ear gym › Bass', tool: 'gym', tab: 'bass', needs: ['h-home'], done: (s) => gymSolid(s, 'bass:', 3) },
    { id: 'h-sing', name: 'Sing a note back', how: 'Ear gym › Sing', tool: 'gym', tab: 'sing', needs: ['h-home'], done: (s) => gymSolid(s, 'sing:', 2) },
  ] },
  { id: 'blocks', name: 'Building blocks', defs: [
    { id: 'b-finish', name: 'A strong landing', theory: th('authentic'), how: 'End your bars with the 5 chord → home', tool: 'lessons', tab: 'missions', needs: [], done: (s) => C('authentic')(s) || C('plagal')(s) },
    { id: 'b-question', name: 'A question-mark ending', theory: th('half'), how: 'End a phrase on the 5 chord', tool: 'lessons', tab: 'missions', needs: [], done: C('half') },
    { id: 'b-fake', name: 'A fake-out', theory: th('deceptive'), how: 'After the 5 chord, land on the sad 6 chord', tool: 'lessons', tab: 'theory', needs: ['b-finish'], done: C('deceptive') },
    { id: 'b-seventh', name: 'A richer chord', theory: th('seventh'), how: 'Use the “7ths (richer)” row', tool: 'lessons', tab: 'missions', needs: [], done: C('seventh') },
    { id: 'b-sus', name: 'An open, hanging chord', theory: th('sus'), how: 'Use a sus chord, then settle it', tool: 'lessons', tab: 'missions', needs: [], done: C('sus') },
    { id: 'b-borrow', name: 'A borrowed mood', theory: th('borrowed'), how: 'Use the “Extra colour” row', tool: 'lessons', tab: 'missions', needs: ['b-finish'], done: (s) => C('borrowed')(s) || C('modalColour')(s) },
    { id: 'b-secondary', name: 'Point at another chord', theory: th('secondary'), how: 'Use the “Secondaries” row', tool: 'lessons', tab: 'missions', needs: ['b-borrow'], done: C('secondary') },
  ] },
  { id: 'writing', name: 'Writing moves', defs: [
    { id: 'w-loop', name: 'A four-chord loop', how: 'Missions › Four different chords', tool: 'lessons', tab: 'missions', needs: [], done: M('loop4') },
    { id: 'w-fix', name: 'Fix a broken progression', how: 'Lessons › Fix it', tool: 'lessons', tab: 'fix', needs: [], done: (s) => s.missions.includes('finished') },
    { id: 'w-home2', name: 'Call and answer', how: 'Missions › Come home twice', tool: 'lessons', tab: 'missions', needs: ['w-loop'], done: M('home2') },
    { id: 'w-unfinished', name: 'Leave it hanging', how: 'Missions › Make it sound unfinished', tool: 'lessons', tab: 'missions', needs: [], done: M('unfinished') },
    { id: 'w-keys', name: 'Same song, new key', theory: 'transposition', how: 'Lessons › Key slide', tool: 'lessons', tab: 'keys', needs: ['w-loop'], done: (s) => s.modesUsed.includes('transposed') },
  ] },
  { id: 'guide', name: 'Theory guide', defs: [
    { id: 'g-basics', name: 'Notes, scales & chords', theory: 'chapters 1–3', how: 'Theory guide › chapters 1–3 (read + quiz)', tool: 'theory', tab: 'sound', needs: [], done: G('sound', 'scales', 'chords') },
    { id: 'g-function', name: 'Chord jobs & endings', theory: 'chapters 4–6', how: 'Theory guide › chapters 4–6', tool: 'theory', tab: 'roman', needs: ['g-basics'], done: G('roman', 'progressions', 'tension') },
    { id: 'g-colour', name: 'Modes & borrowed colour', theory: 'chapters 7–8', how: 'Theory guide › chapters 7–8', tool: 'theory', tab: 'modes', needs: ['g-function'], done: G('modes', 'borrowed') },
    { id: 'g-song', name: 'Melody, rhythm & tunings', theory: 'chapters 9–11', how: 'Theory guide › chapters 9–11', tool: 'theory', tab: 'melody', needs: ['g-basics'], done: G('melody', 'rhythm', 'tunings') },
    { id: 'g-ear', name: 'Styles & ear', theory: 'chapters 12–13', how: 'Theory guide › chapters 12–13', tool: 'theory', tab: 'styles', needs: ['g-colour'], done: G('styles', 'ear') },
  ] },
  { id: 'colours', name: 'Colours (modes)', defs: [
    { id: 'c-major', name: 'Bright (major)', how: 'Write in a major key', tool: 'lessons', tab: 'modes', needs: [], done: modeUsed('major') },
    { id: 'c-minor', name: 'Dark (minor)', how: 'Write in a minor key', tool: 'lessons', tab: 'modes', needs: [], done: modeUsed('minor') },
    { id: 'c-mixo', name: 'Rock swagger', theory: 'Mixolydian', how: 'Mode morph › Mixolydian', tool: 'lessons', tab: 'modes', needs: ['c-major'], done: modeUsed('mixolydian') },
    { id: 'c-dorian', name: 'Hopeful minor', theory: 'Dorian', how: 'Mode morph › Dorian', tool: 'lessons', tab: 'modes', needs: ['c-minor'], done: modeUsed('dorian') },
    { id: 'c-lydian', name: 'Floating', theory: 'Lydian', how: 'Mode morph › Lydian', tool: 'lessons', tab: 'modes', needs: ['c-mixo'], done: modeUsed('lydian') },
    { id: 'c-phrygian', name: 'Menacing', theory: 'Phrygian', how: 'Mode morph › Phrygian', tool: 'lessons', tab: 'modes', needs: ['c-dorian'], done: modeUsed('phrygian') },
  ] },
];

export function progressMap(s: ProgressStores): { branches: ProgressBranch[]; next: ProgressNode | null } {
  const done = new Set<string>();
  for (const b of TREE) for (const d of b.defs) if (d.done(s)) done.add(d.id);
  const branches = TREE.map((b) => {
    const nodes: ProgressNode[] = b.defs.map((d) => ({
      id: d.id, name: d.name, theory: d.theory, how: d.how, tool: d.tool, tab: d.tab, needs: d.needs,
      state: done.has(d.id) ? 'done' : d.needs.every((n) => done.has(n)) ? 'next' : 'later',
    }));
    return { id: b.id, name: b.name, nodes, share: nodes.filter((n) => n.state === 'done').length / nodes.length };
  });
  // Next up: the least-advanced branch's first open node (spreads learning across branches).
  const order = [...branches].sort((a, b) => a.share - b.share);
  const next = order.map((b) => b.nodes.find((n) => n.state === 'next')).find(Boolean) ?? null;
  return { branches, next };
}
export const PROGRESS_NODE_COUNT = TREE.reduce((a, b) => a + b.defs.length, 0);
