import { create } from 'zustand'
import { PRIMARY_ANGLE, type Angle, type Clip, type Note, type Pane, type Source, type Tab, type Word } from './types'
import { SAMPLE_SOURCES } from './data/sample'
import { angleList, getAngle, nextCamera, videoAngles } from './lib/angles'
import { buildMaster, longestAngleId, normalizeOwn, shiftWords, timelineLength, transcriptSpan } from './lib/sync'
import { deleteSource, kvGet, kvSet, mediaKey, moveMedia, saveSource } from './lib/db'
import { sentenceRanges } from './lib/transcript'
const sentenceRangesOf = sentenceRanges
import { applyReplacement, findMatches, replaceWords, retext, tokenize, toggleBreakAfter } from './lib/textdiff'

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

export interface FindState {
  query: string
  replace: string
  matchCase: boolean
  wholeWord: boolean
  allSources: boolean
  /** Index of the highlighted match in the open source. */
  cur: number
}

const sameWords = (a: Word[], b: Word[]) =>
  a.length === b.length && a.every((w, i) => w.t === b[i].t && w.s === b[i].s && w.e === b[i].e && w.p === b[i].p)

// ───────────────────────── history ─────────────────────────

/** Everything undo can restore: the clip list plus each source's (editable) transcript. */
interface Snapshot {
  clips: Clip[]
  text: Record<string, { words: Word[]; sentences: [number, number][] }>
}

const snapshot = (s: { clips: Clip[]; sources: Source[] }): Snapshot => ({
  clips: s.clips,
  text: Object.fromEntries(s.sources.map((x) => [x.id, { words: x.words, sentences: x.sentences }])),
})

/** State changes needed to put a snapshot back (sources added/removed since are left alone). */
function restore(snap: Snapshot, s: { sources: Source[]; selectedClipId: string | null }) {
  return {
    clips: snap.clips,
    sources: s.sources.map((x) => {
      const t = snap.text[x.id]
      return t && t.words !== x.words ? { ...x, words: t.words, sentences: t.sentences } : x
    }),
    refine: null,
    editingNote: null,
    editingWord: null,
    sourceSel: null,
    selectedClipId: snap.clips.some((c) => c.id === s.selectedClipId) ? s.selectedClipId : null,
  }
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
  past: Snapshot[]
  future: Snapshot[]

  /** The Sync Editor (multicam grid + timeline), for this source id. */
  syncEditorId: string | null
  /** Which angle the Source pane is previewing, per source (absent = primary). */
  sourceAngle: Record<string, string>

  mode: 'source' | 'edit'
  playing: boolean
  sourceT: number
  editT: number

  refine: { which: 'in' | 'out'; delta: number } | null
  /** The inline note editor that's open (noteId null = a new note). */
  editingNote: { clipId: string; noteId: string | null; kind: Note['kind'] } | null
  /** Transcript editing mode (T) and the word whose inline editor is open. */
  editMode: boolean
  editingWord: { sourceId: string; index: number } | null
  /** Find & replace bar (null = closed). */
  find: FindState | null
  timelineZoom: number
  toastMsg: string | null

  // actions
  setTab: (t: Tab) => void
  setMobilePane: (p: Pane) => void
  setSourcesOpen: (o: boolean) => void
  zoomText: (dir: 1 | -1) => void
  selectSource: (id: string) => void
  /** Select a source and go to it (Source tab on phones, closes the drawer on tablets). */
  openSource: (id: string) => void
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
  toggleTranscriptEdit: () => void
  openFind: () => void
  closeFind: () => void
  setFind: (patch: Partial<FindState>) => void
  /** Replace the current match (all=false) or every match (all=true). */
  replaceMatches: (all: boolean) => void
  /** Rewrite a source's transcript from edited plain text (paragraphs = lines). */
  applyFullText: (sourceId: string, text: string) => void
  toggleParagraphBreak: (sourceId: string, index: number) => void
  startWordEdit: (sourceId: string, index: number) => void
  cancelWordEdit: () => void
  /** Apply the typed text to the open word. move: 1/-1 = continue to the next/previous word. */
  commitWordEdit: (text: string, move?: -1 | 0 | 1) => void
  undo: () => void
  redo: () => void
  newEdit: () => void
  save: () => void
  removeSource: () => void
  addSources: (sources: Source[]) => void
  setSourceAngle: (sourceId: string, angleId: string) => void
  /** Choose which angle a clip in the edit uses. */
  setClipAngle: (clipId: string, angleId: string) => void
  openSyncEditor: (sourceId?: string) => void
  closeSyncEditor: () => void
  /** Replace a source wholesale (used by the Sync Editor's Apply). */
  replaceSource: (src: Source) => void
  /** Apply the Sync Editor's result: replace the source and shift its clips if the timeline was rebased. */
  applySync: (src: Source, delta: number) => void
  /** Drop a clip's transcript (single-camera clips; multicam transcripts are managed in the Sync Editor). */
  removeTranscript: (sourceId: string) => void
  /** Pick the selected clip's Nth angle (1 = primary) — the 1-9 shortcuts. */
  setAngleByNumber: (n: number) => void
  /** Edit a source's metadata (title, date, camera info, sync offsets…). */
  updateSource: (sourceId: string, update: (s: Source) => Source) => void
  /** Merge sources that are the same take from different cameras into one multicam source. */
  syncSources: (ids: string[]) => void
  /** Split an angle (or all extra angles) back out into separate sources. */
  unsyncAngle: (sourceId: string, angleId: string | 'all') => void
}

/** Clips as they were when the current trim-drag began (for one undo step). */
let dragBase: Snapshot | null = null

let toastTimer: ReturnType<typeof setTimeout> | undefined

export const useStore = create<State>((set, get) => {
  /** Apply a clip-list change, recording undo history. */
  const commit = (clips: Clip[], selectedClipId?: string | null) =>
    set((s) => ({
      clips,
      past: [...s.past.slice(-99), snapshot(s)],
      future: [],
      selectedClipId: selectedClipId === undefined ? s.selectedClipId : selectedClipId,
    }))

  /** Swap in new transcripts for one or more sources as a single undo step. */
  const applySourceTexts = (updates: { sourceId: string; words: Word[] }[]) =>
    set((st) => ({
      past: [...st.past.slice(-99), snapshot(st)],
      future: [],
      sources: st.sources.map((x) => {
        const u = updates.find((y) => y.sourceId === x.id)
        return u ? { ...x, words: u.words, sentences: sentenceRanges(u.words) } : x
      }),
      sourceSel: null, // word indices may have shifted
      editingWord: null,
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

    syncEditorId: null,
    sourceAngle: {},
    mode: 'source',
    playing: false,
    sourceT: 0,
    editT: 0,

    refine: null,
    editingNote: null,
    editMode: false,
    editingWord: null,
    find: null,
    timelineZoom: 14,
    toastMsg: null,

    setTab: (tab) => set({ tab }),
    setMobilePane: (mobilePane) => set({ mobilePane }),
    setSourcesOpen: (sourcesOpen) => set({ sourcesOpen }),
    zoomText: (dir) =>
      set((s) => ({ textScale: Math.min(1.7, Math.max(0.8, +(s.textScale + dir * 0.1).toFixed(2))) })),

    selectSource: (id) => set({ selectedSourceId: id, sourceSel: null, sourceT: 0, playing: false }),
    openSource: (id) =>
      set({ selectedSourceId: id, sourceSel: null, sourceT: 0, playing: false, sourcesOpen: false, mobilePane: 'source' }),
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
        const cur = currentSource()
        if (getAngle(cur, s.sourceAngle[cur.id]).mediaUrl) return // driven by the <video> in Viewer
        const end = currentSource().duration
        const t = s.sourceT + dt
        set(t >= end ? { sourceT: end, playing: false } : { sourceT: t })
      } else {
        const loc = locate(s.clips, s.editT)
        const ls = loc && s.sources.find((x) => x.id === loc.clip.sourceId)
        if (loc && ls && getAngle(ls, loc.clip.angleId).mediaUrl) return
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
      dragBase ??= snapshot(s)
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
      if (!base || base.clips === get().clips) return
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
    toggleTranscriptEdit: () =>
      set((s) => ({ editMode: !s.editMode, editingWord: null, refine: null, editingNote: null, sourceSel: null })),
    startWordEdit: (sourceId, index) => set({ editingWord: { sourceId, index }, editingNote: null, refine: null }),
    cancelWordEdit: () => set({ editingWord: null }),
    commitWordEdit: (text, move = 0) => {
      const s = get()
      const edit = s.editingWord
      if (!edit) return // already closed (Esc / Enter) — blur lands here too
      const src = s.sources.find((x) => x.id === edit.sourceId)
      const word = src?.words[edit.index]
      if (!src || !word) return set({ editingWord: null })

      const body = text.trim()
      let words = src.words
      let next = edit.index + 1
      if (!body) {
        // clearing a word deletes it
        words = [...src.words.slice(0, edit.index), ...src.words.slice(edit.index + 1)]
        next = edit.index
      } else if (body !== word.t) {
        const tokens = body.split(/\s+/).map((t) => ({ t, p: word.p }))
        if (tokens.length === 1) {
          words = src.words.map((w, i) => (i === edit.index ? { ...w, t: body } : w)) // swap, same timing
        } else {
          // several words: they share the time between the words on either side
          words = replaceWords(src.words, edit.index, edit.index + 1, tokens, src.duration)
        }
        next = edit.index + tokens.length
      }

      const target = move === 1 ? next : move === -1 ? edit.index - 1 : -1
      const open = target >= 0 && target < words.length ? { sourceId: src.id, index: target } : null
      if (words === src.words) return set({ editingWord: open })

      set((st) => ({
        past: [...st.past.slice(-99), snapshot(st)],
        future: [],
        sources: st.sources.map((x) => (x.id === src.id ? { ...x, words, sentences: sentenceRanges(words) } : x)),
        sourceSel: null, // word indices shifted
        editingWord: open,
      }))
    },
    openFind: () =>
      set((s) => ({
        find: s.find ?? { query: '', replace: '', matchCase: false, wholeWord: false, allSources: false, cur: 0 },
        mobilePane: 'source',
      })),
    closeFind: () => set({ find: null }),
    setFind: (patch) => set((s) => (s.find ? { find: { ...s.find, ...patch } } : s)),
    applyFullText: (sourceId, text) => {
      const s = get()
      const src = s.sources.find((x) => x.id === sourceId)
      if (!src) return
      if (!tokenize(text).length) return get().toast('The transcript can’t be empty')
      const words = retext(src.words, text, src.duration)
      if (sameWords(words, src.words)) return get().toast('No changes')
      applySourceTexts([{ sourceId, words }])
      get().toast('Transcript updated — new words share the time around them')
    },
    toggleParagraphBreak: (sourceId, index) => {
      const src = get().sources.find((x) => x.id === sourceId)
      if (!src) return
      const words = toggleBreakAfter(src.words, index)
      if (words !== src.words) applySourceTexts([{ sourceId, words }])
    },
    replaceMatches: (all) => {
      const s = get()
      const f = s.find
      if (!f || !f.query.trim()) return
      const opts = { query: f.query, matchCase: f.matchCase, wholeWord: f.wholeWord }
      const targets = all && f.allSources ? s.sources : [currentSource()]
      const updates: { sourceId: string; words: Word[] }[] = []
      let total = 0
      for (const src of targets) {
        const matches = findMatches(src.words, opts)
        if (!matches.length) continue
        const only = all ? undefined : Math.min(f.cur, matches.length - 1)
        total += all ? matches.length : 1
        updates.push({ sourceId: src.id, words: retext(src.words, applyReplacement(src.words, matches, f.replace, only), src.duration) })
      }
      if (!updates.length) return get().toast('No matches')
      applySourceTexts(updates)
      get().toast(`Replaced ${total} ${total === 1 ? 'match' : 'matches'}${updates.length > 1 ? ` in ${updates.length} sources` : ''}`)
    },
    undo: () =>
      set((s) => {
        if (!s.past.length) return s
        const prev = s.past[s.past.length - 1]
        return {
          ...restore(prev, s),
          past: s.past.slice(0, -1),
          future: [snapshot(s), ...s.future],
        }
      }),
    redo: () =>
      set((s) => {
        if (!s.future.length) return s
        const [next, ...rest] = s.future
        return {
          ...restore(next, s),
          past: [...s.past, snapshot(s)],
          future: rest,
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
      for (const a of angleList(src)) if (a.mediaUrl) URL.revokeObjectURL(a.mediaUrl)
      const isSample = SAMPLE_SOURCES.some((x) => x.id === src.id)
      const forget = isSample
        ? kvGet<string[]>('removedSamples').then((ids) => kvSet('removedSamples', [...(ids ?? []), src.id]))
        : deleteSource(src.id)
      forget.catch(() => get().toast('Couldn’t update storage'))
    },
    setSourceAngle: (sourceId, angleId) =>
      set((s) => ({ sourceAngle: { ...s.sourceAngle, [sourceId]: angleId }, playing: false })),
    setClipAngle: (clipId, angleId) => {
      const s = get()
      const clip = s.clips.find((c) => c.id === clipId)
      if (!clip) return
      const next = angleId === PRIMARY_ANGLE ? undefined : angleId
      if (clip.angleId === next) return
      commit(s.clips.map((c) => (c.id === clipId ? { ...c, angleId: next } : c)))
    },
    setAngleByNumber: (n) => {
      const s = get()
      const clip = s.clips.find((c) => c.id === s.selectedClipId)
      const src = clip && s.sources.find((x) => x.id === clip.sourceId)
      if (!clip || !src) return
      const cams = videoAngles(src)
      const a = cams[n - 1]
      if (!a) return get().toast(`This clip only has ${cams.length} camera angle${cams.length === 1 ? '' : 's'}`)
      get().setClipAngle(clip.id, a.id)
    },
    updateSource: (sourceId, update) =>
      set((s) => ({ sources: s.sources.map((x) => (x.id === sourceId ? update(x) : x)) })),

    openSyncEditor: (sourceId) => {
      const id = sourceId ?? get().selectedSourceId
      if (get().sources.some((x) => x.id === id)) set({ syncEditorId: id, playing: false })
    },
    closeSyncEditor: () => set({ syncEditorId: null }),
    replaceSource: (src) => set((s) => ({ sources: s.sources.map((x) => (x.id === src.id ? src : x)), sourceSel: null, editingWord: null })),
    applySync: (src, delta) => {
      set((s) => ({
        sources: s.sources.map((x) => (x.id === src.id ? src : x)),
        // a camera that rolled earlier moved the start of the timeline: keep every clip on the same footage
        clips: delta ? s.clips.map((c) => (c.sourceId === src.id ? { ...c, inMs: c.inMs + delta, outMs: c.outMs + delta } : c)) : s.clips,
        past: [],
        future: [],
        sourceSel: null,
        editingWord: null,
        syncEditorId: null,
      }))
    },
    removeTranscript: (sourceId) => {
      const src = get().sources.find((x) => x.id === sourceId)
      if (!src || !src.words.length) return
      if (!window.confirm(`Remove the transcript from “${src.title}”? Clips already in your edit keep their time ranges.`)) return
      get().replaceSource({ ...src, words: [], sentences: [], transcriptFormat: undefined, primaryTranscript: undefined })
      get().toast('Transcript removed')
    },

    syncSources: (ids) => {
      const s = get()
      const picked = s.sources.filter((x) => ids.includes(x.id)).map(normalizeOwn)
      if (picked.length < 2) return get().toast('Select two or more clips to sync')
      // the longest transcript becomes the base clip and, by default, the shared (master) transcript
      const primary = picked.reduce((best, x) => (transcriptSpan(x) > transcriptSpan(best) || (transcriptSpan(x) === transcriptSpan(best) && x.words.length > best.words.length) ? x : best))
      const others = picked.filter((x) => x !== primary)
      if (!window.confirm(`Sync ${picked.length} clips into one multicam clip?\n\nEvery transcript is kept. “${primary.title}” has the longest one, so it is used as the shared transcript — you can change that in the Sync Editor.`)) return

      let merged: Source = { ...primary, mainDuration: primary.mainDuration ?? primary.duration }
      const remap = new Map<string, string>() // `${otherId}|${oldAngleId}` → new angle id
      const mediaMoves: [string, string][] = []
      let n = 0
      for (const o of others) {
        for (const a of angleList(o)) {
          const used = new Set(angleList(merged).map((x) => x.camera.toUpperCase()))
          const id = `${primary.id}-s${Date.now().toString(36)}${n++}`
          const angle: Angle = {
            id,
            camera: used.has(a.camera.toUpperCase()) ? nextCamera(merged) : a.camera,
            shotType: a.shotType,
            filename: a.filename ?? o.title,
            recordedAt: a.recordedAt,
            mediaUrl: a.mediaUrl,
            offsetMs: a.offsetMs,
            durationMs: a.durationMs ?? o.duration,
            audioOnly: a.audioOnly,
            transcript: a.transcript, // each camera keeps its own transcript
          }
          merged = { ...merged, extraAngles: [...(merged.extraAngles ?? []), angle] }
          remap.set(`${o.id}|${a.id}`, id)
          mediaMoves.push([mediaKey(o.id, a.id), mediaKey(primary.id, id)])
        }
      }
      merged = { ...merged, masterAngle: longestAngleId(merged), transcriptMode: 'single' }
      const built = buildMaster(merged)
      if (built) merged = { ...merged, words: built.words, sentences: built.sentences, transcriptFormat: built.format ?? merged.transcriptFormat }
      merged = { ...merged, duration: timelineLength(merged) }

      const otherIds = new Set(others.map((o) => o.id))
      const sources = s.sources.filter((x) => !otherIds.has(x.id)).map((x) => (x.id === primary.id ? merged : x))
      const clips = s.clips.map((c) =>
        otherIds.has(c.sourceId)
          ? { ...c, sourceId: primary.id, angleId: remap.get(`${c.sourceId}|${c.angleId ?? PRIMARY_ANGLE}`) }
          : c,
      )
      // syncing rewrites sources and clips together, so earlier undo steps no longer apply
      set({ sources, clips, past: [], future: [], selectedSourceId: primary.id, sourceSel: null, sourceT: 0, playing: false })

      // storage: move angle media under the primary source, then forget the merged-in sources
      void (async () => {
        try {
          for (const [from, to] of mediaMoves) if (from !== to) await moveMedia(from, to)
          for (const o of others) {
            if (SAMPLE_SOURCES.some((x) => x.id === o.id)) {
              const ids = (await kvGet<string[]>('removedSamples')) ?? []
              await kvSet('removedSamples', [...ids, o.id])
            } else await deleteSource(o.id)
          }
        } catch {
          get().toast('Couldn’t update storage')
        }
      })()
      get().toast(`Synced ${picked.length} clips — all transcripts kept; “${primary.title}” is the shared one`)
    },

    unsyncAngle: (sourceId, angleId) => {
      const s = get()
      const src = s.sources.find((x) => x.id === sourceId)
      if (!src?.extraAngles?.length) return
      const leaving = angleId === 'all' ? src.extraAngles : src.extraAngles.filter((a) => a.id === angleId)
      if (!leaving.length) return

      // a split-out camera keeps its OWN transcript; if it never had one it gets a copy of the shared one
      const made: Source[] = leaving.map((a, i) => {
        const own = a.transcript
        const words = own ? own.words : shiftWords(src.words, -a.offsetMs)
        return {
          id: `imp-${Date.now().toString(36)}-u${i}`,
          title: `${src.title} – ${a.camera}`,
          date: src.date,
          duration: a.durationMs ?? src.duration,
          words,
          sentences: sentenceRangesOf(words),
          transcriptFormat: own ? own.format : src.transcriptFormat,
          mediaUrl: a.mediaUrl,
          camera: a.camera,
          shotType: a.shotType,
          filename: a.filename,
          recordedAt: a.recordedAt,
          scene: src.scene,
          take: src.take,
          director: src.director,
          dp: src.dp,
          interviewer: src.interviewer,
        }
      })
      const gone = new Set(leaving.map((a) => a.id))
      const idFor = new Map(leaving.map((a, i) => [a.id, made[i].id]))
      const remaining = src.extraAngles.filter((a) => !gone.has(a.id))
      let updated: Source = { ...src, extraAngles: remaining.length ? remaining : undefined }
      if (!remaining.length) {
        // back to a single camera: it reverts to its own transcript (or keeps the shared one)
        const mine = src.primaryTranscript
        updated = {
          ...updated,
          words: mine ? mine.words : src.words,
          sentences: mine ? sentenceRangesOf(mine.words) : src.sentences,
          transcriptFormat: mine ? mine.format : src.transcriptFormat,
          duration: src.mainDuration ?? src.duration,
          primaryTranscript: undefined,
          mainDuration: undefined,
          masterAngle: undefined,
          transcriptMode: undefined,
        }
      } else if (src.masterAngle && gone.has(src.masterAngle)) {
        updated = { ...updated, masterAngle: longestAngleId(updated) }
        const built = buildMaster(updated)
        if (built) updated = { ...updated, words: built.words, sentences: built.sentences }
      }
      const at = s.sources.findIndex((x) => x.id === sourceId)
      const sources = [...s.sources.slice(0, at), updated, ...made, ...s.sources.slice(at + 1)]
      const clips = s.clips.map((c) =>
        c.sourceId === sourceId && c.angleId && gone.has(c.angleId) ? { ...c, sourceId: idFor.get(c.angleId)!, angleId: undefined } : c,
      )
      set({ sources, clips, past: [], future: [] })
      void (async () => {
        try {
          for (const [i, a] of leaving.entries()) {
            if (a.mediaUrl) await moveMedia(mediaKey(sourceId, a.id), mediaKey(made[i].id))
            await saveSource(made[i]) // record only; media was moved above
          }
        } catch {
          get().toast('Couldn’t update storage')
        }
      })()
      get().toast(`Split ${leaving.length} angle${leaving.length > 1 ? 's' : ''} out — each keeps its own transcript`)
    },
  }
})


export const selectSource = (s: State) => s.sources.find((x) => x.id === s.selectedSourceId)!
