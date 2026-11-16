import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { IconGallery } from './components/IconGallery'
import { useStore } from './store'
import './styles.css'

// dev-only handle for poking at state from the console / tests
if (import.meta.env.DEV) (window as unknown as { __papercuts: typeof useStore }).__papercuts = useStore

const showGallery = location.hash === '#icons'

createRoot(document.getElementById('root')!).render(
  <StrictMode>{showGallery ? <IconGallery /> : <App />}</StrictMode>,
)
