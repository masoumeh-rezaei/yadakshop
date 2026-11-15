import { deliverCompletionOnce, readDeliveryLedger, updateDeliveryLedger, type AlertDelivery } from './completionDelivery';

let opening: Promise<IDBDatabase | null> | null = null;
function openStore() {
  if (opening) return opening;
  opening = new Promise<IDBDatabase | null>(resolve => {
    let settled = false;
    const finish = (database: IDBDatabase | null) => {
      if (settled) { database?.close(); return; }
      settled = true; window.clearTimeout(timer); resolve(database);
    };
    const timer = window.setTimeout(() => finish(null), 2000);
    try {
      const request = indexedDB.open('delivery-completion-alerts', 1);
      request.onupgradeneeded = () => { request.result.createObjectStore('deliveries'); };
      request.onerror = () => finish(null);
      request.onblocked = () => finish(null);
      request.onsuccess = () => {
        request.result.onversionchange = () => { request.result.close(); opening = null; };
        finish(request.result);
      };
    } catch { finish(null); }
  });
  return opening;
}

/** An IndexedDB read/write transaction serializes reads and writes across renderer processes. */
export async function deliverCompletionAcrossTabs(scope: string, key: string, deliver: (remaining: AlertDelivery) => AlertDelivery) {
  let storage: Storage | null = null;
  try { storage = localStorage; } catch {}
  const database = await openStore();
  let actionStarted = false;
  let delivered = { sound: false, desktop: false };
  if (database) try {
    return await new Promise<AlertDelivery>((resolve, reject) => {
      const transaction = database.transaction('deliveries', 'readwrite');
      const store = transaction.objectStore('deliveries');
      const request = store.get(scope);
      request.onsuccess = () => {
        try {
          let saved: unknown = request.result;
          if (saved === undefined) try { saved = JSON.parse(storage?.getItem(scope) || 'null'); } catch {}
          const next = updateDeliveryLedger(readDeliveryLedger(saved), key, remaining => {
            actionStarted = true; return deliver(remaining);
          });
          delivered = next.result; store.put(next.entries, scope);
          // Older panel versions understand this desktop-only list as well.
          transaction.oncomplete = () => {
            try { storage?.setItem(scope, JSON.stringify(next.entries.filter(entry => entry.desktop).map(entry => entry.key))); } catch {}
            resolve(delivered);
          };
        } catch (error) { transaction.abort(); reject(error); }
      };
      transaction.onabort = () => reject(new Error('Alert transaction aborted'));
      transaction.onerror = () => reject(new Error('Alert storage unavailable'));
    });
  } catch {
    // Never repeat a sound/notification that was already emitted before a storage failure.
    if (actionStarted) return delivered;
  }
  const withLock = typeof navigator.locks?.request === 'function'
    ? (name: string, action: () => AlertDelivery) => navigator.locks.request(name, action) : undefined;
  return deliverCompletionOnce(scope, key, deliver, storage, withLock);
}
