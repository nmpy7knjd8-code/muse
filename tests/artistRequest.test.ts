import { describe, expect, it } from 'vitest';
import {
  artistLensAgentPrompt,
  artistLensPromptDeeplink,
  bandFromArtistLensTitle,
  isSmokeArtistRequest,
  parseArtistLensIssue,
  parseBandRequestEntries,
  songFromArtistLensBody,
} from '../src/core/artistRequest';

describe('Artist Lens issue intake', () => {
  it('parses title, name, and optional song', () => {
    const req = parseArtistLensIssue({
      number: 42,
      title: 'Artist Lens request: Radiohead',
      body: [
        '## Band / artist request',
        '',
        '**Name:** Radiohead',
        '',
        '## Song to include in analysis (optional)',
        'Paranoid Android — section changes',
        '',
        '### Checklist',
      ].join('\n'),
      html_url: 'https://github.com/nmpy7knjd8-code/muse/issues/42',
    });
    expect(req).toEqual({
      band: 'Radiohead',
      song: 'Paranoid Android — section changes',
      issueNumber: 42,
      issueUrl: 'https://github.com/nmpy7knjd8-code/muse/issues/42',
    });
  });

  it('treats (none) song as null', () => {
    expect(songFromArtistLensBody('## Song to include in analysis (optional)\n\n(none)\n')).toBeNull();
  });

  it('skips smoke / placeholder bands', () => {
    expect(isSmokeArtistRequest('PIPELINE-SMOKE-TEST')).toBe(true);
    expect(parseArtistLensIssue({
      title: 'Artist Lens request: PIPELINE-SMOKE-TEST',
      body: 'smoke test — delete me',
    })).toBeNull();
  });

  it('ignores unrelated issues', () => {
    expect(bandFromArtistLensTitle('Fix the build')).toBeNull();
    expect(parseArtistLensIssue({
      title: 'Fix the build',
      body: '**Name:** Someone',
    })).toBeNull();
  });

  it('parses muse.bandRequests localStorage dumps', () => {
    const reqs = parseBandRequestEntries([
      { band: 'PIPELINE-SMOKE-TEST', at: 1 },
      { band: 'Radiohead', song: 'Paranoid Android', at: 10 },
      { band: 'radiohead', song: 'Karma Police', at: 20 },
      { band: ' Björk ', song: '(none)', at: 5 },
    ]);
    expect(reqs).toEqual([
      { band: 'radiohead', song: 'Karma Police', at: 20 },
      { band: 'Björk', song: null, at: 5 },
    ]);
  });

  it('builds a Cursor prompt deeplink for on-device requests', () => {
    const text = artistLensAgentPrompt({ band: 'Radiohead', song: 'Paranoid Android' });
    expect(text).toContain('Radiohead');
    expect(text).toContain('artists.json');
    expect(text).toContain('Paranoid Android');
    const link = artistLensPromptDeeplink({ band: 'Radiohead', song: null });
    expect(link.startsWith('https://cursor.com/link/prompt?')).toBe(true);
    expect(link).toContain(encodeURIComponent('Radiohead'));
  });
});
