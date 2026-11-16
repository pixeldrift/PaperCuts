import type { Clip, Source } from '../types'

/**
 * Tiny IndexedDB wrapper (no dependencies).
 *   sources: Source metadata + transcript, keyed by id (no mediaUrl — blob URLs don't survive reloads)
 *   media:   the original File/Blob, keyed by source id
 *   kv:      small settings, e.g. the current edit
 */
const NAME = 'papercuts'
const VERSION = 1

export type StoredSource = Omit<Source, 'mediaUrl'> & { hasMedia: boolean }
export interface StoredEdit {
  name: string
  clips: Clip[]
}

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      db.createObjectStore('sources', { keyPath: 'id' })
      db.createObjectStore('media')
      db.createObjectStore('kv')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

async function tx<T>(
  stores: string | string[],
  mode: IDBTransactionMode,
  run: (t: IDBTransaction) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode)
    const req = run(t)
    t.oncomplete = () => resolve(req ? req.result : undefined)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error ?? new Error('Transaction aborted'))
  })
}

export const kvGet = <T>(key: string) => tx<T>('kv', 'readonly', (t) => t.objectStore('kv').get(key))
export const kvSet = (key: string, value: unknown) =>
  tx('kv', 'readwrite', (t) => void t.objectStore('kv').put(value, key))

export async function saveSource(src: Source, file?: Blob) {
  const { mediaUrl: _drop, ...rest } = src
  const record: StoredSource = { ...rest, hasMedia: !!file }
  await tx(['sources', 'media'], 'readwrite', (t) => {
    t.objectStore('sources').put(record)
    if (file) t.objectStore('media').put(file, src.id)
  })
}

/** Save edited transcript text for an existing source, keeping its stored media link. */
export async function saveSourceText(src: Source) {
  const db = await open()
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction('sources', 'readwrite')
    const store = t.objectStore('sources')
    const get = store.get(src.id)
    get.onsuccess = () => {
      const existing = get.result as StoredSource | undefined
      const { mediaUrl: _drop, ...rest } = src
      store.put({ ...rest, hasMedia: existing?.hasMedia ?? false } satisfies StoredSource)
    }
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })
}

export async function deleteSource(id: string) {
  await tx(['sources', 'media'], 'readwrite', (t) => {
    t.objectStore('sources').delete(id)
    t.objectStore('media').delete(id)
  })
}

export async function loadSources(): Promise<{ src: StoredSource; blob?: Blob }[]> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const t = db.transaction(['sources', 'media'], 'readonly')
    const all = t.objectStore('sources').getAll()
    const media = t.objectStore('media')
    const out: { src: StoredSource; blob?: Blob }[] = []
    all.onsuccess = () => {
      for (const src of all.result as StoredSource[]) {
        const entry: { src: StoredSource; blob?: Blob } = { src }
        out.push(entry)
        if (src.hasMedia) {
          media.get(src.id).onsuccess = (e) => {
            entry.blob = (e.target as IDBRequest<Blob | undefined>).result
          }
        }
      }
    }
    t.oncomplete = () => resolve(out)
    t.onerror = () => reject(t.error)
  })
}
