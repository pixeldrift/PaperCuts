import { SAMPLE_SOURCES, sampleClips } from '../data/sample'
import { useStore } from '../store'
import type { Clip } from '../types'
import { kvGet, kvSet, loadSources, saveSourceText, type StoredEdit } from './db'
import type { Source } from '../types'

type SampleText = Record<string, Pick<Source, 'words' | 'sentences'>>

let started: Promise<void> | null = null

/** Load sources + the saved edit from IndexedDB, then autosave edit changes. */
export function initPersistence() {
  started ??= run()
  return started
}

async function run() {
  try {
    const [stored, edit, removed, sampleText] = await Promise.all([
      loadSources(),
      kvGet<StoredEdit>('edit'),
      kvGet<string[]>('removedSamples'),
      kvGet<SampleText>('sampleText'),
    ])
    const hidden = new Set(removed ?? [])
    const imported = stored.map(({ src, blob }) => {
      const { hasMedia: _h, ...rest } = src
      return { ...rest, mediaUrl: blob ? URL.createObjectURL(blob) : undefined }
    })
    // sample transcripts are regenerated from code, so edits to them are stored as overrides
    const samples = SAMPLE_SOURCES.filter((s) => !hidden.has(s.id)).map((s) => (sampleText?.[s.id] ? { ...s, ...sampleText[s.id] } : s))
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

  // autosave edited transcript text (debounced)
  const dirty = new Set<string>()
  let textTimer: ReturnType<typeof setTimeout> | undefined
  const flushText = async () => {
    const ids = [...dirty]
    dirty.clear()
    for (const id of ids) {
      const src = useStore.getState().sources.find((x) => x.id === id)
      if (!src) continue
      try {
        if (SAMPLE_SOURCES.some((x) => x.id === id)) {
          const all = (await kvGet<SampleText>('sampleText')) ?? {}
          await kvSet('sampleText', { ...all, [id]: { words: src.words, sentences: src.sentences } })
        } else {
          await saveSourceText(src)
        }
      } catch {
        useStore.getState().toast('Couldn’t save transcript changes (storage unavailable)')
      }
    }
  }
  useStore.subscribe((s, prev) => {
    if (s.sources === prev.sources) return
    for (const src of s.sources) {
      const old = prev.sources.find((x) => x.id === src.id)
      if (old && old.words !== src.words) dirty.add(src.id)
    }
    if (!dirty.size) return
    clearTimeout(textTimer)
    textTimer = setTimeout(() => void flushText(), 400)
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
