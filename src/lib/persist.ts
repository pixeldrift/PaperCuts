import { SAMPLE_SOURCES, sampleClips } from '../data/sample'
import { useStore } from '../store'
import type { Clip, Source } from '../types'
import { getMedia, kvGet, kvSet, loadSources, mediaKey, saveSourceRecord, toStored, type StoredSource, type StoredEdit } from './db'

/** Edits to sample sources (their transcripts are regenerated from code, so changes are stored as overrides). */
type Overrides = Record<string, Partial<StoredSource>>

let started: Promise<void> | null = null

/** Load sources + the saved edit from IndexedDB, then autosave changes. */
export function initPersistence() {
  started ??= run()
  return started
}

/** Stored record → live source, recreating blob URLs for every angle that has a stored file. */
async function realize(stored: StoredSource): Promise<Source> {
  const url = async (key: string, has: boolean) => {
    if (!has) return undefined
    const blob = await getMedia(key)
    return blob ? URL.createObjectURL(blob) : undefined
  }
  const { hasMedia, extraAngles, ...rest } = stored
  const mediaUrl = await url(mediaKey(stored.id), hasMedia)
  const extras = await Promise.all(
    (extraAngles ?? []).map(async ({ hasMedia: has, ...a }) => ({ ...a, mediaUrl: await url(mediaKey(stored.id, a.id), has) })),
  )
  return { ...rest, mediaUrl, extraAngles: extras.length ? extras : undefined }
}

async function run() {
  try {
    const [stored, edit, removed, legacyText, overrides] = await Promise.all([
      loadSources(),
      kvGet<StoredEdit>('edit'),
      kvGet<string[]>('removedSamples'),
      kvGet<Overrides>('sampleText'), // v1: transcript-only overrides
      kvGet<Overrides>('sampleOverrides'),
    ])
    const hidden = new Set(removed ?? [])
    const over: Overrides = { ...legacyText, ...overrides }

    const imported = await Promise.all(stored.map(realize))
    const samples = await Promise.all(
      SAMPLE_SOURCES.filter((s) => !hidden.has(s.id)).map((s) => (over[s.id] ? realize({ ...toStored(s), ...over[s.id] }) : s)),
    )
    let sources = [...samples, ...imported]
    if (!sources.length) sources = [...SAMPLE_SOURCES]

    let clips: Clip[]
    let name = 'Episode 01'
    if (edit) {
      clips = edit.clips
      name = edit.name
    } else {
      clips = migrateLegacy() ?? sampleClips()
    }
    clips = clips
      .filter((c) => sources.some((s) => s.id === c.sourceId))
      .map((c) => ({ ...c, notes: (c.notes ?? []).map((n, i) => ({ ...n, id: n.id ?? `n${i}-${c.id}` })) }))

    const { selectedSourceId } = useStore.getState()
    useStore.setState({
      sources,
      clips,
      editName: name,
      selectedSourceId: sources.some((s) => s.id === selectedSourceId) ? selectedSourceId : sources[0].id,
      hydrated: true,
    })
  } catch (err) {
    console.error('Persistence unavailable, running in-memory', err)
    useStore.setState({ clips: sampleClips(), hydrated: true })
  }

  // autosave source changes (transcript text, meta, angles) — debounced
  const dirty = new Set<string>()
  let sourceTimer: ReturnType<typeof setTimeout> | undefined
  const flushSources = async () => {
    const ids = [...dirty]
    dirty.clear()
    for (const id of ids) {
      const src = useStore.getState().sources.find((x) => x.id === id)
      if (!src) continue
      try {
        if (SAMPLE_SOURCES.some((x) => x.id === id)) {
          const all = (await kvGet<Overrides>('sampleOverrides')) ?? {}
          await kvSet('sampleOverrides', { ...all, [id]: toStored(src) })
        } else {
          await saveSourceRecord(src)
        }
      } catch {
        useStore.getState().toast('Couldn’t save changes (storage unavailable)')
      }
    }
  }
  useStore.subscribe((s, prev) => {
    if (s.sources === prev.sources) return
    for (const src of s.sources) {
      const old = prev.sources.find((x) => x.id === src.id)
      if (old && old !== src) dirty.add(src.id)
    }
    if (!dirty.size) return
    clearTimeout(sourceTimer)
    sourceTimer = setTimeout(() => void flushSources(), 400)
  })

  // autosave the edit (debounced)
  let timer: ReturnType<typeof setTimeout> | undefined
  useStore.subscribe((s, prev) => {
    if (s.clips === prev.clips && s.editName === prev.editName) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      const { editName, clips } = useStore.getState()
      kvSet('edit', { name: editName, clips } satisfies StoredEdit).catch(() => {})
    }, 400)
  })
}

/** Edits saved by the first version lived in localStorage. */
function migrateLegacy(): Clip[] | null {
  try {
    const raw = localStorage.getItem('papercuts.edit')
    return raw ? (JSON.parse(raw) as { clips: Clip[] }).clips : null
  } catch {
    return null
  }
}
