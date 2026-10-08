// Parse GitHub "Artist Lens request: …" issues into a structured add-band job.
// Pure helpers so the cloud agent (and tests) share one intake path.

export interface ArtistLensRequest {
  band: string;
  song: string | null;
  issueNumber?: number;
  issueUrl?: string;
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
