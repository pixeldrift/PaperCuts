import { useStore } from '../store'
import { mediaKey, saveMedia, saveSource } from './db'
import { PRIMARY_ANGLE } from '../types'
import { importFiles } from './importSources'

/** Import files and report the outcome as a toast. */
export async function runImport(files: File[]) {
  const st = useStore.getState()
  if (!files.length) return
  st.toast('Importing…')
  const { sources, files: media, warnings } = await importFiles(files)
  useStore.getState().addSources(sources)
  // keep them across reloads; if storage is full the sources still work this session
  const saved = await Promise.allSettled(
    sources.map(async (src) => {
      await saveSource(src, media[mediaKey(src.id)])
      for (const a of src.extraAngles ?? []) {
        const f = media[mediaKey(src.id, a.id)]
        if (f && a.id !== PRIMARY_ANGLE) await saveMedia(mediaKey(src.id, a.id), f)
      }
    }),
  )
  if (saved.some((r) => r.status === 'rejected')) warnings.unshift('couldn’t store media (storage full?) — it won’t survive a reload')
  void navigator.storage?.persist?.()
  const ok = sources.length ? `Imported ${sources.length} source${sources.length > 1 ? 's' : ''}` : 'Nothing imported'
  useStore.getState().toast(warnings.length ? `${ok} — ${warnings[0]}` : ok)
}

export const IMPORT_EVENT = 'papercuts:import'
export const openImportPicker = () => window.dispatchEvent(new Event(IMPORT_EVENT))
