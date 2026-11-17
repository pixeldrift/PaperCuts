import type { Source } from '../types'

/** One colour per source, used on the timelines so clips can be matched to where they came from. */
const PALETTE = ['#7A6CF6', '#3FD0C0', '#E2B45F', '#FF7A90', '#6FB4FF', '#9BE564', '#D58BFF', '#FFA05C']

export function sourceColor(sources: Source[], id: string) {
  const i = sources.findIndex((s) => s.id === id)
  return PALETTE[(i < 0 ? 0 : i) % PALETTE.length]
}
