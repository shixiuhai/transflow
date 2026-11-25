import type { VocabItem, VocabRemote, VocabState } from './types';

export const DEFAULT_SYNC_URL = 'https://transflow.yizhiweb.top/transflow';

export function mergeVocab(
  local: VocabState,
  remote: VocabRemote,
): Pick<VocabState, 'items' | 'deleted'> {
  const items = new Map<string, VocabItem>();
  for (const item of local.items) items.set(item.id, item);
  for (const item of remote.items ?? []) {
    const existing = items.get(item.id);
    if (!existing || item.updatedAt >= existing.updatedAt) items.set(item.id, item);
  }
  const deleted: Record<string, number> = { ...local.deleted };
  for (const [id, at] of Object.entries(remote.deleted ?? {})) {
    deleted[id] = Math.max(deleted[id] ?? 0, at);
  }
  for (const [id, at] of Object.entries(deleted)) {
    const item = items.get(id);
    if (item && at >= item.updatedAt) items.delete(id);
  }
  return { items: Array.from(items.values()), deleted };
}

export async function syncVocab(state: VocabState, syncUrl = DEFAULT_SYNC_URL): Promise<VocabState> {
  const response = await fetch(`${syncUrl.replace(/\/$/, '')}/vocab/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Transflow-Id': state.uuid,
      'X-Client-Version': 'transflow-extension/1.4.0',
    },
    body: JSON.stringify({
      protocol: 1,
      lastSyncAt: state.sync.lastSyncAt,
      items: state.items,
      deleted: state.deleted,
    }),
    signal: AbortSignal.timeout(15000),
  });

  const json = (await response.json().catch(() => null)) as
    | { code?: number; msg?: string; data?: VocabRemote }
    | null;
  if (!response.ok || !json || json.code !== 200 || !json.data) {
    throw new Error(json?.msg || `同步失败（${response.status}）`);
  }

  const merged = mergeVocab(state, json.data);
  return {
    ...state,
    ...merged,
    sync: {
      ...state.sync,
      lastSyncAt: Date.now(),
      lastError: undefined,
    },
  };
}
