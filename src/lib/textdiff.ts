import type { Word } from '../types'

/**
 * Turning edited transcript text back into timed words.
 *
 * Words that are unchanged keep their timing. For anything new:
 *  - a word swapped 1:1 for another keeps the old word's timing;
 *  - otherwise the new words share the time between the unchanged words on
 *    either side of the edit, divided evenly. If that gap is too small to hold
 *    them, the two neighbours each give up a little time.
 */

/** Shortest slot a new word is given before neighbours start donating time. */
export const MIN_WORD_MS = 120
/** Guess at a word's length when there is nothing after/before it to measure against. */
const EDGE_WORD_MS = 350
/** A neighbour never shrinks below this. */
const MIN_NEIGHBOUR_MS = 80
/** Above this many cells the alignment falls back to "the whole middle changed". */
const MAX_DP_CELLS = 16_000_000

export interface Token {
  t: string
  /** Paragraph number (0-based, consecutive). */
  p: number
}

/** Transcript as editable text: paragraphs separated by a blank line. */
export function wordsToText(words: Word[]): string {
  const paras: string[][] = []
  let last: number | null = null
  for (const w of words) {
    if (last === null || w.p !== last) paras.push([])
    paras[paras.length - 1].push(w.t)
    last = w.p
  }
  return paras.map((p) => p.join(' ')).join('\n\n')
}

/** Every non-empty line is a paragraph; words are separated by whitespace. */
export function tokenize(text: string): Token[] {
  const out: Token[] = []
  let p = -1
  for (const line of text.split(/\r?\n/)) {
    const toks = line.split(/\s+/).filter(Boolean)
    if (!toks.length) continue
    p++
    for (const t of toks) out.push({ t, p })
  }
  return out
}

/** Longest-common-subsequence pairs [oldIndex, newIndex], in order. */
function align(a: string[], b: string[]): [number, number][] {
  const n = a.length
  const m = b.length
  if (!n || !m || n * m > MAX_DP_CELLS) return []
  const w = m + 1
  const dp = new Uint16Array((n + 1) * w)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = a[i] === b[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1])
    }
  }
  const pairs: [number, number][] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) pairs.push([i++, j++])
    else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) i++
    else j++
  }
  return pairs
}

/**
 * Put `toks` in place of old words [from, to) and time them.
 * `out` holds the already-built words before the edit (its last entry may be
 * adjusted if a neighbour has to donate time); `next` is the unchanged word that
 * follows. Returns the start time `next` must be moved to (if it donated time).
 */
function fillHunk(
  out: Word[],
  replaced: Word[],
  toks: Token[],
  next: Word | undefined,
  durationMs: number,
): number | undefined {
  const m = toks.length
  if (!m) return undefined

  // 1:1 swap — same timing, new text
  if (replaced.length === m) {
    replaced.forEach((w, x) => out.push({ ...w, t: toks[x].t, p: toks[x].p }))
    return undefined
  }

  const prev = out[out.length - 1]
  let start = prev ? prev.e : replaced.length ? replaced[0].s : 0
  let end = next ? next.s : replaced.length ? replaced[replaced.length - 1].e : Math.min(durationMs, start + m * EDGE_WORD_MS)
  if (!prev && !replaced.length) start = Math.max(0, end - m * EDGE_WORD_MS)
  if (end < start) end = start

  // not enough room: the neighbours each give up some time
  let donatedByNext: number | undefined
  const need = m * MIN_WORD_MS - (end - start)
  if (need > 0) {
    const room = (w: Word | undefined) => (w ? Math.max(0, w.e - w.s - MIN_NEIGHBOUR_MS) : 0)
    let fromPrev = Math.min(room(prev), need / 2)
    let fromNext = Math.min(room(next), need / 2)
    fromPrev = Math.min(room(prev), fromPrev + Math.max(0, need / 2 - fromNext)) // one side short → other covers
    fromNext = Math.min(room(next), fromNext + Math.max(0, need / 2 - fromPrev))
    if (prev && fromPrev > 0) {
      out[out.length - 1] = { ...prev, e: Math.round(prev.e - fromPrev) }
      start -= fromPrev
    }
    if (next && fromNext > 0) {
      end += fromNext
      donatedByNext = Math.round(end)
    }
  }

  const slot = (end - start) / m
  toks.forEach((tok, x) => {
    const s = Math.round(start + x * slot)
    const e = x === m - 1 ? Math.round(end) : Math.round(start + (x + 1) * slot)
    out.push({ t: tok.t, p: tok.p, s, e })
  })
  return donatedByNext
}

/** Replace words [from, to) with new tokens (used by the inline word editor). */
export function replaceWords(words: Word[], from: number, to: number, toks: Token[], durationMs: number): Word[] {
  const out = words.slice(0, from)
  const donated = fillHunk(out, words.slice(from, to), toks, words[to], durationMs)
  const rest = words.slice(to)
  if (donated !== undefined && rest.length) rest[0] = { ...rest[0], s: donated }
  return [...out, ...rest]
}

/** Rebuild the word list from edited text, keeping timing wherever the words didn't change. */
export function retext(old: Word[], text: string, durationMs: number): Word[] {
  const toks = tokenize(text)

  let pre = 0
  while (pre < old.length && pre < toks.length && old[pre].t === toks[pre].t) pre++
  let suf = 0
  while (suf < old.length - pre && suf < toks.length - pre && old[old.length - 1 - suf].t === toks[toks.length - 1 - suf].t) suf++

  const mid = align(
    old.slice(pre, old.length - suf).map((w) => w.t),
    toks.slice(pre, toks.length - suf).map((x) => x.t),
  )
  const matches: [number, number][] = [
    ...Array.from({ length: pre }, (_, k) => [k, k] as [number, number]),
    ...mid.map(([i, j]) => [i + pre, j + pre] as [number, number]),
    ...Array.from({ length: suf }, (_, k) => [old.length - suf + k, toks.length - suf + k] as [number, number]),
  ]

  const out: Word[] = []
  let oi = 0
  let ni = 0
  let shiftNextTo: number | undefined
  for (const [mi, mj] of [...matches, [old.length, toks.length] as [number, number]]) {
    if (mi > oi || mj > ni) {
      shiftNextTo = fillHunk(out, old.slice(oi, mi), toks.slice(ni, mj), old[mi], durationMs)
    }
    if (mi < old.length) {
      out.push({ ...old[mi], p: toks[mj].p, s: shiftNextTo ?? old[mi].s })
      shiftNextTo = undefined
    }
    oi = mi + 1
    ni = mj + 1
  }
  return out
}

/** Sequential paragraph numbers (0,1,2…) from whatever runs of equal `p` exist. */
export function renumber(words: Word[]): Word[] {
  let p = -1
  let prev: number | null = null
  return words.map((w) => {
    if (w.p !== prev) p++
    prev = w.p
    return w.p === p ? w : { ...w, p }
  })
}

/** Insert a paragraph break after word `i`, or join the paragraphs if one is already there. */
export function toggleBreakAfter(words: Word[], i: number): Word[] {
  const cur = words[i]
  const next = words[i + 1]
  if (!cur || !next) return words
  const out = words.map((w) => ({ ...w }))
  if (next.p === cur.p) {
    // split: everything after i in this paragraph moves to a fresh paragraph id
    const fresh = Math.max(...words.map((w) => w.p)) + 1
    for (let k = i + 1; k < out.length && words[k].p === cur.p; k++) out[k].p = fresh
  } else {
    // join: the following paragraph takes on this one's id
    const old = next.p
    for (let k = i + 1; k < out.length && words[k].p === old; k++) out[k].p = cur.p
  }
  return renumber(out)
}

// ───────────────────────── find & replace ─────────────────────────

export interface FindOptions {
  query: string
  matchCase: boolean
  wholeWord: boolean
}

export interface Match {
  /** Character range in the text produced by `joinParagraphs`. */
  start: number
  end: number
  /** Word index range (inclusive) the match touches. */
  fromWord: number
  toWord: number
}

/** Paragraphs joined with a single newline (so a match can't span a paragraph break). */
export function joinParagraphs(words: Word[]) {
  let text = ''
  const spans: [number, number][] = []
  words.forEach((w, i) => {
    if (i > 0) text += words[i - 1].p === w.p ? ' ' : '\n'
    spans.push([text.length, text.length + w.t.length])
    text += w.t
  })
  return { text, spans }
}

function buildRegex({ query, matchCase, wholeWord }: FindOptions): RegExp | null {
  const q = query.trim()
  if (!q) return null
  const body = q
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[ ]+')
  const src = wholeWord ? `(?<![\\p{L}\\p{N}_'’])${body}(?![\\p{L}\\p{N}_'’])` : body
  return new RegExp(src, `g${matchCase ? '' : 'i'}u`)
}

export function findMatches(words: Word[], opts: FindOptions): Match[] {
  const re = buildRegex(opts)
  if (!re || !words.length) return []
  const { text, spans } = joinParagraphs(words)
  const out: Match[] = []
  let w = 0
  for (const m of text.matchAll(re)) {
    if (!m[0]) continue
    const start = m.index!
    const end = start + m[0].length
    while (w < spans.length - 1 && spans[w][1] <= start) w++
    let to = w
    while (to < spans.length - 1 && spans[to + 1][0] < end) to++
    out.push({ start, end, fromWord: w, toWord: to })
  }
  return out
}

/** Text with the given matches (all, or only `only`) swapped for `replacement`. */
export function applyReplacement(words: Word[], matches: Match[], replacement: string, only?: number): string {
  const { text } = joinParagraphs(words)
  let out = ''
  let at = 0
  matches.forEach((m, k) => {
    if (only !== undefined && k !== only) return
    out += text.slice(at, m.start) + replacement
    at = m.end
  })
  return out + text.slice(at)
}
