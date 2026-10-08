import { describe, expect, it } from 'vitest';
import { buildRequestIssue } from '../src/ui/ArtistLens';

describe('buildRequestIssue', () => {
  it('titles issues so the agent can find them and uses an existing label', () => {
    const { title, body, taskUrl } = buildRequestIssue('Radiohead', 'Paranoid Android');
    expect(title).toBe('Artist Lens request: Radiohead');
    expect(body).toContain('**Name:** Radiohead');
    expect(body).toContain('Paranoid Android');
    expect(taskUrl).toContain('issues/new?');
    expect(taskUrl).toContain(encodeURIComponent(title));
    expect(taskUrl).toContain('labels=enhancement');
    expect(taskUrl).not.toContain('artist-lens-request');
  });
});
