import { useEffect, useRef } from 'react'
import { Transport } from '../icons'
import { angleLabel, angleList, getAngle } from '../lib/angles'
import { AngleChips } from './AngleChips'
import { fmt, layout, locate, selectSource, useStore } from '../store'

/** Seek a media element, waiting for metadata if it isn't ready yet. */
function seekMedia(v: HTMLVideoElement, ms: number) {
  const apply = () => {
    const target = Math.max(0, ms / 1000)
    if (Math.abs(v.currentTime - target) > 0.02) v.currentTime = target
  }
  if (v.readyState >= 1) apply()
  else v.addEventListener('loadedmetadata', apply, { once: true })
}

/**
 * Player for either the source or the paper edit. Sources with a media file
 * play through a real <video>; sources without one fall back to the store's
 * simulated clock. The paper-edit viewer sequences clips by seeking (and
 * swapping src) at each clip boundary.
 */
export function Viewer({ kind }: { kind: 'source' | 'edit' }) {
  const source = useStore(selectSource)
  const clips = useStore((s) => s.clips)
  const sources = useStore((s) => s.sources)
  const sourceAngleId = useStore((s) => s.sourceAngle[s.selectedSourceId])
  const t = useStore((s) => (kind === 'source' ? s.sourceT : s.editT))
  const playing = useStore((s) => s.playing && s.mode === kind)
  const { togglePlay, seekSource, seekEdit, setSourceAngle, setClipAngle } = useStore.getState()
  const videoRef = useRef<HTMLVideoElement>(null)
  const switching = useRef(false)

  const total = kind === 'source' ? source.duration : layout(clips).total
  const loc = kind === 'edit' ? locate(clips, t) : null
  const shown = kind === 'source' ? source : sources.find((s) => s.id === loc?.clip.sourceId)
  // which camera is on screen: the previewed angle (Source) or the angle chosen for the clip (Edit)
  const angle = shown ? getAngle(shown, kind === 'source' ? sourceAngleId : loc?.clip.angleId) : undefined
  const url = angle?.mediaUrl
  const offset = angle?.offsetMs ?? 0 // this footage starts `offset` later than the shared timeline
  const mediaTime = Math.max(0, (kind === 'source' ? t : (loc?.sourceT ?? 0)) - offset)
  const clipKey = kind === 'edit' ? `${loc?.clip.id ?? ''}|${angle?.id ?? ''}` : ''
  const angles = shown ? angleList(shown) : []

  // keep <video src> in step with what should be on screen
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (url && v.getAttribute('src') !== url) v.src = url
    if (!url && v.hasAttribute('src')) {
      v.removeAttribute('src')
      v.load()
    }
  }, [url])

  // paused: scrubbing / clicking a word moves the frame
  useEffect(() => {
    const v = videoRef.current
    if (!v || !url || playing) return
    seekMedia(v, mediaTime)
  }, [url, mediaTime, playing])

  // play / pause, and re-seek whenever the clip changes mid-playback
  useEffect(() => {
    const v = videoRef.current
    if (!v || !url) return
    if (!playing) return void v.pause()
    switching.current = true
    const done = () => (switching.current = false)
    v.addEventListener('seeked', done, { once: true })
    const fallback = setTimeout(done, 400)
    seekMedia(v, Math.max(0, (useStore.getState().mode === 'edit' && kind === 'edit'
      ? (locate(useStore.getState().clips, useStore.getState().editT)?.sourceT ?? 0)
      : useStore.getState().sourceT) - offset))
    v.play().catch(() => useStore.getState().setPlaying(false))
    return () => {
      clearTimeout(fallback)
      v.removeEventListener('seeked', done)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, url, clipKey, offset])

  // while playing from media, the video element is the clock
  useEffect(() => {
    const v = videoRef.current
    if (!v || !url || !playing) return
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      if (switching.current) return
      const ms = v.currentTime * 1000 + offset // back onto the shared timeline
      const s = useStore.getState()
      if (kind === 'source') {
        if (v.ended || ms >= s.sources.find((x) => x.id === s.selectedSourceId)!.duration)
          s.setPlaying(false)
        useStore.setState({ sourceT: ms })
        return
      }
      const cur = locate(s.clips, s.editT)
      if (!cur) return
      const { starts, total: all } = layout(s.clips)
      if (ms >= cur.clip.outMs - 15 || v.ended) {
        if (cur.index + 1 < s.clips.length) useStore.setState({ editT: starts[cur.index + 1] })
        else useStore.setState({ editT: all, playing: false })
      } else {
        useStore.setState({ editT: starts[cur.index] + (ms - cur.clip.inMs) })
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [kind, url, playing, offset])

  const label = kind === 'source' ? source.title : (shown?.title ?? 'Empty edit')
  const activeAngle = angle?.id ?? angles[0]?.id ?? ''
  const seek = (ms: number) => (kind === 'source' ? seekSource(ms) : seekEdit(ms))

  const jump = (dir: -1 | 1) => {
    if (kind === 'source') return seek(t + dir * 10_000)
    const { starts } = layout(clips)
    if (!loc) return
    const target = dir < 0 ? (t - starts[loc.index] > 1000 ? loc.index : loc.index - 1) : loc.index + 1
    seek(starts[Math.max(0, Math.min(target, clips.length - 1))] ?? 0)
  }

  return (
    <div className="viewer">
      <div className="screen" data-media={!!url || undefined}>
        <video ref={videoRef} playsInline preload="auto" aria-label={`${label} video`} />
        {!url && (
          <>
            <span className="screen-label">{label}</span>
            {angles.length > 1 && angle && <span className="screen-angle">{angleLabel(angle)}</span>}
            <span className="screen-hint">Simulated playback — no media loaded</span>
          </>
        )}
        {angles.length > 1 && angle && url && <span className="screen-badge">{angleLabel(angle)}</span>}
      </div>
      <AngleChips
        angles={angles}
        active={activeAngle}
        label={kind === 'edit' ? 'Clip angle' : 'Preview angle'}
        onPick={(id) => (kind === 'source' ? setSourceAngle(source.id, id) : loc && setClipAngle(loc.clip.id, id))}
      />
      <div className="transport">
        <button className="tbtn" onClick={() => jump(-1)} aria-label="Previous">
          <Transport kind="prev" />
        </button>
        <button className="tbtn" onClick={() => togglePlay(kind)} aria-label={playing ? 'Pause' : 'Play'}>
          <Transport kind={playing ? 'pause' : 'play'} />
        </button>
        <button className="tbtn" onClick={() => jump(1)} aria-label="Next">
          <Transport kind="next" />
        </button>
        <input
          className="scrub"
          type="range"
          min={0}
          max={Math.max(total, 1)}
          value={Math.min(t, total)}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Scrub"
          style={{ ['--pct' as string]: `${total ? (Math.min(t, total) / total) * 100 : 0}%` }}
        />
        <span className="timecode">{fmt(t)}</span>
      </div>
    </div>
  )
}
