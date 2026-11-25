import { describe, expect, it } from 'vitest';
import { formatGlossary, parseGlossary, protectTerms, restoreTerms } from '../../src/core/glossary';

const entries = [
  { source: 'transformer', target: '变换器' },
  { source: 'RAG', target: '检索增强生成' },
];

describe('glossary', () => {
  it('protects terms case-insensitively', () => {
    const protectedText = protectTerms('A Transformer and a rag.', entries);
    expect(protectedText).toBe('A [[G0]] and a [[G1]].');
  });

  it('restores tokens to target terms', () => {
    const text = 'A [[G0]] and a [[G 1]].';
    expect(restoreTerms(text, entries)).toBe('A 变换器 and a 检索增强生成.');
  });

  it('prefers longer matches', () => {
    const long = [{ source: 'New York', target: '纽约' }, { source: 'York', target: '约克' }];
    expect(protectTerms('New York City', long)).toBe('[[G0]] City');
  });

  it('parses and formats lines', () => {
    const parsed = parseGlossary('Transformer=变换器\n# comment\nRAG,检索增强生成');
    expect(parsed).toEqual([
      { source: 'Transformer', target: '变换器' },
      { source: 'RAG', target: '检索增强生成' },
    ]);
    expect(formatGlossary(parsed)).toContain('Transformer=变换器');
  });
});
