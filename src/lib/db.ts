import { PRIMARY_ANGLE, type Angle, type Clip, type Source } from '../types'

/**
 * Tiny IndexedDB wrapper (no dependencies).
 *   sources: imported sources' metadata + shared transcript, keyed by id (no blob URLs —
 *            those don't survive reloads; `hasMedia` flags say which angles have a stored file)
 *   media:   the original File/Blob per angle: key = sourceId (primary) or `sourceId::angleId`
 *   kv:      small settings — the current edit, sample-source overrides, removed samples…
 */
const NAME = 'papercuts'
const VERSION = 1

export type StoredAngle = Omit<Angle, 'mediaUrl'> & { hasMedia: boolean }
export type StoredSource = Omit<Source, 'mediaUrl' | 'extraAngles'> & { hasMedia: boolean; extraAngles?: StoredAngle[] }
export interface StoredEdit {
  name: string
  clips: Clip[]
}

export const mediaKey = (sourceId: string, angleId?: string) =>
  angleId && angleId !== PRIMARY_ANGLE ? `${sourceId}::${angleId}` : sourceId

/** Strip session-only blob URLs, noting which angles have stored media. */
export function toStored(src: Source): StoredSource {
  const { mediaUrl, extraAngles, ...rest } = src
  return {
    ...rest,
    hasMedia: !!mediaUrl,
    extraAngles: extraAngles?.map(({ mediaUrl: u, ...a }) => ({ ...a, hasMedia: !!u })),
  }
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

/** Save an imported source's record (and, if given, its primary media file). */
export async function saveSource(src: Source, file?: Blob) {
  await tx(['sources', 'media'], 'readwrite', (t) => {
    t.objectStore('sources').put(toStored(src))
    if (file) t.objectStore('media').put(file, src.id)
  })
}

/** Update a record without touching any media (transcript text, meta, angle list). */
export async function saveSourceRecord(src: Source) {
  await tx('sources', 'readwrite', (t) => void t.objectStore('sources').put(toStored(src)))
}

export const saveMedia = (key: string, blob: Blob) =>
  tx('media', 'readwrite', (t) => void t.objectStore('media').put(blob, key))

export const getMedia = (key: string) => tx<Blob | undefined>('media', 'readonly', (t) => t.objectStore('media').get(key))

/** Re-key a stored media file (used when angles are synced into / split out of a source). */
export async function moveMedia(from: string, to: string) {
  const blob = await getMedia(from)
  if (!blob) return
  await tx('media', 'readwrite', (t) => {
    t.objectStore('media').put(blob, to)
    t.objectStore('media').delete(from)
  })
}

/** Remove a source record and every angle's media (`id` and `id::*`). */
export async function deleteSource(id: string) {
  await tx(['sources', 'media'], 'readwrite', (t) => {
    t.objectStore('sources').delete(id)
    t.objectStore('media').delete(id)
    t.objectStore('media').delete(IDBKeyRange.bound(`${id}::`, `${id}::￿`))
  })
}

export const deleteMedia = (key: string) => tx('media', 'readwrite', (t) => void t.objectStore('media').delete(key))

export async function loadSources(): Promise<StoredSource[]> {
  return (await tx<StoredSource[]>('sources', 'readonly', (t) => t.objectStore('sources').getAll())) ?? []
}
