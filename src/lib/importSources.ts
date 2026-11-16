import type { Source } from '../types'
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
  warnings: string[]
}

/**
 * Turn dropped / picked files into sources. Transcripts and media are paired
 * by file name (interview.mp4 + interview.srt). With exactly one of each,
 * they're paired regardless of name.
 */
export async function importFiles(files: File[]): Promise<ImportResult> {
  const transcripts = files.filter((f) => TRANSCRIPT_EXT.test(f.name))
  const media = files.filter((f) => MEDIA_EXT.test(f.name))
  const warnings: string[] = []
  const ignored = files.length - transcripts.length - media.length
  if (ignored) warnings.push(`${ignored} unsupported file${ignored > 1 ? 's' : ''} skipped`)

  const unmatched = new Set(media)
  const pairs: { transcript?: File; media?: File }[] = []
  for (const t of transcripts) {
    let m = media.find((x) => unmatched.has(x) && norm(x.name) === norm(t.name))
    if (!m && transcripts.length === 1 && media.length === 1) m = media[0]
    if (m) unmatched.delete(m)
    pairs.push({ transcript: t, media: m })
  }
  for (const m of unmatched) pairs.push({ media: m })

  const sources: Source[] = []
  for (const { transcript, media: m } of pairs) {
    const file = (transcript ?? m)!
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

    const mediaUrl = m ? URL.createObjectURL(m) : undefined
    const mediaMs = mediaUrl ? await mediaDuration(mediaUrl) : 0
    const textMs = parsed.words.length ? parsed.words[parsed.words.length - 1].e + 2000 : 0
    const date = new Date(file.lastModified || Date.now()).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    sources.push({
      id: `imp-${Date.now().toString(36)}-${sources.length}`,
      title: base(file.name),
      date,
      duration: Math.max(mediaMs, textMs),
      mediaUrl,
      ...parsed,
    })
  }
  return { sources, warnings }
}
