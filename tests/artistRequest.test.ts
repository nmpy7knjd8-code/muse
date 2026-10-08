import { describe, expect, it } from 'vitest';
import {
  bandFromArtistLensTitle,
  isSmokeArtistRequest,
  parseArtistLensIssue,
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
});
