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
  /** Object/remote URL of the media file. Absent = simulated playback. */
  mediaUrl?: string
  /** Time of day it was recorded, 24h "HH:mm". */
  recordedAt?: string
  /** Camera / angle label: "A", "B", "GoPro"… */
  camera?: string
  /** Shot type: "Closeup", "Wide", "OTS", "BTS"… */
  shotType?: string
  filename?: string
  /** Where the transcript came from. */
  transcriptFormat?: 'srt' | 'vtt' | 'json' | 'auto'
  /** Sources sharing a syncId are the same take from different angles (multicam). */
  syncId?: string
  words: Word[]
  /** [firstWordIndex, lastWordIndex] per sentence. */
  sentences: [number, number][]
}

export interface Note {
  id: string
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
