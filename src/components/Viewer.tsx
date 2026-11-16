import { Transport } from '../icons'
import { fmt, layout, locate, useStore, selectSource } from '../store'

/**
 * Stand-in for the video player. There is no media yet, so this simulates
 * playback with a clock; swapping in real <video> elements later only
 * touches this component and the store's `tick`.
 */
export function Viewer({ kind }: { kind: 'source' | 'edit' }) {
  const source = useStore(selectSource)
  const clips = useStore((s) => s.clips)
  const t = useStore((s) => (kind === 'source' ? s.sourceT : s.editT))
  const playing = useStore((s) => s.playing && s.mode === kind)
  const { togglePlay, seekSource, seekEdit } = useStore.getState()

  const total = kind === 'source' ? source.duration : layout(clips).total
  const loc = kind === 'edit' ? locate(clips, t) : null
  const label =
    kind === 'source'
      ? source.title
      : loc
        ? useStore.getState().sources.find((s) => s.id === loc.clip.sourceId)?.title
        : 'Empty edit'

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
      <div className="screen">
        <span className="screen-label">{label}</span>
        <span className="screen-hint">Simulated playback — no media loaded</span>
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
