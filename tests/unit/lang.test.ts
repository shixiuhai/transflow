import { describe, expect, it } from 'vitest';
import { fromProviderCode, guessTargetForText, toProviderCode } from '../../src/core/lang';

describe('language mapping', () => {
  it('maps internal codes to volc codes', () => {
    expect(toProviderCode('zh', 'volc')).toBe('zh');
    expect(toProviderCode('zh-TW', 'volc')).toBe('zh-Hant');
    expect(toProviderCode('auto', 'volc')).toBe('');
  });

  it('maps internal codes to baidu codes', () => {
    expect(toProviderCode('ja', 'baidu')).toBe('jp');
    expect(toProviderCode('ko', 'baidu')).toBe('kor');
    expect(toProviderCode('zh-TW', 'baidu')).toBe('cht');
  });

  it('normalizes detected provider codes', () => {
    expect(fromProviderCode('zh-CN', 'google')).toBe('zh');
    expect(fromProviderCode('zh-TW', 'google')).toBe('zh-TW');
    expect(fromProviderCode('jp', 'baidu')).toBe('ja');
  });

  it('guesses a target for input translation', () => {
    expect(guessTargetForText('hello world')).toBe('zh');
    expect(guessTargetForText('你好，世界')).toBe('en');
  });
});
