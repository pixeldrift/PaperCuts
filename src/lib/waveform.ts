/** Peak envelopes for drawing audio waveforms. */
const cache = new Map<string, Promise<Float32Array | null>>()

/** Decode an audio/video file's soundtrack into `buckets` peak values (0‥1). */
export function loadPeaks(url: string, buckets = 1600): Promise<Float32Array | null> {
  let p = cache.get(url)
  if (!p) {
    p = (async () => {
      try {
        const buf = await (await fetch(url)).arrayBuffer()
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        const ctx = new Ctx()
        const audio = await ctx.decodeAudioData(buf)
        void ctx.close()
        const data = audio.getChannelData(0)
        const out = new Float32Array(buckets)
        const step = Math.max(1, Math.floor(data.length / buckets))
        let max = 0
        for (let b = 0; b < buckets; b++) {
          let m = 0
          const from = b * step
          for (let i = from; i < Math.min(from + step, data.length); i += Math.max(1, step >> 6)) m = Math.max(m, Math.abs(data[i]))
          out[b] = m
          max = Math.max(max, m)
        }
        if (max > 0) for (let b = 0; b < buckets; b++) out[b] /= max
        return out
      } catch {
        return null // no audio track, or the browser can't decode it
      }
    })()
    cache.set(url, p)
  }
  return p
}

/** A speech-like envelope for footage we don't have (deterministic per id). */
export function fakePeaks(seed: string, buckets = 1600): Float32Array {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  const rand = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296
  const out = new Float32Array(buckets)
  let level = 0.4
  for (let i = 0; i < buckets; i++) {
    if (i % 9 === 0) level = rand() < 0.18 ? 0.05 : 0.25 + rand() * 0.7 // phrases and pauses
    out[i] = Math.min(1, level * (0.55 + rand() * 0.6))
  }
  return out
}
