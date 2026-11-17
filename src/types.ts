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

  // — Slate (traditional production metadata)
  scene?: string
  take?: string
  director?: string
  /** DP / camera operator. */
  dp?: string
  interviewer?: string

  // — Multicam bookkeeping (only meaningful once a clip has several angles)
  /** The primary angle's own transcript, in that camera's own media time. */
  primaryTranscript?: OwnTranscript
  /** Length of the primary angle's footage (`duration` becomes the length of the shared timeline). */
  mainDuration?: number
  /** When the primary angle's footage starts on the shared timeline (0 unless another camera rolled earlier). */
  mainOffset?: number
  /** Which angle's transcript has priority when building the shared transcript. Absent = primary. */
  masterAngle?: string
  /** 'single' = only the master angle's transcript; 'combined' = fill the whole timeline using every transcript. */
  transcriptMode?: 'single' | 'combined'

  /** The shared transcript (the "master"), on the shared timeline. Everything in the app edits from this. */
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
  /** Length of this footage. */
  durationMs?: number
  /** An audio-only recording (e.g. an external recorder) rather than a camera. */
  audioOnly?: boolean
  /** This camera's own transcript, in its own media time (shifted by `offsetMs` onto the shared timeline). */
  transcript?: OwnTranscript
}

/** A transcript that belongs to one angle's footage. */
export interface OwnTranscript {
  words: Word[]
  format?: Source['transcriptFormat']
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
