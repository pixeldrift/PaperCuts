import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { FindBar } from './FindBar'
import { FullTextEditor } from './FullTextEditor'
import { findMatches, wordsToText } from '../lib/textdiff'
import { WordInput } from './WordInput'
import { EditHint } from './EditHint'
import { findWord, selectSource, useStore } from '../store'
import type { Word } from '../types'
import { Toolbar } from './Toolbar'
import { Viewer } from './Viewer'

const WordSpan = memo(function WordSpan({
  i,
  text,
  state,
  editing,
  sourceId,
}: {
  i: number
  text: string
  state: string
  editing: boolean
  sourceId: string
}) {
  if (editing) {
    return (
      <span data-w={i} className="editing-word">
        <WordInput sourceId={sourceId} index={i} initial={text} />{' '}
      </span>
    )
  }
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
  const editMode = useStore((s) => s.editMode)
  const find = useStore((s) => s.find)
  const [fullText, setFullText] = useState<string | null>(null)
  const editIdx = useStore((s) => (s.editingWord?.sourceId === s.selectedSourceId ? s.editingWord.index : -1))
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

  // find & replace: matches in this transcript, and which words they cover
  const matches = useMemo(
    () => (find ? findMatches(source.words, { query: find.query, matchCase: find.matchCase, wholeWord: find.wholeWord }) : []),
    [source, find?.query, find?.matchCase, find?.wholeWord], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const curMatch = matches.length ? Math.min(find?.cur ?? 0, matches.length - 1) : -1
  const found = useMemo(() => {
    const flags = new Uint8Array(source.words.length)
    matches.forEach((m, k) => {
      for (let i = m.fromWord; i <= m.toWord; i++) flags[i] = k === curMatch ? 2 : 1
    })
    return flags
  }, [matches, curMatch, source])
  useEffect(() => {
    if (curMatch < 0) return
    rootRef.current?.querySelector<HTMLElement>(`[data-w="${matches[curMatch].fromWord}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [curMatch, matches])

  // switching source closes the full-text editor
  useEffect(() => setFullText(null), [source.id])

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
    <section
      className="pane source-pane"
      aria-label="Source"
      data-compact={editMode || !!find || fullText !== null || undefined}
    >
      <header className="pane-head">
        <h2>Source – {source.title}</h2>
      </header>
      <Viewer kind="source" />
      <Toolbar
        groups={[
          [
            { icon: 'storyNote', label: 'Add Story Note', short: 'Story Note', shortcut: 'N', onClick: () => st.toast('Story notes attach to clips in the paper edit') },
            { icon: 'comment', label: 'Add Comment', short: 'Comment', shortcut: 'C', onClick: () => st.toast('Comments attach to clips in the paper edit') },
            { icon: 'editTranscript', label: 'Edit Transcript', short: 'Edit Text', shortcut: 'T', onClick: st.toggleTranscriptEdit, active: editMode },
            { icon: 'find', label: 'Find and Replace', short: 'Find', shortcut: 'Cmd+F', onClick: () => (find ? st.closeFind() : st.openFind()), active: !!find },
          ],
          [
            { icon: 'insert', label: 'Insert', short: 'Insert', shortcut: ',', onClick: st.insert, disabled: !sel },
            { icon: 'overwrite', label: 'Overwrite', short: 'Overwrite', shortcut: '.', onClick: st.overwrite, disabled: !sel },
          ],
          [
            { icon: 'textGrow', label: 'Zoom Text', short: 'Text +', shortcut: '+', onClick: () => st.zoomText(1) },
            { icon: 'textShrink', label: 'Shrink Text', short: 'Text −', shortcut: '−', onClick: () => st.zoomText(-1) },
          ],
        ]}
      />
      {editMode && <EditHint onFullText={() => setFullText(wordsToText(source.words))} />}
      {find && <FindBar count={matches.length} />}
      {fullText !== null ? (
        <FullTextEditor
          initial={fullText}
          onCancel={() => setFullText(null)}
          onApply={(t) => {
            st.applyFullText(source.id, t)
            setFullText(null)
          }}
        />
      ) : (
      <div
        className="transcript"
        ref={rootRef}
        data-edit={editMode || undefined}
        onClick={(e) => {
          // a plain click on a word: edit it (edit mode) or jump the playhead to it
          const el = (e.target as HTMLElement).closest<HTMLElement>('[data-w]')
          if (!el || el.classList.contains('editing-word') || !window.getSelection()?.isCollapsed) return
          const i = Number(el.dataset.w)
          if (useStore.getState().editMode) useStore.getState().startWordEdit(source.id, i)
          else useStore.getState().seekSource(source.words[i].s)
        }}
      >
        {source.words.length === 0 && (
          <div className="no-transcript">
            <p>This source has no transcript yet.</p>
            <p>Import an .srt, .vtt or word-level .json file (same name as the video) to start selecting.</p>
          </div>
        )}
        {paragraphs.map((para) => (
          <p key={para.p}>
            {para.words.map(({ w, i }) => {
              const cls = [
                used[i] ? 'used' : '',
                found[i] === 2 ? 'find-cur' : found[i] === 1 ? 'find' : '',
                sel && i >= sel[0] && i <= sel[1] ? 'sel' : '',
                i === cur ? 'cur' : '',
              ]
                .filter(Boolean)
                .join(' ')
              return <WordSpan key={i} i={i} text={w.t} state={cls} editing={i === editIdx} sourceId={source.id} />
            })}
          </p>
        ))}
      </div>
      )}
    </section>
  )
}
