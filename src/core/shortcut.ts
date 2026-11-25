export interface ShortcutEventLike {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

const MODIFIER_KEYS = new Set(['control', 'alt', 'shift', 'meta', 'capslock', 'os']);

/** Normalize a keyboard event into a stable string such as `alt+s` or `t`. */
export function normalizeShortcut(event: ShortcutEventLike): string | null {
  if (!event.key || event.key === 'Escape' || MODIFIER_KEYS.has(event.key.toLowerCase())) return null;
  let key = event.key.toLowerCase();
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
    .map((part) => LABELS[part] ?? part.toUpperCase())
    .join(' + ');
}
