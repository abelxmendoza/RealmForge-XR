/**
 * On-device storage for scan models. Scans run to tens of megabytes, far past localStorage, so they
 * live in IndexedDB keyed by id. When IndexedDB is unavailable (private mode, tests) they are kept
 * in memory for the session instead. Files are never deleted automatically: another saved world
 * may still use the same scan.
 */
const DB = 'realmforge-scans'
const STORE = 'models'
const memory = new Map<string, Blob>()

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

function run<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Scan storage failed'))
  })
}

export async function putScanBlob(id: string, blob: Blob): Promise<void> {
  memory.set(id, blob)
  const db = await open()
  if (!db) return
  try {
    await run(db, 'readwrite', (s) => s.put(blob, id))
  } finally {
    db.close()
  }
}

export async function getScanBlob(id: string): Promise<Blob | null> {
  const cached = memory.get(id)
  if (cached) return cached
  const db = await open()
  if (!db) return null
  try {
    const blob = await run<Blob | undefined>(db, 'readonly', (s) => s.get(id))
    if (blob) memory.set(id, blob)
    return blob ?? null
  } catch {
    return null
  } finally {
    db.close()
  }
}
