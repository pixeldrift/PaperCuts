import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../icons'
import { angleList, patchAngle } from '../lib/angles'
import { FRAME, useStore } from '../store'
import { PRIMARY_ANGLE, type Source } from '../types'

const CAMERAS = ['A', 'B', 'C', 'D', 'GoPro', 'Drone', 'Phone']
const SHOTS = ['Wide', 'Medium', 'Closeup', 'OTS', 'POV', 'Insert', 'BTS', 'Drone']

interface AngleDraft {
  id: string
  camera: string
  shotType: string
  filename: string
  recordedAt: string
  offsetMs: number
  hasMedia: boolean
}

/**
 * Edit a clip's metadata: its title and date, and for every camera angle the camera, shot type,
 * filename, time recorded and sync offset. Opened by double-clicking (or pressing and holding) a
 * clip's data in the Sources list. `field` says which column was tapped, to focus it.
 */
export function ClipInfo({ source, field, onClose }: { source: Source; field?: string; onClose: () => void }) {
  const { updateSource, unsyncAngle } = useStore.getState()
  const [title, setTitle] = useState(source.title)
  const [date, setDate] = useState(source.date)
  const [angles, setAngles] = useState<AngleDraft[]>(() =>
    angleList(source).map((a) => ({
      id: a.id,
      camera: a.camera,
      shotType: a.shotType ?? '',
      filename: a.filename ?? '',
      recordedAt: a.recordedAt ?? '',
      offsetMs: a.offsetMs,
      hasMedia: !!a.mediaUrl,
    })),
  )
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const target = (field && root.querySelector<HTMLInputElement>(`[data-field^="${field}"]`)) || root.querySelector<HTMLInputElement>('[data-field="title"]')
    target?.focus()
    target?.select?.()
  }, [field])

  const patch = (id: string, p: Partial<AngleDraft>) => setAngles((a) => a.map((x) => (x.id === id ? { ...x, ...p } : x)))

  const save = () => {
    updateSource(source.id, (s) => {
      let next: Source = { ...s, title: title.trim() || s.title, date: date.trim() || s.date }
      for (const a of angles) {
        next = patchAngle(next, a.id, {
          camera: a.camera.trim() || 'A',
          shotType: a.shotType.trim() || undefined,
          filename: a.filename.trim() || undefined,
          recordedAt: a.recordedAt || undefined,
          ...(a.id === PRIMARY_ANGLE ? {} : { offsetMs: Math.round(a.offsetMs) }),
        })
      }
      return next
    })
    onClose()
  }

  const input = (key: string, value: string, set: (v: string) => void, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input
      data-field={key}
      value={value}
      onChange={(e) => set(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape') onClose()
        else if (e.key === 'Enter') (e.preventDefault(), save())
      }}
      {...extra}
    />
  )

  return createPortal(
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Clip info" ref={rootRef}>
        <header className="modal-head">
          <h3>Clip info</h3>
          <button className="fbtn" onClick={onClose} aria-label="Close">✕</button>
        </header>

        <div className="modal-body">
          <div className="form-grid">
            <label>
              Title
              {input('title', title, setTitle)}
            </label>
            <label>
              Date
              {input('date', date, setDate)}
            </label>
          </div>
          <p className="modal-note">
            {source.words.length ? `${source.words.length.toLocaleString()} words` : 'No transcript'}
            {source.transcriptFormat ? ` · ${source.transcriptFormat.toUpperCase()}` : ''} · shared by{' '}
            {angles.length === 1 ? 'this clip' : `all ${angles.length} angles`}
          </p>

          {angles.map((a, i) => (
            <fieldset className="angle-card" key={a.id}>
              <legend>
                <span className="chip">{a.camera || '?'}</span> {i === 0 ? 'Primary angle' : `Angle ${i + 1}`}
                {!a.hasMedia && <small> · no media (simulated)</small>}
              </legend>
              <div className="form-grid">
                <label>
                  Camera
                  {input(`camera-${a.id}`, a.camera, (v) => patch(a.id, { camera: v }), { list: 'dl-cameras' })}
                </label>
                <label>
                  Shot type
                  {input(`shotType-${a.id}`, a.shotType, (v) => patch(a.id, { shotType: v }), { list: 'dl-shots' })}
                </label>
                <label className="wide">
                  Filename
                  {input(`filename-${a.id}`, a.filename, (v) => patch(a.id, { filename: v }))}
                </label>
                <label>
                  Time recorded
                  {input(`recordedAt-${a.id}`, a.recordedAt, (v) => patch(a.id, { recordedAt: v }), { type: 'time' })}
                </label>
                {i > 0 && (
                  <label>
                    Sync offset (ms)
                    <span className="offset-row">
                      <button type="button" className="fbtn" onClick={() => patch(a.id, { offsetMs: Math.round(a.offsetMs - FRAME) })} aria-label="Earlier by one frame">−1f</button>
                      {input(`offset-${a.id}`, String(a.offsetMs), (v) => patch(a.id, { offsetMs: Number(v) || 0 }), { inputMode: 'numeric' })}
                      <button type="button" className="fbtn" onClick={() => patch(a.id, { offsetMs: Math.round(a.offsetMs + FRAME) })} aria-label="Later by one frame">+1f</button>
                    </span>
                    <small>Positive = this camera started recording later.</small>
                  </label>
                )}
              </div>
              {i > 0 && (
                <button
                  type="button"
                  className="fbtn danger"
                  onClick={() => (unsyncAngle(source.id, a.id), onClose())}
                >
                  Split “{a.camera}” out as its own clip
                </button>
              )}
            </fieldset>
          ))}
          <datalist id="dl-cameras">{CAMERAS.map((c) => <option key={c} value={c} />)}</datalist>
          <datalist id="dl-shots">{SHOTS.map((c) => <option key={c} value={c} />)}</datalist>
        </div>

        <footer className="modal-foot">
          {angles.length > 1 && (
            <button className="fbtn danger" onClick={() => (unsyncAngle(source.id, 'all'), onClose())}>
              <Icon name="multicam" size={14} /> Unsync all
            </button>
          )}
          <span className="spacer" />
          <button className="fbtn wide" onClick={onClose}>Cancel</button>
          <button className="fbtn wide primary" onClick={save}>Save</button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
