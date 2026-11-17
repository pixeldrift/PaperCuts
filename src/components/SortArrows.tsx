/**
 * Two stacked triangles, like an elevator button pair. Both are faded until
 * the column is the sort column; then the active direction lights up.
 */
export function SortArrows({ dir }: { dir: 1 | -1 | null }) {
  return (
    <svg className="sort-arrows" viewBox="0 0 10 16" width="9" height="14" aria-hidden="true">
      <path d="M5 1.5L9 7H1z" data-on={dir === 1 || undefined} />
      <path d="M5 14.5L1 9h8z" data-on={dir === -1 || undefined} />
    </svg>
  )
}
