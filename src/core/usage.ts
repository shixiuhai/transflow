const KEY = 'tf:usage';

export interface UsageRecord {
  month: string;
  total: number;
  byProvider: Record<string, number>;
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export async function getUsage(): Promise<UsageRecord> {
  const stored = (await chrome.storage.local.get(KEY))[KEY] as UsageRecord | undefined;
  if (!stored || stored.month !== currentMonth()) {
    return { month: currentMonth(), total: 0, byProvider: {} };
  }
  return stored;
}

export async function recordUsage(provider: string, chars: number): Promise<void> {
  if (chars <= 0) return;
  const usage = await getUsage();
  usage.total += chars;
  usage.byProvider[provider] = (usage.byProvider[provider] ?? 0) + chars;
  await chrome.storage.local.set({ [KEY]: usage });
}

export async function resetUsage(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}

/** Very rough estimate for the built-in providers (CNY). */
export function estimateCost(provider: string, chars: number): number {
  const million = 1_000_000;
  if (provider === 'volc') return Math.max(0, chars - 2 * million) * (49 / million);
  if (provider === 'baidu') return Math.max(0, chars - 1 * million) * (49 / million);
  if (provider === 'aliyun') return Math.max(0, chars - 1 * million) * (50 / million);
  return 0;
}
