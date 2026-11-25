import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normalizeSettings } from '../../src/core/settings/schema';

describe('settings merge', () => {
  it('returns defaults for empty input', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('merges nested patches without dropping defaults', () => {
    const settings = normalizeSettings({ language: { target: 'ja' } });
    expect(settings.language.target).toBe('ja');
    expect(settings.language.source).toBe('auto');
    expect(settings.provider.active).toBe('mock');
  });

  it('keeps unknown provider configs', () => {
    const settings = normalizeSettings({ provider: { active: 'volc', configs: { volc: { accessKey: 'x' } } } });
    expect(settings.provider.configs.volc?.accessKey).toBe('x');
    expect(settings.provider.fallback).toEqual([]);
  });
});
