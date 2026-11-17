import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Avatar, Icon } from '../icons'
import { openImportPicker, runImport } from '../lib/runImport'
import { fmt, useStore } from '../store'
import type { Source } from '../types'
import { PaneHead } from './PaneHead'
import { SortArrows } from './SortArrows'
import { ToolButton } from './Toolbar'

// ───────────────────────── columns ─────────────────────────

type ColKey =
  | 'thumb'
  | 'title'
  | 'duration'
  | 'date'
  | 'recordedAt'
  | 'camera'
  | 'shotType'
  | 'filename'
  | 'transcript'
  | 'multicam'

/** One table row: a source, or (when synced clips are combined) a multicam group led by its primary. */
interface Row {
  primary: Source
  /** Every angle of this take (just the source itself if it isn't multicam). */
  angles: Source[]
  child?: boolean
}

interface Col {
  key: ColKey
  label: string
  /** Checkbox label in the options box. */
  option: string
  sort?: (r: Row) => string | number
  render: (r: Row, ctx: { combine: boolean; expanded: boolean; toggle: () => void }) => ReactNode
  defaultOn: boolean
  locked?: boolean
}

const clock = (hhmm?: string) => {
  if (!hhmm) return '—'
  const [h, m] = hhmm.split(':').map(Number)
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

const COLS: Col[] = [
  { key: 'thumb', label: 'Thumb', option: 'Thumbnail', defaultOn: true, render: (r) => <Avatar size={r.child ? 26 : 34} /> },
  { key: 'title', label: 'Title', option: 'Title', defaultOn: true, locked: true, sort: (r) => r.primary.title.toLowerCase(), render: (r) => <span className="cell-title">{r.primary.title}</span> },
  { key: 'duration', label: 'Duration', option: 'Duration', defaultOn: true, sort: (r) => r.primary.duration, render: (r) => <span className="num">{fmt(r.primary.duration)}</span> },
  { key: 'date', label: 'Date', option: 'Date', defaultOn: true, sort: (r) => Date.parse(r.primary.date) || 0, render: (r) => r.primary.date },
  { key: 'recordedAt', label: 'Recorded', option: 'Time recorded', defaultOn: false, sort: (r) => r.primary.recordedAt ?? '', render: (r) => <span className="num">{clock(r.primary.recordedAt)}</span> },
  { key: 'camera', label: 'Camera', option: 'Camera', defaultOn: false, sort: (r) => (r.primary.camera ?? '').toLowerCase(), render: (r) => (r.primary.camera ? <span className="chip">{r.primary.camera}</span> : '—') },
  { key: 'shotType', label: 'Shot', option: 'Shot type', defaultOn: false, sort: (r) => (r.primary.shotType ?? '').toLowerCase(), render: (r) => r.primary.shotType ?? '—' },
  { key: 'filename', label: 'Filename', option: 'Filename', defaultOn: false, sort: (r) => (r.primary.filename ?? '').toLowerCase(), render: (r) => <span className="mono">{r.primary.filename ?? '—'}</span> },
  {
    key: 'transcript',
    label: 'Transcript',
    option: 'Transcript (✓ and format)',
    defaultOn: false,
    sort: (r) => (r.primary.words.length ? (r.primary.transcriptFormat ?? 'z') : '~'),
    render: (r) =>
      r.primary.words.length ? (
        <span className="tx-ok" title={`Transcript loaded${r.primary.transcriptFormat ? ` (${r.primary.transcriptFormat.toUpperCase()})` : ''}`}>
          ✓ {r.primary.transcriptFormat && <small>{r.primary.transcriptFormat.toUpperCase()}</small>}
        </span>
      ) : (
        <span className="tx-none" title="No transcript">—</span>
      ),
  },
  {
    key: 'multicam',
    label: 'Multicam',
    option: 'Multicam',
    defaultOn: false,
    sort: (r) => r.angles.length,
    render: (r, { combine, expanded, toggle }) => {
      if (r.child || r.angles.length < 2) return null
      const tag = (
        <span className="mc-tag">
          <Icon name="multicam" size={13} /> {r.angles.length} angles
        </span>
      )
      return combine ? (
        <button
          className="twirl"
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Hide' : 'Show'} ${r.angles.length} angles`}
          onClick={(e) => (e.stopPropagation(), toggle())}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <span className="twirl-chevron" data-open={expanded || undefined}>▸</span>
          {tag}
        </button>
      ) : (
        tag
      )
    },
  },
]

// ───────────────────────── persisted view settings ─────────────────────────

interface View {
  cols: Record<ColKey, boolean>
  combine: boolean
}
const KEY = 'papercuts.sourcesView'
const defaults = (): View => ({
  cols: Object.fromEntries(COLS.map((c) => [c.key, c.defaultOn])) as Record<ColKey, boolean>,
  combine: false,
})
function loadView(): View {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<View> | null
    const d = defaults()
    return saved ? { combine: !!saved.combine, cols: { ...d.cols, ...saved.cols, title: true } } : d
  } catch {
    return defaults()
  }
}

// ───────────────────────── component ─────────────────────────

export function SourcesPanel() {
  const sources = useStore((s) => s.sources)
  const selected = useStore((s) => s.selectedSourceId)
  const { selectSource, openSource, removeSource, setSourcesOpen } = useStore.getState()
  const [query, setQuery] = useState('')
  const [dragging, setDragging] = useState(false)
  const [sort, setSort] = useState<{ key: ColKey; dir: 1 | -1 } | null>(null)
  const [view, setView] = useState<View>(loadView)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const lastTap = useRef<{ id: string; t: number } | null>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(view))
    } catch {
      /* storage unavailable */
    }
  }, [view])

  // close the options box on outside tap / Esc
  useEffect(() => {
    if (!optionsOpen) return
    const away = (e: PointerEvent) => {
      const t = e.target as HTMLElement
      if (!popRef.current?.contains(t) && !t.closest('[data-options-btn]')) setOptionsOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOptionsOpen(false)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [optionsOpen])

  const showMulticam = view.cols.multicam || view.combine
  const stuck = (key: ColKey, first: ColKey) =>
    key === 'thumb' ? { className: 'sticky', style: { left: 0 } } : key === 'title' ? { className: 'sticky edge', style: { left: first === 'thumb' ? 52 : 0 } } : null
  const visible = COLS.filter((c) => (c.key === 'multicam' ? showMulticam : view.cols[c.key]))

  const rows = useMemo(() => {
    const groups = new Map<string, Source[]>()
    for (const s of sources) if (s.syncId) groups.set(s.syncId, [...(groups.get(s.syncId) ?? []), s])
    const seen = new Set<string>()
    let list: Row[] = []
    for (const s of sources) {
      const angles = s.syncId ? groups.get(s.syncId)! : [s]
      if (view.combine && s.syncId) {
        if (seen.has(s.syncId)) continue
        seen.add(s.syncId)
      }
      list.push({ primary: s, angles })
    }
    const q = query.trim().toLowerCase()
    if (q) {
      const hit = (s: Source) => [s.title, s.camera, s.shotType, s.filename].some((v) => v?.toLowerCase().includes(q))
      list = list.filter((r) => (view.combine ? r.angles.some(hit) : hit(r.primary)))
    }
    const col = sort && COLS.find((c) => c.key === sort.key)
    if (col?.sort && sort) {
      const val = col.sort
      list = [...list].sort((a, b) => {
        const av = val(a)
        const bv = val(b)
        return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir
      })
    }
    return list
  }, [sources, query, sort, view.combine])

  const tap = (id: string) => {
    const now = Date.now()
    if (lastTap.current?.id === id && now - lastTap.current.t < 400) {
      lastTap.current = null
      openSource(id) // double tap / double click → open it and go to the Source tab
    } else {
      lastTap.current = { id, t: now }
      selectSource(id)
    }
  }

  const cycleSort = (key: ColKey) =>
    setSort((p) => (p?.key !== key ? { key, dir: 1 } : p.dir === 1 ? { key, dir: -1 } : null))

  const renderRow = (r: Row, key: string) => {
    const id = r.primary.id
    const groupHasSel = r.angles.some((a) => a.id === selected)
    const isSel = r.child ? id === selected : view.combine && r.angles.length > 1 ? groupHasSel : id === selected
    const open = !!r.primary.syncId && expanded.has(r.primary.syncId)
    return (
      <tr
        key={key}
        data-selected={isSel || undefined}
        data-child={r.child || undefined}
        onClick={() => tap(id)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') openSource(id)
          else if (e.key === ' ') (e.preventDefault(), selectSource(id))
        }}
        title="Double-tap to open"
      >
        {visible.map((c) => (
          <td
            key={c.key}
            className={[c.key === 'thumb' ? 'thumb-col' : c.key === 'duration' ? 'num' : '', stuck(c.key, visible[0].key)?.className ?? ''].join(' ').trim() || undefined}
            style={stuck(c.key, visible[0].key)?.style}
          >
            {c.render(r, {
              combine: view.combine,
              expanded: open,
              toggle: () =>
                setExpanded((p) => {
                  const n = new Set(p)
                  if (n.has(r.primary.syncId!)) n.delete(r.primary.syncId!)
                  else n.add(r.primary.syncId!)
                  return n
                }),
            })}
          </td>
        ))}
      </tr>
    )
  }

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
      <PaneHead
        kind="sources"
        title={`${sources.length} source${sources.length === 1 ? '' : 's'}`}
        right={
          <button className="drawer-close" onClick={() => setSourcesOpen(false)} aria-label="Close sources">
            ✕
          </button>
        }
      />
      <div className="source-tools">
        <input className="search" type="search" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
        <ToolButton icon="importSource" label="Import Source" short="Import" shortcut="Cmd+I" onClick={openImportPicker} />
        <ToolButton icon="removeSource" label="Remove Source" short="Remove" onClick={removeSource} tone="danger" />
        <span data-options-btn>
          <ToolButton icon="options" label="Table options — columns and view" short="Options" onClick={() => setOptionsOpen((o) => !o)} active={optionsOpen} />
        </span>
      </div>

      {optionsOpen && (
        <div className="options-pop" ref={popRef} role="dialog" aria-label="Table options">
          <div className="options-head">
            <b>Columns</b>
            <button className="fbtn" onClick={() => (setView(defaults()), setSort(null))}>Reset</button>
          </div>
          <div className="options-grid">
            {COLS.map((c) => (
              <label key={c.key} className={c.locked ? 'locked' : undefined}>
                <input
                  type="checkbox"
                  checked={c.key === 'multicam' ? showMulticam : view.cols[c.key]}
                  disabled={c.locked || (c.key === 'multicam' && view.combine)}
                  onChange={(e) => setView((v) => ({ ...v, cols: { ...v.cols, [c.key]: e.target.checked } }))}
                />
                {c.option}
              </label>
            ))}
          </div>
          <div className="options-head view">
            <b>View</b>
          </div>
          <label className="options-combine">
            <input type="checkbox" checked={view.combine} onChange={(e) => setView((v) => ({ ...v, combine: e.target.checked }))} />
            <span>
              Combine synced clips
              <small>Groups multicam angles into one row with a twirl-down. Turns on the Multicam column.</small>
            </span>
          </label>
        </div>
      )}

      <div className="table-wrap">
        <table className="sources-table">
          <thead>
            <tr>
              {visible.map((c) => {
                const active = sort?.key === c.key
                return (
                  <th
                    key={c.key}
                    className={[c.key === 'thumb' ? 'thumb-col' : '', stuck(c.key, visible[0].key)?.className ?? ''].join(' ').trim() || undefined}
                    style={stuck(c.key, visible[0].key)?.style}
                    aria-sort={active ? (sort!.dir === 1 ? 'ascending' : 'descending') : c.sort ? 'none' : undefined}
                  >
                    {c.sort ? (
                      <button className="th-btn" data-active={active || undefined} onClick={() => cycleSort(c.key)} title={`Sort by ${c.label}`}>
                        <span>{c.label}</span>
                        <SortArrows dir={active ? sort!.dir : null} />
                      </button>
                    ) : (
                      <span className="th-plain">{c.label}</span>
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.flatMap((r) => {
              const out = [renderRow(r, r.primary.id)]
              if (view.combine && r.angles.length > 1 && r.primary.syncId && expanded.has(r.primary.syncId)) {
                r.angles.forEach((a) => out.push(renderRow({ primary: a, angles: [a], child: true }, `${r.primary.id}>${a.id}`)))
              }
              return out
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="drop-hint">No sources match “{query}”.</p>}
        <p className="drop-hint">Double-tap a source to open it. Drop video and .srt / .vtt / .json files here, or press Import.</p>
      </div>
    </section>
  )
}
