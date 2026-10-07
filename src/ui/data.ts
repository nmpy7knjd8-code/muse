// Runtime data loading: theory KB (real → seed fallback), optional mood lexicon and feature mapping.
import { ArtistsFile, LoreFile, TheoryKB, applyFeatureMapping, normalizeArtists, normalizeKB, normalizeLore, setFeatureConfig } from '../core';

/** Display info for any KB item (raw file — includes items the engine can't place, e.g. 'varies' pedals). */
export interface KbItemInfo { kind: string; id: string; name: string; description: string; moods: string[] }

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
  artists: ArtistsFile | null;
  kbIndex: Map<string, KbItemInfo>;
}

function indexKb(raw: unknown): Map<string, KbItemInfo> {
  const out = new Map<string, KbItemInfo>();
  const r = (raw ?? {}) as Record<string, unknown>;
  const add = (field: string, kind: string) => {
    const list = Array.isArray(r[field]) ? (r[field] as Array<Record<string, unknown>>) : [];
    for (const it of list) {
      if (!it || typeof it.id !== 'string') continue;
      const moods = Array.isArray(it.moods) ? (it.moods as unknown[]).map((m) => (typeof m === 'string' ? m : (m as { id?: string })?.id ?? '')).filter(Boolean) : [];
      out.set(`${kind}:${it.id}`, { kind, id: it.id, name: String(it.name ?? it.id), description: String(it.description ?? ''), moods });
    }
  };
  add('chordMoves', 'chordMove'); add('melodicMoves', 'melodicMove'); add('modes', 'mode'); add('progressions', 'progression');
  return out;
}

export async function loadData(): Promise<LoadedData> {
  let raw = await getJson('theory_kb.json');
  let kbFile = 'theory_kb.json';
  if (!raw) {
    raw = await getJson('theory_kb.seed.json');
    kbFile = 'theory_kb.seed.json';
  }
  const kb = normalizeKB(raw ?? {});
  const [moodLexicon, mapping, loreRaw, artistsRaw] = await Promise.all([getJson('mood_lexicon.json'), getJson('feature_mood_mapping.json'), getJson('lore.json'), getJson('artists.json')]);
  let featureMapping: LoadedData['featureMapping'] = null;
  if (mapping) {
    const res = applyFeatureMapping(mapping);
    setFeatureConfig(res.config);
    featureMapping = { applied: res.applied, ignored: res.ignored };
  }
  return { kb, kbFile, moodLexicon, featureMapping, lore: loreRaw ? normalizeLore(loreRaw) : null, artists: normalizeArtists(artistsRaw), kbIndex: indexKb(raw) };
}
