import { create } from 'zustand'
import type { Clip, Note, Pane, Source, Tab, Word } from './types'
import { SAMPLE_SOURCES } from './data/sample'
import { deleteSource, kvGet, kvSet } from './lib/db'

export const FPS = 30
export const FRAME = 1000 / FPS

let counter = 0
const newId = () => `c${Date.now().toString(36)}${(counter++).toString(36)}`

// ───────────────────────── helpers ─────────────────────────

export function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s % 60)}`
}

/** mm:ss:ff style used for in/out ranges. */
export function fmtShort(ms: number) {
  const total = Math.max(0, ms)
  const s = Math.floor(total / 1000)
  const f = Math.floor((total % 1000) / FRAME)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}.${pad(f)}`
}

export function layout(clips: Clip[]) {
  let t = 0
  const starts = clips.map((c) => {
    const s = t
    t += c.outMs - c.inMs
    return s
  })
  return { starts, total: t }
}

/** Map a position on the edit timeline to a clip + position in its source. */
export function locate(clips: Clip[], editT: number) {
  if (!clips.length) return null
  const { starts, total } = layout(clips)
  const t = Math.min(Math.max(editT, 0), Math.max(total - 1, 0))
  let index = clips.length - 1
  for (let i = 0; i < clips.length; i++) {
    if (t >= starts[i] && t < starts[i] + (clips[i].outMs - clips[i].inMs)) {
      index = i
      break
    }
  }
  return { index, clip: clips[index], sourceT: clips[index].inMs + (t - starts[index]) }
}

/** Index of the word being spoken at time t (or the next one if in a pause). */
export function findWord(words: Word[], t: number) {
  let lo = 0
  let hi = words.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (words[mid].e <= t) lo = mid + 1
    else hi = mid
  }
  return lo
}

export function clipWords(src: Source, clip: Clip) {
  return src.words.filter((w) => w.s >= clip.inMs - 1 && w.e <= clip.outMs + 1)
}

// ───────────────────────── store ─────────────────────────

interface State {
  hydrated: boolean
  tab: Tab
  mobilePane: Pane
  sourcesOpen: boolean
  textScale: number

  sources: Source[]
  selectedSourceId: string
  /** Selected word range [first, last] in the active source transcript. */
  sourceSel: [number, number] | null

  editName: string
  clips: Clip[]
  selectedClipId: string | null
  past: Clip[][]
  future: Clip[][]

  mode: 'source' | 'edit'
  playing: boolean
  sourceT: number
  editT: number

  refine: { which: 'in' | 'out'; delta: number } | null
  /** The inline note editor that's open (noteId null = a new note). */
  editingNote: { clipId: string; noteId: string | null; kind: Note['kind'] } | null
  timelineZoom: number
  toastMsg: string | null

  // actions
  setTab: (t: Tab) => void
  setMobilePane: (p: Pane) => void
  setSourcesOpen: (o: boolean) => void
  zoomText: (dir: 1 | -1) => void
  selectSource: (id: string) => void
  setSourceSel: (sel: [number, number] | null) => void
  selectClip: (id: string | null) => void
  seekSource: (ms: number) => void
  seekEdit: (ms: number) => void
  setPlaying: (p: boolean, mode?: 'source' | 'edit') => void
  togglePlay: (mode: 'source' | 'edit') => void
  tick: (dt: number) => void
  setTimelineZoom: (z: number) => void
  toast: (msg: string) => void

  insert: () => void
  overwrite: () => void
  removeClip: () => void
  cut: () => void
  glue: () => void
  trim: (which: 'in' | 'out') => void
  trimDrag: (clipId: string, which: 'in' | 'out', ms: number) => void
  endTrimDrag: () => void
  openRefine: (which: 'in' | 'out' | null) => void
  nudge: (frames: number) => void
  addNote: (kind: Note['kind']) => void
  editNote: (clipId: string, note: Note) => void
  saveNote: (text: string) => void
  cancelNote: () => void
  deleteNote: (clipId: string, noteId: string) => void
  undo: () => void
  redo: () => void
  newEdit: () => void
  save: () => void
  removeSource: () => void
  addSources: (sources: Source[]) => void
}

/** Clips as they were when the current trim-drag began (for one undo step). */
let dragBase: Clip[] | null = null

let toastTimer: ReturnType<typeof setTimeout> | undefined

export const useStore = create<State>((set, get) => {
  /** Apply a clip-list change, recording undo history. */
  const commit = (clips: Clip[], selectedClipId?: string | null) =>
    set((s) => ({
      clips,
      past: [...s.past.slice(-99), s.clips],
      future: [],
      selectedClipId: selectedClipId === undefined ? s.selectedClipId : selectedClipId,
    }))

  const currentSource = () => {
    const s = get()
    return s.sources.find((x) => x.id === s.selectedSourceId)!
  }

  const selectionToClip = (): Clip | null => {
    const { sourceSel } = get()
    if (!sourceSel) {
      get().toast('Select some transcript text first')
      return null
    }
    const src = currentSource()
    const [a, b] = sourceSel
    return {
      id: newId(),
      sourceId: src.id,
      inMs: src.words[a].s,
      outMs: src.words[b].e,
      notes: [],
    }
  }

  const clearNativeSelection = () => window.getSelection()?.removeAllRanges()

  return {
    hydrated: false,
    tab: 'edits',
    mobilePane: 'edit',
    sourcesOpen: false,
    textScale: 1,

    sources: SAMPLE_SOURCES,
    selectedSourceId: 'src-jane',
    sourceSel: null,

    editName: 'Episode 01',
    clips: [],
    selectedClipId: null,
    past: [],
    future: [],

    mode: 'source',
    playing: false,
    sourceT: 0,
    editT: 0,

    refine: null,
    editingNote: null,
    timelineZoom: 14,
    toastMsg: null,

    setTab: (tab) => set({ tab }),
    setMobilePane: (mobilePane) => set({ mobilePane }),
    setSourcesOpen: (sourcesOpen) => set({ sourcesOpen }),
    zoomText: (dir) =>
      set((s) => ({ textScale: Math.min(1.7, Math.max(0.8, +(s.textScale + dir * 0.1).toFixed(2))) })),

    selectSource: (id) =>
      set({ selectedSourceId: id, sourceSel: null, sourceT: 0, playing: false, sourcesOpen: false }),
    setSourceSel: (sourceSel) => set({ sourceSel }),
    selectClip: (selectedClipId) => set({ selectedClipId, refine: null }),

    seekSource: (ms) => set({ sourceT: Math.max(0, Math.min(ms, currentSource().duration)), mode: 'source' }),
    seekEdit: (ms) => set({ editT: Math.max(0, ms), mode: 'edit' }),

    setPlaying: (playing, mode) => set((s) => ({ playing, mode: mode ?? s.mode })),
    togglePlay: (mode) => {
      const s = get()
      if (s.playing && s.mode === mode) return set({ playing: false })
      if (mode === 'edit') {
        const { total } = layout(s.clips)
        if (!total) return get().toast('The paper edit is empty — insert a selection first')
        if (s.editT >= total - 50) set({ editT: 0 })
      }
      set({ playing: true, mode })
    },
    tick: (dt) => {
      const s = get()
      if (!s.playing) return
      if (s.mode === 'source') {
        if (currentSource().mediaUrl) return // driven by the <video> in Viewer
        const end = currentSource().duration
        const t = s.sourceT + dt
        set(t >= end ? { sourceT: end, playing: false } : { sourceT: t })
      } else {
        const loc = locate(s.clips, s.editT)
        if (loc && s.sources.find((x) => x.id === loc.clip.sourceId)?.mediaUrl) return
        const { total } = layout(s.clips)
        const t = s.editT + dt
        set(t >= total ? { editT: total, playing: false } : { editT: t })
      }
    },
    setTimelineZoom: (timelineZoom) => set({ timelineZoom }),
    toast: (toastMsg) => {
      set({ toastMsg })
      clearTimeout(toastTimer)
      toastTimer = setTimeout(() => set({ toastMsg: null }), 2200)
    },

    insert: () => {
      const clip = selectionToClip()
      if (!clip) return
      const { clips, selectedClipId } = get()
      const at = clips.findIndex((c) => c.id === selectedClipId)
      const next = [...clips]
      next.splice(at < 0 ? clips.length : at + 1, 0, clip)
      commit(next, clip.id)
      set({ sourceSel: null })
      clearNativeSelection()
    },
    overwrite: () => {
      const clip = selectionToClip()
      if (!clip) return
      const { clips, selectedClipId } = get()
      const at = clips.findIndex((c) => c.id === selectedClipId)
      if (at < 0) {
        commit([...clips, clip], clip.id)
      } else {
        const next = [...clips]
        next[at] = clip
        commit(next, clip.id)
      }
      set({ sourceSel: null })
      clearNativeSelection()
    },
    removeClip: () => {
      const { clips, selectedClipId } = get()
      const at = clips.findIndex((c) => c.id === selectedClipId)
      if (at < 0) return get().toast('Select a clip to remove')
      const next = clips.filter((c) => c.id !== selectedClipId)
      commit(next, next[Math.min(at, next.length - 1)]?.id ?? null)
    },
    cut: () => {
      const s = get()
      const loc = locate(s.clips, s.editT)
      if (!loc) return get().toast('Nothing to cut')
      const src = s.sources.find((x) => x.id === loc.clip.sourceId)!
      const inside = clipWords(src, loc.clip)
      const k = inside.findIndex((w) => w.s >= loc.sourceT)
      if (k <= 0) return get().toast('Move the playhead inside a clip to cut it')
      const a: Clip = { ...loc.clip, id: newId(), outMs: inside[k - 1].e }
      const b: Clip = { ...loc.clip, id: newId(), inMs: inside[k].s, notes: [] }
      const next = [...s.clips]
      next.splice(loc.index, 1, a, b)
      commit(next, b.id)
    },
    glue: () => {
      const { clips, selectedClipId } = get()
      const at = clips.findIndex((c) => c.id === selectedClipId)
      const a = clips[at]
      const b = clips[at + 1]
      if (!a || !b) return get().toast('Select a clip that has another clip after it')
      const gap = b.inMs - a.outMs
      if (a.sourceId !== b.sourceId || gap < 0 || gap > 4000)
        return get().toast('Those clips aren’t adjacent in the same source')
      const merged: Clip = { ...a, id: newId(), outMs: b.outMs, notes: [...a.notes, ...b.notes] }
      const next = [...clips]
      next.splice(at, 2, merged)
      commit(next, merged.id)
    },
    trim: (which) => {
      const s = get()
      const loc = locate(s.clips, s.editT)
      const clip = s.clips.find((c) => c.id === s.selectedClipId)
      if (!clip || !loc || loc.clip.id !== clip.id)
        return get().toast('Put the playhead inside the selected clip first')
      const t = Math.round(loc.sourceT / FRAME) * FRAME
      const next = s.clips.map((c) =>
        c.id !== clip.id
          ? c
          : which === 'in'
            ? { ...c, inMs: Math.min(t, c.outMs - FRAME) }
            : { ...c, outMs: Math.max(t, c.inMs + FRAME) },
      )
      commit(next)
      // keep the playhead on the same frame after the layout shifts
      if (which === 'in') set({ editT: layout(next).starts[loc.index] })
    },
    trimDrag: (clipId, which, ms) => {
      const s = get()
      const clip = s.clips.find((c) => c.id === clipId)
      if (!clip) return
      const src = s.sources.find((x) => x.id === clip.sourceId)!
      dragBase ??= s.clips
      const next = s.clips.map((c) =>
        c.id !== clipId
          ? c
          : which === 'in'
            ? { ...c, inMs: Math.max(0, Math.min(ms, c.outMs - FRAME)) }
            : { ...c, outMs: Math.min(src.duration, Math.max(ms, c.inMs + FRAME)) },
      )
      set({ clips: next })
    },
    endTrimDrag: () => {
      const base = dragBase
      dragBase = null
      if (!base || base === get().clips) return
      set((s) => ({ past: [...s.past.slice(-99), base], future: [] }))
    },
    openRefine: (which) => {
      const s = get()
      if (which && !s.selectedClipId) return get().toast('Select a clip to refine')
      set({ refine: which ? { which, delta: 0 } : null })
    },
    nudge: (frames) => {
      const s = get()
      if (!s.refine || !s.selectedClipId) return
      const { which } = s.refine
      const clip = s.clips.find((c) => c.id === s.selectedClipId)!
      const src = s.sources.find((x) => x.id === clip.sourceId)!
      const delta = frames * FRAME
      const next = s.clips.map((c) => {
        if (c.id !== clip.id) return c
        if (which === 'in') return { ...c, inMs: Math.max(0, Math.min(c.inMs + delta, c.outMs - FRAME)) }
        return { ...c, outMs: Math.min(src.duration, Math.max(c.outMs + delta, c.inMs + FRAME)) }
      })
      commit(next)
      set({ refine: { which, delta: s.refine.delta + frames } })
    },
    addNote: (kind) => {
      const { selectedClipId } = get()
      if (!selectedClipId) return get().toast('Select a clip first')
      set({ editingNote: { clipId: selectedClipId, noteId: null, kind }, refine: null })
    },
    editNote: (clipId, note) => set({ editingNote: { clipId, noteId: note.id, kind: note.kind } }),
    cancelNote: () => set({ editingNote: null }),
    saveNote: (text) => {
      const edit = get().editingNote
      if (!edit) return // already cancelled (Esc) — the textarea's blur lands here too
      set({ editingNote: null })
      const body = text.trim()
      const { clips } = get()
      const next = clips.map((c) => {
        if (c.id !== edit.clipId) return c
        if (edit.noteId === null) {
          return body ? { ...c, notes: [...c.notes, { id: newId(), kind: edit.kind, text: body }] } : c
        }
        return {
          ...c,
          notes: body
            ? c.notes.map((n) => (n.id === edit.noteId ? { ...n, text: body } : n))
            : c.notes.filter((n) => n.id !== edit.noteId), // clearing the text deletes the note
        }
      })
      if (next.some((c, i) => c !== clips[i])) commit(next)
    },
    deleteNote: (clipId, noteId) =>
      commit(get().clips.map((c) => (c.id === clipId ? { ...c, notes: c.notes.filter((n) => n.id !== noteId) } : c))),
    undo: () =>
      set((s) => {
        if (!s.past.length) return s
        const prev = s.past[s.past.length - 1]
        return {
          clips: prev,
          past: s.past.slice(0, -1),
          future: [s.clips, ...s.future],
          refine: null,
          editingNote: null,
          selectedClipId: prev.some((c) => c.id === s.selectedClipId) ? s.selectedClipId : null,
        }
      }),
    redo: () =>
      set((s) => {
        if (!s.future.length) return s
        const [next, ...rest] = s.future
        return {
          clips: next,
          past: [...s.past, s.clips],
          future: rest,
          refine: null,
          editingNote: null,
          selectedClipId: next.some((c) => c.id === s.selectedClipId) ? s.selectedClipId : null,
        }
      }),
    newEdit: () => {
      if (get().clips.length && !window.confirm('Start a new, empty edit? Unsaved changes will be lost.')) return
      commit([], null)
      set({ editName: 'Untitled Edit', editT: 0, playing: false })
    },
    save: () => {
      const { editName, clips } = get()
      kvSet('edit', { name: editName, clips })
        .then(() => get().toast('Edit saved'))
        .catch(() => get().toast('Couldn’t save (storage unavailable)'))
    },
    addSources: (added) => {
      if (!added.length) return
      set((s) => ({
        sources: [...s.sources, ...added],
        selectedSourceId: added[0].id,
        sourceSel: null,
        sourceT: 0,
        playing: false,
        sourcesOpen: false,
      }))
    },
    removeSource: () => {
      const s = get()
      if (s.sources.length <= 1) return s.toast('Keep at least one source')
      const src = currentSource()
      if (!window.confirm(`Remove “${src.title}” and its clips from the edit?`)) return
      const sources = s.sources.filter((x) => x.id !== src.id)
      commit(s.clips.filter((c) => c.sourceId !== src.id), null)
      set({ sources, selectedSourceId: sources[0].id, sourceSel: null, sourceT: 0 })
      if (src.mediaUrl) URL.revokeObjectURL(src.mediaUrl)
      const isSample = SAMPLE_SOURCES.some((x) => x.id === src.id)
      const forget = isSample
        ? kvGet<string[]>('removedSamples').then((ids) => kvSet('removedSamples', [...(ids ?? []), src.id]))
        : deleteSource(src.id)
      forget.catch(() => get().toast('Couldn’t update storage'))
    },
  }
})


export const selectSource = (s: State) => s.sources.find((x) => x.id === s.selectedSourceId)!
