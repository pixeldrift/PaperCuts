import { memo, useEffect, useMemo, useRef } from 'react'
import { findWord, selectSource, useStore } from '../store'
import type { Word } from '../types'
import { Toolbar } from './Toolbar'
import { Viewer } from './Viewer'

const WordSpan = memo(function WordSpan({
  i,
  text,
  state,
}: {
  i: number
  text: string
  state: string
}) {
  return (
    <span data-w={i} className={state || undefined}>
      {text}{' '}
    </span>
  )
})

/** Resolve a DOM selection endpoint to a word index. */
function wordIndexAt(node: Node | null, offset: number): number | null {
  if (!node) return null
  let el: Node | null = node
  if (node.nodeType === Node.ELEMENT_NODE && node.childNodes[offset]) el = node.childNodes[offset]
  const span = (el instanceof Element ? el : el?.parentElement)?.closest<HTMLElement>('[data-w]')
  return span ? Number(span.dataset.w) : null
}

export function SourcePane() {
  const source = useStore(selectSource)
  const clips = useStore((s) => s.clips)
  const sel = useStore((s) => s.sourceSel)
  const cur = useStore((s) => (s.mode === 'source' ? findWord(selectSource(s).words, s.sourceT) : -1))
  const playing = useStore((s) => s.playing && s.mode === 'source')
  const rootRef = useRef<HTMLDivElement>(null)
  const st = useStore.getState()

  // words already used in the paper edit are marked in the transcript
  const used = useMemo(() => {
    const flags = new Uint8Array(source.words.length)
    for (const c of clips) {
      if (c.sourceId !== source.id) continue
      source.words.forEach((w, i) => {
        if (w.s >= c.inMs - 1 && w.e <= c.outMs + 1) flags[i] = 1
      })
    }
    return flags
  }, [clips, source])

  const paragraphs = useMemo(() => {
    const out: { p: number; words: { w: Word; i: number }[] }[] = []
    source.words.forEach((w, i) => {
      if (!out.length || out[out.length - 1].p !== w.p) out.push({ p: w.p, words: [] })
      out[out.length - 1].words.push({ w, i })
    })
    return out
  }, [source])

  // text selection → word range (works with mouse and touch long-press)
  useEffect(() => {
    const onChange = () => {
      const s = window.getSelection()
      const root = rootRef.current
      if (!s || !root || !s.anchorNode || !root.contains(s.anchorNode)) return
      if (s.isCollapsed) return useStore.getState().setSourceSel(null)
      const a = wordIndexAt(s.anchorNode, s.anchorOffset)
      const f = wordIndexAt(s.focusNode, s.focusOffset)
      if (a == null || f == null) return
      useStore.getState().setSourceSel([Math.min(a, f), Math.max(a, f)])
    }
    document.addEventListener('selectionchange', onChange)
    return () => document.removeEventListener('selectionchange', onChange)
  }, [])

  // follow the playhead
  useEffect(() => {
    if (!playing) return
    rootRef.current?.querySelector<HTMLElement>(`[data-w="${cur}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [cur, playing])

  return (
    <section className="pane source-pane" aria-label="Source">
      <header className="pane-head">
        <h2>Source – {source.title}</h2>
      </header>
      <Viewer kind="source" />
      <Toolbar
        groups={[
          [
            { icon: 'storyNote', label: 'Add Story Note', shortcut: 'N', onClick: () => st.toast('Story notes attach to clips in the paper edit') },
            { icon: 'comment', label: 'Add Comment', shortcut: 'C', onClick: () => st.toast('Comments attach to clips in the paper edit') },
            { icon: 'editTranscript', label: 'Edit Transcript', shortcut: 'T', onClick: () => st.toast('Transcript editing is coming soon') },
          ],
          [
            { icon: 'insert', label: 'Insert', shortcut: ',', onClick: st.insert, disabled: !sel },
            { icon: 'overwrite', label: 'Overwrite', shortcut: '.', onClick: st.overwrite, disabled: !sel },
          ],
          [
            { icon: 'textGrow', label: 'Zoom Text', shortcut: '+', onClick: () => st.zoomText(1) },
            { icon: 'textShrink', label: 'Shrink Text', shortcut: '−', onClick: () => st.zoomText(-1) },
          ],
        ]}
      />
      <div className="transcript" ref={rootRef}>
        {paragraphs.map((para) => (
          <p key={para.p}>
            {para.words.map(({ w, i }) => {
              const cls = [
                used[i] ? 'used' : '',
                sel && i >= sel[0] && i <= sel[1] ? 'sel' : '',
                i === cur ? 'cur' : '',
              ]
                .filter(Boolean)
                .join(' ')
              return <WordSpan key={i} i={i} text={w.t} state={cls} />
            })}
          </p>
        ))}
      </div>
    </section>
  )
}
