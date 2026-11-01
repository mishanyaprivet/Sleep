/** Minimal IndexedDB blob store for audio clips (stays on this device). */
const DB = 'lumen-audio';
const STORE = 'clips';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => {
      db.close();
      resolve(req ? (req.result as T) : undefined);
    };
    t.onerror = () => reject(t.error);
  });
}

export const clipStore = {
  put: (id: string, blob: Blob) => tx('readwrite', (s) => void s.put(blob, id)),
  get: (id: string) => tx<Blob>('readonly', (s) => s.get(id)).then((b) => b ?? null),
  delete: (ids: string[]) => tx('readwrite', (s) => void ids.forEach((id) => s.delete(id))),
  keys: () => tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys()).then((k) => (k ?? []).map(String)),
  clear: () => tx('readwrite', (s) => void s.clear()),
};
