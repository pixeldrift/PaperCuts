import { Avatar, Icon } from '../icons'
import { layout, locate, useStore } from '../store'

export function Timeline() {
  const clips = useStore((s) => s.clips)
  const sources = useStore((s) => s.sources)
  const selectedId = useStore((s) => s.selectedClipId)
  const zoom = useStore((s) => s.timelineZoom)
  const editT = useStore((s) => s.editT)
  const { selectClip, seekEdit, setTimelineZoom } = useStore.getState()
  const { starts, total } = layout(clips)
  const activeId = locate(clips, editT)?.clip.id
  const px = (ms: number) => (ms / 1000) * zoom

  return (
    <section className="pane timeline" aria-label="Timeline view">
      <header className="pane-head">
        <h2>Timeline View</h2>
        <div className="zoom">
          <button className="tool sm" onClick={() => setTimelineZoom(Math.max(1, zoom - 1))} aria-label="Zoom out">
            <Icon name="zoomOut" size={16} />
          </button>
          <input
            type="range"
            min={1}
            max={24}
            step={0.5}
            value={zoom}
            onChange={(e) => setTimelineZoom(Number(e.target.value))}
            aria-label="Timeline zoom"
          />
          <button className="tool sm" onClick={() => setTimelineZoom(Math.min(24, zoom + 1))} aria-label="Zoom in">
            <Icon name="zoomIn" size={16} />
          </button>
        </div>
      </header>
      <div
        className="track-scroll"
        onClick={(e) => {
          if (e.target === e.currentTarget) selectClip(null)
        }}
      >
        <div className="track" style={{ width: Math.max(px(total), 1) + 8 }}>
          {clips.map((c, i) => {
            const name = sources.find((s) => s.id === c.sourceId)?.title
            const w = px(c.outMs - c.inMs)
            return (
              <button
                key={c.id}
                className="tclip"
                data-selected={c.id === selectedId || undefined}
                data-active={c.id === activeId || undefined}
                style={{ width: w, left: px(starts[i]) }}
                onClick={() => {
                  selectClip(c.id)
                  seekEdit(starts[i])
                }}
                title={name}
              >
                <span className="tclip-name">{name}</span>
                {w > 90 && <Avatar size={22} />}
                {c.notes.length > 0 && (
                  <span className="tclip-notes" title={`${c.notes.length} note${c.notes.length > 1 ? 's' : ''}`}>
                    {c.notes.length}
                  </span>
                )}
              </button>
            )
          })}
          {total > 0 && <div className="playhead" style={{ left: px(Math.min(editT, total)) }} />}
        </div>
      </div>
    </section>
  )
}
