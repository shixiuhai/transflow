export interface BatchOptions {
  maxItems: number;
  maxChars: number;
}

/**
 * Greedy batching that respects both an item cap and a character cap.
 * Items larger than maxChars are kept alone (the provider adapter is
 * responsible for rejecting or splitting them).
 */
export function buildBatches<T extends { text: string }>(items: T[], opts: BatchOptions): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let chars = 0;

  for (const item of items) {
    const len = item.text.length;
    const wouldOverflow = current.length > 0 && (current.length >= opts.maxItems || chars + len > opts.maxChars);
    if (wouldOverflow) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(item);
    chars += len;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** Stable ids for unique strings, keeping the first occurrence order. */
export function uniqueByText<T extends { text: string }>(items: T[]): { items: T[]; index: Map<string, number> } {
  const seen = new Map<string, number>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.text)) continue;
    seen.set(item.text, out.length);
    out.push(item);
  }
  return { items: out, index: seen };
}
