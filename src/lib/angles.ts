import { PRIMARY_ANGLE, type Angle, type Source } from '../types'

/** All angles of a source, primary first. */
export function angleList(src: Source): Angle[] {
  return [
    {
      id: PRIMARY_ANGLE,
      camera: src.camera ?? 'A',
      shotType: src.shotType,
      filename: src.filename,
      recordedAt: src.recordedAt,
      mediaUrl: src.mediaUrl,
      offsetMs: src.mainOffset ?? 0,
      durationMs: src.mainDuration ?? src.duration,
      transcript: src.primaryTranscript,
    },
    ...(src.extraAngles ?? []),
  ]
}

/** Angles you can pick for a clip (cameras, not audio-only recorders). */
export const videoAngles = (src: Source) => angleList(src).filter((a) => !a.audioOnly)

/** The requested angle, falling back to the primary one. */
export function getAngle(src: Source, angleId?: string): Angle {
  const all = angleList(src)
  return all.find((a) => a.id === angleId) ?? all[0]
}

export const angleLabel = (a: Angle) => (a.shotType ? `${a.camera} · ${a.shotType}` : a.camera)

/** Next unused camera letter (A, B, C…) for a newly synced angle. */
export function nextCamera(src: Source) {
  const used = new Set(angleList(src).map((a) => a.camera.toUpperCase()))
  for (let i = 0; i < 26; i++) {
    const c = String.fromCharCode(65 + i)
    if (!used.has(c)) return c
  }
  return `Cam ${used.size + 1}`
}

/** Apply a patch to one angle of a source (the primary angle lives on the source itself). */
export function patchAngle(src: Source, angleId: string, patch: Partial<Omit<Angle, 'id' | 'mediaUrl'>>): Source {
  if (angleId === PRIMARY_ANGLE) {
    const { camera, shotType, filename, recordedAt, transcript, durationMs, offsetMs } = patch
    return {
      ...src,
      ...(camera !== undefined && { camera }),
      ...(shotType !== undefined && { shotType }),
      ...(filename !== undefined && { filename }),
      ...(recordedAt !== undefined && { recordedAt }),
      ...('transcript' in patch && { primaryTranscript: transcript }),
      ...(durationMs !== undefined && { mainDuration: durationMs }),
      ...(offsetMs !== undefined && { mainOffset: offsetMs || undefined }),
    }
  }
  return { ...src, extraAngles: (src.extraAngles ?? []).map((a) => (a.id === angleId ? { ...a, ...patch } : a)) }
}
