export interface ShortcutEventLike {
  key: string;
  code?: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

const MODIFIER_KEYS = new Set(['control', 'alt', 'shift', 'meta', 'capslock', 'os']);

/** Normalize a keyboard event into a stable string such as `alt+s` or `t`. */
export function normalizeShortcut(event: ShortcutEventLike): string | null {
  let rawKey = event.key;
  // IMEs report Process/Unidentified for the physical key; fall back to `code`.
  if (!rawKey || rawKey === 'Process' || rawKey === 'Unidentified') {
    if (event.code?.startsWith('Key')) rawKey = event.code.slice(3).toLowerCase();
    else if (event.code?.startsWith('Digit')) rawKey = event.code.slice(5);
    else return null;
  }
  if (rawKey === 'Escape' || MODIFIER_KEYS.has(rawKey.toLowerCase())) return null;
  let key = rawKey.toLowerCase();
  if (key === ' ') key = 'space';
  if (key === '+') key = 'plus';
  const parts: string[] = [];
  if (event.ctrlKey) parts.push('ctrl');
  if (event.altKey) parts.push('alt');
  if (event.shiftKey) parts.push('shift');
  if (event.metaKey) parts.push('meta');
  parts.push(key);
  return parts.join('+');
}

export function matchesShortcut(event: ShortcutEventLike, shortcut: string): boolean {
  const normalized = normalizeShortcut(event);
  return normalized !== null && normalized === shortcut.toLowerCase();
}

const LABELS: Record<string, string> = {
  ctrl: 'Ctrl',
  alt: 'Alt',
  shift: 'Shift',
  meta: '⌘',
  space: 'Space',
  plus: '+',
};

export function formatShortcut(shortcut: string): string {
  if (!shortcut) return '';
  return shortcut
    .split('+')
    .map((part) => {
      if (LABELS[part]) return LABELS[part];
      return part.length === 1 ? part.toLowerCase() : part.toUpperCase();
    })
    .join(' + ');
}
