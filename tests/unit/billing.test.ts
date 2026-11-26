import { describe, expect, it } from 'vitest';
import { parseVolcBilling } from '../../src/core/usage/billing';

describe('volc billing parse', () => {
  it('sums account and translation amounts', () => {
    const result = parseVolcBilling({
      Result: {
        List: [
          { Product: 'TTS', ProductZh: '语音合成', PayableAmount: '8.19', Currency: 'CNY' },
          { Product: 'Translate', ProductZh: '机器翻译', PayableAmount: '1.50', Currency: 'CNY' },
        ],
      },
    }, '2026-11');
    expect(result.total).toBeCloseTo(9.69);
    expect(result.translationTotal).toBeCloseTo(1.5);
    expect(result.hasTranslationLine).toBe(true);
    expect(result.lines).toHaveLength(2);
  });

  it('reports no translation line when everything is in free tier', () => {
    const result = parseVolcBilling({ Result: { List: [] } }, '2026-11');
    expect(result.total).toBe(0);
    expect(result.hasTranslationLine).toBe(false);
  });
});
