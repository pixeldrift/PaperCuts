import { useMemo, useState } from 'react'
import { Avatar } from '../icons'
import { ToolButton } from './Toolbar'
import { openImportPicker, runImport } from '../lib/runImport'
import { fmt, useStore } from '../store'

type SortKey = 'title' | 'duration' | 'date'

export function SourcesPanel() {
  const sources = useStore((s) => s.sources)
  const selected = useStore((s) => s.selectedSourceId)
  const { selectSource, removeSource, setSourcesOpen } = useStore.getState()
  const [query, setQuery] = useState('')
  const [dragging, setDragging] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = sources.filter((s) => s.title.toLowerCase().includes(q))
    if (!sort) return list
    return [...list].sort((a, b) => {
      const av = sort.key === 'date' ? Date.parse(a.date) : sort.key === 'duration' ? a.duration : a.title
      const bv = sort.key === 'date' ? Date.parse(b.date) : sort.key === 'duration' ? b.duration : b.title
      return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir
    })
  }, [sources, query, sort])

  const th = (key: SortKey, label: string) => (
    <th>
      <button
        className="th-btn"
        onClick={() => setSort((p) => (p?.key === key ? { key, dir: (p.dir * -1) as 1 | -1 } : { key, dir: 1 }))}
      >
        {label}
        {sort?.key === key && <span aria-hidden>{sort.dir === 1 ? ' ▲' : ' ▼'}</span>}
      </button>
    </th>
  )

  return (
    <section
      className={`pane sources${dragging ? ' drop-active' : ''}`}
      aria-label="Sources"
      onDragOver={(e) => (e.preventDefault(), setDragging(true))}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        void runImport([...e.dataTransfer.files])
      }}
    >
      <header className="pane-head">
        <h2>Sources</h2>
        <button className="drawer-close" onClick={() => setSourcesOpen(false)} aria-label="Close sources">
          ✕
        </button>
      </header>
      <div className="source-tools">
        <input
          className="search"
          type="search"
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <ToolButton icon="importSource" label="Import Source" short="Import" shortcut="Cmd+I" onClick={openImportPicker} />
        <ToolButton icon="removeSource" label="Remove Source" short="Remove" onClick={removeSource} tone="danger" />
      </div>
      <div className="table-wrap">
        <table className="sources-table">
          <thead>
            <tr>
              <th className="thumb-col">Thumb</th>
              {th('title', 'Title')}
              {th('duration', 'Duration')}
              {th('date', 'Date')}
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr
                key={s.id}
                data-selected={s.id === selected || undefined}
                onClick={() => selectSource(s.id)}
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && selectSource(s.id)}
              >
                <td className="thumb-col">
                  <Avatar size={34} />
                </td>
                <td>{s.title}</td>
                <td className="num">{fmt(s.duration)}</td>
                <td>{s.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="drop-hint">Drop video and .srt / .vtt / .json transcript files here, or press the + button.</p>
      </div>
    </section>
  )
}
