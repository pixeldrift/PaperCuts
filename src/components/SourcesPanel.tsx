import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Avatar, Icon } from '../icons'
import { angleList } from '../lib/angles'
import { openImportPicker, runImport } from '../lib/runImport'
import { fmt, useStore } from '../store'
import { PRIMARY_ANGLE, type Angle, type Source } from '../types'
import { ClipInfo } from './ClipInfo'
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
  | 'scene'
  | 'take'
  | 'director'
  | 'dp'
  | 'interviewer'

/** One table row: a clip (source), or — when it has several angles — one of its angles. */
interface Row {
  source: Source
  /** The angle this row describes (a combined parent row describes the primary angle). */
  angle: Angle
  /** Every angle of the clip. */
  angles: Angle[]
  /** An angle row listed under its combined parent. */
  child?: boolean
}

interface Ctx {
  combine: boolean
  expanded: boolean
  toggle: () => void
}

interface Col {
  key: ColKey
  label: string
  /** Checkbox label in the options box. */
  option: string
  sort?: (r: Row) => string | number
  render: (r: Row, ctx: Ctx) => ReactNode
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
  {
    key: 'title',
    label: 'Title',
    option: 'Title',
    defaultOn: true,
    locked: true,
    sort: (r) => r.source.title.toLowerCase(),
    render: (r) =>
      r.child ? (
        <span className="cell-angle">
          <span className="chip">{r.angle.camera}</span> {r.angle.shotType ?? ''}
        </span>
      ) : (
        <span className="cell-title">{r.source.title}</span>
      ),
  },
  { key: 'duration', label: 'Duration', option: 'Duration', defaultOn: true, sort: (r) => r.source.duration, render: (r) => <span className="num">{fmt(r.source.duration)}</span> },
  { key: 'date', label: 'Date', option: 'Date', defaultOn: true, sort: (r) => Date.parse(r.source.date) || 0, render: (r) => r.source.date },
  { key: 'recordedAt', label: 'Recorded', option: 'Time recorded', defaultOn: false, sort: (r) => r.angle.recordedAt ?? '', render: (r) => <span className="num">{clock(r.angle.recordedAt)}</span> },
  {
    key: 'camera',
    label: 'Camera',
    option: 'Camera',
    defaultOn: false,
    sort: (r) => r.angle.camera.toLowerCase(),
    render: (r, { combine }) =>
      combine && !r.child && r.angles.length > 1 ? (
        <span className="chips">{r.angles.map((a) => <span key={a.id} className="chip">{a.camera}</span>)}</span>
      ) : (
        <span className="chip">{r.angle.camera}</span>
      ),
  },
  { key: 'shotType', label: 'Shot', option: 'Shot type', defaultOn: false, sort: (r) => (r.angle.shotType ?? '').toLowerCase(), render: (r) => r.angle.shotType ?? '—' },
  { key: 'filename', label: 'Filename', option: 'Filename', defaultOn: false, sort: (r) => (r.angle.filename ?? '').toLowerCase(), render: (r) => <span className="mono">{r.angle.filename ?? '—'}</span> },
  { key: 'scene', label: 'Scene', option: 'Scene', defaultOn: false, sort: (r) => (r.source.scene ?? '').padStart(6, '0'), render: (r) => r.source.scene ?? '—' },
  { key: 'take', label: 'Take', option: 'Take', defaultOn: false, sort: (r) => (r.source.take ?? '').padStart(6, '0'), render: (r) => r.source.take ?? '—' },
  { key: 'director', label: 'Director', option: 'Director', defaultOn: false, sort: (r) => (r.source.director ?? '').toLowerCase(), render: (r) => r.source.director ?? '—' },
  { key: 'dp', label: 'DP / Op', option: 'DP / Camera op', defaultOn: false, sort: (r) => (r.source.dp ?? '').toLowerCase(), render: (r) => r.source.dp ?? '—' },
  { key: 'interviewer', label: 'Interviewer', option: 'Interviewer', defaultOn: false, sort: (r) => (r.source.interviewer ?? '').toLowerCase(), render: (r) => r.source.interviewer ?? '—' },
  {
    key: 'transcript',
    label: 'Transcript',
    option: 'Transcript (✓ and format)',
    defaultOn: false,
    sort: (r) => (r.source.words.length ? (r.source.transcriptFormat ?? 'z') : '~'),
    render: (r) =>
      r.source.words.length ? (
        <span
          className="tx-ok"
          title={`Transcript loaded${r.source.transcriptFormat ? ` (${r.source.transcriptFormat.toUpperCase()})` : ''}${r.angles.length > 1 ? ' — shared by all angles' : ''}`}
        >
          ✓ {r.source.transcriptFormat && <small>{r.source.transcriptFormat.toUpperCase()}</small>}
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
          <Icon name="multicam" size={13} /> {combine ? `${r.angles.length} angles` : `Angle ${r.angle.camera}`}
        </span>
      )
      return combine ? (
        <button
          className="twirl"
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Hide' : 'Show'} ${r.angles.length} angles`}
          onClick={(e) => (e.stopPropagation(), toggle())}
          onDoubleClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
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
  /** One row per clip (angles under a twirl-down) vs. every angle as its own row. */
  combine: boolean
}
const KEY = 'papercuts.sourcesView2'
const defaults = (): View => ({
  cols: Object.fromEntries(COLS.map((c) => [c.key, c.defaultOn])) as Record<ColKey, boolean>,
  combine: true,
})
function loadView(): View {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<View> | null
    const d = defaults()
    return saved ? { combine: saved.combine ?? true, cols: { ...d.cols, ...saved.cols, title: true } } : d
  } catch {
    return defaults()
  }
}

/** How long a press must last to count as press-and-hold. */
const HOLD_MS = 550

// ───────────────────────── component ─────────────────────────

export function SourcesPanel() {
  const sources = useStore((s) => s.sources)
  const selected = useStore((s) => s.selectedSourceId)
  const selectedAngle = useStore((s) => s.sourceAngle[s.selectedSourceId])
  const { selectSource, openSource, removeSource, setSourcesOpen, setSourceAngle, syncSources, openSyncEditor } = useStore.getState()
  const [query, setQuery] = useState('')
  const [dragging, setDragging] = useState(false)
  const [sort, setSort] = useState<{ key: ColKey; dir: 1 | -1 } | null>(null)
  const [view, setView] = useState<View>(loadView)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [marked, setMarked] = useState<Set<string>>(new Set())
  const [info, setInfo] = useState<{ id: string; field?: string } | null>(null)
  const lastTap = useRef<{ key: string; t: number } | null>(null)
  const hold = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null)
  const held = useRef(false)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(view))
    } catch {
      /* storage unavailable */
    }
  }, [view])

  // drop marks for clips that no longer exist (e.g. after a sync)
  useEffect(() => setMarked((m) => new Set([...m].filter((id) => sources.some((s) => s.id === id)))), [sources])

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
  const visible = COLS.filter((c) => (c.key === 'multicam' ? showMulticam : view.cols[c.key]))

  /** Title (and thumbnail) stay put while the table scrolls sideways. */
  const stuck = (key: ColKey) => {
    const base = selectMode ? 36 : 0
    if (key === 'thumb') return { className: 'sticky', style: { left: base } }
    if (key === 'title') return { className: 'sticky edge', style: { left: base + (visible[0].key === 'thumb' ? 52 : 0) } }
    return null
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const hit = (s: Source, a: Angle) => [s.title, a.camera, a.shotType, a.filename, s.scene, s.take, s.director, s.dp, s.interviewer].some((v) => v?.toLowerCase().includes(q))
    let list: Row[] = []
    for (const source of sources) {
      const angles = angleList(source)
      if (view.combine) list.push({ source, angle: angles[0], angles })
      else angles.forEach((angle) => list.push({ source, angle, angles }))
    }
    if (q) list = list.filter((r) => (view.combine ? r.angles.some((a) => hit(r.source, a)) : hit(r.source, r.angle)))
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

  const cancelHold = () => {
    if (hold.current) clearTimeout(hold.current.timer)
    hold.current = null
  }

  /**
   * One tap selects. A quick second tap opens the clip (thumbnail / title) or edits its info
   * (any other data cell). Press-and-hold anywhere on a row edits its info too.
   */
  const tap = (r: Row, colKey: ColKey | 'select') => {
    if (held.current) return void (held.current = false) // this is the click that ends a long press
    const id = r.source.id
    if (selectMode) {
      setMarked((m) => {
        const n = new Set(m)
        if (n.has(id)) n.delete(id)
        else n.add(id)
        return n
      })
      return
    }
    const now = Date.now()
    const key = `${id}|${r.angle.id}`
    if (lastTap.current?.key === key && now - lastTap.current.t < 400) {
      lastTap.current = null
      if (colKey === 'thumb' || colKey === 'title' || colKey === 'multicam') {
        openSource(id) // double tap / double click → open it and go to the Source tab
        if (r.angles.length > 1) setSourceAngle(id, r.angle.id)
      } else {
        setInfo({ id, field: colKey })
      }
    } else {
      lastTap.current = { key, t: now }
      selectSource(id)
      if (r.angles.length > 1 && (r.child || !view.combine)) setSourceAngle(id, r.angle.id)
    }
  }

  const cycleSort = (key: ColKey) =>
    setSort((p) => (p?.key !== key ? { key, dir: 1 } : p.dir === 1 ? { key, dir: -1 } : null))

  const renderRow = (r: Row, key: string) => {
    const id = r.source.id
    const multi = r.angles.length > 1
    const angleRow = r.child || (!view.combine && multi)
    const isSel = id === selected && (!angleRow || (selectedAngle ?? PRIMARY_ANGLE) === r.angle.id)
    const checked = marked.has(id)
    return (
      <tr
        key={key}
        data-selected={isSel || undefined}
        data-marked={checked || undefined}
        data-child={r.child || undefined}
        tabIndex={0}
        title="Double-tap the title to open · double-tap other data, or press and hold, to edit its info"
        onKeyDown={(e) => {
          if (e.key === 'Enter') openSource(id)
          else if (e.key === ' ') (e.preventDefault(), selectSource(id))
          else if (e.key.toLowerCase() === 'i' && !e.metaKey && !e.ctrlKey) setInfo({ id })
        }}
        onContextMenu={(e) => (e.preventDefault(), setInfo({ id }))}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return
          held.current = false
          cancelHold()
          const cell = (e.target as HTMLElement).closest<HTMLElement>('[data-col]')
          hold.current = {
            x: e.clientX,
            y: e.clientY,
            timer: setTimeout(() => {
              held.current = true
              hold.current = null
              selectSource(id)
              setInfo({ id, field: cell?.dataset.col })
            }, HOLD_MS),
          }
        }}
        onPointerMove={(e) => hold.current && Math.hypot(e.clientX - hold.current.x, e.clientY - hold.current.y) > 8 && cancelHold()}
        onPointerUp={cancelHold}
        onPointerCancel={cancelHold}
        onPointerLeave={cancelHold}
      >
        {selectMode && (
          <td className="sticky select-col" style={{ left: 0 }} onClick={() => tap(r, 'select')}>
            <input type="checkbox" checked={checked} onChange={() => {}} aria-label={`Select ${r.source.title}`} />
          </td>
        )}
        {visible.map((c) => {
          const st = stuck(c.key)
          return (
            <td
              key={c.key}
              data-col={c.key}
              className={[c.key === 'thumb' ? 'thumb-col' : c.key === 'duration' ? 'num' : '', st?.className ?? ''].join(' ').trim() || undefined}
              style={st?.style}
              onClick={() => tap(r, c.key)}
            >
              {c.render(r, {
                combine: view.combine,
                expanded: expanded.has(id),
                toggle: () =>
                  setExpanded((p) => {
                    const n = new Set(p)
                    if (n.has(id)) n.delete(id)
                    else n.add(id)
                    return n
                  }),
              })}
            </td>
          )
        })}
      </tr>
    )
  }

  const infoSource = info && sources.find((s) => s.id === info.id)
  const nMarked = marked.size
  const leaveSelect = () => (setSelectMode(false), setMarked(new Set()))

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
        title={`${sources.length} clip${sources.length === 1 ? '' : 's'}`}
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
        <ToolButton
          icon="check"
          label="Select clips — to sync cameras together"
          short="Select"
          active={selectMode}
          onClick={() => (selectMode ? leaveSelect() : setSelectMode(true))}
        />
        <ToolButton icon="multicam" label="Sync editor — line up cameras, audio and transcripts" short="Sync" onClick={() => openSyncEditor()} />
        <span data-options-btn>
          <ToolButton icon="options" label="Table options — columns and view" short="Options" onClick={() => setOptionsOpen((o) => !o)} active={optionsOpen} />
        </span>
      </div>

      {selectMode && (
        <div className="select-bar" role="status">
          <span>{nMarked === 0 ? 'Tick the clips that are the same take from different cameras' : `${nMarked} selected`}</span>
          <button
            className="fbtn wide primary"
            disabled={nMarked < 2}
            onClick={() => {
              syncSources([...marked])
              leaveSelect()
            }}
          >
            <Icon name="multicam" size={14} /> Sync as multicam
          </button>
          <button className="fbtn" onClick={leaveSelect}>Cancel</button>
        </div>
      )}

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
              <small>One row per clip, with its camera angles under a twirl-down. Turn off to list every angle as its own row.</small>
            </span>
          </label>
        </div>
      )}

      <div className="table-wrap">
        <table className="sources-table">
          <thead>
            <tr>
              {selectMode && <th className="sticky select-col" style={{ left: 0 }} />}
              {visible.map((c) => {
                const active = sort?.key === c.key
                const st = stuck(c.key)
                return (
                  <th
                    key={c.key}
                    className={[c.key === 'thumb' ? 'thumb-col' : '', st?.className ?? ''].join(' ').trim() || undefined}
                    style={st?.style}
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
              const out = [renderRow(r, `${r.source.id}|${r.angle.id}`)]
              if (view.combine && r.angles.length > 1 && expanded.has(r.source.id)) {
                r.angles.forEach((a) => out.push(renderRow({ source: r.source, angle: a, angles: r.angles, child: true }, `${r.source.id}|${a.id}|child`)))
              }
              return out
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="drop-hint">No clips match “{query}”.</p>}
        <p className="drop-hint">
          Double-tap a clip to open it. Double-tap its data (or press and hold) to edit its info. Drop several camera files with one
          transcript to sync them as angles.
        </p>
      </div>

      {infoSource && <ClipInfo key={`${infoSource.id}|${info?.field ?? ''}`} source={infoSource} field={info?.field} onClose={() => setInfo(null)} />}
    </section>
  )
}
