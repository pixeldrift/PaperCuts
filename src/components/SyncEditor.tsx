import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon, Transport } from '../icons'
import { angleList, nextCamera, patchAngle } from '../lib/angles'
import { angleColor } from '../lib/colors'
import { mediaDuration } from '../lib/importSources'
import { mediaKey, saveMedia } from '../lib/db'
import {
  buildMaster,
  hasOwnTranscripts,
  layoutSignature,
  masterHasEdits,
  masterPlan,
  normalizeDelta,
  normalizeOwn,
  rebase,
  timelineLength,
} from '../lib/sync'
import { AUDIO_EXT, MEDIA_EXT, TRANSCRIPT_EXT, parseTranscript } from '../lib/transcript'
import { fakePeaks, loadPeaks } from '../lib/waveform'
import { FRAME, useStore } from '../store'
import { PRIMARY_ANGLE, type Angle, type Source } from '../types'

const LABEL_W = 232
const STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600]

const clock = (ms: number) => {
  const neg = ms < 0
  const s = Math.floor(Math.abs(ms) / 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  const h = Math.floor(s / 3600)
  return `${neg ? '−' : ''}${h ? `${h}:${pad(Math.floor((s % 3600) / 60))}` : Math.floor(s / 60)}:${pad(s % 60)}`
}

// ───────────────────────── waveform ─────────────────────────

function Waveform({ angle, width, color }: { angle: Angle; width: number; color: string }) {
  const [peaks, setPeaks] = useState<Float32Array | null>(null)
  const ref = useRef<HTMLCanvasElement>(null)
  const simulated = !angle.mediaUrl

  useEffect(() => {
    let live = true
    if (angle.mediaUrl) void loadPeaks(angle.mediaUrl).then((p) => live && setPeaks(p))
    else setPeaks(fakePeaks(angle.id))
    return () => {
      live = false
    }
  }, [angle.mediaUrl, angle.id])

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.max(1, Math.min(Math.round(width * dpr), 8000))
    const h = Math.round(38 * dpr)
    c.width = w
    c.height = h
    const g = c.getContext('2d')!
    g.clearRect(0, 0, w, h)
    if (!peaks) return
    g.fillStyle = color
    for (let x = 0; x < w; x++) {
      const v = peaks[Math.min(peaks.length - 1, Math.floor((x / w) * peaks.length))]
      const bar = Math.max(1, v * h * 0.92)
      g.fillRect(x, (h - bar) / 2, 1, bar)
    }
  }, [peaks, width, color])

  return (
    <>
      <canvas ref={ref} className="wave" style={{ width }} />
      {simulated && <span className="wave-sim">simulated waveform</span>}
      {!simulated && peaks === null && <span className="wave-sim">no audio</span>}
    </>
  )
}

// ───────────────────────── editor ─────────────────────────

export function SyncEditor() {
  const id = useStore((s) => s.syncEditorId)
  const source = useStore((s) => s.sources.find((x) => x.id === s.syncEditorId))
  if (!id || !source) return null
  return <Editor key={id} source={source} />
}

function Editor({ source }: { source: Source }) {
  const { closeSyncEditor, applySync, toast } = useStore.getState()
  // work on a copy; a clip's plain transcript is treated as its primary camera's own transcript
  const [draft, setDraft] = useState<Source>(() => normalizeOwn(source))
  const added = useRef<{ key: string; file: File; url: string }[]>([])
  const [t, setT] = useState(0)
  const tRef = useRef(0)
  const [playing, setPlaying] = useState(false)
  // start zoomed so the whole timeline fits the window
  const [zoom, setZoom] = useState(() => Math.min(40, Math.max(1, Math.floor((1000 / (timelineLength(normalizeOwn(source)) / 1000)) * 2) / 2)))
  const [monitor, setMonitor] = useState<string>(() => angleList(source).find((a) => a.mediaUrl && !a.audioOnly)?.id ?? PRIMARY_ANGLE)
  const [selected, setSelected] = useState<string>(PRIMARY_ANGLE)
  const media = useRef<Record<string, HTMLMediaElement | null>>({})
  const addInput = useRef<HTMLInputElement>(null)
  const linkInput = useRef<HTMLInputElement>(null)
  const linkFor = useRef<string>(PRIMARY_ANGLE)
  const innerRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: string; x0: number; off0: number } | null>(null)

  const angles = angleList(draft)
  const delta = normalizeDelta(draft)
  const origin = Math.min(0, ...angles.map((a) => a.offsetMs))
  const end = Math.max(timelineLength(draft), 10_000)
  const px = (ms: number) => ((ms - origin) / 1000) * zoom
  const width = px(end) + 40

  // what the shared transcript will be, in this editor's (un-rebased) time
  const plan = useMemo(() => masterPlan(rebase(draft, delta)), [draft, delta])
  const segments = (plan?.segments ?? []).map((s) => ({ ...s, fromMs: s.fromMs - delta, toMs: s.toMs - delta }))
  const hasTranscripts = hasOwnTranscripts(draft)

  const setAngle = (aid: string, patch: Partial<Omit<Angle, 'id' | 'mediaUrl'>>) => setDraft((d) => patchAngle(d, aid, patch))

  // ── playback: one clock drives every camera at its own offset
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      tRef.current = Math.min(end, tRef.current + (now - last))
      last = now
      setT(tRef.current)
      if (tRef.current >= end) return setPlaying(false)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing, end])

  useEffect(() => {
    for (const a of angles) {
      const v = media.current[a.id]
      if (!v || !a.mediaUrl) continue
      const target = (t - a.offsetMs) / 1000
      v.muted = a.id !== monitor
      const inRange = target >= 0 && target <= (v.duration || Infinity)
      if (!inRange) {
        if (!v.paused) v.pause()
        continue
      }
      if (playing) {
        if (Math.abs(v.currentTime - target) > 0.25) v.currentTime = target
        if (v.paused) void v.play().catch(() => {})
      } else {
        if (!v.paused) v.pause()
        if (Math.abs(v.currentTime - target) > 0.04) v.currentTime = target
      }
    }
  }, [t, playing, monitor, angles])

  const seek = (ms: number) => {
    tRef.current = Math.max(origin, Math.min(end, ms))
    setT(tRef.current)
  }
  const seekFromPointer = (clientX: number) => {
    const r = innerRef.current!.getBoundingClientRect()
    seek(origin + ((clientX - r.left - LABEL_W) / zoom) * 1000)
  }

  // ── adding footage / linking transcripts
  const addFiles = async (files: File[]) => {
    for (const f of files.filter((x) => MEDIA_EXT.test(x.name))) {
      const url = URL.createObjectURL(f)
      const dur = await mediaDuration(url)
      const audioOnly = AUDIO_EXT.test(f.name)
      setDraft((d) => {
        const aid = `${d.id}-n${Date.now().toString(36)}${added.current.length}`
        added.current.push({ key: mediaKey(d.id, aid), file: f, url })
        const cams = angleList(d)
        const angle: Angle = {
          id: aid,
          camera: audioOnly ? `Audio${cams.some((a) => a.audioOnly) ? ` ${cams.filter((a) => a.audioOnly).length + 1}` : ''}` : nextCamera(d),
          filename: f.name,
          mediaUrl: url,
          offsetMs: 0,
          durationMs: dur || d.duration,
          audioOnly,
        }
        return { ...d, extraAngles: [...(d.extraAngles ?? []), angle] }
      })
    }
  }
  const linkTranscript = async (angleId: string, file: File) => {
    try {
      const parsed = parseTranscript(file.name, await file.text())
      if (!parsed.words.length) return toast(`${file.name} had no timed text`)
      const format = file.name.split('.').pop()!.toLowerCase() as Source['transcriptFormat']
      setDraft((d) => patchAngle(d, angleId, { transcript: { words: parsed.words, format } }))
    } catch {
      toast(`Couldn’t read ${file.name}`)
    }
  }

  // ── apply
  const cleanup = () => added.current.forEach((a) => URL.revokeObjectURL(a.url))
  const cancel = () => {
    cleanup()
    closeSyncEditor()
  }
  const apply = async () => {
    const base = normalizeOwn(source)
    let final = rebase(draft, delta)
    const layoutChanged = layoutSignature(draft) !== layoutSignature(base)
    if (layoutChanged && hasOwnTranscripts(final)) {
      if (masterHasEdits(base) && !window.confirm('Rebuilding the shared transcript will replace text edits you’ve made to it. Continue?')) return
      const built = buildMaster(final)
      if (built) final = { ...final, words: built.words, sentences: built.sentences, transcriptFormat: built.format ?? final.transcriptFormat }
    }
    final = { ...final, duration: timelineLength(final) }
    try {
      for (const a of added.current) await saveMedia(a.key, a.file)
    } catch {
      toast('Couldn’t store the added media (it works this session only)')
    }
    applySync(final, delta)
    toast('Sync applied')
  }

  // keys: space = play, Esc = close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      if (e.key === 'Escape') cancel()
      else if (e.key === ' ') (e.preventDefault(), setPlaying((p) => !p))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ruler ticks
  const major = STEPS.find((s) => s * zoom >= 90) ?? 3600
  const labels: number[] = []
  for (let s = Math.ceil(origin / 1000 / major) * major; s * 1000 <= end + major * 1000; s += major) labels.push(s)
  const minor = major / ([5, 2, 1].find((n) => (major * zoom) / n >= 9) ?? 1)

  const colorOf = (aid: string) => angleColor(Math.max(0, angles.findIndex((a) => a.id === aid)))
  const videoAngs = angles.filter((a) => !a.audioOnly)
  const audioAngs = angles.filter((a) => a.audioOnly)
  const masterId = draft.masterAngle ?? PRIMARY_ANGLE

  const offsetControls = (a: Angle) => (
    <div className="off-ctl">
      <button title="10 frames earlier" onClick={() => setAngle(a.id, { offsetMs: Math.round(a.offsetMs - FRAME * 10) })}>«</button>
      <button title="1 frame earlier" onClick={() => setAngle(a.id, { offsetMs: Math.round(a.offsetMs - FRAME) })}>‹</button>
      <input
        value={Math.round(a.offsetMs)}
        inputMode="numeric"
        aria-label={`Offset for ${a.camera} (ms)`}
        onChange={(e) => setAngle(a.id, { offsetMs: Number(e.target.value.replace(/[^\d-]/g, '')) || 0 })}
      />
      <span>ms</span>
      <button title="1 frame later" onClick={() => setAngle(a.id, { offsetMs: Math.round(a.offsetMs + FRAME) })}>›</button>
      <button title="10 frames later" onClick={() => setAngle(a.id, { offsetMs: Math.round(a.offsetMs + FRAME * 10) })}>»</button>
    </div>
  )

  const startDrag = (e: React.PointerEvent, a: Angle) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { id: a.id, x0: e.clientX, off0: a.offsetMs }
    setSelected(a.id)
  }
  const moveDrag = (e: React.PointerEvent) => {
    const d = drag.current
    if (d) setAngle(d.id, { offsetMs: Math.round(d.off0 + ((e.clientX - d.x0) / zoom) * 1000) })
  }

  return createPortal(
    <div className="modal-scrim sync-scrim">
      <div className="sync" role="dialog" aria-modal="true" aria-label="Sync editor">
        <header className="sync-head">
          <span className="pane-icon" style={{ background: 'var(--k-source)' }}>
            <Icon name="multicam" size={20} />
          </span>
          <div className="pane-titles">
            <span className="pane-kind" style={{ color: 'var(--k-source)' }}>Multicam sync</span>
            <h2>{draft.title}</h2>
          </div>
          <div className="sync-actions">
            <button className="fbtn" onClick={() => addInput.current?.click()} title="Add another camera or an external audio recording">
              + Camera / audio
            </button>
            <button className="fbtn wide" onClick={cancel}>Cancel</button>
            <button className="fbtn wide primary" onClick={() => void apply()}>Apply</button>
          </div>
          <input ref={addInput} type="file" hidden multiple accept="video/*,audio/*" onChange={(e) => (void addFiles([...(e.target.files ?? [])]), (e.target.value = ''))} />
          <input
            ref={linkInput}
            type="file"
            hidden
            accept=".srt,.vtt,.json"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f && TRANSCRIPT_EXT.test(f.name)) void linkTranscript(linkFor.current, f)
              e.target.value = ''
            }}
          />
        </header>

        {/* multicam grid */}
        <div className="sync-grid" data-count={videoAngs.length}>
          {videoAngs.map((a) => {
            const local = t - a.offsetMs
            const live = local >= 0 && local <= (a.durationMs ?? source.duration)
            const i = angles.findIndex((x) => x.id === a.id)
            return (
              <div key={a.id} className="sync-tile" data-selected={selected === a.id || undefined} style={{ ['--c' as string]: angleColor(i) }} onClick={() => setSelected(a.id)}>
                {a.mediaUrl ? (
                  <video ref={(el) => void (media.current[a.id] = el)} src={a.mediaUrl} playsInline muted preload="auto" style={{ opacity: live ? 1 : 0.15 }} />
                ) : (
                  <div className="tile-sim">
                    <b>{a.camera}</b>
                    <span>{a.shotType ?? 'simulated footage'}</span>
                  </div>
                )}
                <span className="tile-label">
                  <i style={{ background: angleColor(i) }} /> {a.camera}
                  {a.shotType ? ` · ${a.shotType}` : ''}
                </span>
                <span className="tile-time">{live ? clock(local) : local < 0 ? 'not rolling yet' : 'ended'}</span>
                {a.mediaUrl && (
                  <button
                    className="tile-spk"
                    data-on={monitor === a.id || undefined}
                    title="Listen to this camera"
                    aria-label={`Monitor audio of ${a.camera}`}
                    onClick={(e) => (e.stopPropagation(), setMonitor(a.id))}
                  >
                    {monitor === a.id ? '🔊' : '🔈'}
                  </button>
                )}
              </div>
            )
          })}
          {audioAngs.map((a) => (
            <div key={a.id} className="sync-tile audio" style={{ ['--c' as string]: colorOf(a.id) }} onClick={() => setSelected(a.id)}>
              <div className="tile-sim"><b>♪</b><span>{a.camera}</span></div>
              {a.mediaUrl && (
                <>
                  <audio ref={(el) => void (media.current[a.id] = el)} src={a.mediaUrl} preload="auto" />
                  <button className="tile-spk" data-on={monitor === a.id || undefined} onClick={(e) => (e.stopPropagation(), setMonitor(a.id))} aria-label={`Monitor ${a.camera}`}>
                    {monitor === a.id ? '🔊' : '🔈'}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        {/* transport */}
        <div className="sync-transport">
          <button className="tbtn" onClick={() => seek(origin)} aria-label="Start"><Transport kind="prev" /></button>
          <button className="tbtn" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}>
            <Transport kind={playing ? 'pause' : 'play'} />
          </button>
          <span className="timecode wide">{clock(t)}</span>
          <span className="sync-hint">Drag a camera’s bar to line it up · space plays · the playhead drives every camera at once</span>
          <label className="zoom">
            <Icon name="zoomOut" size={14} />
            <input type="range" min={1} max={60} step={0.5} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Timeline zoom" />
            <Icon name="zoomIn" size={14} />
          </label>
        </div>

        {/* stacked timeline */}
        <div className="sync-scroll">
          <div className="sync-inner" ref={innerRef} style={{ width: LABEL_W + width }}>
            <div
              className="sync-row ruler-row"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId)
                seekFromPointer(e.clientX)
              }}
              onPointerMove={(e) => e.buttons && seekFromPointer(e.clientX)}
            >
              <div className="sync-label sync-corner">Timeline</div>
              <div
                className="sync-lane ruler"
                style={{ width, backgroundSize: `${minor * zoom}px 6px, ${major * zoom}px 12px`, backgroundPosition: `${px(Math.ceil(origin / 1000 / minor) * minor * 1000)}px bottom` }}
              >
                {labels.map((s) => (
                  <span key={s} className="ruler-label" style={{ left: px(s * 1000) }}>{clock(s * 1000)}</span>
                ))}
              </div>
            </div>

            <div className="sync-section">Cameras &amp; audio</div>
            {angles.map((a, i) => {
              const color = colorOf(a.id)
              return (
                <div key={a.id} className="sync-row" data-selected={selected === a.id || undefined} onClick={() => setSelected(a.id)}>
                  <div className="sync-label">
                    <div className="lab-top">
                      <span className="chip" style={{ borderColor: color }}>{a.camera}</span>
                      <span className="lab-name">{a.audioOnly ? 'Audio only' : (a.shotType ?? 'Camera')}</span>
                      {!a.audioOnly && a.mediaUrl && (
                        <button className="lab-spk" data-on={monitor === a.id || undefined} onClick={() => setMonitor(a.id)} aria-label={`Monitor ${a.camera}`}>
                          {monitor === a.id ? '🔊' : '🔈'}
                        </button>
                      )}
                    </div>
                    {offsetControls(a)}
                    <small className="lab-file">{a.filename ?? (i === 0 ? 'primary' : '')}</small>
                  </div>
                  <div className="sync-lane" style={{ width }}>
                    <div
                      className="sync-block"
                      style={{ left: px(a.offsetMs), width: ((a.durationMs ?? source.duration) / 1000) * zoom, ['--c' as string]: color }}
                      onPointerDown={(e) => startDrag(e, a)}
                      onPointerMove={moveDrag}
                      onPointerUp={() => (drag.current = null)}
                      onPointerCancel={() => (drag.current = null)}
                      title={`${a.camera}: drag to line it up with the others`}
                    >
                      <span className="block-title">{a.filename ?? a.camera}</span>
                      <Waveform angle={a} width={((a.durationMs ?? source.duration) / 1000) * zoom} color={color} />
                    </div>
                  </div>
                </div>
              )
            })}

            <div className="sync-section">
              Transcripts <small>— only one is active at any point on the timeline</small>
            </div>
            {angles.map((a) => {
              const color = colorOf(a.id)
              const tr = a.transcript
              const first = tr?.words[0]
              const last = tr?.words[tr.words.length - 1]
              return (
                <div key={a.id} className="sync-row tr-row" data-selected={selected === a.id || undefined}>
                  <div className="sync-label">
                    <div className="lab-top">
                      <span className="chip" style={{ borderColor: color }}>{a.camera}</span>
                      <span className="lab-name">{tr ? `${tr.words.length.toLocaleString()} words${tr.format ? ` · ${tr.format.toUpperCase()}` : ''}` : 'No transcript'}</span>
                    </div>
                    <div className="lab-btns">
                      {tr && (
                        <label className="radio" title="Use this transcript first when building the shared one">
                          <input type="radio" name="master" checked={masterId === a.id} onChange={() => setDraft((d) => ({ ...d, masterAngle: a.id }))} />
                          Primary
                        </label>
                      )}
                      <button className="fbtn" onClick={() => ((linkFor.current = a.id), linkInput.current?.click())}>{tr ? 'Replace…' : 'Link transcript…'}</button>
                      {tr && <button className="fbtn danger" onClick={() => setAngle(a.id, { transcript: undefined })}>Remove</button>}
                    </div>
                  </div>
                  <div className="sync-lane" style={{ width }}>
                    {tr && first && last ? (
                      <div
                        className="sync-block tr"
                        data-used={segments.some((s) => s.angleId === a.id) || undefined}
                        style={{ left: px(first.s + a.offsetMs), width: ((last.e - first.s) / 1000) * zoom, ['--c' as string]: color }}
                      >
                        <span className="block-title">{tr.words.slice(0, 14).map((w) => w.t).join(' ')}…</span>
                      </div>
                    ) : (
                      <span className="lane-empty">no transcript linked to this camera</span>
                    )}
                  </div>
                </div>
              )
            })}

            <div className="sync-row master-row">
              <div className="sync-label">
                <div className="lab-top">
                  <b>Shared transcript</b>
                </div>
                {hasTranscripts ? (
                  <label className="radio" title="Fill the whole timeline using every transcript, so nothing any camera caught is lost">
                    <input
                      type="checkbox"
                      checked={draft.transcriptMode === 'combined'}
                      onChange={(e) => setDraft((d) => ({ ...d, transcriptMode: e.target.checked ? 'combined' : 'single' }))}
                    />
                    Combine all transcripts
                  </label>
                ) : (
                  <small className="lab-file">Link a transcript to a camera above</small>
                )}
              </div>
              <div className="sync-lane" style={{ width }}>
                {segments.map((s, k) => (
                  <div key={k} className="sync-block master" style={{ left: px(s.fromMs), width: ((s.toMs - s.fromMs) / 1000) * zoom, ['--c' as string]: colorOf(s.angleId) }}>
                    <span className="block-title">
                      {angles.find((a) => a.id === s.angleId)?.camera} · {clock(s.fromMs)}–{clock(s.toMs)}
                    </span>
                  </div>
                ))}
                {!segments.length && source.words.length > 0 && (
                  <div className="sync-block master" style={{ left: px(source.words[0].s), width: ((source.words[source.words.length - 1].e - source.words[0].s) / 1000) * zoom, ['--c' as string]: 'var(--muted)' }}>
                    <span className="block-title">Shared transcript</span>
                  </div>
                )}
              </div>
            </div>

            <div className="sync-playhead" style={{ left: LABEL_W + px(t) }} />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
