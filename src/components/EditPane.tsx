import { Avatar } from '../icons'
import { clipWords, fmtShort, layout, locate, useStore } from '../store'
import type { Clip } from '../types'
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

function ClipBlock({ clip, selected, active }: { clip: Clip; selected: boolean; active: boolean }) {
  const source = useStore((s) => s.sources.find((x) => x.id === clip.sourceId)!)
  const curT = useStore((s) => {
    if (!active) return -1
    const loc = locate(s.clips, s.editT)
    return loc?.clip.id === clip.id ? loc.sourceT : -1
  })
  const refine = useStore((s) => s.refine)
  const { selectClip, seekEdit, removeClip, openRefine } = useStore.getState()
  const words = clipWords(source, clip)

  const onWord = (e: React.MouseEvent, ms: number) => {
    e.stopPropagation()
    selectClip(clip.id)
    const { clips } = useStore.getState()
    seekEdit(layout(clips).starts[clips.findIndex((c) => c.id === clip.id)] + (ms - clip.inMs))
  }

  // group words into paragraphs by their source paragraph
  const paras: (typeof words)[] = []
  for (const w of words) {
    const last = paras[paras.length - 1]
    if (last && last[0].p === w.p) last.push(w)
    else paras.push([w])
  }

  return (
    <article className="clip" data-selected={selected || undefined} onClick={() => selectClip(clip.id)}>
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
            {p.map((w) => {
              const isCur = curT >= w.s && curT < w.e + 35
              return (
                <span key={w.s} className={isCur ? 'cur' : undefined} onClick={(e) => onWord(e, w.s)}>
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
          <button className="handle in" aria-label="Refine in point" onClick={(e) => (e.stopPropagation(), openRefine('in'))} />
          <button className="handle out" aria-label="Refine out point" onClick={(e) => (e.stopPropagation(), openRefine('out'))} />
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
