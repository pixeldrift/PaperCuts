import type { Source, Word } from '../types'

const END_PUNCT = /[.!?]["')\]]?$/

/** "00:01:02,500" | "01:02.500" | "1.5" → ms */
function parseTime(raw: string): number {
  const parts = raw.trim().replace(',', '.').split(':').map(Number)
  if (parts.some(Number.isNaN)) return NaN
  let sec = 0
  for (const p of parts) sec = sec * 60 + p
  return Math.round(sec * 1000)
}

interface RawWord {
  t: string
  s: number
  e: number
}

/** Spread a caption cue's time range over its words, weighted by length. */
function spreadCue(text: string, start: number, end: number): RawWord[] {
  const tokens = text.split(/\s+/).filter(Boolean)
  const weights = tokens.map((t) => t.length + 1)
  const total = weights.reduce((a, b) => a + b, 0) || 1
  let at = start
  return tokens.map((t, i) => {
    const e = i === tokens.length - 1 ? end : Math.round(at + ((end - start) * weights[i]) / total)
    const w = { t, s: Math.round(at), e }
    at = e
    return w
  })
}

function parseCaptions(text: string): RawWord[] {
  const out: RawWord[] = []
  const blocks = text.replace(/\r/g, '').replace(/^﻿/, '').split(/\n{2,}/)
  for (const block of blocks) {
    const lines = block.split('\n')
    const ti = lines.findIndex((l) => l.includes('-->'))
    if (ti < 0) continue
    const [a, b] = lines[ti].split('-->')
    const start = parseTime(a)
    const end = parseTime(b.trim().split(/\s+/)[0])
    if (Number.isNaN(start) || Number.isNaN(end)) continue
    const body = lines
      .slice(ti + 1)
      .join(' ')
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim()
    if (body) out.push(...spreadCue(body, start, Math.max(end, start + 1)))
  }
  return out
}

/** Accepts word arrays, `{ words }`, `{ segments: [{ words | text }] }` (Whisper-style). */
function parseJson(text: string): RawWord[] {
  const data = JSON.parse(text)
  const num = (v: unknown) => (typeof v === 'number' ? v : Number(v))
  const toWord = (o: Record<string, unknown>): RawWord | null => {
    const t = String(o.word ?? o.text ?? o.w ?? o.t ?? '').trim()
    const s = num(o.start ?? o.s ?? o.start_time)
    const e = num(o.end ?? o.e ?? o.end_time)
    return t && !Number.isNaN(s) && !Number.isNaN(e) ? { t, s, e } : null
  }
  const out: RawWord[] = []
  const walk = (items: unknown[]) => {
    for (const it of items as Record<string, unknown>[]) {
      if (Array.isArray(it.words)) walk(it.words)
      else if (typeof it.text === 'string' && it.text.includes(' ') && ('start' in it || 's' in it)) {
        // a segment with no word timings: treat like a caption cue
        const s = num(it.start ?? it.s)
        const e = num(it.end ?? it.e)
        out.push(...spreadCue(it.text.trim(), s, e))
      } else {
        const w = toWord(it)
        if (w) out.push(w)
      }
    }
  }
  walk(Array.isArray(data) ? data : (data.words ?? data.segments ?? data.results ?? []))
  // seconds → ms unless the values already look like milliseconds
  const looksLikeMs = out.length > 0 && out[out.length - 1].e > 36000
  return out.map((w) => (looksLikeMs ? w : { ...w, s: Math.round(w.s * 1000), e: Math.round(w.e * 1000) }))
}

/** [first, last] word index of each sentence (a sentence ends on . ! ? or the final word). */
export function sentenceRanges(words: { t: string }[]): [number, number][] {
  const out: [number, number][] = []
  let start = 0
  words.forEach((w, i) => {
    if (END_PUNCT.test(w.t) || i === words.length - 1) {
      out.push([start, i])
      start = i + 1
    }
  })
  return out
}

/** Group raw words into paragraphs (long pauses / sentence ends) and sentences. */
function structure(raw: RawWord[]): Pick<Source, 'words' | 'sentences'> {
  const words: Word[] = []
  const sentences: [number, number][] = []
  let para = 0
  let paraLen = 0
  let sentStart = 0
  raw.forEach((w, i) => {
    const prev = raw[i - 1]
    if (prev && words.length) {
      const gap = w.s - prev.e
      if (gap > 1500 || (paraLen > 70 && END_PUNCT.test(prev.t))) {
        para++
        paraLen = 0
      }
    }
    words.push({ ...w, p: para })
    paraLen++
    if (END_PUNCT.test(w.t) || i === raw.length - 1) {
      sentences.push([sentStart, i])
      sentStart = i + 1
    }
  })
  return { words, sentences }
}

export function parseTranscript(filename: string, text: string): Pick<Source, 'words' | 'sentences'> {
  const raw = /\.json$/i.test(filename) ? parseJson(text) : parseCaptions(text)
  raw.sort((a, b) => a.s - b.s)
  return structure(raw)
}

export const TRANSCRIPT_EXT = /\.(srt|vtt|json)$/i
export const MEDIA_EXT = /\.(mp4|m4v|mov|webm|mkv|mp3|m4a|wav|ogg|aac)$/i
