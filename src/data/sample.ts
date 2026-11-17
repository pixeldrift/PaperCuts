import { buildMaster, shiftWords } from '../lib/sync'
import type { Angle, Source, Clip } from '../types'

/** Deterministic PRNG so sample data is stable between reloads. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CORPUS = [
  'When we first started the project nobody believed it would ever get finished.',
  'I remember walking into the old print shop and smelling ink and dust everywhere.',
  'The hardest part was not the filming, it was deciding what to leave out.',
  'Every story has a shape, and you only find it once you stop trying to force it.',
  'We had hundreds of hours of tape and no clear idea where to begin.',
  'Somebody suggested we just read the transcripts like a book and underline the good parts.',
  'That changed everything for us, because suddenly the edit felt like writing.',
  'You can hear the hesitation in her voice right before she tells the real story.',
  'I think people underestimate how much a pause can say about a person.',
  'The town had changed so much that she barely recognised the main street.',
  'He kept every letter in a shoebox under the bed for almost forty years.',
  'We argued for a week about whether the ending should be hopeful or honest.',
  'In the end the audience decided that for us, and they were right.',
  'There is a moment in the second interview where everything suddenly clicks.',
  'You do not realise how much you remember until somebody asks the right question.',
  'The crew was tiny, just two cameras, one microphone and a lot of coffee.',
  'It rained on the first day of shooting and it never really stopped after that.',
  'I would not change a single frame, even the ones that went out of focus.',
  'People talk differently when they forget the camera is there.',
  'The archive footage gave us a sense of scale that no interview ever could.',
  'We cut the whole opening three times before it finally felt right.',
  'She laughed at the memory and then went quiet for a long time.',
  'The simplest version of the story was always the strongest one.',
  'Looking back, the mistakes are what make the film feel human.',
  'He told us the same story twice and the details were completely different.',
  'Rough cuts are supposed to be rough, that is the whole point of them.',
  'You find the film in the edit, not in the script.',
  'Nobody ever remembers the shots that did not make it into the final version.',
  'We kept coming back to the same three minutes of footage again and again.',
  'It felt less like making a documentary and more like uncovering something buried.',
]

interface Spec {
  id: string
  title: string
  date: string
  seed: number
  offset: number
  recordedAt: string
  camera: string
  shotType: string
  filename: string
  transcriptFormat: NonNullable<Source['transcriptFormat']>
  extraAngles?: Angle[]
  scene: string
  take: string
  director: string
  dp: string
  interviewer: string
  /** Multicam demo: sentence ranges [from, to) each camera's own transcript covers. */
  own?: { main: [number, number]; extra: [number, number] }
}

const SPEC: Spec[] = [
  { id: 'src-john', title: 'John Doe', date: 'Nov 2, 2016', seed: 11, offset: 0, recordedAt: '09:15', camera: 'A', shotType: 'Wide', filename: 'JOHN_A001.mov', transcriptFormat: 'srt', scene: '1', take: '2', director: 'R. Alvarez', dp: 'M. Chen', interviewer: 'Priya N.' },
  // Jane was shot on three synced cameras: one transcript, three angles
  {
    id: 'src-jane', title: 'Jane Smith', date: 'Dec 15, 2016', seed: 23, offset: 7, recordedAt: '14:02', camera: 'A', shotType: 'Wide', filename: 'JANE_A001.mov', transcriptFormat: 'vtt',
    scene: '2', take: '1', director: 'R. Alvarez', dp: 'M. Chen', interviewer: 'Priya N.',
    // camera A stopped early; B rolled late and ran longer; the GoPro has no transcript of its own
    own: { main: [0, 56], extra: [10, 72] },
    extraAngles: [
      { id: 'src-jane-b', camera: 'B', shotType: 'Closeup', filename: 'JANE_B001.mov', recordedAt: '14:02', offsetMs: 120 },
      { id: 'src-jane-gp', camera: 'GoPro', shotType: 'BTS', filename: 'GOPR0412.mp4', recordedAt: '14:03', offsetMs: 340 },
    ],
  },
  { id: 'src-tom', title: 'Tom Taylor', date: 'Mar 22, 2017', seed: 37, offset: 14, recordedAt: '11:40', camera: 'A', shotType: 'OTS', filename: 'TOM_A003.mov', transcriptFormat: 'json', scene: '3', take: '4', director: 'R. Alvarez', dp: 'S. Okafor', interviewer: 'Dan W.' },
  { id: 'src-sarah', title: 'Sarah Baker', date: 'July 18, 2017', seed: 41, offset: 21, recordedAt: '16:25', camera: 'B', shotType: 'Closeup', filename: 'SARAH_B002.mov', transcriptFormat: 'srt', scene: '4', take: '1', director: 'J. Moreau', dp: 'S. Okafor', interviewer: 'Dan W.' },
]

const SENTENCES_PER_SOURCE = 72
const SENTENCES_PER_PARAGRAPH = 4

function build(spec: Spec): Source {
  const rand = mulberry32(spec.seed)
  const words: Source['words'] = []
  const sentences: Source['sentences'] = []
  let t = 1200 + Math.floor(rand() * 2000)
  let para = 0

  for (let i = 0; i < SENTENCES_PER_SOURCE; i++) {
    const text = CORPUS[(spec.offset + i * 3 + Math.floor(i / CORPUS.length)) % CORPUS.length]
    const tokens = text.split(' ')
    const first = words.length
    for (const tok of tokens) {
      const dur = 170 + tok.length * 42 + Math.floor(rand() * 60)
      words.push({ t: tok, s: Math.round(t), e: Math.round(t + dur), p: para })
      t += dur + 35
    }
    sentences.push([first, words.length - 1])
    const endOfPara = (i + 1) % SENTENCES_PER_PARAGRAPH === 0
    if (endOfPara) para++
    t += endOfPara ? 1400 : 550
  }

  const src: Source = {
    id: spec.id,
    title: spec.title,
    date: spec.date,
    recordedAt: spec.recordedAt,
    camera: spec.camera,
    shotType: spec.shotType,
    filename: spec.filename,
    transcriptFormat: spec.transcriptFormat,
    extraAngles: spec.extraAngles,
    scene: spec.scene,
    take: spec.take,
    director: spec.director,
    dp: spec.dp,
    interviewer: spec.interviewer,
    duration: Math.round(t + 2000),
    words,
    sentences,
  }

  // multicam demo: each camera keeps its own transcript, timed against its own footage
  if (spec.own && spec.extraAngles) {
    const slice = ([a, b]: [number, number]) => words.slice(sentences[a][0], sentences[b - 1][1] + 1)
    const [b0] = spec.extraAngles
    const mainWords = slice(spec.own.main)
    const bWords = shiftWords(slice(spec.own.extra), -b0.offsetMs)
    const withDur: Source = {
      ...src,
      mainDuration: src.duration,
      primaryTranscript: { words: mainWords, format: spec.transcriptFormat },
      extraAngles: spec.extraAngles.map((a, k) => ({
        ...a,
        durationMs: src.duration,
        ...(k === 0 ? { transcript: { words: bWords, format: 'srt' as const } } : {}),
      })),
      masterAngle: b0.id, // the longest transcript has priority
      transcriptMode: 'combined',
    }
    const built = buildMaster(withDur)!
    return { ...withDur, words: built.words, sentences: built.sentences }
  }
  return src
}

export const SAMPLE_SOURCES: Source[] = SPEC.map(build)

/** A short starter paper edit so the UI isn't empty on first load. */
export function sampleClips(): Clip[] {
  const pick = (id: string, from: number, to: number): Clip => {
    const src = SAMPLE_SOURCES.find((s) => s.id === id)!
    return {
      id: `seed-${id}-${from}`,
      sourceId: id,
      inMs: src.words[src.sentences[from][0]].s,
      outMs: src.words[src.sentences[to][1]].e,
      notes: [],
    }
  }
  return [
    pick('src-john', 0, 1),
    pick('src-sarah', 4, 6),
    pick('src-tom', 2, 2),
    pick('src-tom', 9, 10),
  ]
}
