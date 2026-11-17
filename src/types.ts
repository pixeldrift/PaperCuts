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
  /**
   * Further camera angles of the same take, synced to this source's timeline and sharing its
   * transcript. The fields above (camera, shotType, filename, mediaUrl, recordedAt) describe the
   * primary angle.
   */
  extraAngles?: Angle[]
  words: Word[]
  /** [firstWordIndex, lastWordIndex] per sentence. */
  sentences: [number, number][]
}

/** One camera's footage of a take. */
export interface Angle {
  id: string
  camera: string
  shotType?: string
  filename?: string
  recordedAt?: string
  mediaUrl?: string
  /** How much later this footage starts than the shared timeline (media time = timeline time − offset). */
  offsetMs: number
}

/** Id of a source's primary angle (the one its transcript was timed against). */
export const PRIMARY_ANGLE = 'main'

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
  /** Which angle to show for this clip. Absent = the source's primary angle. */
  angleId?: string
}

export type Tab = 'transcripts' | 'edits'
export type Pane = 'sources' | 'source' | 'edit' | 'timeline'
