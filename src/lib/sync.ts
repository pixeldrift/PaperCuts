import { PRIMARY_ANGLE, type Angle, type OwnTranscript, type Source, type Word } from '../types'
import { angleList } from './angles'
import { renumber } from './textdiff'
import { sentenceRanges } from './transcript'

/**
 * Multicam transcripts.
 *
 * Every angle can keep its *own* transcript, timed against that camera's own footage. The clip's
 * shared ("master") transcript — the one everything is edited from — is built from them on the
 * shared timeline (own time + the angle's sync offset):
 *   - 'single':   just the master angle's transcript (by default the longest one);
 *   - 'combined': the master angle's transcript, plus whatever the other transcripts cover that it
 *                 doesn't (a camera that rolled early or kept rolling after). Only one transcript is
 *                 ever active at any point on the timeline.
 */

/** Shift words by `delta` ms, dropping any that end up wholly before zero. */
export function shiftWords(words: Word[], delta: number): Word[] {
  if (!delta) return words
  return words
    .map((w) => ({ ...w, s: Math.max(0, Math.round(w.s + delta)), e: Math.max(0, Math.round(w.e + delta)) }))
    .filter((w) => w.e > 0)
}

export interface Candidate {
  id: string
  angle: Angle
  /** Words on the shared timeline. */
  words: Word[]
  start: number
  end: number
  format?: OwnTranscript['format']
}

/** Every angle that has its own transcript, placed on the shared timeline. */
export function candidates(src: Source): Candidate[] {
  return angleList(src)
    .filter((a) => a.transcript?.words.length)
    .map((a) => {
      const words = shiftWords(a.transcript!.words, a.offsetMs)
      return { id: a.id, angle: a, words, start: words[0].s, end: words[words.length - 1].e, format: a.transcript!.format }
    })
}

export const hasOwnTranscripts = (src: Source) => candidates(src).length > 0

const length = (c: Candidate) => c.end - c.start

/** Id of the angle with the longest transcript (by time covered). */
export function longestAngleId(src: Source): string | undefined {
  const c = candidates(src)
  return c.length ? c.reduce((b, x) => (length(x) > length(b) ? x : b)).id : undefined
}

export interface Segment {
  angleId: string
  fromMs: number
  toMs: number
}

export interface MasterPlan {
  words: Word[]
  /** Which transcript is active over which stretch of the timeline. */
  segments: Segment[]
  format?: OwnTranscript['format']
}

/** Work out the shared transcript and which angle supplies each stretch of it. */
export function masterPlan(src: Source, mode = src.transcriptMode ?? 'single', masterId = src.masterAngle): MasterPlan | null {
  const cands = candidates(src)
  if (!cands.length) return null
  const master = cands.find((c) => c.id === (masterId ?? PRIMARY_ANGLE)) ?? cands.reduce((b, x) => (length(x) > length(b) ? x : b))
  const parts: { id: string; words: Word[] }[] = [{ id: master.id, words: master.words }]
  if (mode === 'combined') {
    let lo = master.start
    let hi = master.end
    for (const c of cands.filter((x) => x !== master).sort((a, b) => length(b) - length(a))) {
      const before = c.words.filter((w) => w.e <= lo + 1)
      const after = c.words.filter((w) => w.s >= hi - 1)
      if (before.length) {
        parts.unshift({ id: c.id, words: before })
        lo = before[0].s
      }
      if (after.length) {
        parts.push({ id: c.id, words: after })
        hi = after[after.length - 1].e
      }
    }
  }
  const words = renumber(parts.flatMap((part, i) => part.words.map((w) => ({ ...w, p: w.p + i * 1_000_000 }))))
  const segments = parts.map((p) => ({ angleId: p.id, fromMs: p.words[0].s, toMs: p.words[p.words.length - 1].e }))
  return { words, segments, format: master.format }
}

/** The shared transcript for a clip, or null if no angle has its own transcript. */
export function buildMaster(src: Source) {
  const plan = masterPlan(src)
  return plan && { words: plan.words, sentences: sentenceRanges(plan.words), format: plan.format }
}

/**
 * Before merging, make sure a clip's transcript is stored as an angle's own transcript — a plain
 * single-camera clip's transcript belongs to its (only) camera.
 */
export function normalizeOwn(src: Source): Source {
  if (hasOwnTranscripts(src) || !src.words.length) return src
  return { ...src, primaryTranscript: { words: src.words, format: src.transcriptFormat } }
}

/** How much timeline a transcript covers (0 if none). */
export const transcriptSpan = (src: Source) => {
  const c = candidates(normalizeOwn(src))
  return c.length ? Math.max(...c.map(length)) : 0
}

/** Length of the shared timeline: wherever any footage or the transcript reaches. */
export function timelineLength(src: Source) {
  const ends = angleList(src).map((a) => a.offsetMs + (a.durationMs ?? src.duration))
  const last = src.words.length ? src.words[src.words.length - 1].e + 2000 : 0
  return Math.max(1000, ...ends, last)
}

/** A string that changes when anything affecting the shared transcript changes. */
export function layoutSignature(src: Source) {
  return JSON.stringify([
    src.masterAngle ?? PRIMARY_ANGLE,
    src.transcriptMode ?? 'single',
    angleList(src).map((a) => [a.id, a.offsetMs, a.transcript?.words.length ?? 0, a.transcript?.words[0]?.s ?? 0, a.transcript?.words.at(-1)?.e ?? 0]),
  ])
}

export const sameWords = (a: Word[], b: Word[]) =>
  a.length === b.length && a.every((w, i) => w.t === b[i].t && w.s === b[i].s && w.e === b[i].e && w.p === b[i].p)

/** True if the shared transcript has text edits that rebuilding it would throw away. */
export function masterHasEdits(src: Source) {
  const built = buildMaster(src)
  return !!built && !sameWords(built.words, src.words)
}

/**
 * Move everything on a clip's shared timeline later by `delta` ms (all angle offsets, the shared
 * transcript). Used when a camera that rolled earlier becomes the new start of the timeline.
 */
export function rebase(src: Source, delta: number): Source {
  if (!delta) return src
  return {
    ...src,
    mainOffset: (src.mainOffset ?? 0) + delta || undefined,
    extraAngles: src.extraAngles?.map((a) => ({ ...a, offsetMs: a.offsetMs + delta })),
    words: shiftWords(src.words, delta),
  }
}

/** The shift that puts the earliest footage at zero (0 if nothing starts before zero). */
export const normalizeDelta = (src: Source) => Math.max(0, -Math.min(0, ...angleList(src).map((a) => a.offsetMs)))
