import { useEffect, useMemo, useRef } from 'react'
import { Icon } from '../icons'
import { findMatches } from '../lib/textdiff'
import { selectSource, useStore } from '../store'

/** Find & replace across the open transcript (or every source) — for fixing mis-heard jargon. */
export function FindBar({ count }: { count: number }) {
  const find = useStore((s) => s.find)
  const sources = useStore((s) => s.sources)
  const source = useStore(selectSource)
  const { setFind, closeFind, replaceMatches } = useStore.getState()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const others = useMemo(() => {
    if (!find?.allSources || !find.query.trim()) return 0
    const opts = { query: find.query, matchCase: find.matchCase, wholeWord: find.wholeWord }
    return sources.filter((x) => x.id !== source.id).reduce((n, x) => n + findMatches(x.words, opts).length, 0)
  }, [find?.allSources, find?.query, find?.matchCase, find?.wholeWord, sources, source.id])

  if (!find) return null
  const step = (dir: 1 | -1) => count && setFind({ cur: (find.cur + dir + count) % count })
  const has = find.query.trim().length > 0
  const total = count + others

  return (
    <div className="findbar" role="search" onMouseDown={(e) => e.stopPropagation()}>
      <div className="find-row">
        <input
          ref={inputRef}
          className="find-input"
          placeholder="Find"
          value={find.query}
          onChange={(e) => setFind({ query: e.target.value, cur: 0 })}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') (e.preventDefault(), step(e.shiftKey ? -1 : 1))
            else if (e.key === 'Escape') closeFind()
          }}
          aria-label="Find"
        />
        <span className="find-count" aria-live="polite">
          {!has ? '' : total === 0 ? 'No matches' : count ? `${Math.min(find.cur, count - 1) + 1} of ${count}${others ? ` (+${others})` : ''}` : `0 here (+${others})`}
        </span>
        <button className="fbtn" onClick={() => step(-1)} disabled={!count} aria-label="Previous match" title="Previous (Shift+Enter)">↑</button>
        <button className="fbtn" onClick={() => step(1)} disabled={!count} aria-label="Next match" title="Next (Enter)">↓</button>
        <button className="fbtn close" onClick={closeFind} aria-label="Close find" title="Close (Esc)">✕</button>
      </div>
      <div className="find-row">
        <input
          className="find-input"
          placeholder="Replace with"
          value={find.replace}
          onChange={(e) => setFind({ replace: e.target.value })}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') (e.preventDefault(), replaceMatches(false))
            else if (e.key === 'Escape') closeFind()
          }}
          aria-label="Replace with"
        />
        <button className="fbtn wide" onClick={() => replaceMatches(false)} disabled={!count}>Replace</button>
        <button className="fbtn wide" onClick={() => replaceMatches(true)} disabled={!has || total === 0}>
          Replace all
        </button>
      </div>
      <div className="find-opts">
        <label><input type="checkbox" checked={find.matchCase} onChange={(e) => setFind({ matchCase: e.target.checked, cur: 0 })} /> Match case</label>
        <label><input type="checkbox" checked={find.wholeWord} onChange={(e) => setFind({ wholeWord: e.target.checked, cur: 0 })} /> Whole word</label>
        <label><input type="checkbox" checked={find.allSources} onChange={(e) => setFind({ allSources: e.target.checked })} /> All sources</label>
        <span className="find-icon" aria-hidden><Icon name="find" size={14} /></span>
      </div>
    </div>
  )
}
