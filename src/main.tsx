import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { IconGallery } from './components/IconGallery'
import './styles.css'

const showGallery = location.hash === '#icons'

createRoot(document.getElementById('root')!).render(
  <StrictMode>{showGallery ? <IconGallery /> : <App />}</StrictMode>,
)
