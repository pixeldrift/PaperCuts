import type { ReactNode } from 'react'

/**
 * Icon set redrawn from the wireframe sheet. 24×24 grid, 2px stroke,
 * square joins to keep the chunky, mechanical feel of the originals.
 */
const lines = (y0: number) => (
  <path d={`M5 ${y0}h14M5 ${y0 + 3}h14M5 ${y0 + 6}h14`} />
)
const plus = (cx: number, cy: number, r = 4) => (
  <path d={`M${cx} ${cy - r}v${r * 2}M${cx - r} ${cy}h${r * 2}`} />
)
const arrowIn = (
  <path d="M2.5 12h8M7 8.5l3.5 3.5L7 15.5" />
)

const paths = {
  // — Source / edit management
  importSource: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" />
      {plus(12, 12, 4.5)}
    </>
  ),
  removeSource: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" />
      <path d="M8 8l8 8M16 8l-8 8" />
    </>
  ),
  newEdit: (
    <>
      <path d="M5 3.5h9l5 5v12H5z" />
      <path d="M14 3.5v5h5" />
      {plus(12, 15, 3)}
    </>
  ),
  saveEdit: (
    <>
      <path d="M12 3.5v10M8 9.5l4 4 4-4" />
      <path d="M4 13v7.5h16V13" />
    </>
  ),

  // — Annotation
  storyNote: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" />
      <path d="M12.5 20.5v-9h-9" />
      <path d="M3.5 11.5l9 9" />
    </>
  ),
  comment: <path d="M3.5 4.5h17v11h-8l-3.5 4.5v-4.5h-5.5z" />,
  editTranscript: <path d="M8 4h8M12 4v16M8 20h8M10 12h4" />,

  // — Trim
  trimIn: (
    <>
      <path d="M4.5 4v16" strokeDasharray="2.5 3" />
      <path d="M20 6.5H9v11h11" />
    </>
  ),
  trimOut: (
    <>
      <path d="M19.5 4v16" strokeDasharray="2.5 3" />
      <path d="M4 6.5h11v11H4" />
    </>
  ),
  refine: (
    <>
      <path d="M11 4.5h9.5v15H11" />
      <path d="M2.5 12h12M6 8.5L2.5 12 6 15.5M11 8.5l3.5 3.5-3.5 3.5" />
    </>
  ),

  // — Assemble
  insert: (
    <>
      {arrowIn}
      <path d="M13.5 3.5h7v7h-7zM13.5 13.5h7v7h-7z" />
    </>
  ),
  overwrite: (
    <>
      {arrowIn}
      <path d="M13.5 9V3.5h7v17h-7V15" />
    </>
  ),
  cutClip: (
    <>
      <path d="M8.5 4.5H4v15h4.5M15.5 4.5H20v15h-4.5" />
      <path d="M12 3.5v17" strokeDasharray="3 3" />
    </>
  ),
  glueClips: (
    <>
      <rect x="3.5" y="6" width="17" height="12" />
      <path d="M12 9v6" />
    </>
  ),
  removeClip: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" />
      <path d="M8 8l8 8M16 8l-8 8" />
    </>
  ),

  // — Text / block tools (unlabelled in the wireframe)
  appendText: (
    <>
      <path d="M12 3.5v8M8.5 8l3.5 3.5L15.5 8" />
      {lines(14)}
    </>
  ),
  addLines: (
    <>
      {plus(12, 7.5)}
      {lines(14)}
    </>
  ),
  addBlock: (
    <>
      {plus(12, 7.5)}
      <rect x="4.5" y="14" width="15" height="6" />
    </>
  ),
  removeBlock: (
    <>
      <path d="M8.5 4l7 7M15.5 4l-7 7" />
      <rect x="4.5" y="14" width="15" height="6" />
    </>
  ),
  insertLine: (
    <>
      {plus(12, 7.5)}
      <path d="M3.5 14h2M8.5 14h12M5 18h14" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20l1-5L16 4l4 4L9 19z" />
      <path d="M13.5 6.5l4 4" />
    </>
  ),
  pencilLine: (
    <>
      <path d="M8.5 14.5l1-4 6-6 3 3-6 6z" />
      <path d="M3.5 20h17" />
    </>
  ),
  shiftText: (
    <>
      <path d="M4 5h5M13 5h7M4 19h5M13 19h7M4 12h14M14 8.5l3.5 3.5-3.5 3.5" />
    </>
  ),

  // — Search
  find: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20.5 20.5L15.5 15.5" />
    </>
  ),

  // — Pane kinds (headers / tabs)
  kindSource: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" />
      <path d="M10 9v6l5-3z" fill="currentColor" />
    </>
  ),
  kindEdit: (
    <>
      <path d="M5 3.5h9l5 5v12H5z" />
      <path d="M14 3.5v5h5M8.5 12.5h7M8.5 16h5" />
    </>
  ),
  kindTimeline: (
    <>
      <path d="M3.5 8h17M3.5 8v-2M8.5 8v-2M13.5 8v-2M18.5 8v-2" />
      <rect x="3.5" y="12" width="7" height="6" />
      <rect x="12.5" y="12" width="8" height="6" />
    </>
  ),
  options: (
    <>
      <path d="M4 7h7M15 7h5M4 17h3M11 17h9M4 12h10M18 12h2" />
      <circle cx="13" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
      <circle cx="16" cy="12" r="2" />
    </>
  ),
  multicam: (
    <>
      <rect x="3.5" y="7.5" width="12" height="10" />
      <path d="M8 4.5h12.5v10M18.5 20.5h-0" />
      <path d="M8 4.5v3" />
    </>
  ),

  check: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" />
      <path d="M8 12.5l3 3 5-6" />
    </>
  ),

  // — History
  undo: <path d="M9 5L4 10l5 5M4 10h10.5a5.5 5.5 0 0 1 0 11H10" />,
  redo: <path d="M15 5l5 5-5 5M20 10H9.5a5.5 5.5 0 0 0 0 11H14" />,

  // — View
  zoomIn: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20.5 20.5L15.5 15.5M10.5 7.5v6M7.5 10.5h6" />
    </>
  ),
  zoomOut: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20.5 20.5L15.5 15.5M7.5 10.5h6" />
    </>
  ),
  textGrow: (
    <>
      <path d="M3.5 7V5h10v2M8.5 5v13M5.5 18h6" />
      <path d="M17.5 10v6M14.5 13h6" />
    </>
  ),
  textShrink: (
    <>
      <path d="M3.5 7V5h10v2M8.5 5v13M5.5 18h6" />
      <path d="M14.5 13h6" />
    </>
  ),
  sources: (
    <>
      <rect x="3.5" y="4" width="17" height="16" />
      <path d="M3.5 9h17M9 9v11" />
    </>
  ),
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof paths
export const iconNames = Object.keys(paths) as IconName[]

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="butt"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  )
}

/** Small filled glyphs for the transport bar (not part of the custom set). */
export function Transport({ kind }: { kind: 'play' | 'pause' | 'prev' | 'next' }) {
  const d = {
    play: 'M7 5v14l11-7z',
    pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
    prev: 'M5 5h2v14H5zM19 5v14L8 12z',
    next: 'M17 5h2v14h-2zM5 5v14l11-7z',
  }[kind]
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

export function Avatar({ size = 40 }: { size?: number }) {
  return (
    <svg
      className="avatar"
      viewBox="0 0 40 40"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <rect x="1" y="1" width="38" height="38" rx="7" fill="var(--avatar-bg)" />
      <circle cx="20" cy="15" r="6.5" fill="var(--avatar-fg)" />
      <path d="M7 36c0-8 5.5-12 13-12s13 4 13 12z" fill="var(--avatar-fg)" />
    </svg>
  )
}
