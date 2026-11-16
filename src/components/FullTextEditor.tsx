import { useEffect, useMemo, useRef, useState } from 'react'
import { tokenize } from '../lib/textdiff'

/**
 * The whole transcript as plain text. Each line is a paragraph, so pressing
 * Enter adds a paragraph break. Unchanged words keep their timing; new words
 * share the time between the words on either side.
 */
export function FullTextEditor({
  initial,
  onApply,
  onCancel,
}: {
  initial: string
  onApply: (text: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(initial)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => ref.current?.focus(), [])

  const before = useMemo(() => tokenize(initial).length, [initial])
  const after = useMemo(() => tokenize(text).length, [text])
  const paras = useMemo(() => (tokenize(text).at(-1)?.p ?? -1) + 1, [text])
  const dirty = text !== initial

  return (
    <div className="fulltext">
      <textarea
        ref={ref}
        value={text}
        spellCheck
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape') onCancel()
          else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) (e.preventDefault(), onApply(text))
        }}
        aria-label="Full transcript text"
      />
      <div className="fulltext-bar">
        <span className="fulltext-stats">
          {before} → {after} words · {paras} paragraph{paras === 1 ? '' : 's'}
        </span>
        <span className="fulltext-note">New words share the time between the words around them.</span>
        <button className="fbtn wide" onClick={onCancel}>Cancel</button>
        <button className="fbtn wide primary" onClick={() => onApply(text)} disabled={!dirty} title="Apply (Cmd+Enter)">
          Apply
        </button>
      </div>
    </div>
  )
}
