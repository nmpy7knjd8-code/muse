import { describe, expect, it } from 'vitest';
import { listenErrorMessage } from '../src/ui/listen';

describe('listenErrorMessage', () => {
  it('rewrites the iOS AudioSession capture error', () => {
    const msg = listenErrorMessage(new Error('AudioSession category is not compatible with audio capture.'));
    expect(msg.toLowerCase()).toContain('mic');
    expect(msg.toLowerCase()).not.toContain('audiosession category is not compatible');
  });
  it('rewrites permission denials', () => {
    expect(listenErrorMessage(new Error('NotAllowedError: Permission denied')).toLowerCase()).toContain('permission');
  });
  it('passes through unknown errors', () => {
    expect(listenErrorMessage(new Error('weird failure'))).toBe('weird failure');
  });
});
