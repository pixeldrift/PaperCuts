import type { Angle } from '../types'

/** A little segmented control for choosing a camera angle. */
export function AngleChips({
  angles,
  active,
  onPick,
  compact,
  label = 'Angle',
}: {
  angles: Angle[]
  active: string
  onPick: (id: string) => void
  compact?: boolean
  label?: string
}) {
  if (angles.length < 2) return null
  return (
    <div className="angle-chips" data-compact={compact || undefined} role="radiogroup" aria-label={label}>
      {!compact && <span className="angle-label">{label}</span>}
      {angles.map((a, i) => (
        <button
          key={a.id}
          role="radio"
          aria-checked={a.id === active}
          data-on={a.id === active || undefined}
          title={`${a.camera}${a.shotType ? ` · ${a.shotType}` : ''} (press ${i + 1})`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => (e.stopPropagation(), onPick(a.id))}
        >
          {a.camera}
        </button>
      ))}
    </div>
  )
}
