// Muse request box: one free-text field, submitted to FormSubmit (emails the bot's inbox).
// No visitor account needed; the bot interprets what the visitor means.

export const MUSE_REQUEST_ENDPOINT = 'https://formsubmit.co/ajax/pulse-requests@mail.grokbot.com';
export const MUSE_REQUEST_SUBJECT = 'Muse request';
export const MUSE_REQUEST_MAX = 1000;

export interface MuseRequestPayload {
  request: string;
  _subject: string;
  _captcha: 'false';
  _template: 'table';
  _honey: '';
}

/** Build the JSON payload, or null when empty or the honeypot is filled (bot). */
export function buildMuseRequest(text: string, honey = ''): MuseRequestPayload | null {
  if (honey.trim()) return null;
  const request = text.trim().slice(0, MUSE_REQUEST_MAX);
  if (!request) return null;
  return { request, _subject: MUSE_REQUEST_SUBJECT, _captcha: 'false', _template: 'table', _honey: '' };
}

/** POST to FormSubmit. Resolves true on success. */
export async function sendMuseRequest(payload: MuseRequestPayload, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(MUSE_REQUEST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return false;
    const data = (await res.json().catch(() => ({}))) as { success?: unknown };
    return data.success === undefined || data.success === true || data.success === 'true';
  } catch { return false; }
}
