export interface AlertDelivery { sound: boolean; desktop: boolean }
export interface DeliveryEntry extends AlertDelivery { key: string }
interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
type WithLock = (name: string, action: () => AlertDelivery) => Promise<AlertDelivery>;
const memory = new Map<string, DeliveryEntry[]>();

export function readDeliveryLedger(saved: unknown): DeliveryEntry[] {
  return Array.isArray(saved) ? saved.slice(-200).flatMap((value): DeliveryEntry[] => {
    if (typeof value === 'string' && /^\d+:\d+$/.test(value)) return [{ key: value, sound: true, desktop: true }];
    return value && typeof value.key === 'string' && /^\d+:\d+$/.test(value.key)
      && typeof value.sound === 'boolean' && typeof value.desktop === 'boolean' ? [value] : [];
  }) : [];
}

export function updateDeliveryLedger(entries: DeliveryEntry[], key: string, deliver: (remaining: AlertDelivery) => AlertDelivery) {
  const previous = entries.find(entry => entry.key === key) || { key, sound: false, desktop: false };
  const sent = previous.sound && previous.desktop ? previous : deliver({ sound: !previous.sound, desktop: !previous.desktop });
  const next = { key, sound: previous.sound || sent.sound, desktop: previous.desktop || sent.desktop };
  return { entries: next.sound || next.desktop ? [...entries.filter(entry => entry.key !== key), next].slice(-200) : entries,
    result: { sound: next.sound, desktop: next.desktop } };
}

/** Claim sound and desktop separately, so an unarmed tab cannot consume another tab's sound. */
export async function deliverCompletionOnce(scope: string, key: string, deliver: (remaining: AlertDelivery) => AlertDelivery,
  storage: StorageLike | null, withLock?: WithLock): Promise<AlertDelivery> {
  let started = false;
  const action = () => {
    started = true;
    let entries = memory.get(scope) || [];
    try {
      const saved: unknown = JSON.parse(storage?.getItem(scope) || 'null');
      if (Array.isArray(saved)) entries = readDeliveryLedger(saved);
    } catch { /* In-memory deduplication remains available when storage is blocked. */ }
    const next = updateDeliveryLedger(entries, key, deliver);
    if (next.result.sound || next.result.desktop) {
      memory.set(scope, next.entries);
      try { storage?.setItem(scope, JSON.stringify(next.entries)); } catch {}
    }
    return next.result;
  };
  if (withLock) {
    try { return await withLock(scope, action); }
    catch (error) { if (started) throw error; }
  }
  return action();
}
