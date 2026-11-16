/** A single timed word in a source transcript. Times are milliseconds. */
export interface Word {
  t: string
  s: number
  e: number
  /** Paragraph index (speaker turn). */
  p: number
}

export interface Source {
  id: string
  title: string
  date: string
  duration: number
  words: Word[]
  /** [firstWordIndex, lastWordIndex] per sentence. */
  sentences: [number, number][]
}

export interface Note {
  kind: 'story' | 'comment'
  text: string
}

/** A range of a source placed in the paper edit. */
export interface Clip {
  id: string
  sourceId: string
  inMs: number
  outMs: number
  notes: Note[]
}

export type Tab = 'transcripts' | 'edits'
export type Pane = 'sources' | 'source' | 'edit' | 'timeline'
