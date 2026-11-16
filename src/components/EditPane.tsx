import { useEffect, useRef, useState } from 'react'
import { Avatar } from '../icons'
import { EditHint } from './EditHint'
import { WordInput } from './WordInput'
import { fmtShort, layout, locate, useStore } from '../store'
import type { Clip, Word } from '../types'
import { Toolbar } from './Toolbar'
import { Viewer } from './Viewer'

const NOTE_LABEL = { story: 'Story note', comment: 'Comment' } as const

/** Inline textarea: Enter / blur saves, Shift+Enter adds a line, Esc cancels. */
function NoteEditor({ kind, initial }: { kind: 'story' | 'comment'; initial: string }) {
  const [text, setText] = useState(initial)
  const ref = useRef<HTMLTextAreaElement>(null)
  const { saveNote, cancelNote } = useStore.getState()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])
  // grow with content
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text])
  return (
    <div className="clip-note editing" data-kind={kind} onClick={(e) => e.stopPropagation()}>
      <b>{NOTE_LABEL[kind]}</b>
      <textarea
        ref={ref}
        rows={1}
        value={text}
        placeholder={kind === 'story' ? 'What is this clip doing in the story?' : 'Leave a comment…'}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => saveNote(text)}
        onKeyDown={(e) => {
          e.stopPropagation() // don't trigger editor shortcuts while typing
          if (e.key === 'Escape') cancelNote()
          else if (e.key === 'Enter' && !e.shiftKey) (e.preventDefault(), saveNote(text))
        }}
      />
      <span className="note-hint">Enter to save · Esc to cancel</span>
    </div>
  )
}

function RefinePopover() {
  const refine = useStore((s) => s.refine)
  const { nudge, openRefine } = useStore.getState()
  if (!refine) return null
  const bump = (dir: 1 | -1) => (e: React.MouseEvent) => nudge(dir * (e.shiftKey ? 10 : 1))
  const frames = refine.delta
  const sign = frames < 0 ? '-' : frames > 0 ? '+' : ''
  const secs = Math.floor(Math.abs(frames) / 30)
  const ff = String(Math.abs(frames) % 30).padStart(2, '0')
  return (
    <div className="refine" role="dialog" aria-label={`Refine ${refine.which}`}>
      <div className="refine-title">Refine {refine.which === 'in' ? 'In' : 'Out'}</div>
      <div className="refine-row">
        <button onClick={bump(-1)} aria-label="Back one frame (shift for ten)">‹</button>
        <span className="refine-val">{`${sign}0:00:${String(secs).padStart(2, '0')}.${ff}`}</span>
        <button onClick={bump(1)} aria-label="Forward one frame (shift for ten)">›</button>
      </div>
      <button className="refine-done" onClick={() => openRefine(null)}>Done</button>
    </div>
  )
}

/** How many faded words of source context to show around the selected clip. */
const CONTEXT = 14

/** The word span nearest the pointer (lines first, then horizontal distance). */
function nearestWord(block: HTMLElement, x: number, y: number) {
  let best: { i: number; rect: DOMRect } | null = null
  let bestScore = Infinity
  block.querySelectorAll<HTMLElement>('[data-wi]').forEach((el) => {
    const r = el.getBoundingClientRect()
    const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0
    const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0
    const score = dy * 1000 + dx
    if (score < bestScore) {
      bestScore = score
      best = { i: Number(el.dataset.wi), rect: r }
    }
  })
  return best as { i: number; rect: DOMRect } | null
}

interface Shown {
  w: Word
  i: number
  ctx: boolean
}

function ClipBlock({ clip, selected, active }: { clip: Clip; selected: boolean; active: boolean }) {
  const source = useStore((s) => s.sources.find((x) => x.id === clip.sourceId)!)
  const curT = useStore((s) => {
    if (!active) return -1
    const loc = locate(s.clips, s.editT)
    return loc?.clip.id === clip.id ? loc.sourceT : -1
  })
  const refine = useStore((s) => s.refine)
  const editMode = useStore((s) => s.editMode)
  const editWordIdx = useStore((s) => (s.editingWord?.sourceId === clip.sourceId ? s.editingWord.index : -1))
  const editing = useStore((s) => (s.editingNote?.clipId === clip.id ? s.editingNote : null))
  const { selectClip, seekEdit, removeClip, openRefine, trimDrag, endTrimDrag, editNote, deleteNote } = useStore.getState()
  const blockRef = useRef<HTMLElement>(null)
  const drag = useRef<{ which: 'in' | 'out'; x: number; y: number; moved: boolean } | null>(null)

  // word indices covered by the clip, plus faded context when selected
  const all = source.words
  let a = all.findIndex((w) => w.s >= clip.inMs - 1)
  if (a < 0) a = all.length
  let b = a - 1
  while (b + 1 < all.length && all[b + 1].e <= clip.outMs + 1) b++
  const shown: Shown[] = []
  const from = selected ? Math.max(0, a - CONTEXT) : a
  const to = selected ? Math.min(all.length - 1, b + CONTEXT) : b
  for (let i = from; i <= to; i++) shown.push({ w: all[i], i, ctx: i < a || i > b })

  const onWord = (e: React.MouseEvent, ms: number, index: number) => {
    e.stopPropagation()
    selectClip(clip.id)
    if (useStore.getState().editMode) return useStore.getState().startWordEdit(source.id, index)
    const { clips } = useStore.getState()
    seekEdit(layout(clips).starts[clips.findIndex((c) => c.id === clip.id)] + (ms - clip.inMs))
  }

  // group words into paragraphs by their source paragraph
  const paras: Shown[][] = []
  for (const sw of shown) {
    const last = paras[paras.length - 1]
    if (last && last[0].w.p === sw.w.p) last.push(sw)
    else paras.push([sw])
  }

  // dragging a handle across the (faded) words moves the in / out point
  const down = (which: 'in' | 'out') => (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { which, x: e.clientX, y: e.clientY, moved: false }
    document.body.classList.add('trimming')
  }
  const move = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d || !blockRef.current) return
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return
    d.moved = true
    const hit = nearestWord(blockRef.current, e.clientX, e.clientY)
    if (!hit) return
    const past = e.clientX >= hit.rect.left + hit.rect.width / 2 // pointer in the second half of the word
    if (d.which === 'out') {
      const w = past ? all[hit.i] : all[hit.i - 1]
      if (w) trimDrag(clip.id, 'out', w.e)
    } else {
      const w = past ? all[hit.i + 1] : all[hit.i]
      if (w) trimDrag(clip.id, 'in', w.s)
    }
  }
  const up = (cancel: boolean) => (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    drag.current = null
    document.body.classList.remove('trimming')
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    endTrimDrag()
    if (d && !d.moved && !cancel) openRefine(d.which) // a plain click opens the frame-level refine popover
  }
  const handleProps = (which: 'in' | 'out') => ({
    onPointerDown: down(which),
    onPointerMove: move,
    onPointerUp: up(false),
    onPointerCancel: up(true),
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
  })

  return (
    <article
      ref={blockRef}
      className="clip"
      data-selected={selected || undefined}
      onClick={() => selectClip(clip.id)}
    >
      <div className="clip-meta">
        <span className="clip-speaker">{source.title}</span>
        <Avatar size={36} />
        <span className="clip-time">
          {fmtShort(clip.inMs)} –<br />
          {fmtShort(clip.outMs)}
        </span>
      </div>
      <div className="clip-text" data-edit={editMode || undefined}>
        {paras.map((p, pi) => (
          <p key={pi}>
            {p.map(({ w, i, ctx }) => {
              const isCur = !ctx && curT >= w.s && curT < w.e + 35
              const cls = ctx ? 'ctx' : isCur ? 'cur' : undefined
              if (!ctx && i === editWordIdx) {
                return (
                  <span key={i} data-wi={i} className="editing-word">
                    <WordInput sourceId={source.id} index={i} initial={w.t} />{' '}
                  </span>
                )
              }
              return (
                <span key={i} data-wi={i} className={cls} onClick={ctx ? undefined : (e) => onWord(e, w.s, i)}>
                  {w.t}{' '}
                </span>
              )
            })}
          </p>
        ))}
        {clip.notes.map((n) =>
          editing?.noteId === n.id ? (
            <NoteEditor key={n.id} kind={n.kind} initial={n.text} />
          ) : (
            <div key={n.id} className="clip-note" data-kind={n.kind}>
              <b>{NOTE_LABEL[n.kind]}</b> <span className="note-text">{n.text}</span>
              <span className="note-actions">
                <button aria-label="Edit note" title="Edit" onClick={(e) => (e.stopPropagation(), selectClip(clip.id), editNote(clip.id, n))}>
                  ✎
                </button>
                <button aria-label="Delete note" title="Delete" onClick={(e) => (e.stopPropagation(), deleteNote(clip.id, n.id))}>
                  ✕
                </button>
              </span>
            </div>
          ),
        )}
        {editing && editing.noteId === null && <NoteEditor kind={editing.kind} initial="" />}
      </div>
      {selected && (
        <>
          <button className="clip-x" aria-label="Remove clip" onClick={(e) => (e.stopPropagation(), removeClip())}>
            ✕
          </button>
          <button
            className="handle in"
            aria-label="Trim in point — drag over the text, or click to refine by frame"
            title="Drag to trim · click to refine"
            {...handleProps('in')}
          />
          <button
            className="handle out"
            aria-label="Trim out point — drag over the text, or click to refine by frame"
            title="Drag to trim · click to refine"
            {...handleProps('out')}
          />
          {refine && <RefinePopover />}
        </>
      )}
    </article>
  )
}

export function EditPane() {
  const clips = useStore((s) => s.clips)
  const selectedId = useStore((s) => s.selectedClipId)
  const name = useStore((s) => s.editName)
  const playingEdit = useStore((s) => s.playing && s.mode === 'edit')
  const activeId = useStore((s) => (s.mode === 'edit' ? (locate(s.clips, s.editT)?.clip.id ?? null) : null))
  const refine = useStore((s) => s.refine)
  const st = useStore.getState()
  const none = !selectedId
  const editMode = useStore((s) => s.editMode)

  return (
    <section className="pane edit-pane" aria-label="Paper edit">
      <header className="pane-head">
        <h2>Paper Edit – {name}</h2>
      </header>
      <Viewer kind="edit" />
      <Toolbar
        groups={[
          [
            { icon: 'storyNote', label: 'Add Story Note', short: 'Story Note', shortcut: 'N', onClick: () => st.addNote('story'), disabled: none },
            { icon: 'comment', label: 'Add Comment', short: 'Comment', shortcut: 'C', onClick: () => st.addNote('comment'), disabled: none },
            { icon: 'editTranscript', label: 'Edit Transcript', short: 'Edit Text', shortcut: 'T', onClick: st.toggleTranscriptEdit, active: editMode },
          ],
          [
            { icon: 'trimIn', label: 'Trim In Point', short: 'Trim In', shortcut: 'Q', onClick: () => st.trim('in'), disabled: none },
            { icon: 'trimOut', label: 'Trim Out Point', short: 'Trim Out', shortcut: 'W', onClick: () => st.trim('out'), disabled: none },
          ],
          [{ icon: 'refine', label: 'Refine In/Out', short: 'Refine', shortcut: 'R', onClick: () => st.openRefine(refine ? null : 'out'), disabled: none, active: !!refine }],
          [
            { icon: 'cutClip', label: 'Cut Clip', short: 'Cut', shortcut: 'K', onClick: st.cut, disabled: !clips.length },
            { icon: 'glueClips', label: 'Glue Clips', short: 'Glue', shortcut: 'G', onClick: st.glue, disabled: none },
          ],
          [{ icon: 'removeClip', label: 'Remove Clip', short: 'Remove', shortcut: 'X', onClick: st.removeClip, disabled: none, tone: 'danger' }],
        ]}
      />
      {editMode && <EditHint />}
      <div className="transcript edit-transcript" data-edit={editMode || undefined} onClick={() => st.selectClip(null)}>
        {clips.length === 0 && (
          <div className="empty">
            <p>This edit is empty.</p>
            <p>Select text in a source transcript and press <kbd>,</kbd> to insert it here.</p>
          </div>
        )}
        {clips.map((c) => (
          <ClipBlock key={c.id} clip={c} selected={c.id === selectedId} active={playingEdit || c.id === activeId} />
        ))}
      </div>
    </section>
  )
}
