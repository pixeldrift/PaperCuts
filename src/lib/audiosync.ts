/**
 * Lining cameras up by their sound.
 *
 * Two cameras that heard the same thing recorded the same loudness pattern, just shifted in time.
 * Each soundtrack is reduced to a loudness envelope (ENV_RATE values per second), and the two
 * envelopes are cross-correlated (via FFT) to find the shift where they agree best.
 */

/** Envelope samples per second — 5 ms resolution, plenty for frame-accurate sync. */
export const ENV_RATE = 200
/** Sample rate the soundtrack is reduced to before measuring loudness. */
const ANALYSIS_RATE = 8000

// ───────────────────────── envelope ─────────────────────────

/** Mono samples (at `rate` Hz) → a speech-friendly loudness envelope at ENV_RATE. */
export function envelopeFromSamples(x: Float32Array, rate = ANALYSIS_RATE): Float32Array {
  const hop = Math.max(1, Math.round(rate / ENV_RATE))
  const n = Math.floor(x.length / hop)
  const env = new Float32Array(n)
  let prev = 0
  for (let b = 0; b < n; b++) {
    let sum = 0
    for (let i = b * hop; i < (b + 1) * hop; i++) {
      const y = x[i] - 0.97 * prev // pre-emphasis: favour speech over rumble and hum
      prev = x[i]
      sum += y * y
    }
    env[b] = Math.log(Math.sqrt(sum / hop) + 1e-4) // log: loud and quiet speech count alike
  }
  // remove the slow trend (room tone, gain drift) so only the dynamics are compared
  const win = ENV_RATE * 2
  const cum = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + env[i]
  const out = new Float32Array(n)
  let energy = 0
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - win)
    const hi = Math.min(n, i + win + 1)
    out[i] = env[i] - (cum[hi] - cum[lo]) / (hi - lo)
    energy += out[i] * out[i]
  }
  const sd = Math.sqrt(energy / Math.max(1, n)) || 1
  for (let i = 0; i < n; i++) out[i] /= sd
  return out
}

// ───────────────────────── cross-correlation ─────────────────────────

function fft(re: Float64Array, im: Float64Array, inverse = false) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? -2 : 2) * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k
        const b = a + len / 2
        const tr = re[b] * cr - im[b] * ci
        const ti = re[b] * ci + im[b] * cr
        re[b] = re[a] - tr
        im[b] = im[a] - ti
        re[a] += tr
        im[a] += ti
        const nr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = nr
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) (re[i] /= n), (im[i] /= n)
}

export interface AudioAlignment {
  /**
   * How far later than the reference's start the camera's footage began (ms): add it to the
   * reference's own offset to get the camera's offset.
   */
  offsetMs: number
  /** Normalised correlation at the best shift (0‥1). */
  score: number
  /** Best match versus the best match somewhere else (higher = less ambiguous). */
  ratio: number
  /** How far the best match stands out from the background of every other shift (robust z-score). */
  z: number
  /** True if this looks like a real match rather than coincidence. */
  confident: boolean
}

/**
 * Find the shift d (in ms) such that `own` delayed by d lines up with `ref`:
 * an event at time r in the reference is at time r − d in the camera's own footage.
 */
export function alignByAudio(ref: Float32Array, own: Float32Array, minOverlapSec = 8): AudioAlignment | null {
  const n = ref.length
  const m = own.length
  const minOverlap = Math.min(Math.round(minOverlapSec * ENV_RATE), Math.floor(Math.min(n, m) * 0.5))
  if (n < ENV_RATE * 2 || m < ENV_RATE * 2) return null

  let size = 1
  while (size < n + m) size <<= 1
  const ar = new Float64Array(size)
  const ai = new Float64Array(size)
  const br = new Float64Array(size)
  const bi = new Float64Array(size)
  ref.forEach((v, i) => (ar[i] = v))
  own.forEach((v, i) => (br[i] = v))
  fft(ar, ai)
  fft(br, bi)
  for (let i = 0; i < size; i++) {
    // A · conj(B)
    const r = ar[i] * br[i] + ai[i] * bi[i]
    const q = ai[i] * br[i] - ar[i] * bi[i]
    ar[i] = r
    ai[i] = q
  }
  fft(ar, ai, true) // ar[k] (k ≥ 0) and ar[size + k] (k < 0) = Σ ref[i + k] · own[i]

  // prefix sums of squares, to normalise by the energy of just the overlapping stretch
  const sq = (x: Float32Array) => {
    const c = new Float64Array(x.length + 1)
    for (let i = 0; i < x.length; i++) c[i + 1] = c[i] + x[i] * x[i]
    return c
  }
  const sa = sq(ref)
  const sb = sq(own)
  const lo = -(m - 1)
  const hi = n - 1
  const ncc = new Float64Array(hi - lo + 1)
  // Evidence grows with how much sound overlaps, so a short overlap with a lucky high correlation
  // must not beat a long one: rank shifts by NCC × √overlap (≈ a z-score under "unrelated").
  const sig = new Float64Array(hi - lo + 1)
  const valid: number[] = []
  let best = -Infinity
  let bestK = 0
  for (let k = lo; k <= hi; k++) {
    // overlap: ref[i + k] with own[i], i from max(0, −k) to min(m, n − k)
    const i0 = Math.max(0, -k)
    const i1 = Math.min(m, n - k)
    if (i1 - i0 < minOverlap) continue
    const ea = sa[i1 + k] - sa[i0 + k]
    const eb = sb[i1] - sb[i0]
    const c = ar[k >= 0 ? k : size + k]
    const v = ea > 1e-9 && eb > 1e-9 ? c / Math.sqrt(ea * eb) : 0
    ncc[k - lo] = v
    sig[k - lo] = v * Math.sqrt(i1 - i0)
    valid.push(sig[k - lo])
    if (sig[k - lo] > best) (best = sig[k - lo]), (bestK = k)
  }
  if (!Number.isFinite(best) || best <= 0 || valid.length < 10) return null
  const peakNcc = ncc[bestK - lo]

  // robust background (median / MAD) of the evidence over every other shift
  const sorted = Float64Array.from(valid).sort()
  const med = sorted[sorted.length >> 1]
  const dev = Float64Array.from(valid, (v) => Math.abs(v - med)).sort()
  const mad = (dev[dev.length >> 1] || 1e-9) * 1.4826
  const z = (best - med) / mad

  // a competing peak elsewhere (more than a second away) means the match is ambiguous
  let second = 0
  for (let k = lo; k <= hi; k++) if (Math.abs(k - bestK) > ENV_RATE && sig[k - lo] > second) second = sig[k - lo]
  // sub-sample refinement
  const at = (k: number) => (k >= lo && k <= hi ? ncc[k - lo] : 0)
  const y0 = at(bestK - 1)
  const y1 = peakNcc
  const y2 = at(bestK + 1)
  const denom = y0 - 2 * y1 + y2
  const frac = denom < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / denom)) : 0

  const ratio = second > 0 ? best / second : 10
  return {
    offsetMs: Math.round(((bestK + frac) / ENV_RATE) * 1000),
    score: peakNcc,
    ratio,
    z,
    confident: z >= Z_MIN && ratio >= RATIO_MIN,
  }
}

/** Confidence thresholds (calibrated against true and unrelated pairs — see audio.test). */
export const Z_MIN = 5
export const RATIO_MIN = 1.5

// ───────────────────────── decoding (browser) ─────────────────────────

const cache = new Map<string, Promise<Float32Array | null>>()

/**
 * Loudness envelope of a media file's soundtrack (first `maxSeconds` of it), or null if it has no
 * decodable audio. Results are cached per URL.
 */
export function loadEnvelope(url: string, maxSeconds = 600): Promise<Float32Array | null> {
  let p = cache.get(url)
  if (!p) {
    p = (async () => {
      try {
        const buf = await (await fetch(url)).arrayBuffer()
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        const ctx = new Ctx()
        const decoded = await ctx.decodeAudioData(buf)
        void ctx.close()
        // mix down and resample to a low rate with an offline context
        const seconds = Math.min(decoded.duration, maxSeconds)
        const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(seconds * ANALYSIS_RATE)), ANALYSIS_RATE)
        const src = off.createBufferSource()
        src.buffer = decoded
        src.connect(off.destination)
        src.start()
        const rendered = await off.startRendering()
        return envelopeFromSamples(rendered.getChannelData(0))
      } catch {
        return null
      }
    })()
    cache.set(url, p)
  }
  return p
}
