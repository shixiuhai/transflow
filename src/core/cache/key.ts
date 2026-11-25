/** Fast, deterministic 64-bit-ish hash (two FNV-1a passes) for cache keys. */
export function hashText(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= code + i;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  const a = (h1 >>> 0).toString(16).padStart(8, '0');
  const b = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${a}${b}${input.length.toString(16)}`;
}

export function cacheKey(provider: string, from: string, to: string, text: string): string {
  return `tf:cache:${provider}:${from}:${to}:${hashText(text)}`;
}
