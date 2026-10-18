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
    const tx = db.transaction(STORE, mode)
    const req = fn(tx.objectStore(STORE))
    tx.oncomplete = () => resolve(req.result)
    tx.onabort = () => reject(tx.error ?? new Error('Scan storage failed'))
    tx.onerror = () => reject(tx.error ?? new Error('Scan storage failed'))
  })
}

export async function putScanBlob(id: string, blob: Blob): Promise<void> {
  const db = await open()
  if (!db) { memory.set(id, blob); return }
  try {
    await run(db, 'readwrite', (s) => s.put(blob, id))
    memory.delete(id)
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
    return blob ?? null
  } catch {
    return null
  } finally {
    db.close()
  }
}

/** Only for failed bundle staging; removing a section does not delete saved worlds' assets. */
export async function deleteScanBlob(id: string): Promise<void> {
  memory.delete(id)
  const db = await open()
  if (!db) return
  try { await run(db, 'readwrite', (s) => s.delete(id)) } catch { /* Best-effort rollback. */ } finally { db.close() }
}
