import type { ReactNode } from 'react'
import { Icon, type IconName } from '../icons'

export type PaneKind = 'sources' | 'source' | 'edit' | 'timeline'

const META: Record<PaneKind, { icon: IconName; label: string }> = {
  sources: { icon: 'sources', label: 'Sources' },
  source: { icon: 'kindSource', label: 'Source' },
  edit: { icon: 'kindEdit', label: 'Paper Edit' },
  timeline: { icon: 'kindTimeline', label: 'Timeline' },
}

/**
 * Pane header. Each kind gets its own colour, icon and small-caps label so you can
 * tell at a glance whether you're looking at a source or the edit.
 */
export function PaneHead({ kind, title, right }: { kind: PaneKind; title?: string; right?: ReactNode }) {
  const m = META[kind]
  return (
    <header className="pane-head" data-kind={kind}>
      <span className="pane-icon">
        <Icon name={m.icon} size={20} />
      </span>
      <div className="pane-titles">
        <span className="pane-kind">{m.label}</span>
        {title && <h2>{title}</h2>}
      </div>
      {right && <div className="pane-right">{right}</div>}
    </header>
  )
}
