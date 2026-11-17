import { useMemo, useRef } from 'react'
import { Avatar, Icon } from '../icons'
import { sourceColor } from '../lib/colors'
import { fmt, layout, locate, useStore } from '../store'
import type { Clip, Source } from '../types'
import { PaneHead } from './PaneHead'

/** Candidate major-tick spacings in seconds. */
const STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600]

const ruler = (sec: number) => {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

function clipText(src: Source | undefined, clip: Clip) {
  if (!src) return ''
  let out = ''
  for (const w of src.words) {
    if (w.s < clip.inMs - 1) continue
    if (w.e > clip.outMs + 1 || out.length > 280) break
    out += (out ? ' ' : '') + w.t
  }
  return out
}

export function Timeline() {
  const clips = useStore((s) => s.clips)
  const sources = useStore((s) => s.sources)
  const selectedId = useStore((s) => s.selectedClipId)
  const zoom = useStore((s) => s.timelineZoom)
  const editT = useStore((s) => s.editT)
  const editName = useStore((s) => s.editName)
  const { selectClip, seekEdit, setTimelineZoom } = useStore.getState()
  const { starts, total } = layout(clips)
  const activeId = locate(clips, editT)?.clip.id
  const px = (ms: number) => (ms / 1000) * zoom
  const innerRef = useRef<HTMLDivElement>(null)
  const scrubbing = useRef(false)

  const texts = useMemo(
    () => new Map(clips.map((c) => [c.id, clipText(sources.find((s) => s.id === c.sourceId), c)])),
    [clips, sources],
  )

  // ruler ticks: a major tick at least ~80px apart, minor ticks in between
  const major = STEPS.find((s) => s * zoom >= 80) ?? 3600
  const sub = [5, 2, 1].find((n) => (major * zoom) / n >= 9) ?? 1
  const minor = major / sub
  const labels: number[] = []
  const labelEnd = Math.ceil(total / 1000 / major) * major + major
  for (let t = 0; t <= labelEnd; t += major) labels.push(t)
  const width = px(total) + 32

  /** Time under a pointer, from where it sits on the (scrolling) track. */
  const msAt = (clientX: number) => {
    const r = innerRef.current!.getBoundingClientRect()
    return Math.min(Math.max(((clientX - r.left) / zoom) * 1000, 0), total)
  }
  const seekTo = (ms: number, select: boolean) => {
    seekEdit(ms)
    if (select && clips.length) selectClip(locate(clips, ms)!.clip.id)
  }

  return (
    <section className="pane timeline" aria-label="Timeline view">
      <PaneHead
        kind="timeline"
        title={editName}
        right={
          <>
            <span className="pane-meta" aria-label="Current time">
              {fmt(editT)} / {fmt(total)}
            </span>
            <div className="zoom">
              <button className="tool sm" onClick={() => setTimelineZoom(Math.max(1, zoom - 1))} aria-label="Zoom out">
                <Icon name="zoomOut" size={16} />
              </button>
              <input type="range" min={1} max={24} step={0.5} value={zoom} onChange={(e) => setTimelineZoom(Number(e.target.value))} aria-label="Timeline zoom" />
              <button className="tool sm" onClick={() => setTimelineZoom(Math.min(24, zoom + 1))} aria-label="Zoom in">
                <Icon name="zoomIn" size={16} />
              </button>
            </div>
          </>
        }
      />
      <div className="track-scroll">
        <div className="track-inner" ref={innerRef} style={{ width, minWidth: '100%' }}>
          {/* ruler: tap or drag to move the current time */}
          <div
            className="ruler"
            role="slider"
            aria-label="Timeline position"
            aria-valuemin={0}
            aria-valuemax={Math.round(total / 1000)}
            aria-valuenow={Math.round(editT / 1000)}
            style={{
              backgroundSize: `${minor * zoom}px 6px, ${major * zoom}px 12px`,
            }}
            onPointerDown={(e) => {
              scrubbing.current = true
              e.currentTarget.setPointerCapture(e.pointerId)
              seekTo(msAt(e.clientX), false)
            }}
            onPointerMove={(e) => scrubbing.current && seekTo(msAt(e.clientX), false)}
            onPointerUp={() => (scrubbing.current = false)}
            onPointerCancel={() => (scrubbing.current = false)}
          >
            {labels.map((t) => (
              <span key={t} className="ruler-label" style={{ left: t * zoom }}>
                {ruler(t)}
              </span>
            ))}
          </div>

          {/* clips: tapping anywhere moves the current time there */}
          <div
            className="track"
            onClick={(e) => {
              if (e.target === e.currentTarget) seekTo(msAt(e.clientX), true)
            }}
          >
            {clips.map((c, i) => {
              const src = sources.find((s) => s.id === c.sourceId)
              const w = px(c.outMs - c.inMs)
              return (
                <button
                  key={c.id}
                  className="tclip"
                  data-selected={c.id === selectedId || undefined}
                  data-active={c.id === activeId || undefined}
                  style={{ width: w, left: px(starts[i]), ['--c' as string]: sourceColor(sources, c.sourceId) }}
                  onClick={(e) => {
                    // mouse / touch: jump to where you tapped; keyboard (detail 0): clip start
                    seekTo(e.detail === 0 ? starts[i] : msAt(e.clientX), false)
                    selectClip(c.id)
                  }}
                  title={`${src?.title ?? ''} — ${fmt(c.outMs - c.inMs)}`}
                >
                  <span className="tclip-head">
                    <Avatar size={20} />
                    <span className="tclip-name">{src?.title}</span>
                    {c.notes.length > 0 && (
                      <span className="tclip-notes" title={`${c.notes.length} note${c.notes.length > 1 ? 's' : ''}`}>
                        {c.notes.length}
                      </span>
                    )}
                  </span>
                  <span className="tclip-text">{texts.get(c.id)}</span>
                </button>
              )
            })}
          </div>
          {total > 0 && (
            <div className="playhead" style={{ left: px(Math.min(editT, total)) }}>
              <span className="playhead-flag">{ruler(Math.floor(editT / 1000))}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
