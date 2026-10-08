// Parse GitHub "Artist Lens request: …" issues into a structured add-band job.
// Pure helpers so the cloud agent (and tests) share one intake path.
// Also accepts device dumps of localStorage `muse.bandRequests`.

export interface ArtistLensRequest {
  band: string;
  song: string | null;
  issueNumber?: number;
  issueUrl?: string;
  /** Epoch ms when saved on-device (muse.bandRequests), if known. */
  at?: number;
}

/** Shape stored in localStorage key `muse.bandRequests`. */
export interface BandRequestEntry {
  band: string;
  note?: string;
  song?: string;
  at?: number;
  taskUrl?: string;
}

const TITLE_RE = /^Artist Lens request:\s*(.+?)\s*$/i;
const NAME_RE = /\*\*Name:\*\*\s*(.+)/i;

/** True for intentional smoke / placeholder issues — never add these as artists. */
export function isSmokeArtistRequest(band: string): boolean {
  const b = band.trim().toLowerCase();
  return !b
    || b.includes('pipeline-smoke')
    || b.includes('smoke-test')
    || b === 'test'
    || b === 'placeholder'
    || /^x+$/i.test(b);
}

/**
 * Parse a JSON dump of `muse.bandRequests` (array or `{ requests: [...] }`).
 * Skips smoke/placeholder names. Dedupes by band (case-insensitive), keeping newest `at`.
 */
export function parseBandRequestEntries(raw: unknown): ArtistLensRequest[] {
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : (raw && typeof raw === 'object' && Array.isArray((raw as { requests?: unknown }).requests)
      ? (raw as { requests: unknown[] }).requests
      : []);
  const byBand = new Map<string, ArtistLensRequest>();
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const e = item as BandRequestEntry;
    const band = typeof e.band === 'string' ? e.band.trim() : '';
    if (!band || isSmokeArtistRequest(band)) continue;
    const song = typeof e.song === 'string' && e.song.trim() && !/^\(none\)$/i.test(e.song.trim())
      ? e.song.trim()
      : null;
    const at = typeof e.at === 'number' ? e.at : undefined;
    const key = band.toLowerCase();
    const prev = byBand.get(key);
    if (prev && (prev.at ?? 0) >= (at ?? 0)) continue;
    byBand.set(key, { band, song, at });
  }
  return [...byBand.values()].sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}

/** Agent prompt text for a band-add job (Cursor prompt deeplink / paste). */
export function artistLensAgentPrompt(req: Pick<ArtistLensRequest, 'band' | 'song'>): string {
  const song = req.song ? ` Include song analysis / try-it material for: ${req.song}.` : '';
  return (
    `Add Artist Lens artist "${req.band}" to public/artists.json on nmpy7knjd8-code/muse ` +
    `with techniques, sources, and at least one try-it exercise; update tests/artists.test.ts.` +
    song
  );
}

/** https://cursor.com/link/prompt deeplink — user must confirm before it runs. */
export function artistLensPromptDeeplink(req: Pick<ArtistLensRequest, 'band' | 'song'>): string {
  const url = new URL('https://cursor.com/link/prompt');
  url.searchParams.set('text', artistLensAgentPrompt(req));
  return url.toString();
}

/** Extract band name from an issue title, or null if it is not an Artist Lens request. */
export function bandFromArtistLensTitle(title: string): string | null {
  const m = TITLE_RE.exec(title.trim());
  if (!m) return null;
  const band = m[1].trim();
  return band || null;
}

/** Optional song line from the standard issue body. */
export function songFromArtistLensBody(body: string): string | null {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  let inSong = false;
  for (const line of lines) {
    if (/^##\s*Song to include/i.test(line)) { inSong = true; continue; }
    if (inSong) {
      const t = line.trim();
      if (!t) continue;
      if (t.startsWith('#')) break;
      if (/^\(none\)$/i.test(t)) return null;
      return t;
    }
  }
  // Fallback: **Name:** is required; ignore if song section missing.
  return null;
}

/** Name from body when title parse fails (template may leave a blank title suffix). */
export function bandFromArtistLensBody(body: string): string | null {
  const m = NAME_RE.exec(body);
  if (!m) return null;
  const band = m[1].trim();
  return band && !/^\(none\)$/i.test(band) ? band : null;
}

/**
 * Parse a GitHub issue into an Artist Lens add-band request.
 * Returns null when the issue is not a band request or is a smoke/placeholder.
 */
export function parseArtistLensIssue(issue: {
  title: string;
  body?: string | null;
  number?: number;
  html_url?: string;
  url?: string;
}): ArtistLensRequest | null {
  const title = issue.title.trim();
  if (!/^Artist Lens request:/i.test(title)) return null;
  const body = issue.body ?? '';
  const band = (bandFromArtistLensTitle(title) || bandFromArtistLensBody(body) || '').trim();
  if (!band || isSmokeArtistRequest(band)) return null;
  return {
    band,
    song: songFromArtistLensBody(body),
    issueNumber: issue.number,
    issueUrl: issue.html_url ?? issue.url,
  };
}
