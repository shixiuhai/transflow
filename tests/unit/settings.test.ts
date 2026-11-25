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

  it('migrates the old alt+s default to lowercase t', () => {
    const settings = normalizeSettings({
      version: 1,
      selection: { enabled: true, target: 'zh', trigger: 'both', keys: 'alt+s' },
    });
    expect(settings.selection.keys).toBe('t');
    expect(settings.version).toBe(2);
  });

  it('keeps a customized shortcut', () => {
    const settings = normalizeSettings({
      version: 1,
      selection: { enabled: true, target: 'zh', trigger: 'both', keys: 'r' },
    });
    expect(settings.selection.keys).toBe('r');
  });

  it('keeps unknown provider configs', () => {
    const settings = normalizeSettings({ provider: { active: 'volc', configs: { volc: { accessKey: 'x' } } } });
    expect(settings.provider.configs.volc?.accessKey).toBe('x');
    expect(settings.provider.fallback).toEqual([]);
  });
});
