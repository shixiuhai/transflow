export interface GlossaryEntry {
  source: string;
  target: string;
}

const TOKEN = (index: number) => `[[G${index}]]`;

/**
 * Replace glossary source terms with stable ASCII tokens before sending text to
 * a provider, then restore them as the configured target terms. Matching is
 * case-insensitive and longest-first to avoid partial overlaps.
 */
export function protectTerms(text: string, entries: GlossaryEntry[]): string {
  if (!entries.length) return text;
  const ordered = entries
    .map((entry, index) => ({ ...entry, index }))
    .filter((entry) => entry.source.trim().length > 0)
    .sort((a, b) => b.source.length - a.source.length);

  let output = text;
  for (const entry of ordered) {
    const escaped = entry.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    output = output.replace(new RegExp(escaped, 'gi'), TOKEN(entry.index));
  }
  return output;
}

export function restoreTerms(text: string, entries: GlossaryEntry[]): string {
  if (!entries.length) return text;
  return text.replace(/\[\[\s*G\s*(\d+)\s*\]\]/gi, (match, rawIndex: string) => {
    const entry = entries[Number(rawIndex)];
    return entry?.target ?? match;
  });
}

export function parseGlossary(input: string): GlossaryEntry[] {
  return input
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const [source, ...rest] = line.split(/[=,，\t]/);
      return { source: (source ?? '').trim(), target: rest.join(',').trim() };
    })
    .filter((entry) => entry.source && entry.target);
}

export function formatGlossary(entries: GlossaryEntry[]): string {
  return entries.map((entry) => `${entry.source}=${entry.target}`).join('\n');
}
