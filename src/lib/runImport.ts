import { useStore } from '../store'
import { importFiles } from './importSources'

/** Import files and report the outcome as a toast. */
export async function runImport(files: File[]) {
  const st = useStore.getState()
  if (!files.length) return
  st.toast('Importing…')
  const { sources, warnings } = await importFiles(files)
  useStore.getState().addSources(sources)
  const ok = sources.length ? `Imported ${sources.length} source${sources.length > 1 ? 's' : ''}` : 'Nothing imported'
  useStore.getState().toast(warnings.length ? `${ok} — ${warnings[0]}` : ok)
}

export const IMPORT_EVENT = 'papercuts:import'
export const openImportPicker = () => window.dispatchEvent(new Event(IMPORT_EVENT))
