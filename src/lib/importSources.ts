import { mediaKey } from './db'
import { PRIMARY_ANGLE, type Angle, type Source } from '../types'
import { MEDIA_EXT, TRANSCRIPT_EXT, parseTranscript } from './transcript'

const base = (name: string) => name.replace(/\.[^.]+$/, '')
const norm = (name: string) => base(name).toLowerCase().replace(/[^a-z0-9]+/g, '')

function mediaDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () => resolve(Number.isFinite(v.duration) ? Math.round(v.duration * 1000) : 0)
    v.onerror = () => resolve(0)
    v.src = url
  })
}

export interface ImportResult {
  sources: Source[]
  /** Original media file per media key (`sourceId`, or `sourceId::angleId`), for persistence. */
  files: Record<string, File>
  warnings: string[]
}

const CAMERAS = 'ABCDEFGH'
const byName = (a: File, b: File) => a.name.localeCompare(b.name, undefined, { numeric: true })

/**
 * Turn dropped / picked files into sources. A transcript and the media that belong to it are
 * paired by file name (interview.srt + interview.mp4). Several videos that match one transcript
 * — or all the videos, if there's just one transcript — are treated as the same interview filmed
 * from different cameras: one clip, several angles, one shared transcript.
 */
export async function importFiles(files: File[]): Promise<ImportResult> {
  const transcripts = files.filter((f) => TRANSCRIPT_EXT.test(f.name))
  const media = files.filter((f) => MEDIA_EXT.test(f.name)).sort(byName)
  const warnings: string[] = []
  const ignored = files.length - transcripts.length - media.length
  if (ignored) warnings.push(`${ignored} unsupported file${ignored > 1 ? 's' : ''} skipped`)

  const unmatched = new Set(media)
  const pairs: { transcript?: File; media: File[] }[] = []
  for (const t of transcripts) {
    const key = norm(t.name)
    let ms = media.filter((m) => unmatched.has(m) && (norm(m.name) === key || (key.length >= 3 && norm(m.name).startsWith(key))))
    // one transcript + several videos = the same interview from several cameras, whatever the files are called
    if (transcripts.length === 1) ms = media.filter((m) => unmatched.has(m))
    ms.forEach((m) => unmatched.delete(m))
    pairs.push({ transcript: t, media: ms })
  }
  for (const m of unmatched) pairs.push({ media: [m] })

  const sources: Source[] = []
  const stored: Record<string, File> = {}
  for (const { transcript, media: ms } of pairs) {
    const file = (transcript ?? ms[0])!
    let parsed: Pick<Source, 'words' | 'sentences'> = { words: [], sentences: [] }
    if (transcript) {
      try {
        parsed = parseTranscript(transcript.name, await transcript.text())
      } catch {
        warnings.push(`Couldn’t read ${transcript.name}`)
      }
      if (!parsed.words.length) warnings.push(`${transcript.name} had no timed text`)
    } else {
      warnings.push(`${file.name} has no transcript — import an .srt, .vtt or .json alongside it`)
    }

    const id = `imp-${Date.now().toString(36)}-${sources.length}`
    const stamp = (f: File) => new Date(f.lastModified || Date.now()).toTimeString().slice(0, 5)
    const angles: Angle[] = []
    let mediaMs = 0
    for (const [i, m] of ms.entries()) {
      const url = URL.createObjectURL(m)
      mediaMs = Math.max(mediaMs, await mediaDuration(url))
      const angle: Angle = { id: i === 0 ? PRIMARY_ANGLE : `${id}-a${i}`, camera: CAMERAS[i] ?? `Cam ${i + 1}`, filename: m.name, recordedAt: stamp(m), mediaUrl: url, offsetMs: 0 }
      angles.push(angle)
      stored[mediaKey(id, angle.id)] = m
    }
    const [main, ...extras] = angles
    const textMs = parsed.words.length ? parsed.words[parsed.words.length - 1].e + 2000 : 0
    sources.push({
      id,
      title: base(file.name),
      date: new Date(file.lastModified || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      duration: Math.max(mediaMs, textMs),
      mediaUrl: main?.mediaUrl,
      camera: main?.camera,
      filename: main?.filename ?? transcript?.name,
      recordedAt: main?.recordedAt ?? stamp(file),
      extraAngles: extras.length ? extras : undefined,
      transcriptFormat: transcript ? (transcript.name.split('.').pop()!.toLowerCase() as Source['transcriptFormat']) : undefined,
      ...parsed,
    })
    if (extras.length) warnings.push(`${base(file.name)}: ${angles.length} camera angles synced into one source`)
  }
  return { sources, files: stored, warnings }
}
