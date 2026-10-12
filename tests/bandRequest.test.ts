import { describe, expect, it, vi } from 'vitest';
import { MUSE_REQUEST_ENDPOINT, MUSE_REQUEST_MAX, buildMuseRequest, sendMuseRequest } from '../src/core/museRequest';

describe('buildMuseRequest', () => {
  it('builds the FormSubmit payload with one free-text field', () => {
    expect(buildMuseRequest('  add Radiohead, Paranoid Android  ')).toEqual({
      request: 'add Radiohead, Paranoid Android', _subject: 'Muse request', _captcha: 'false', _template: 'table', _honey: '',
    });
  });
  it('rejects empty input and filled honeypot', () => {
    expect(buildMuseRequest('   ')).toBeNull();
    expect(buildMuseRequest('real', 'bot')).toBeNull();
  });
  it('caps length', () => {
    expect(buildMuseRequest('x'.repeat(5000))!.request.length).toBe(MUSE_REQUEST_MAX);
  });
});

describe('sendMuseRequest', () => {
  it('POSTs JSON to the shared inbox', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ success: 'true' }), { status: 200 }));
    expect(await sendMuseRequest(buildMuseRequest('hi')!, f as unknown as typeof fetch)).toBe(true);
    expect(MUSE_REQUEST_ENDPOINT).toBe('https://formsubmit.co/ajax/pulse-requests@mail.grokbot.com');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(MUSE_REQUEST_ENDPOINT);
    expect((init.headers as Record<string, string>).Accept).toBe('application/json');
    expect(JSON.parse(init.body as string)._subject).toBe('Muse request');
  });
  it('returns false on failure', async () => {
    expect(await sendMuseRequest(buildMuseRequest('hi')!, (async () => new Response('', { status: 500 })) as typeof fetch)).toBe(false);
    expect(await sendMuseRequest(buildMuseRequest('hi')!, (async () => { throw new Error('x'); }) as typeof fetch)).toBe(false);
  });
});
