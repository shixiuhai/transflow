import { describe, expect, it } from 'vitest';
import { formatShortcut, matchesShortcut, normalizeShortcut } from '../../src/core/shortcut';

const base = { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false };

describe('shortcut', () => {
  it('normalizes single letters and combinations', () => {
    expect(normalizeShortcut({ ...base, key: 't' })).toBe('t');
    expect(normalizeShortcut({ ...base, key: 'T', shiftKey: true })).toBe('shift+t');
    expect(normalizeShortcut({ ...base, key: 'S', altKey: true })).toBe('alt+s');
    expect(normalizeShortcut({ ...base, key: 'k', ctrlKey: true, shiftKey: true })).toBe('ctrl+shift+k');
  });

  it('ignores modifier-only keys and escape', () => {
    expect(normalizeShortcut({ ...base, key: 'Shift', shiftKey: true })).toBeNull();
    expect(normalizeShortcut({ ...base, key: 'Escape' })).toBeNull();
  });

  it('matches strictly on modifiers', () => {
    expect(matchesShortcut({ ...base, key: 't' }, 't')).toBe(true);
    expect(matchesShortcut({ ...base, key: 't', shiftKey: true }, 't')).toBe(false);
    expect(matchesShortcut({ ...base, key: 'T', altKey: true }, 'alt+t')).toBe(true);
  });

  it('formats for humans', () => {
    expect(formatShortcut('alt+s')).toBe('Alt + S');
    expect(formatShortcut('ctrl+shift+k')).toBe('Ctrl + Shift + K');
  });
});
