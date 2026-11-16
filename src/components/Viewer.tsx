import { useEffect, useRef } from 'react'
import { Transport } from '../icons'
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
  const t = useStore((s) => (kind === 'source' ? s.sourceT : s.editT))
  const playing = useStore((s) => s.playing && s.mode === kind)
  const { togglePlay, seekSource, seekEdit } = useStore.getState()
  const videoRef = useRef<HTMLVideoElement>(null)
  const switching = useRef(false)

  const total = kind === 'source' ? source.duration : layout(clips).total
  const loc = kind === 'edit' ? locate(clips, t) : null
  const shown = kind === 'source' ? source : sources.find((s) => s.id === loc?.clip.sourceId)
  const url = shown?.mediaUrl
  const mediaTime = kind === 'source' ? t : (loc?.sourceT ?? 0)
  const clipKey = kind === 'edit' ? (loc?.clip.id ?? '') : ''

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
    seekMedia(v, useStore.getState().mode === 'edit' && kind === 'edit'
      ? (locate(useStore.getState().clips, useStore.getState().editT)?.sourceT ?? 0)
      : useStore.getState().sourceT)
    v.play().catch(() => useStore.getState().setPlaying(false))
    return () => {
      clearTimeout(fallback)
      v.removeEventListener('seeked', done)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, url, clipKey])

  // while playing from media, the video element is the clock
  useEffect(() => {
    const v = videoRef.current
    if (!v || !url || !playing) return
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      if (switching.current) return
      const ms = v.currentTime * 1000
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
  }, [kind, url, playing])

  const label = kind === 'source' ? source.title : (shown?.title ?? 'Empty edit')
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
            <span className="screen-hint">Simulated playback — no media loaded</span>
          </>
        )}
      </div>
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
