import { useEffect, useRef } from 'react'
import { initPersistence } from './lib/persist'
import { IMPORT_EVENT, openImportPicker, runImport } from './lib/runImport'
import { EditPane } from './components/EditPane'
import { SourcePane } from './components/SourcePane'
import { SyncEditor } from './components/SyncEditor'
import { SourcesPanel } from './components/SourcesPanel'
import { Timeline } from './components/Timeline'
import { ToolButton } from './components/Toolbar'
import { Icon, type IconName } from './icons'
import { useStore } from './store'
import type { Pane } from './types'

/** Drives simulated playback; replace with <video> clocks once media exists. */
function usePlaybackClock() {
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      useStore.getState().tick(Math.min(now - last, 100))
      last = now
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) && (target as HTMLInputElement).type !== 'range') return
      const st = useStore.getState()
      const mod = e.metaKey || e.ctrlKey
      const k = e.key.toLowerCase()

      if (mod) {
        if (k === 'z') return e.preventDefault(), e.shiftKey ? st.redo() : st.undo()
        if (k === 's') return e.preventDefault(), st.save()
        if (k === 'i') return e.preventDefault(), openImportPicker()
        if (k === 'n') return e.preventDefault(), st.newEdit()
        if (k === 'f' || k === 'h') return e.preventDefault(), st.openFind()
        return
      }
      if (e.altKey) return
      const map: Record<string, () => void> = {
        ' ': () => st.togglePlay(st.mode),
        ',': st.insert,
        '.': st.overwrite,
        q: () => st.trim('in'),
        w: () => st.trim('out'),
        r: () => st.openRefine(st.refine ? null : 'out'),
        k: st.cut,
        g: st.glue,
        x: st.removeClip,
        t: st.toggleTranscriptEdit,
        n: () => st.addNote('story'),
        c: () => st.addNote('comment'),
        '=': () => st.zoomText(1),
        '+': () => st.zoomText(1),
        '-': () => st.zoomText(-1),
        escape: () => {
          if (st.find) return st.closeFind()
          if (st.editingWord) return st.cancelWordEdit()
          if (st.editMode) return st.toggleTranscriptEdit()
          st.openRefine(null)
          st.selectClip(null)
        },
        arrowleft: () => st.refine && st.nudge(e.shiftKey ? -10 : -1),
        arrowright: () => st.refine && st.nudge(e.shiftKey ? 10 : 1),
      }
      if (/^[1-9]$/.test(k)) return (e.preventDefault(), st.setAngleByNumber(Number(k)))
      const fn = map[k]
      if (fn) {
        e.preventDefault()
        fn()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

const NAV: { pane: Pane; label: string; icon: IconName }[] = [
  { pane: 'sources', label: 'Sources', icon: 'sources' },
  { pane: 'source', label: 'Source', icon: 'kindSource' },
  { pane: 'edit', label: 'Paper Edit', icon: 'kindEdit' },
  { pane: 'timeline', label: 'Timeline', icon: 'kindTimeline' },
]

export function App() {
  usePlaybackClock()
  useShortcuts()
  useEffect(() => {
    void initPersistence()
  }, [])
  const hydrated = useStore((s) => s.hydrated)
  const tab = useStore((s) => s.tab)
  const pane = useStore((s) => s.mobilePane)
  const sourcesOpen = useStore((s) => s.sourcesOpen)
  const scale = useStore((s) => s.textScale)
  const toastMsg = useStore((s) => s.toastMsg)
  const hasSel = useStore((s) => !!s.sourceSel)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const st = useStore.getState()
  const fileInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const open = () => fileInput.current?.click()
    window.addEventListener(IMPORT_EVENT, open)
    return () => window.removeEventListener(IMPORT_EVENT, open)
  }, [])

  if (!hydrated) return <div className="app" aria-busy="true" />

  const act = (p: Pane) => ({ 'data-active': pane === p })

  return (
    <div className="app" style={{ ['--tscale' as string]: scale }}>
      <header className="topbar">
        <button className="menu-btn" onClick={() => st.setSourcesOpen(!sourcesOpen)} aria-label="Toggle sources">
          <Icon name="sources" size={20} />
        </button>
        <a className="brand" href="/" aria-label="PaperCuts">
          <img
            className="brand-icon"
            src="/icons/brand-32.png"
            srcSet="/icons/brand-32.png 1x, /icons/brand-64.png 2x, /icons/brand-96.png 3x"
            alt=""
            width="32"
            height="32"
          />
          <img
            className="brand-word"
            src="/brand/wordmark-24.png"
            srcSet="/brand/wordmark-24.png 1x, /brand/wordmark-48.png 2x, /brand/wordmark-72.png 3x"
            alt="PaperCuts"
            width="122"
            height="24"
          />
        </a>
        <nav className="tabs" role="tablist">
          <button role="tab" data-kind="source" aria-selected={tab === 'transcripts'} onClick={() => st.setTab('transcripts')}>
            <Icon name="kindSource" size={18} />
            Transcripts
          </button>
          <button role="tab" data-kind="edit" aria-selected={tab === 'edits'} onClick={() => st.setTab('edits')}>
            <Icon name="kindEdit" size={18} />
            Paper Edits
          </button>
        </nav>
        <div className="topbar-tools">
          <ToolButton icon="textShrink" label="Shrink Text" short="Text −" shortcut="−" onClick={() => st.zoomText(-1)} />
          <ToolButton icon="textGrow" label="Zoom Text" short="Text +" shortcut="+" onClick={() => st.zoomText(1)} />
          <span className="sep" />
          <ToolButton icon="newEdit" label="New Edit" short="New" shortcut="Cmd+N" onClick={st.newEdit} />
          <ToolButton icon="saveEdit" label="Save Edit" short="Save" shortcut="Cmd+S" onClick={st.save} />
          <span className="sep" />
          <ToolButton icon="undo" label="Undo" short="Undo" shortcut="Cmd+Z" onClick={st.undo} disabled={!canUndo} />
          <ToolButton icon="redo" label="Redo" short="Redo" shortcut="Cmd+Shift+Z" onClick={st.redo} disabled={!canRedo} />
        </div>
      </header>

      <main className="workspace" data-tab={tab} data-pane={pane} data-sources-open={sourcesOpen || undefined}>
        <div className="slot sources-slot" {...act('sources')}>
          <SourcesPanel />
        </div>
        <div className="slot source-slot" {...act('source')}>
          <SourcePane />
        </div>
        <div className="slot edit-slot" {...act('edit')}>
          <EditPane />
        </div>
        <div className="slot timeline-slot" {...act('timeline')}>
          <Timeline />
        </div>
        {sourcesOpen && <div className="scrim" onClick={() => st.setSourcesOpen(false)} />}
      </main>

      {hasSel && (
        <div className="selbar" role="toolbar" aria-label="Selection actions">
          <ToolButton icon="insert" label="Insert" shortcut="," onClick={st.insert} />
          <ToolButton icon="overwrite" label="Overwrite" shortcut="." onClick={st.overwrite} />
          <span className="selbar-text">Insert or overwrite selection</span>
        </div>
      )}

      <nav className="bottomnav" aria-label="Panels">
        {NAV.map((n) => (
          <button key={n.pane} data-kind={n.pane} data-active={pane === n.pane} aria-current={pane === n.pane ? 'page' : undefined} onClick={() => st.setMobilePane(n.pane)}>
            <Icon name={n.icon} size={22} />
            <span>{n.label}</span>
          </button>
        ))}
      </nav>

      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        accept="video/*,audio/*,.srt,.vtt,.json,.mkv"
        onChange={(e) => {
          void runImport([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />

      <SyncEditor />

      <div className="toast" data-show={!!toastMsg} role="status">
        {toastMsg}
      </div>
    </div>
  )
}
