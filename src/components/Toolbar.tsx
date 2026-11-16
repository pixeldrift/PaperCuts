import { Icon, type IconName } from '../icons'

export interface Tool {
  icon: IconName
  label: string
  shortcut?: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
  tone?: 'danger'
}

/** A row of icon buttons; each inner array is a group separated by dividers. */
export function Toolbar({ groups }: { groups: Tool[][] }) {
  return (
    <div className="toolbar" role="toolbar">
      {groups.map((group, gi) => (
        <div className="tool-group" key={gi}>
          {group.map((t) => (
            <ToolButton key={t.label} {...t} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function ToolButton({ icon, label, shortcut, onClick, disabled, active, tone }: Tool) {
  const title = shortcut ? `${label} (${shortcut})` : label
  return (
    <button
      type="button"
      className="tool"
      data-active={active || undefined}
      data-tone={tone}
      title={title}
      aria-label={title}
      disabled={disabled}
      // keep the transcript's text selection alive when a button is pressed
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      <Icon name={icon} size={20} />
    </button>
  )
}
