import { useRef } from 'react'
import { Avatar } from '../icons'
import { fmtShort, layout, locate, useStore } from '../store'
import type { Clip, Word } from '../types'
import { Toolbar } from './Toolbar'
import { Viewer } from './Viewer'

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
  const { selectClip, seekEdit, removeClip, openRefine, trimDrag, endTrimDrag } = useStore.getState()
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

  const onWord = (e: React.MouseEvent, ms: number) => {
    e.stopPropagation()
    selectClip(clip.id)
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
      <div className="clip-text">
        {paras.map((p, pi) => (
          <p key={pi}>
            {p.map(({ w, i, ctx }) => {
              const isCur = !ctx && curT >= w.s && curT < w.e + 35
              const cls = ctx ? 'ctx' : isCur ? 'cur' : undefined
              return (
                <span key={i} data-wi={i} className={cls} onClick={ctx ? undefined : (e) => onWord(e, w.s)}>
                  {w.t}{' '}
                </span>
              )
            })}
          </p>
        ))}
        {clip.notes.map((n, i) => (
          <div key={i} className="clip-note" data-kind={n.kind}>
            <b>{n.kind === 'story' ? 'Story note' : 'Comment'}</b> {n.text}
          </div>
        ))}
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

  return (
    <section className="pane edit-pane" aria-label="Paper edit">
      <header className="pane-head">
        <h2>Paper Edit – {name}</h2>
      </header>
      <Viewer kind="edit" />
      <Toolbar
        groups={[
          [
            { icon: 'storyNote', label: 'Add Story Note', shortcut: 'N', onClick: () => st.addNote('story'), disabled: none },
            { icon: 'comment', label: 'Add Comment', shortcut: 'C', onClick: () => st.addNote('comment'), disabled: none },
            { icon: 'editTranscript', label: 'Edit Transcript', shortcut: 'T', onClick: () => st.toast('Transcript editing is coming soon') },
          ],
          [
            { icon: 'trimIn', label: 'Trim In Point', shortcut: 'Q', onClick: () => st.trim('in'), disabled: none },
            { icon: 'trimOut', label: 'Trim Out Point', shortcut: 'W', onClick: () => st.trim('out'), disabled: none },
          ],
          [{ icon: 'refine', label: 'Refine In/Out', shortcut: 'R', onClick: () => st.openRefine(refine ? null : 'out'), disabled: none, active: !!refine }],
          [
            { icon: 'cutClip', label: 'Cut Clip', shortcut: 'K', onClick: st.cut, disabled: !clips.length },
            { icon: 'glueClips', label: 'Glue Clips', shortcut: 'G', onClick: st.glue, disabled: none },
          ],
          [{ icon: 'removeClip', label: 'Remove Clip', shortcut: 'X', onClick: st.removeClip, disabled: none, tone: 'danger' }],
        ]}
      />
      <div className="transcript edit-transcript" onClick={() => st.selectClip(null)}>
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
