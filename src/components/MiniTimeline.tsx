import { useRef } from 'react'
import { sourceColor } from '../lib/colors'
import { layout, locate, useStore } from '../store'

/**
 * A thin overview of the whole edit — each clip as a block sized by duration and
 * coloured by source — to see the shape of the cut at a glance. Tap or drag to scrub.
 */
export function MiniTimeline() {
  const clips = useStore((s) => s.clips)
  const sources = useStore((s) => s.sources)
  const selectedId = useStore((s) => s.selectedClipId)
  const editT = useStore((s) => s.editT)
  const { seekEdit, selectClip } = useStore.getState()
  const { starts, total } = layout(clips)
  const ref = useRef<HTMLDivElement>(null)
  const down = useRef(false)

  const at = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    return Math.min(Math.max((clientX - r.left) / r.width, 0), 1) * total
  }
  const go = (clientX: number, select: boolean) => {
    if (!total) return
    const ms = at(clientX)
    seekEdit(ms)
    if (select) selectClip(locate(clips, ms)!.clip.id)
  }

  return (
    <div className="mini" aria-label="Edit overview">
      <div
        className="mini-bar"
        ref={ref}
        onPointerDown={(e) => {
          down.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          go(e.clientX, true)
        }}
        onPointerMove={(e) => down.current && go(e.clientX, false)}
        onPointerUp={() => (down.current = false)}
        onPointerCancel={() => (down.current = false)}
      >
        {total === 0 && <span className="mini-empty">Empty edit</span>}
        {clips.map((c, i) => (
          <span
            key={c.id}
            className="mini-clip"
            data-selected={c.id === selectedId || undefined}
            style={{
              left: `${(starts[i] / total) * 100}%`,
              width: `${((c.outMs - c.inMs) / total) * 100}%`,
              ['--c' as string]: sourceColor(sources, c.sourceId),
            }}
          />
        ))}
        {total > 0 && <span className="mini-head" style={{ left: `${(Math.min(editT, total) / total) * 100}%` }} />}
      </div>
    </div>
  )
}
