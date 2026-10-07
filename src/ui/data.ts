// Runtime data loading: theory KB (real → seed fallback), optional mood lexicon and feature mapping.
import { LoreFile, TheoryKB, applyFeatureMapping, normalizeKB, normalizeLore, setFeatureConfig } from '../core';

const base = import.meta.env.BASE_URL;

async function getJson(path: string): Promise<unknown | null> {
  try {
    const r = await fetch(base + path, { cache: 'no-cache' });
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') ?? '';
    if (!ct.includes('json')) return null; // dev servers may answer 404s with index.html
    return await r.json();
  } catch {
    return null;
  }
}

export interface LoadedData {
  kb: TheoryKB;
  kbFile: string;
  moodLexicon: unknown | null;
  featureMapping: { applied: number; ignored: number } | null;
  lore: LoreFile | null;
}

export async function loadData(): Promise<LoadedData> {
  let raw = await getJson('theory_kb.json');
  let kbFile = 'theory_kb.json';
  if (!raw) {
    raw = await getJson('theory_kb.seed.json');
    kbFile = 'theory_kb.seed.json';
  }
  const kb = normalizeKB(raw ?? {});
  const [moodLexicon, mapping, loreRaw] = await Promise.all([getJson('mood_lexicon.json'), getJson('feature_mood_mapping.json'), getJson('lore.json')]);
  let featureMapping: LoadedData['featureMapping'] = null;
  if (mapping) {
    const res = applyFeatureMapping(mapping);
    setFeatureConfig(res.config);
    featureMapping = { applied: res.applied, ignored: res.ignored };
  }
  return { kb, kbFile, moodLexicon, featureMapping, lore: loreRaw ? normalizeLore(loreRaw) : null };
}
