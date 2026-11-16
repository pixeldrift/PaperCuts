import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'

/**
 * Inline editor for one transcript word.
 *   Enter = save · Tab / Shift+Tab = save and move on · Esc = cancel
 *   typing a space splits the word in two · clearing it deletes the word
 */
export function WordInput({ sourceId, index, initial }: { sourceId: string; index: number; initial: string }) {
  const [text, setText] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.select()
    el.scrollIntoView({ block: 'nearest' })
  }, [])

  const stillMine = () => {
    const e = useStore.getState().editingWord
    return !!e && e.sourceId === sourceId && e.index === index
  }

  return (
    <input
      ref={ref}
      className="word-input"
      value={text}
      size={Math.max(2, text.length + 1)}
      spellCheck
      autoCapitalize="off"
      autoCorrect="off"
      aria-label="Edit word"
      onChange={(e) => setText(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => {
        // ignore the blur that follows moving to another word / closing
        if (stillMine()) useStore.getState().commitWordEdit(text, 0)
      }}
      onKeyDown={(e) => {
        e.stopPropagation()
        const { commitWordEdit, cancelWordEdit } = useStore.getState()
        if (e.key === 'Enter') (e.preventDefault(), commitWordEdit(text, 0))
        else if (e.key === 'Tab') (e.preventDefault(), commitWordEdit(text, e.shiftKey ? -1 : 1))
        else if (e.key === 'Escape') (e.preventDefault(), cancelWordEdit())
      }}
    />
  )
}
